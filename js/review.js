/* =====================================================================
 * review.js  点评评分器（三甲医院标准 · 智能化改造版 v1）
 * 权重写死在下方 DIMS；输入 hits 列表，输出百分制 + 分项 + 三级严重度分组。
 *
 * 硬约束：本文件中仅 DIMS 数组允许出现维度权重冒号数字字面量
 * （scripts/validate-all.js 用 /weight:\s*(\d+)/g 提取，合计必须 =100）。
 * FALLBACK_DIM 必须保持"对象字面量外赋值"写法，勿改成对象内联权重字段。
 * ===================================================================== */
(function (global) {
  'use strict';

  // 按三甲医院处方点评管理规范调整权重（百分制，合计=100）
  const DIMS = [
    { key: 'format',     name: '处方格式规范',              weight: 6,  groups: ['FORMAT'] },
    { key: 'indication', name: '诊断-用药匹配（循证适应症）', weight: 20, groups: ['INDICATION'] },
    { key: 'dosage',     name: '剂量用法（单次/每日量）',    weight: 13, groups: ['DOSAGE'] },
    { key: 'duration',   name: '疗程适宜',                  weight: 3,  groups: ['DURATION'] },
    { key: 'iv_reason',  name: '给药途径决策与输液合理性',   weight: 17, groups: ['IV_REASON'] },
    { key: 'compat_sv',  name: '溶媒与配伍',                weight: 3,  groups: ['COMPAT'], onlyRuleIds: ['IV-06','IV-07'] },
    { key: 'compat_int', name: '药物相互作用/重复用药',      weight: 7,  groups: ['COMPAT'], excludeRuleIds: ['IV-06','IV-07'] },
    { key: 'special_pop',name: '特殊人群（儿童/老人/孕哺/肝肾）', weight: 9,  groups: ['SPECIAL_POP'] },
    { key: 'abx',        name: '抗菌药物分级管理',          weight: 4,  groups: ['ABX'] },
    { key: 'insurance',  name: '医保/基药/集采经济性',        weight: 2,  groups: ['INSURANCE'] },
    { key: 'lab',       name: '检验检查适宜性',              weight: 4,  groups: ['LAB'] },
    { key: 'surgery',   name: '手术指征判断',                weight: 12, groups: ['SURGERY'] },
  ];

  // ------------------------------------------------------------------
  // 三级严重度推断（规范第 2 节）
  //  - hit.severity_level 优先（规则引擎已写入）
  //  - 否则按旧 severity 映射：error→major，warn→minor，pass→pass
  //  - 下列 rule_id 的 error 升级为 critical（禁忌证/超极量/特殊使用级/无指征输液/中药注射剂混瓶）
  // ------------------------------------------------------------------
  const CRITICAL_RULE_IDS = {
    'POP-01': 1,           // 18岁以下喹诺酮（软骨损伤禁忌）
    'SPEC-02': 1,          // 药品说明书禁忌命中
    'COMORBID-04': 1,      // 孕妇用致畸药（ACEI/ARB/他汀/喹诺酮/四环素/华法林…）
    'ALLERGY-01': 1,       // 处方含患者既往过敏药
    'COMORBID-01': 1,      // G6PD 缺乏用氧化性药（急性溶血）
    'COMORBID-02': 1,      // 青光眼用抗胆碱药（急性发作）
    'IV-08': 1,            // 皮试阳性/未皮试仍用
    'ABX-01': 1,           // 特殊使用级抗菌药门诊使用
    'IV-05': 1,            // 门诊输液负面清单命中（无指征输液）
    'IV-07': 1,            // 中药注射剂同瓶混加其他药
    'IV-01': 1,            // usually_no_iv 疾病且输液指征仅为发热/患者要求
    'DOSE-01': 1,          // 单次超说明书极量
    'DOSAGE-WT': 1,        // 儿童 mg/kg 超极量
    'SUR-05': 1            // 存在绝对手术禁忌证仍安排手术
  };
  // 旧 severity=warn 但按规范应归 major 的规则（重复用药）
  const MAJOR_ON_WARN_RULE_IDS = {
    'DUP-01': 1,
    'DUP-02': 1
  };

  function resolveSeverityLevel(h) {
    if (!h) return 'pass';
    // 旧 severity=pass 的中性提示不参与扣分，一律保持 pass
    if (h.severity === 'pass') return 'pass';
    if (h.severity_level === 'critical' || h.severity_level === 'major' ||
        h.severity_level === 'minor' || h.severity_level === 'pass') {
      return h.severity_level;
    }
    const sev = h.severity || 'pass';
    if (sev === 'error') {
      if (CRITICAL_RULE_IDS[h.rule_id]) return 'critical';
      return 'major';
    }
    // warn
    if (MAJOR_ON_WARN_RULE_IDS[h.rule_id]) return 'major';
    return 'minor';
  }

  function classifyHit(h) {
    if (!h || !h.group) return 'format';
    for (const d of DIMS) {
      if (!d.groups.includes(h.group)) continue;
      if (d.onlyRuleIds && !d.onlyRuleIds.includes(h.rule_id)) continue;
      if (d.excludeRuleIds && d.excludeRuleIds.includes(h.rule_id)) continue;
      return d.key;
    }
    return 'format';
  }

  // 判断 visit_ctx 中是否存在任何治疗性药品（排除溶媒）或检验检查项目
  // 并列开具模型：只开检验检查单（无药品）也是有效就诊，不应判空处方 0 分
  function hasAnyOrder(ctx) {
    if (!ctx) return false;
    const rxHas = (rx) => rx && Array.isArray(rx.items) &&
      rx.items.some(it => it && it.drug && it.drug.dosage_form !== 'solvent');
    const hasLab = ctx.lab_rx && Array.isArray(ctx.lab_rx.items) && ctx.lab_rx.items.length > 0;
    // 纯手术指征决策（未开药/未开检验）也算有效就诊，不判空处方
    const hasSurgery = !!(ctx.surgery_rx && ctx.surgery_rx.decision);
    return rxHas(ctx.normal_rx) || rxHas(ctx.iv_rx) || hasLab || hasSurgery;
  }

  // 由 hits 组装 summary（供正常路径与空路径复用）
  function buildSummary(totalScore, hits) {
    const grouped = {
      critical: hits.filter(h => h.severity_level === 'critical'),
      major:    hits.filter(h => h.severity_level === 'major'),
      minor:    hits.filter(h => h.severity_level === 'minor')
    };
    const category_stats = {};
    hits.forEach(h => {
      const g = h.group || 'OTHER';
      category_stats[g] = (category_stats[g] || 0) + 1;
    });
    const verdict = totalScore >= 90 ? 'excellent'
                  : totalScore >= 75 ? 'good'
                  : totalScore >= 60 ? 'pass' : 'fail';

    const ordered = grouped.critical.concat(grouped.major, grouped.minor);
    const top_issues = ordered.slice(0, 3).map(h => h.title || h.message || '').filter(Boolean);

    let headline;
    if (grouped.critical.length > 0) {
      headline = '存在' + grouped.critical.length + '处严重错误：' +
        grouped.critical.slice(0, 2).map(h => h.title || '').join('、');
    } else if (grouped.major.length > 0) {
      headline = '存在' + grouped.major.length + '处一般错误，建议复核用药方案';
    } else if (grouped.minor.length > 0) {
      headline = '处方基本合理，存在' + grouped.minor.length + '处细节可优化';
    } else {
      headline = '处方规范，点评通过';
    }

    const next_steps = [];
    if (grouped.critical.length > 0) {
      next_steps.push('优先整改严重错误：禁忌证/超极量/无指征输液须立即停药并重新开具');
    }
    if (grouped.major.length > 0) {
      next_steps.push('对照指南复核诊断-用药匹配、单次剂量与药物配伍，必要时请上级医师审核');
    }
    if (grouped.minor.length > 0) {
      next_steps.push('规范处方前记与疗程，优先选择口服给药与集采中选品种');
    }
    if (next_steps.length === 0) {
      next_steps.push('保持规范用药，定期复训《处方管理办法》与抗菌药物分级管理');
    }

    return {
      grouped: grouped,
      summary: {
        verdict: verdict,
        headline: headline,
        top_issues: top_issues,
        next_steps: next_steps,
        category_stats: category_stats
      }
    };
  }

  function score(hits, ctx) {
    hits = Array.isArray(hits) ? hits.filter(Boolean) : [];

    // ===== 空就诊拦截（P0）：既无药品也无检验检查项目 → 直接判不合格，0分 =====
    if (!hasAnyOrder(ctx)) {
      const emptyHit = {
        rule_id: 'FMT-EMPTY', group: 'FORMAT', title: '空就诊（未开具药品或检验检查项目）',
        severity: 'error', severity_level: 'critical',
        message: '本次就诊既未开具任何治疗药品，也未开具任何检验检查项目，无临床处置内容，不得提交点评。',
        basis: '《处方管理办法》第十四条：医师应当根据诊断开具处方；无任何处置的就诊无临床意义。',
        suggestion: '根据临床诊断，至少开具一种适宜药品或必要的检验检查项目。',
        lesson_point: '无任何处置的就诊无临床意义，不得提交点评',
        correct_practice: '根据临床诊断，至少开具一种适宜药品或必要的检验检查项目',
        reference_guide: '《处方管理办法》第十四条',
        related_topic: '',
        affected_items: [],
        aggregated_count: 1
      };
      const dimResult = {};
      DIMS.forEach(d => {
        dimResult[d.key] = { name: d.name, weight: d.weight, hits: [emptyHit], deduction: d.weight, score: 0, verdict: 'critical' };
      });
      const built = buildSummary(0, [emptyHit]);
      return {
        total: 0, dims: dimResult, totalHits: 1,
        errorCount: 1, warnCount: 0, emptyPrescription: true,
        criticalCount: 1, minorCount: 0,
        groups: built.grouped,
        summary: built.summary
      };
    }

    // 1) 规范化每条 hit 的 severity_level
    hits.forEach(h => { h.severity_level = resolveSeverityLevel(h); });

    // 2) 初始化维度结果
    const dimResult = {};
    DIMS.forEach(d => {
      dimResult[d.key] = { name: d.name, weight: d.weight, hits: [], deduction: 0, score: d.weight };
    });

    // 3) 按维度归集
    hits.forEach(h => {
      const k = classifyHit(h);
      if (dimResult[k]) dimResult[k].hits.push(h);
    });

    // 4) 扣分：同维度同 rule_id 聚合只扣一次
    //    critical 扣 weight*0.8，major 扣 weight*0.5，minor 扣 weight*0.2；维度封顶 weight
    let total = 0;
    DIMS.forEach(d => {
      const r = dimResult[d.key];
      const seenRule = new Set();
      let ded = 0;
      r.hits.forEach(h => {
        const uid = h.rule_id || ('anon::' + (h.message || ''));
        if (seenRule.has(uid)) return;
        seenRule.add(uid);
        const lvl = h.severity_level;
        if (lvl === 'critical') ded += d.weight * 0.8;
        else if (lvl === 'major') ded += d.weight * 0.5;
        else if (lvl === 'minor') ded += d.weight * 0.2;
      });
      ded = Math.min(ded, d.weight);
      r.deduction = Math.round(ded * 100) / 100;
      r.score = Math.max(0, d.weight - ded);
      r.verdict = r.hits.some(h => h.severity_level === 'critical') ? 'critical'
               : r.hits.some(h => h.severity_level === 'major' || h.severity === 'error') ? 'error'
               : r.hits.some(h => h.severity_level === 'minor' || h.severity === 'warn') ? 'warn'
               : 'pass';
      total += r.score;
    });

    const sc = Math.round(total * 10) / 10;
    const built = buildSummary(sc, hits);

    return {
      total: sc,
      dims: dimResult,
      totalHits: hits.length,
      // 旧字段保持原语义（基于旧 severity）
      errorCount: hits.filter(h => h.severity === 'error').length,
      warnCount:  hits.filter(h => h.severity === 'warn').length,
      // 新增字段
      criticalCount: built.grouped.critical.length,
      minorCount: built.grouped.minor.length,
      groups: built.grouped,
      summary: built.summary
    };
  }

  const RADAR_DIMS = [
    { key: 'format',   name: '处方格式规范' },
    { key: 'match',    name: '诊断-用药匹配' },
    { key: 'dose',     name: '剂量准确' },
    { key: 'route',    name: '给药途径决策' },
    { key: 'compat',   name: '配伍识别' },
    { key: 'special',  name: '特殊人群关注' },
    { key: 'ess',      name: '基药集采甲类使用' },
    { key: 'abx',      name: '抗菌药物合理使用' },
    { key: 'surgery',  name: '手术决策' }
  ];

  // 缺失维度兜底：score=0, weight=1（仅作除零保护，勿改对象字面量写法，
  // 否则会被 scripts/validate-all.js 的 /weight:\s*(\d+)/ 正则误计入 DIMS 权重和）
  const FALLBACK_DIM = { score: 0 };
  FALLBACK_DIM.weight = 1;
  function mapReviewToRadar(review) {
    const d = review.dims || {};
    const safe = (k) => d[k] || FALLBACK_DIM;
    return {
      format:  safe('format').score / safe('format').weight * 100,
      match:   safe('indication').score / safe('indication').weight * 100,
      dose:    safe('dosage').score / safe('dosage').weight * 100,
      route:   safe('iv_reason').score / safe('iv_reason').weight * 100,
      compat:  (safe('compat_sv').score + safe('compat_int').score) / (safe('compat_sv').weight + safe('compat_int').weight) * 100,
      special: safe('special_pop').score / safe('special_pop').weight * 100,
      ess:     safe('insurance').score / safe('insurance').weight * 100,
      abx:     safe('abx').score / safe('abx').weight * 100,
      surgery: safe('surgery').score / safe('surgery').weight * 100
    };
  }

  global.Reviewer = { score, DIMS, RADAR_DIMS, mapReviewToRadar, resolveSeverityLevel, CRITICAL_RULE_IDS };
})(window);

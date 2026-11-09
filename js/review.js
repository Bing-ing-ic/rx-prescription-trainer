/* =====================================================================
 * review.js  点评评分器（三甲医院标准 · 智能化改造版 v2）
 * 权重写死在下方 DIMS；输入 hits 列表，输出百分制 + 分项 + 三级严重度分组。
 *
 * 权重设计依据（对标《医院处方点评管理规范（2010）》与《处方管理办法》）：
 *   - 诊断-用药匹配（indication 20 分）、给药途径决策（iv_reason 17 分）、
 *     剂量用法（dosage 13 分）、手术指征（surgery 12 分）为高权重维度，
 *     直接关系患者用药安全，是点评不合格的主要归因维度；
 *   - 特殊人群、重复用药/相互作用、格式、抗菌药物等为中权重维度；
 *   - 医保经济性、疗程、溶媒配伍为低权重维度，仅作规范性与经济性引导。
 *   12 个维度权重合计 = 100（百分制）。
 *
 * 硬约束：本文件中仅 DIMS 数组允许出现维度权重冒号数字字面量
 * （scripts/validate-all.js 用 /weight:\s*(\d+)/g 提取，合计必须 =100）。
 * FALLBACK_DIM 必须保持"对象字面量外赋值"写法，勿改成对象内联权重字段。
 *
 * 2026-11-09 升级说明（评分严谨度专项 v1）：
 *   1) summary 新增 rule_audit：double_deductions（同药多规则语义重叠检测）、
 *      conflicts（pass 级 hit 展示记录）、notes（未归类维度兜底提示），只记录不改分；
 *   2) summary 新增 weakness_profile：最弱 3-5 维度画像（score_pct/gap/改进方向）；
 *   3) summary 新增 learning_path：先停严重错误→再纠一般错误→最后优化经济性/格式；
 *   4) summary 新增 knowledge_recs：按命中 hit 的 related_topic 去重推荐知识点（≤5）；
 *   5) 同维度多条不同 rule_id 扣分采用"首条全额 + 后续递减"模型，维度封顶 weight；
 *   6) 零错误处方 headline 输出正向优秀反馈；ctx/hits 空值与除零全路径保护。
 *
 * 2026-11-09 严谨性升级（对标三甲医院处方点评 · 红线规则专项）：
 *   【根因】原 critical 仅扣 weight×0.8、major 仅扣 weight×0.5，导致儿童用喹诺酮
 *   （禁忌证）仍得 73.9 分"及格"、成人乱开 3 种无适应症药得 81.6 分"良好"，
 *   违反《医院处方点评管理规范（2010）》对"不适宜处方/超常处方"的定性。
 *   【红线硬失败】
 *     A. 存在任意 severity_level=critical 的 hit（禁忌证/皮试阳性仍用/特殊使用级
 *        抗菌药门诊使用/超极量/无指征输液负面清单/孕妇致畸药/儿童禁忌药）→
 *        总分强制封顶 ≤59，verdict='fail'，headline 强制为不合格警示。
 *        医学依据：禁忌证用药属"用药错误"，不存在"73 分及格"区间。
 *     B. major 累计 ≥3 条（跨所有维度）→ 同样封顶 ≤59、verdict='fail'。
 *        医学依据：无适应症乱开多种药 = 《处方管理办法》第四十一条"超常处方"，
 *        不得评定为合格处方。
 *   【扣分加重】critical 扣 weight×1.0（整维清零），major 扣 weight×0.6，
 *     minor 扣 weight×0.25；同维递减系数改为 [1.0, 0.7, 0.4, 0.2]。
 *   【权重微调（合计严格=100）】indication 20→22（诊断-用药匹配为安全核心）、
 *     special_pop 9→10（特殊人群禁忌权重提升）、abx 4→5（抗菌药物分级管理）、
 *     format 6→5、lab 4→3、duration 3→2、insurance 2→1（低风险规范/经济维度
 *     让位于高风险临床决策维度）。
 *   【headline 分级】critical 时强制"❌ 不合格处方：存在禁忌证用药…必须立即停药"；
 *     major≥3 时强制"❌ 不合格处方：存在 N 项严重用药不适宜…违反《处方管理办法》"；
 *     零错误时输出"✓ 优秀处方…可作为教学示范"。
 * ===================================================================== */
(function (global) {
  'use strict';

  // 按三甲医院处方点评管理规范调整权重（百分制，合计=100）
  // 2026-11-09 红线专项微调：高风险临床决策维度加重，低风险规范/经济维度让位
  const DIMS = [
    { key: 'format',     name: '处方格式规范',              weight: 4,  groups: ['FORMAT'] },
    { key: 'indication', name: '诊断-用药匹配（循证适应症）', weight: 22, groups: ['INDICATION'] },
    { key: 'dosage',     name: '剂量用法（单次/每日量）',    weight: 13, groups: ['DOSAGE'] },
    { key: 'duration',   name: '疗程适宜',                  weight: 1,  groups: ['DURATION'] },
    { key: 'iv_reason',  name: '给药途径决策与输液合理性',   weight: 17, groups: ['IV_REASON'] },
    { key: 'compat_sv',  name: '溶媒与配伍',                weight: 2,  groups: ['COMPAT'], onlyRuleIds: ['IV-06','IV-07'] },
    { key: 'compat_int', name: '药物相互作用/重复用药',      weight: 7,  groups: ['COMPAT'], excludeRuleIds: ['IV-06','IV-07'] },
    { key: 'special_pop',name: '特殊人群（儿童/老人/孕哺/肝肾）', weight: 10, groups: ['SPECIAL_POP'] },
    { key: 'abx',        name: '抗菌药物分级管理',          weight: 5,  groups: ['ABX'] },
    { key: 'insurance',  name: '医保/基药/集采经济性',        weight: 1,  groups: ['INSURANCE'] },
    { key: 'lab',       name: '检验检查适宜性（防过度医疗）', weight: 6,  groups: ['LAB'] },
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

  // ------------------------------------------------------------------
  // 维度改进方向语料（weakness_profile 用）
  // ------------------------------------------------------------------
  const DIM_SUGGESTIONS = {
    format:      '规范处方前记、后记与用法用量书写，逐项核对《处方管理办法》项目完整性',
    indication:  '对照本病种临床诊疗指南复核诊断-用药匹配，剔除无指征用药',
    dosage:      '按药品说明书与患者年龄/体重复核单次剂量、每日频次与给药浓度',
    duration:    '结合病程与病原学复查结果核定疗程，避免过长疗程诱发耐药与不良反应',
    iv_reason:   '严格把握门诊输液指征，优先口服序贯治疗，逐条核对输液负面清单',
    compat_sv:   '复核溶媒种类与用量，中药注射剂单独输注、不与其他药同瓶混加',
    compat_int:  '审查重复用药与药物相互作用，必要时调整给药间隔或更换品种',
    special_pop: '结合儿童/老人/孕哺状态与肝肾功能调整剂量并排查禁忌证',
    abx:         '落实抗菌药物分级管理，门诊不得使用特殊使用级，先送检后按药敏选药',
    insurance:   '优先选用国家基本药物、甲类医保与集采中选品种，控制自费比例',
    lab:         '按诊疗路径开具必要检验检查，避免无指征化验与过度检查',
    surgery:     '复核手术指征与绝对禁忌证，完善术前评估与知情同意流程'
  };

  // ------------------------------------------------------------------
  // rule_audit：双重扣分检测与归类冲突审计（只记录，不改变总分）
  // ------------------------------------------------------------------
  function familyOf(ruleId) {
    const m = /^([A-Z]+)-/.exec(String(ruleId || ''));
    return m ? m[1] : '';
  }
  // 语义重叠规则族对：同一药品同时被两族规则命中，教学上提示但不重复扣分
  const OVERLAP_PAIRS = [
    ['DUP', 'IND'],     // 重复用药 同时被判适应症不适宜
    ['DUP', 'DOSE'],    // 重复用药 同时被判剂量问题
    ['DUP', 'DOSAGE']
  ];
  function familiesOverlap(f1, f2) {
    if (!f1 || !f2 || f1 === f2) return false;
    return OVERLAP_PAIRS.some(p =>
      (p[0] === f1 && p[1] === f2) || (p[0] === f2 && p[1] === f1));
  }
  function buildRuleAudit(hits, dimResult) {
    const double_deductions = [];
    const conflicts = [];
    const notes = [];

    // 1) 按药品归集 hit，检测同药多规则语义重叠
    const byDrug = new Map();
    hits.forEach(h => {
      (h.affected_items || []).forEach(drug => {
        if (!drug) return;
        if (!byDrug.has(drug)) byDrug.set(drug, []);
        byDrug.get(drug).push(h);
      });
    });
    byDrug.forEach((hs, drug) => {
      const seenPairs = new Set();
      for (let i = 0; i < hs.length; i++) {
        for (let j = i + 1; j < hs.length; j++) {
          const a = hs[i], b = hs[j];
          if (!a || !b || !a.rule_id || !b.rule_id || a.rule_id === b.rule_id) continue;
          const da = classifyHit(a), db = classifyHit(b);
          // 溶媒配伍（compat_sv，仅 IV-06/IV-07）与其他配伍规则（compat_int）同药命中视为重叠
          const crossCompat = (da === 'compat_sv' && db === 'compat_int') ||
                              (da === 'compat_int' && db === 'compat_sv');
          if (!familiesOverlap(familyOf(a.rule_id), familyOf(b.rule_id)) && !crossCompat) continue;
          const pairKey = [a.rule_id, b.rule_id].sort().join('|');
          if (seenPairs.has(pairKey)) continue;
          seenPairs.add(pairKey);
          double_deductions.push({
            drug: drug,
            rules: [a.rule_id, b.rule_id],
            note: '同一药品被多条语义重叠规则命中：教学上提示风险，评分系统已按同维聚合与递减模型只计一次主扣分，不重复扣减'
          });
        }
      }
    });

    // 2) conflicts：severity=pass 的中性 hit 仅展示、不参与扣分
    hits.forEach(h => {
      if (h && h.severity_level === 'pass') {
        conflicts.push({
          type: 'pass_hit_listed',
          rule_id: h.rule_id || '(anon)',
          note: 'severity=pass 的中性提示不参与扣分，仅作教学展示记录'
        });
      }
    });

    // 3) notes：无法归入任何维度族、落到 format 兜底的 hit（非 FORMAT 组）
    if (dimResult && dimResult.format && Array.isArray(dimResult.format.hits)) {
      dimResult.format.hits.forEach(h => {
        if (h && h.group && h.group !== 'FORMAT') {
          notes.push({
            type: 'unclassified_fallback',
            rule_id: h.rule_id || '(anon)',
            group: h.group,
            note: '该规则分组无法归入现有维度族，暂按格式维兜底展示，建议规则引擎补充分组配置'
          });
        }
      });
    }
    return { double_deductions, conflicts, notes };
  }

  // ------------------------------------------------------------------
  // weakness_profile：最弱维度画像（只画像实际出错的维度，取最弱 5 个）
  // ------------------------------------------------------------------
  function buildWeaknessProfile(dimResult) {
    if (!dimResult) return [];
    const list = [];
    Object.keys(dimResult).forEach(k => {
      const r = dimResult[k];
      if (!r || !(r.weight > 0)) return;                 // 除零保护：零权重维度不参与画像
      if (!Array.isArray(r.hits) || r.hits.length === 0) return; // 未出错维度不画像
      const pct = Math.round((r.score / r.weight) * 1000) / 10;
      list.push({
        dim_key: k,
        dim_name: r.name,
        score_pct: pct,
        gap: Math.round((100 - pct) * 10) / 10,
        hits_count: r.hits.length,
        suggestion: DIM_SUGGESTIONS[k] || '结合命中规则复查相应诊疗环节'
      });
    });
    list.sort((a, b) => a.score_pct - b.score_pct);
    return list.slice(0, 5);
  }

  // ------------------------------------------------------------------
  // learning_path：先停严重错误 → 再纠一般错误 → 最后优化经济性/格式
  // ------------------------------------------------------------------
  function buildLearningPath(grouped, dimResult) {
    const steps = [];
    if (grouped.critical.length > 0) {
      steps.push('第一步：立即停药/撤回当前处方中的禁忌用药、超极量药品与无指征输液，按安全方案重新开具处方');
    }
    if (grouped.major.length > 0) {
      steps.push('第二步：对照本病种临床诊疗指南，复核诊断-用药匹配、单次剂量与药物相互作用，必要时请上级医师二次审核');
    }
    if (grouped.minor.length > 0) {
      steps.push('第三步：整改细节问题——规范处方前记/后记书写、核定疗程与给药途径，优先口服序贯治疗');
    }
    const ins = dimResult && dimResult.insurance;
    if (ins && Array.isArray(ins.hits) && ins.hits.length > 0) {
      steps.push('第四步：优化药品经济性，优先选用国家基本药物、甲类医保与集采中选品种');
    }
    if (steps.length === 0) {
      steps.push('本例处方零错误：保持规范用药习惯，复训《医院处方点评管理规范（2010）》后进入下一例病例演练');
    } else {
      steps.push('复盘本次命中规则的 lesson_point，完成错题重练后进入下一例病例');
    }
    return steps.slice(0, 5);
  }

  // ------------------------------------------------------------------
  // knowledge_recs：按命中 hit 的 related_topic 去重推荐知识点（≤5）
  // ------------------------------------------------------------------
  function buildKnowledgeRecs(hits) {
    const seen = new Set();
    const out = [];
    hits.forEach(h => {
      if (!h) return;
      const topic = h.related_topic;
      if (!topic || seen.has(topic)) return;
      seen.add(topic);
      out.push({
        topic: topic,
        title: String(topic).replace(/_/g, ' '),
        reason: h.lesson_point || h.message || '结合本例命中规则复习相关知识点'
      });
    });
    return out.slice(0, 5);
  }

  // 由 hits 组装 summary（供正常路径与空路径复用）
  function buildSummary(totalScore, hits, dimResult, opts) {
    opts = opts || {};
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

    // ===== 2026-11-09 红线硬失败规则（三甲处方点评） =====
    // A. 存在任意 critical（禁忌证/皮试阳性仍用/特殊使用级抗菌药门诊/超极量/
    //    无指征输液负面清单/孕妇致畸药/儿童禁忌药）→ 不合格，封顶 59。
    // B. major 累计 ≥3 条（跨所有维度）→ 超常处方，不合格，封顶 59。
    // C. 过度医疗：单条 LAB-02（无指征检查）命中 ≥3 个项目 → 严重过度检查，
    //    按"超常处方"不合格，封顶 59。医学依据：普通上感开 CT+肿瘤标志物+
    //    生化全项等 ≥3 项无关检查，违反诊疗适宜性原则，属重大缺陷。
    const hasCritical = grouped.critical.length > 0;
    const majorCount = grouped.major.length;
    const overLabHit = grouped.major.find(h =>
      h.rule_id === 'LAB-02' && Array.isArray(h.affected_items) && h.affected_items.length >= 3);
    const hardFail = hasCritical || majorCount >= 3 || !!overLabHit;

    let verdict;
    if (hardFail) {
      verdict = 'fail';
    } else if (totalScore >= 90) {
      verdict = 'excellent';
    } else if (totalScore >= 75) {
      verdict = 'good';
    } else if (totalScore >= 60) {
      verdict = 'pass';
    } else {
      verdict = 'fail';
    }

    // 硬失败：总分强制封顶 59
    let finalScore = totalScore;
    if (hardFail && finalScore > 59) finalScore = 59;

    const ordered = grouped.critical.concat(grouped.major, grouped.minor);
    const top_issues = ordered.slice(0, 3).map(h => h.title || h.message || '').filter(Boolean);

    let headline;
    if (hasCritical) {
      // 红线 A：禁忌证用药，必须立即停药
      const firstCrit = grouped.critical[0];
      const drugName = (firstCrit.affected_items && firstCrit.affected_items[0]) || '';
      const reason = firstCrit.lesson_point || firstCrit.message || firstCrit.title || '';
      headline = drugName
        ? `❌ 不合格处方：存在禁忌证用药（「${drugName}」${reason}），必须立即停药重新开具`
        : `❌ 不合格处方：存在禁忌证/严重用药错误（${reason}），必须立即停药重新开具`;
    } else if (overLabHit) {
      // 红线 C：严重过度检查/过度医疗
      const names = overLabHit.affected_items.slice(0, 4).join('、');
      headline = `❌ 不合格处方：存在严重过度医疗（无指征检查「${names}」等 ${overLabHit.affected_items.length} 项），违反诊疗适宜性原则与《处方管理办法》`;
    } else if (majorCount >= 3) {
      // 红线 B：超常处方（无适应症乱开多种药/重复用药/联合用药不当）
      headline = `❌ 不合格处方：存在 ${majorCount} 项严重用药不适宜（无适应症/重复用药/联合用药不当），违反《处方管理办法》第四十一条（超常处方）`;
    } else if (grouped.major.length > 0) {
      const firstMaj = grouped.major[0];
      const drugName = (firstMaj.affected_items && firstMaj.affected_items[0]) || '';
      headline = drugName
        ? '存在' + grouped.major.length + '处一般错误（涉及「' + drugName + '」等），建议复核用药方案'
        : '存在' + grouped.major.length + '处一般错误，建议复核用药方案';
    } else if (grouped.minor.length > 0) {
      headline = '处方基本合理，存在' + grouped.minor.length + '处细节可优化';
    } else {
      // 零错误：优秀处方正向反馈
      headline = totalScore >= 90
        ? '✓ 优秀处方：诊断-用药匹配，剂量途径适宜，零错误，可作为教学示范'
        : '处方规范，点评通过';
    }

    const next_steps = [];
    if (grouped.critical.length > 0) {
      next_steps.push('【立即执行】撤回处方中的禁忌用药、超极量药品与无指征输液，按安全方案重新开具');
    }
    if (overLabHit) {
      next_steps.push('【立即执行】删除与诊断无关的检查项目（CT/肿瘤标志物/生化全项等），按临床路径开具适宜检查');
    }
    if (grouped.major.length > 0) {
      next_steps.push('对照本病种临床诊疗指南，复核诊断-用药匹配、单次剂量与药物配伍，必要时请上级医师二次审核');
    }
    if (grouped.minor.length > 0) {
      next_steps.push('整改细节问题：规范处方前记/后记书写、核定疗程与给药途径，优先口服序贯治疗');
    }
    if (next_steps.length === 0) {
      next_steps.push('保持规范用药习惯，复训《医院处方点评管理规范（2010）》后进入下一例病例演练');
    }

    const summary = {
      verdict: verdict,
      headline: headline,
      top_issues: top_issues,
      next_steps: next_steps,
      category_stats: category_stats
    };

    // ===== 新增审计/画像字段（纯增量，下游未消费方不受影响） =====
    if (opts.empty) {
      summary.rule_audit = {
        double_deductions: [],
        conflicts: [],
        notes: [{ type: 'empty_visit', note: '空就诊路径，未执行规则审计' }]
      };
      summary.weakness_profile = [];
      summary.learning_path = ['根据临床诊断补充至少一种适宜药品或必要检验检查后，重新提交处方点评'];
      summary.knowledge_recs = [];
    } else {
      summary.rule_audit = buildRuleAudit(hits, dimResult);
      let wp = buildWeaknessProfile(dimResult);
      // 硬失败时把"医学合规性"放第一位（前置一条画像，强调红线）
      if (hardFail) {
        const complianceItem = {
          dim_key: '_medical_compliance',
          dim_name: '医学合规性（禁忌证/超常处方/过度医疗）',
          score_pct: 0,
          gap: 100,
          hits_count: grouped.critical.length + majorCount + (overLabHit ? 1 : 0),
          suggestion: '本例已触及处方点评红线（禁忌证/超常处方/过度医疗），必须先停药、撤方、按规范重新开具，再谈其他维度优化'
        };
        wp = [complianceItem].concat(wp);
      }
      summary.weakness_profile = wp;
      summary.learning_path = buildLearningPath(grouped, dimResult);
      summary.knowledge_recs = buildKnowledgeRecs(hits);
    }

    return { grouped, summary, finalScore, hardFail };
  }

  // ------------------------------------------------------------------
  // 同维度多条不同 rule_id 命中时的递减扣分系数：
  //   第 1 条系数 1.0（全额），第 2 条 0.7，第 3 条 0.4，第 4 条及以后 0.2。
  // 依据：教学点评中同一维度反复暴露问题时，扣分边际递减（承认问题已被识别），
  //       维度扣分仍封顶该维度满分——既避免"一错全扣"，也防止单维被无限叠加扣分。
  // 2026-11-09 红线专项：系数由 [1.0,0.6,0.3,0.15] 上调为 [1.0,0.7,0.4,0.2]，
  //   使同维多条不适宜（如多种无适应症药）扣分更贴近临床实际严重度。
  // ------------------------------------------------------------------
  const DED_ORDINAL_FACTORS = [1.0, 0.7, 0.4, 0.2];

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
      const built = buildSummary(0, [emptyHit], dimResult, { empty: true });
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

    // 4) 扣分：同维度同 rule_id 用 Set 聚合只扣一次；
    //    不同 rule_id 按"首条全额 + 后续递减"模型（系数见 DED_ORDINAL_FACTORS）。
    //    2026-11-09 红线专项：critical 扣 weight×1.0（整维清零），
    //    major 扣 weight×0.6，minor 扣 weight×0.25；维度封顶满分。
    let total = 0;
    DIMS.forEach(d => {
      const r = dimResult[d.key];
      const seenRule = new Set();
      let ded = 0;
      r.hits.forEach(h => {
        const uid = h.rule_id || ('anon::' + (h.message || ''));
        if (seenRule.has(uid)) return;
        seenRule.add(uid);
        const ordinalIdx = seenRule.size - 1;
        const factor = DED_ORDINAL_FACTORS[Math.min(ordinalIdx, DED_ORDINAL_FACTORS.length - 1)];
        const lvl = h.severity_level;
        let base = 0;
        if (lvl === 'critical') base = d.weight * 1.0;
        else if (lvl === 'major') base = d.weight * 0.6;
        else if (lvl === 'minor') base = d.weight * 0.25;
        ded += base * factor;
      });
      ded = Math.min(ded, d.weight);
      r.deduction = Math.round(ded * 100) / 100;
      r.score = Math.max(0, d.weight - ded);
      // critical 命中时该维 verdict 必须为 critical（最高优先级判定）
      r.verdict = r.hits.some(h => h.severity_level === 'critical') ? 'critical'
               : r.hits.some(h => h.severity_level === 'major' || h.severity === 'error') ? 'error'
               : r.hits.some(h => h.severity_level === 'minor' || h.severity === 'warn') ? 'warn'
               : 'pass';
      total += r.score;
    });

    const sc = Math.round(total * 10) / 10;
    const built = buildSummary(sc, hits, dimResult, {});
    // 红线硬失败时 buildSummary 会把 finalScore 封顶到 59
    const finalTotal = Math.round((built.finalScore != null ? built.finalScore : sc) * 10) / 10;

    return {
      total: finalTotal,
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
    const d = (review && review.dims) || {};
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

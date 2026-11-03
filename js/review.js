/* =====================================================================
 * review.js  点评评分器
 * 权重写死在下方 DIM_WEIGHTS；输入 hits 列表，输出百分制 + 11 维度分项。
 * ===================================================================== */
(function (global) {
  'use strict';

  // 11 维度权重（合计 100）
  const DIMS = [
    { key: 'format',     name: '处方格式规范',          weight: 15, groups: ['FORMAT'] },
    { key: 'indication', name: '诊断-用药匹配',          weight: 20, groups: ['INDICATION'] },
    { key: 'dosage',     name: '剂量用法',              weight: 12, groups: ['DOSAGE'] },
    { key: 'duration',   name: '疗程适宜',              weight: 3,  groups: ['DURATION'] },
    { key: 'iv_reason',  name: '给药途径决策与静脉输液合理性', weight: 20, groups: ['IV_REASON'] },
    { key: 'compat_sv',  name: '溶媒配伍',              weight: 5,  groups: ['COMPAT'], onlyRuleIds: ['IV-06','IV-07'] },
    { key: 'compat_int', name: '相互作用/重复用药',     weight: 10, groups: ['COMPAT'], excludeRuleIds: ['IV-06','IV-07'] },
    { key: 'special_pop',name: '特殊人群+皮试+过敏',    weight: 6,  groups: ['SPECIAL_POP'] },
    { key: 'abx',        name: '抗菌药物分级管理',      weight: 4,  groups: ['ABX'] },
    { key: 'insurance',  name: '医保/基药/集采',        weight: 5,  groups: ['INSURANCE'] },
    { key: 'tcm',        name: '中药饮片（占位）',       weight: 0,  groups: ['TCM'] }
  ];

  function classifyHit(h) {
    for (const d of DIMS) {
      if (!d.groups.includes(h.group)) continue;
      if (d.onlyRuleIds && !d.onlyRuleIds.includes(h.rule_id)) continue;
      if (d.excludeRuleIds && d.excludeRuleIds.includes(h.rule_id)) continue;
      return d.key;
    }
    return 'format';
  }

  function score(hits) {
    const dimResult = {};
    DIMS.forEach(d => { dimResult[d.key] = { name: d.name, weight: d.weight, hits: [], deduction: 0, score: d.weight }; });

    hits.forEach(h => {
      const k = classifyHit(h);
      dimResult[k].hits.push(h);
    });

    let total = 0;
    DIMS.forEach(d => {
      const r = dimResult[d.key];
      // 该维度下扣分：每个 error 扣 60%，每个 warn 扣 25%，pass 不扣
      let ded = 0;
      r.hits.forEach(h => {
        if (h.severity === 'error') ded += d.weight * 0.6;
        else if (h.severity === 'warn') ded += d.weight * 0.25;
      });
      ded = Math.min(ded, d.weight);
      r.deduction = ded;
      r.score = Math.max(0, d.weight - ded);
      r.verdict = r.hits.some(h=>h.severity==='error') ? 'error'
               : r.hits.some(h=>h.severity==='warn') ? 'warn' : 'pass';
      total += r.score;
    });

    return {
      total: Math.round(total * 10) / 10,
      dims: dimResult,
      totalHits: hits.length,
      errorCount: hits.filter(h=>h.severity==='error').length,
      warnCount: hits.filter(h=>h.severity==='warn').length
    };
  }

  // 八维能力画像维度（独立于 11 点评维度，用于雷达）
  const RADAR_DIMS = [
    { key: 'format',   name: '处方格式规范' },
    { key: 'match',    name: '诊断-用药匹配' },
    { key: 'dose',     name: '剂量准确' },
    { key: 'route',    name: '给药途径决策' },
    { key: 'compat',   name: '配伍识别' },
    { key: 'special',  name: '特殊人群关注' },
    { key: 'ess',      name: '基药集采甲类使用' },
    { key: 'abx',      name: '抗菌药物合理使用' }
  ];

  function mapReviewToRadar(review) {
    // 把 11 维评分映射到 8 维雷达
    const d = review.dims;
    return {
      format:  d.format.score / d.format.weight * 100,
      match:   d.indication.score / d.indication.weight * 100,
      dose:    d.dosage.score / d.dosage.weight * 100,
      route:   d.iv_reason.score / d.iv_reason.weight * 100,
      compat:  (d.compat_sv.score + d.compat_int.score) / (d.compat_sv.weight + d.compat_int.weight) * 100,
      special: d.special_pop.score / d.special_pop.weight * 100,
      ess:     d.insurance.score / d.insurance.weight * 100,
      abx:     d.abx.score / d.abx.weight * 100
    };
  }

  global.Reviewer = { score, DIMS, RADAR_DIMS, mapReviewToRadar };
})(window);

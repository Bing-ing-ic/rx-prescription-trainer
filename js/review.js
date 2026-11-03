/* =====================================================================
 * review.js  点评评分器（三甲医院标准）
 * 权重写死在下方 DIMS；输入 hits 列表，输出百分制 + 分项。
 * ===================================================================== */
(function (global) {
  'use strict';

  // 按三甲医院处方点评管理规范调整权重
  const DIMS = [
    { key: 'format',     name: '处方格式规范',              weight: 8,  groups: ['FORMAT'] },
    { key: 'indication', name: '诊断-用药匹配（循证适应症）', weight: 25, groups: ['INDICATION'] },
    { key: 'dosage',     name: '剂量用法（单次/每日量）',    weight: 15, groups: ['DOSAGE'] },
    { key: 'duration',   name: '疗程适宜',                  weight: 5,  groups: ['DURATION'] },
    { key: 'iv_reason',  name: '给药途径决策与输液合理性',   weight: 22, groups: ['IV_REASON'] },
    { key: 'compat_sv',  name: '溶媒与配伍',                weight: 5,  groups: ['COMPAT'], onlyRuleIds: ['IV-06','IV-07'] },
    { key: 'compat_int', name: '药物相互作用/重复用药',      weight: 8,  groups: ['COMPAT'], excludeRuleIds: ['IV-06','IV-07'] },
    { key: 'special_pop',name: '特殊人群（儿童/老人/孕哺/肝肾）', weight: 10, groups: ['SPECIAL_POP'] },
    { key: 'abx',        name: '抗菌药物分级管理',          weight: 5,  groups: ['ABX'] },
    { key: 'insurance',  name: '医保/基药/集采经济性',        weight: 2,  groups: ['INSURANCE'] },
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
      // 三甲标准：error 扣 80%，warn 扣 30%（更严格）
      let ded = 0;
      r.hits.forEach(h => {
        if (h.severity === 'error') ded += d.weight * 0.8;
        else if (h.severity === 'warn') ded += d.weight * 0.3;
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

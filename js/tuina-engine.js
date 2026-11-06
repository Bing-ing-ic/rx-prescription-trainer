/* =====================================================================
 * tuina-engine.js  推拿手法安全规则引擎（P3-1）
 *  - IIFE 模式，暴露 window.TuinaEngine.check(ctx)
 *  - 输入 ctx：{ case: caseObj, selectedTechniques: [手法名],
 *                patient: { age, pregnant } }
 *  - 输出     ：{ hits: [{ rule_id, severity, message, basis }] }
 *  - 核心规则：
 *      TN-ERR-01  病例禁忌含"中央型腰突/马尾综合征" + 选踩跷法 → error
 *      TN-ERR-02  病例禁忌含"寰枢(关节)半脱位"     + 选扳法   → error
 *      TN-WARN-01 孕妇 + 选强刺激手法（踩跷法/扳法）         → warn
 *      TN-WARN-02 老年（>70 岁）+ 选扳法                     → warn
 *  - 依据：人卫《推拿学》运动关节类手法禁忌；踩跷法可加重马尾综合征；
 *          扳法在寰枢半脱位、骨质疏松/老年患者中可致颈髓损伤。
 * ===================================================================== */
(function (global) {
  'use strict';

  // 强刺激手法名单（孕妇、老年患者需慎选）
  const STRONG_TECHNIQUES = ['踩跷法', '扳法'];
  // 老年阈值
  const ELDER_AGE = 70;

  // 病例 contraindications 中命中"中央型腰突/马尾"的关键字（模糊匹配）
  const KW_CENTRAL_DISC = ['中央型', '马尾'];
  // 病例 contraindications 中命中"寰枢半脱位"的关键字
  const KW_ATLAS_SUBLUX = ['寰枢'];

  function hasContra(caseObj, keywords) {
    const list = (caseObj && caseObj.contraindications) || [];
    return list.some(item => {
      const t = String(item || '').replace(/\s/g, '');
      return keywords.some(k => t.indexOf(k) >= 0);
    });
  }

  function normalizeTechniques(arr) {
    return (arr || []).map(s => String(s || '').trim()).filter(Boolean);
  }

  function mk(rule_id, severity, message, basis) {
    return { rule_id, severity, message, basis: basis || '' };
  }

  // ctx: { case, selectedTechniques, patient: { age, pregnant } }
  function check(ctx) {
    ctx = ctx || {};
    const caseObj = ctx.case || {};
    const techniques = normalizeTechniques(ctx.selectedTechniques);
    const patient = ctx.patient || {};
    const hits = [];

    // TN-ERR-01：中央型腰突/马尾综合征 + 踩跷法
    if (hasContra(caseObj, KW_CENTRAL_DISC) && techniques.indexOf('踩跷法') >= 0) {
      hits.push(mk(
        'TN-ERR-01',
        'error',
        '病例禁忌含"中央型腰突/马尾综合征"，严禁使用踩跷法。',
        '踩跷法以自身体重双足踩踏腰背，可加重中央型椎间盘突出对马尾神经的压迫，' +
        '甚至诱发/加重马尾综合征（大小便障碍、鞍区麻木）。此类患者应转为外科评估，' +
        '推拿仅可选择轻柔松解类手法（㨰法、揉法），禁用踩跷、背法。'
      ));
    }

    // TN-ERR-02：寰枢(关节)半脱位 + 扳法
    if (hasContra(caseObj, KW_ATLAS_SUBLUX) && techniques.indexOf('扳法') >= 0) {
      hits.push(mk(
        'TN-ERR-02',
        'error',
        '病例禁忌含"寰枢关节半脱位"，严禁使用颈部扳法。',
        '寰枢关节半脱位时关节失稳，颈部旋转扳法可进一步错位并危及延髓/高位颈髓，' +
        '导致呼吸循环障碍甚至瘫痪。此类患者应先行影像评估与牵引/颅骨/颌枕带复位，' +
        '复位稳定前禁用任何旋转、斜扳、踩跷类手法。'
      ));
    }

    // TN-WARN-01：孕妇 + 强刺激手法
    if (patient.pregnant && techniques.some(t => STRONG_TECHNIQUES.indexOf(t) >= 0)) {
      const chosen = techniques.filter(t => STRONG_TECHNIQUES.indexOf(t) >= 0);
      hits.push(mk(
        'TN-WARN-01',
        'warn',
        '孕妇患者应避免强刺激手法（已选：' + chosen.join('、') + '）。',
        '踩跷法重量大、振动强，可诱发子宫收缩；扳法为运动关节类突发性巧力，' +
        '可致反射性胎动不安甚至流产。孕妇腰腹、骶部尤其禁用重手法，' +
        '宜选用揉法、摩法、一指禅推法等轻柔松解手法，并避开合谷、三阴交、肩井等孕妇禁针/禁重按穴。'
      ));
    }

    // TN-WARN-02：老年（>70 岁）+ 扳法
    const age = Number(patient.age);
    if (!isNaN(age) && age > ELDER_AGE && techniques.indexOf('扳法') >= 0) {
      hits.push(mk(
        'TN-WARN-02',
        'warn',
        '患者年龄 ' + age + ' 岁（>70），使用扳法需高度谨慎。',
        '老年人多伴骨质疏松、颈椎管狭窄、后纵韧带骨化及血管硬化，' +
        '颈部旋转扳法有诱发颈椎骨折、硬膜外血肿、椎动脉夹层及脑卒中的风险。' +
        '宜先行骨密度与颈椎 MRI 评估；确需施用时应小幅度、低力度、' +
        '在生理活动范围内操作，严禁暴力、过度旋转颈椎。'
      ));
    }

    return { hits };
  }

  global.TuinaEngine = {
    check,
    STRONG_TECHNIQUES,
    ELDER_AGE,
    KW_CENTRAL_DISC,
    KW_ATLAS_SUBLUX
  };
})(typeof window !== 'undefined' ? window : global);

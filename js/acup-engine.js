/* =====================================================================
 * acup-engine.js  针灸推拿规则引擎
 *  - 内置：禁针/慎针穴（孕妇、晕针、大血管附近）、四总穴歌、主穴配穴
 *  - 暴露 window.ACUPENgine
 * ===================================================================== */
(function (global) {
  'use strict';

  // 孕妇绝对禁针穴（error）：教材明确列为孕妇禁针/禁灸，可动胎气
  // 依据：人卫《针灸学》"妊娠禁刺"节；合谷、三阴交泻血行气，昆仑、至阴活血催产，肩井深部为肺尖且气动胎，缺盆近胎气
  const PREGNANCY_FORBIDDEN = ['合谷','三阴交','昆仑','至阴','肩井','缺盆'];
  // 孕妇慎用穴（warn）：血海为活血调经穴，非绝对禁忌，妊娠期间应避免强刺激；
  // 天枢、次髎、中极、关元、石门、急脉为腹部/腰骶部穴，妊娠期间应禁强刺激、忌深刺重灸
  const PREGNANCY_CAUTION = ['血海','天枢','次髎','中极','关元','石门','急脉'];
  // 大血管/延髓附近禁深刺（warn）
  const DEEP_FORBIDDEN = ['风府','哑门','风池','天柱','颈动脉窦','人迎','晴明','承泣','球后','玉枕'];
  // 重要脏器附近禁直刺深刺
  const ORGAN_AREA = ['肺俞','心俞','膈俞','肝俞','脾俞','肾俞','肩井','云门','中府','期门','日月','章门','大包'];

  // 四总穴歌：肚腹三里留，腰背委中求，头项寻列缺，面口合谷收
  const SI_ZONG_XUE = [
    { area: '头面', points: ['合谷'], hint: '面口合谷收' },
    { area: '头项', points: ['列缺'], hint: '头项寻列缺' },
    { area: '腰背', points: ['委中'], hint: '腰背委中求' },
    { area: '肚腹', points: ['足三里'], hint: '肚腹三里留' }
  ];

  let extraRules = [];

  async function load() {
    try {
      const r = await fetch('data/acup-rules.json');
      if (r.ok) {
        const j = await r.json();
        extraRules = j.rules || j || [];
      }
    } catch (e) {}
  }

  // ctx: { case, zhengInput, points: [{name, method, retainMin, moxa}], patient: {isPregnant, age} }
  function check(ctx) {
    const hits = [];
    const c = ctx.case || {};
    const pts = ctx.points || [];
    const names = new Set(pts.map(p => (p.name || '').trim()));
    const patient = ctx.patient || {};

    // 1) 辨证
    const zheng = (ctx.zhengInput || '').replace(/\s/g, '');
    const refZheng = (c.syndrome_differentiation || c.zheng_hou || '').replace(/\s/g, '');
    if (!zheng) {
      hits.push(mk('ACU-ZH-01', 'ZHENG', error('未填写辨证'), '请先完成辨证，再据证选穴。'));
    } else if (refZheng && zheng !== refZheng && refZheng.indexOf(zheng) < 0 && zheng.indexOf(refZheng) < 0) {
      hits.push(mk('ACU-ZH-02', 'ZHENG', error('辨证与参考证型不符'),
        '学生辨证“' + zheng + '”，参考证型“' + refZheng + '”。请结合经络循行重新判断。',
        '参考证型：' + refZheng));
    }

    if (pts.length === 0) {
      hits.push(mk('ACU-PT-01', 'POINTS', error('未选择任何穴位'), '请根据辨证选择主穴与配穴。'));
      return { hits, score: score(hits) };
    }

    // 2) 孕妇禁针（error：绝对禁针穴；warn：腹部/腰骶/血海等慎用穴）
    if (patient.isPregnant) {
      PREGNANCY_FORBIDDEN.forEach(p => {
        if (names.has(p)) {
          hits.push(mk('ACU-PG-' + p, 'SAFETY', error('孕妇绝对禁针：' + p),
            p + '为孕妇禁针穴，妊娠期间尤其妊娠3个月内禁针，以免堕胎。合谷、三阴交泻血行气，昆仑、至阴活血催产，肩井、缺盆气动胎元。'));
        }
      });
      PREGNANCY_CAUTION.forEach(p => {
        if (names.has(p)) {
          hits.push(mk('ACU-PG-' + p, 'SAFETY', warn('孕妇慎用：' + p),
            p + '为孕妇慎用穴，非绝对禁忌；妊娠期间应避免强刺激、深刺重灸，确需使用宜浅刺轻刺激并告知患者。'));
        }
      });
    }

    // 3) 危险穴位（深部延髓/大血管）
    DEEP_FORBIDDEN.forEach(p => {
      if (names.has(p)) {
        hits.push(mk('ACU-DF-' + p, 'SAFETY', warn('危险腧穴：' + p),
          p + '深部邻近延髓/大血管，应严格控制针刺角度与深度，风府、哑门禁向上深刺。'));
      }
    });

    // 4) 胸背部腧穴禁直刺深刺
    ORGAN_AREA.forEach(p => {
      if (names.has(p)) {
        hits.push(mk('ACU-OR-' + p, 'SAFETY', warn(p + '应斜刺/浅刺'),
          p + '邻近重要脏器，应斜刺0.5-0.8寸，不可直刺深刺，以免气胸/刺伤脏器。'));
      }
    });

    // 5) 主穴匹配：区分"必选主穴"与"配穴"
    //    - 病例标注 main_points：必选主穴命中 < 80% 判 error（处方无纲）
    //    - 病例标注 adjuvant_points：配穴命中 < 30% 判 warn
    //    - 病例未标注分组（向后兼容）：reference_points 中至少命中 1 个即不报警
    const mainPts = (c.main_points || []).map(p => (typeof p === 'string' ? p : p.name));
    const adjPts = (c.adjuvant_points || []).map(p => (typeof p === 'string' ? p : p.name));
    if (mainPts.length > 0) {
      const mainHits = mainPts.filter(p => names.has(p));
      const mainRatio = mainHits.length / mainPts.length;
      if (mainRatio < 0.8) {
        const missing = mainPts.filter(p => !names.has(p));
        hits.push(mk('ACU-MN-01', 'POINTS', error('必选主穴命中不足（' + mainHits.length + '/' + mainPts.length + '）'),
          '必选主穴应至少命中 80%。已命中：' + (mainHits.join('、') || '无') +
          '；缺失：' + missing.join('、') +
          '。局部主穴+循经远端主穴构成处方骨架，缺一不可。',
          '必选主穴：' + mainPts.join('、')));
      }
      if (adjPts.length > 0) {
        const adjHits = adjPts.filter(p => names.has(p));
        const adjRatio = adjHits.length / adjPts.length;
        if (adjRatio < 0.3) {
          hits.push(mk('ACU-MN-02', 'POINTS', warn('配穴选取不足（' + adjHits.length + '/' + adjPts.length + '）'),
            '配穴建议命中 ≥30%。可选配穴：' + adjPts.join('、') +
            '。配穴随证加减，可增强主穴疗效。',
            '参考配穴：' + adjPts.join('、')));
        }
      }
    } else {
      // 向后兼容：未标注 main_points 的病例，保留"至少命中 1 个参考穴"的宽松规则
      const refMain = (c.reference_points || []).map(p => (typeof p === 'string' ? p : p.name));
      if (refMain.length > 0) {
        const hit = refMain.find(p => names.has(p));
        if (!hit) {
          hits.push(mk('ACU-MN-01', 'POINTS', warn('未选中参考主穴'),
            '参考主穴包括：' + refMain.join('、') + '。请结合经脉循行与主治重新选穴。'));
        }
      }
    }

    // 6) 补泻手法与证型匹配（粗略）
    const hasMethod = pts.some(p => p.method && p.method.indexOf('补') >= 0 || p.method.indexOf('泻') >= 0 || p.method.indexOf('平') >= 0);
    if (!hasMethod) {
      hits.push(mk('ACU-MD-01', 'METHOD', warn('未标注补泻手法'),
        '应根据虚/实/寒热补泻：虚证用补法，实证用泻法，虚实不明显用平补平泻。'));
    }

    // 7) 留针时间合理（一般15-30分钟）
    pts.forEach(p => {
      const m = parseFloat(p.retainMin);
      if (!isNaN(m) && m > 60) {
        hits.push(mk('ACU-RT-01', 'METHOD', warn(p.name + '留针时间过长'),
          p.name + '留针' + m + '分钟，一般留针15-20分钟，慢性病可至30分钟，过长易滞针/晕针。'));
      }
    });

    return { hits, score: score(hits) };
  }

  const DIMS = [
    { key: 'zheng', name: '辨证准确性', weight: 20 },
    { key: 'main', name: '主穴选择', weight: 30 },
    { key: 'peixue', name: '配穴合理性', weight: 15 },
    { key: 'method', name: '补泻手法规范', weight: 15 },
    { key: 'safety', name: '安全禁忌', weight: 20 }
  ];

  function score(hits) {
    const dimMap = { zheng: [], main: [], peixue: [], method: [], safety: [] };
    (hits || []).forEach(h => {
      if (h.group === 'ZHENG') dimMap.zheng.push(h);
      else if (h.group === 'POINTS') dimMap.main.push(h);
      else if (h.group === 'METHOD') dimMap.method.push(h);
      else if (h.group === 'SAFETY') dimMap.safety.push(h);
      else dimMap.peixue.push(h);
    });
    const dimResult = {};
    let total = 0;
    DIMS.forEach(d => {
      const hs = dimMap[d.key] || [];
      let ded = 0;
      hs.forEach(h => ded += h.severity === 'error' ? d.weight * 0.8 : d.weight * 0.3);
      ded = Math.min(ded, d.weight);
      dimResult[d.key] = { name: d.name, weight: d.weight, hits: hs, deduction: ded, score: d.weight - ded };
      total += d.weight - ded;
    });
    return {
      total: Math.round(total * 10) / 10,
      dims: dimResult,
      errorCount: (hits || []).filter(h => h.severity === 'error').length,
      warnCount: (hits || []).filter(h => h.severity === 'warn').length
    };
  }

  function mk(id, group, sev, message, suggestion, basis) {
    return { rule_id: id, group, title: sev.title, severity: sev.severity, message: message, suggestion: suggestion || '', basis: basis || '' };
  }
  function error(title) { return { severity: 'error', title: title }; }
  function warn(title) { return { severity: 'warn', title: title }; }

  global.ACUPENGINE = { load, check, score, DIMS, PREGNANCY_FORBIDDEN, PREGNANCY_CAUTION, DEEP_FORBIDDEN };
})(window);

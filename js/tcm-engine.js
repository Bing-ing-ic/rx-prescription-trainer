/* =====================================================================
 * tcm-engine.js  中医汉方规则引擎
 *  - 内置十八反、十九畏、辨证/治法/选方匹配、君臣佐使、剂量规范
 *  - 同时尝试加载 data/tcm-rules.json 作为扩展规则
 *  - 暴露 window.TCMEngine
 * ===================================================================== */
(function (global) {
  'use strict';

  // ---- 十八反（药材名归一化后匹配；同方中出现双方即 error）----
  // 歌诀：本草明言十八反，半蒌贝蔹及攻乌，藻戟遂芫俱战草，诸参辛芍叛藜芦
  const SHIBAFAN_PAIRS = [
    { a: ['川乌','草乌','附子','乌头','天雄'], b: ['半夏','法半夏','姜半夏','清半夏','水半夏','瓜蒌','瓜蒌皮','瓜蒌仁','天花粉','贝母','川贝母','浙贝母','伊贝母','白蔹','白及'], title: '乌头反半夏、瓜蒌、贝母、白蔹、白及' },
    { a: ['甘草','炙甘草'], b: ['海藻','京大戟','甘遂','芫花'], title: '甘草反海藻、大戟、甘遂、芫花' },
    { a: ['藜芦'], b: ['人参','红参','西洋参','党参','丹参','玄参','南沙参','北沙参苦参','细辛','赤芍','白芍'], title: '藜芦反诸参、细辛、芍药' }
  ];

  // ---- 十九畏（相畏；一般 warn，剧毒药对升 error）----
  // 歌诀：硫黄原是火中精，朴硝一见便相争；水银莫与砒霜见，狼毒最怕密陀僧；
  //       巴豆性烈最为上，偏与牵牛不顺情；丁香莫与郁金见，牙硝难合京三棱；
  //       川乌草乌不顺犀，人参最怕五灵脂；官桂善能调冷气，若逢石脂便相欺。
  const SHIJIUWEI_PAIRS = [
    { a: ['硫黄'], b: ['朴硝','芒硝','玄明粉'], title: '硫黄畏朴硝' },
    { a: ['水银'], b: ['砒霜','砒石'], title: '水银畏砒霜' },
    { a: ['狼毒'], b: ['密陀僧'], title: '狼毒畏密陀僧' },
    { a: ['巴豆','巴豆霜'], b: ['牵牛子','黑丑','白丑'], title: '巴豆畏牵牛' },
    { a: ['丁香','公丁香','母丁香'], b: ['郁金','广郁金'], title: '丁香畏郁金' },
    { a: ['牙硝','芒硝'], b: ['三棱','京三棱'], title: '牙硝畏三棱' },
    { a: ['川乌','草乌','附子'], b: ['犀角','水牛角'], title: '川乌/草乌畏犀角（现以水牛角代）' },
    { a: ['人参','红参','西洋参','党参'], b: ['五灵脂'], title: '人参畏五灵脂' },
    { a: ['肉桂','官桂','桂枝'], b: ['赤石脂','白石脂'], title: '官桂畏赤石脂' }
  ];

  // ---- 剂量安全阈值（g）：超出给 warn，剧毒超量给 error ----
  const DOSE_LIMITS = {
    '附子': { max: 15, note: '附子常规3-15g，宜先煎30-60分钟，过量易中毒' },
    '川乌': { max: 6, note: '川乌有毒，一般1.5-3g，宜先煎久煎' },
    '草乌': { max: 3, note: '草乌有毒，一般1.5-3g' },
    '细辛': { max: 3, note: '细辛"不过钱"，汤剂可用至3-6g，散剂不超过3g' },
    '麻黄': { max: 10, note: '麻黄发汗力强，常用2-10g' },
    '甘遂': { max: 1.5, note: '甘遂有毒，入丸散0.5-1.5g' },
    '大戟': { max: 3, note: '京大戟1.5-3g' },
    '芫花': { max: 3, note: '芫花1.5-3g' },
    '商陆': { max: 9, note: '商陆3-9g' },
    '马钱子': { max: 0.6, note: '马钱子0.3-0.6g，入丸散' },
    '朱砂': { max: 0.5, note: '朱砂0.1-0.5g，入丸散，不宜火煅' },
    '苦杏仁': { max: 10, note: '苦杏仁有小毒，5-10g' }
  };

  let extraRules = [];

  async function load() {
    try {
      const r = await fetch('data/tcm-rules.json');
      if (r.ok) {
        const j = await r.json();
        extraRules = j.rules || j || [];
      }
    } catch (e) { /* 数据未就绪时降级为内置规则 */ }
  }

  function norm(s) { return (s || '').replace(/\s/g, '').trim(); }

  function herbNamesSet(herbs) {
    const set = new Set();
    (herbs || []).forEach(h => {
      if (!h) return;
      const n = norm(h.name);
      if (n) set.add(n);
    });
    return set;
  }

  function matchAny(names, target) {
    return names.some(n => target === n || target.indexOf(n) >= 0 || n.indexOf(target) >= 0);
  }

  // ctx: { case, zhengInput, faZhengInput, formulaCode, formulaName, herbs: [{name,dose,role,prep}] }
  function check(ctx) {
    const hits = [];
    const c = ctx.case || {};
    const herbs = ctx.herbs || [];
    const names = herbNamesSet(herbs);

    // 1) 辨证
    const zheng = norm(ctx.zhengInput);
    const refZheng = norm(c.syndrome_differentiation || c.zheng_hou || '');
    if (!zheng) {
      hits.push(mk('TCM-ZH-01', 'ZHENG', error('未填写辨证'), '请先根据四诊资料完成辨证，再立法选方。'));
    } else if (refZheng && zheng !== refZheng && refZheng.indexOf(zheng) < 0 && zheng.indexOf(refZheng) < 0) {
      hits.push(mk('TCM-ZH-02', 'ZHENG', error('辨证与参考证型不符'),
        '学生辨证为“' + zheng + '”，参考证型为“' + refZheng + '”。请结合舌象、脉象重新判断。',
        '参考证型：' + refZheng));
    }

    // 2) 治法
    const fz = norm(ctx.faZhengInput);
    const refFz = norm(c.treatment_principle || c.fa_zheng || '');
    const zhengOk = !refZheng || zheng === refZheng || refZheng.indexOf(zheng) >= 0 || zheng.indexOf(refZheng) >= 0;
    if (!zhengOk) {
      // 辨证已错，治法不重复扣分
    } else if (refFz && fz) {
      const ok = refFz.indexOf(fz) >= 0 || fz.indexOf(refFz) >= 0;
      if (!ok) {
        hits.push(mk('TCM-FZ-01', 'FAZHENG', warn('治法与证型不够贴合'),
          '治法为“' + fz + '”，与“' + refZheng + '”对应的常用治法“' + refFz + '”存在偏差。'));
      }
    } else if (!fz) {
      hits.push(mk('TCM-FZ-02', 'FAZHENG', warn('未填写治法'), '辨证后应"随证立法"，治法应与证型对应。'));
    }

    // 3) 选方（按 code 或 name 匹配）
    const fm = norm(ctx.formulaName);
    const refFm = norm((c.formulas && c.formulas[0]) || c.formula_name || c.formula || '');
    const refFmCode = (c.reference_formula_code || '').toUpperCase();
    const selFmCode = (ctx.formulaCode || '').toUpperCase();
    if (refFmCode && selFmCode) {
      if (refFmCode !== selFmCode) {
        hits.push(mk('TCM-FM-01', 'FORMULA', warn('所选方剂与参考方不符'),
          '选方代码为“' + selFmCode + '”，参考用方代码为“' + refFmCode + '”。请考虑该方是否对证。',
          '参考方：' + refFm));
      }
    } else if (refFm && fm) {
      const ok = refFm.indexOf(fm) >= 0 || fm.indexOf(refFm) >= 0;
      if (!ok) {
        hits.push(mk('TCM-FM-01', 'FORMULA', warn('所选方剂与参考方不符'),
          '选方为“' + fm + '”，参考用方为“' + refFm + '”。',
          '参考方：' + refFm));
      }
    } else if (!fm) {
      hits.push(mk('TCM-FM-02', 'FORMULA', error('未选择方剂'), '应在辨证立法后选择对应方剂。'));
    }

    // 4) 十八反
    SHIBAFAN_PAIRS.forEach(p => {
      const hitA = p.a.find(n => matchAny([n], [...names]));
      const hitB = p.b.find(n => matchAny([n], [...names]));
      if (hitA && hitB) {
        hits.push(mk('TCM-FB-' + p.a[0], 'INCOMPAT', error('十八反：' + p.title),
          '方中同时出现“' + hitA + '”与“' + hitB + '”，属十八反配伍禁忌，原则上禁止同方。'));
      }
    });

    // 5) 十九畏
    SHIJIUWEI_PAIRS.forEach(p => {
      const hitA = p.a.find(n => matchAny([n], [...names]));
      const hitB = p.b.find(n => matchAny([n], [...names]));
      if (hitA && hitB) {
        hits.push(mk('TCM-WW-' + p.a[0], 'INCOMPAT', warn('十九畏：' + p.title),
          '方中同时出现“' + hitA + '”与“' + hitB + '”，属十九畏，临床一般避免同方；如确需同用须医师签名并向患者说明。'));
      }
    });

    // 6) 君臣佐使结构
    const hasJun = herbs.some(h => norm(h.role) === '君');
    if (herbs.length > 0 && !hasJun) {
      hits.push(mk('TCM-JZ-01', 'STRUCT', warn('缺少君药标注'),
        '方剂应分清君臣佐使。君药是针对主证起主要治疗作用的药物，不可或缺。'));
    }
    if (herbs.length === 0) {
      hits.push(mk('TCM-JZ-02', 'STRUCT', error('处方为空'), '请在所选方基础上加入中药，或自行组方。'));
    }

    // 7) 剂量超限
    herbs.forEach(h => {
      if (!h || !h.name) return;
      const n = norm(h.name);
      const dose = parseFloat(h.dose);
      if (isNaN(dose)) return;
      // 精确命中或包含
      for (const key in DOSE_LIMITS) {
        if (n === key || n.indexOf(key) >= 0 || key.indexOf(n) >= 0) {
          const lim = DOSE_LIMITS[key];
          if (dose > lim.max) {
            hits.push(mk('TCM-DS-' + key, 'DOSAGE', error(key + '剂量过大'),
              key + '用' + dose + 'g，超过常规上限' + lim.max + 'g。' + lim.note));
          }
          break;
        }
      }
      if (dose > 30) {
        hits.push(mk('TCM-DS-GEN', 'DOSAGE', warn('单味药剂量偏大'),
          n + '用' + dose + 'g，超出常用上限（一般饮片3-15g，重证可至30g），请复核。'));
      }
      if (dose <= 0) {
        hits.push(mk('TCM-DS-00', 'DOSAGE', error('剂量无效'), n + '剂量为' + h.dose + '，请填写正数克数。'));
      }
    });

    // 8) 扩展规则（外部 JSON 声明的检查，按 herb_pair / zheng / formula 类型）
    (extraRules || []).forEach(r => {
      try {
        if (r.type === 'herb_pair' && r.a && r.b) {
          const hitA = r.a.find(n => names.has(n));
          const hitB = r.b.find(n => names.has(n));
          if (hitA && hitB) {
            hits.push(mk(r.id || 'TCM-EX', r.group || 'CUSTOM',
              r.severity === 'warn' ? warn(r.title || '配伍禁忌') : error(r.title || '配伍禁忌'),
              r.message || ('方中出现 ' + hitA + ' 与 ' + hitB),
              r.suggestion || '', r.basis || ''));
          }
        }
      } catch (e) {}
    });

    return hits;
  }

  function mk(id, group, sev, message, suggestion, basis) {
    return { rule_id: id, group, title: sev.title, severity: sev.severity, message: message, suggestion: suggestion || '掌握相关配伍与剂量规范', basis: basis || '' };
  }
  function error(title) { return { severity: 'error', title: title }; }
  function warn(title) { return { severity: 'warn', title: title }; }

  // 评分：5 个维度
  const DIMS = [
    { key: 'zheng', name: '辨证准确性', weight: 25 },
    { key: 'fazheng', name: '治法正确性', weight: 15 },
    { key: 'formula', name: '选方合理性', weight: 20 },
    { key: 'compat', name: '配伍安全（十八反十九畏）', weight: 25 },
    { key: 'dosage', name: '剂量与煎服规范', weight: 15 }
  ];

  function score(hits) {
    const dimMap = { zheng: [], fazheng: [], formula: [], compat: [], dosage: [] };
    (hits || []).forEach(h => {
      if (h.group === 'ZHENG') dimMap.zheng.push(h);
      else if (h.group === 'FAZHENG') dimMap.fazheng.push(h);
      else if (h.group === 'FORMULA' || h.group === 'STRUCT') dimMap.formula.push(h);
      else if (h.group === 'INCOMPAT' || h.group === 'CUSTOM') dimMap.compat.push(h);
      else if (h.group === 'DOSAGE') dimMap.dosage.push(h);
      else dimMap.formula.push(h);
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

  global.TCMEngine = { load, check, score, DIMS, SHIBAFAN_PAIRS, SHIJIUWEI_PAIRS };
})(window);

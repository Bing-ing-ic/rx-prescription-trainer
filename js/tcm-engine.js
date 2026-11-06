/* =====================================================================
 * tcm-engine.js  中医汉方规则引擎
 *  - 内置十八反、十九畏、辨证/治法/选方匹配、君臣佐使、剂量规范
 *  - 同时加载 data/tcm-rules.json 作为扩展规则（type-based 可执行）
 *  - 暴露 window.TCMEngine
 * ===================================================================== */
(function (global) {
  'use strict';

  // ---- 十八反（药材名归一化后匹配；同方中出现双方即 error）----
  // 歌诀：本草明言十八反，半蒌贝蔹及攻乌，藻戟遂芫俱战草，诸参辛芍叛藜芦
  // T-3 修复：'北沙参苦参' 拆分为 '北沙参'、'苦参' 两个独立条目
  const SHIBAFAN_PAIRS = [
    { a: ['川乌','草乌','附子','乌头','天雄','制川乌','制草乌'], b: ['半夏','法半夏','姜半夏','清半夏','水半夏','瓜蒌','瓜蒌皮','瓜蒌仁','天花粉','贝母','川贝母','浙贝母','伊贝母','白蔹','白及'], title: '乌头反半夏、瓜蒌、贝母、白蔹、白及' },
    { a: ['甘草','炙甘草'], b: ['海藻','京大戟','甘遂','芫花'], title: '甘草反海藻、大戟、甘遂、芫花' },
    { a: ['藜芦'], b: ['人参','红参','西洋参','党参','丹参','玄参','南沙参','北沙参','苦参','细辛','赤芍','白芍'], title: '藜芦反诸参、细辛、芍药' }
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
    { a: ['川乌','草乌','附子','制川乌','制草乌'], b: ['犀角','水牛角'], title: '川乌/草乌畏犀角（现以水牛角代）' },
    { a: ['人参','红参','西洋参','党参'], b: ['五灵脂'], title: '人参畏五灵脂' },
    { a: ['肉桂','官桂','桂枝'], b: ['赤石脂','白石脂'], title: '官桂畏赤石脂' }
  ];

  // ---- 剂量安全阈值（g）：超出给 warn，剧毒超量给 error ----
  // T-5/E-03 修复：川乌/草乌/制川乌/制草乌统一为 3g（药典 1.5-3g 上限）
  // P1-1 修复：生川乌/生草乌不得内服（max=0，出现即 error），内服一律使用炮制品
  const DOSE_LIMITS = {
    '附子': { max: 15, note: '附子常规3-15g，宜先煎30-60分钟，过量易中毒' },
    '川乌': { max: 3, note: '川乌有毒，1.5-3g，宜先煎久煎；内服须用制川乌' },
    '草乌': { max: 3, note: '草乌有毒，1.5-3g，宜先煎久煎；内服须用制草乌' },
    '制川乌': { max: 3, note: '制川乌1.5-3g，宜先煎久煎30-60分钟，至口尝无麻辣感' },
    '制草乌': { max: 3, note: '制草乌1.5-3g，宜先煎久煎30-60分钟，至口尝无麻辣感' },
    '生川乌': { max: 0, note: '生川乌毒性剧烈，一般只供外用，不得内服；如确需内服必须经炮制为制川乌，并在医师指导下先煎久煎' },
    '生草乌': { max: 0, note: '生草乌毒性剧烈，一般只供外用，不得内服；如确需内服必须经炮制为制草乌，并在医师指导下先煎久煎' },
    '细辛': { max: 3, note: '细辛"不过钱"，汤剂可用至3g，散剂不超过3g' },
    '麻黄': { max: 10, note: '麻黄发汗力强，常用2-10g' },
    '甘遂': { max: 1.5, note: '甘遂有毒，入丸散0.5-1.5g' },
    '大戟': { max: 3, note: '京大戟1.5-3g' },
    '芫花': { max: 3, note: '芫花1.5-3g' },
    '商陆': { max: 9, note: '商陆3-9g' },
    '马钱子': { max: 0.6, note: '马钱子0.3-0.6g，入丸散' },
    '朱砂': { max: 0.5, note: '朱砂0.1-0.5g，只入丸散，不入煎剂；忌火煅' },
    '苦杏仁': { max: 10, note: '苦杏仁有小毒，5-10g' }
  };

  // ---- T-4 修复：药名规范化别名表 ----
  // 炮制品/别名 → 处方通用名（仅用于十八反/十九畏/剂量表的命中映射）
  // 严禁子串包含；白附子 ≠ 附子，法半夏 → 半夏（十八反 b 列已列法半夏，此处仅做兜底）
  const HERB_ALIAS = {
    '炙甘草': '甘草',
    '法半夏': '半夏',
    '姜半夏': '半夏',
    '清半夏': '半夏',
    '水半夏': '半夏',
    '半夏曲': '半夏',
    '苦杏仁': '杏仁',
    '杏仁': '苦杏仁',
    '苏叶': '紫苏叶',
    '元参': '玄参',
    '乌元参': '玄参',
    '忍冬花': '金银花',
    '双花': '金银花',
    '板蓝根': '大青叶', // 非十八反药，仅规范化
    '橘红': '陈皮',
    '紅花': '红花',
    '淮山药': '山药',
    '怀山药': '山药',
    '杭白芍': '白芍',
    '川白芍': '白芍',
    '细生地': '生地黄',
    '大生地': '生地黄',
    '熟地': '熟地黄'
  };

  // 剂型后缀（处方文本中可能出现的后缀，规范化时剥离）
  // 注意：不能包含"膏"（会误伤"石膏"）、"片"（会误伤"冰片"）、"花"等常见药名字尾
  // 仅保留明确不会出现在药名末尾的剂型词
  const DOSAGE_FORM_SUFFIX = /(汤|散|丸|丹|饮|颗粒|胶囊|合剂|口服液|煎)$/;

  // 脚注关键词（prep 字段中可能出现的先煎/后下等标注）
  const DECOCTION_FIRST_KEY = /先煎|久煎|先入|另煎先/;
  const DECOCTION_LATER_KEY = /后下|后入|临煎|薄荷后下/;
  const DECOCTION_WRAP_KEY = /包煎|布包|纱布包/;
  const DECOCTION_MELT_KEY = /烊化|烊|蒸化|溶化兑/;
  const DECOCTION_SEPARATE_KEY = /另煎|另炖|另蒸|另煎兑/;
  const DECOCTION_POWDER_KEY = /冲服|研末冲|吞服|入丸散|不入煎/;

  let extraRules = [];
  let herbsMeta = {}; // 药名 → {min, max, range, usage}

  async function load() {
    try {
      const r = await fetch('data/tcm-rules.json');
      if (r.ok) {
        const j = await r.json();
        // 兼容：原 rules 数组（trigger/group schema）与 executable_rules 数组并存
        const exec = j.executable_rules || [];
        const legacy = j.rules || j || [];
        // 合并：优先使用带 type 字段的可执行规则
        extraRules = exec.concat(legacy.filter(x => x && x.type));
      }
    } catch (e) { /* 数据未就绪时降级为内置规则 */ }

    // 同时加载 tcm-herbs.json 建 dose_range 映射，供 dose_range_check 使用
    try {
      const hr = await fetch('data/tcm-herbs.json');
      if (hr.ok) {
        const hj = await hr.json();
        const arr = (hj && hj.herbs) || (Array.isArray(hj) ? hj : []);
        herbsMeta = buildHerbsMeta(arr);
      }
    } catch (e) { /* 静默降级 */ }
  }

  function buildHerbsMeta(arr) {
    const m = {};
    (arr || []).forEach(h => {
      if (!h || !h.name) return;
      const name = norm(h.name);
      if (!name) return;
      let min = null, max = null;
      if (typeof h.min_dose === 'number') min = h.min_dose;
      if (typeof h.max_dose === 'number') max = h.max_dose;
      // 解析 dose_range 字符串如 "0.1-0.5g" / "3-9g" / "10-15g"
      if ((min === null || max === null) && typeof h.dose_range === 'string') {
        const mt = h.dose_range.match(/([0-9]+(?:\.[0-9]+)?)\s*[-–~～]\s*([0-9]+(?:\.[0-9]+)?)/);
        if (mt) {
          if (min === null) min = parseFloat(mt[1]);
          if (max === null) max = parseFloat(mt[2]);
        }
      }
      m[name] = { min, max, range: h.dose_range || '', usage: h.usage || '', contra: h.contraindications || [] };
    });
    return m;
  }

  function norm(s) { return (s || '').replace(/\s/g, '').trim(); }

  // T-4 修复：规范化药名——剥离剂量数字、单位、脚注、剂型后缀
  function normalizeHerbName(raw) {
    if (!raw) return '';
    let s = String(raw);
    // 去掉剂量部分：如 "朱砂 0.1-0.5g（研末冲服，不入煎剂）" → "朱砂"
    s = s.split(/[0-9]/)[0];
    // 去掉括号及其中的脚注说明
    s = s.replace(/[（(].*?[）)]/g, '');
    // 去掉剂型后缀
    s = s.replace(DOSAGE_FORM_SUFFIX, '');
    s = norm(s);
    // 别名映射
    if (HERB_ALIAS[s]) s = HERB_ALIAS[s];
    return s;
  }

  function herbNamesSet(herbs) {
    const set = new Set();
    (herbs || []).forEach(h => {
      if (!h) return;
      // 支持两种入参：字符串 "药名" 或对象 {name, dose, role, prep}
      const rawName = typeof h === 'string' ? h : h.name;
      const n = normalizeHerbName(rawName);
      if (n) set.add(n);
    });
    return set;
  }

  // T-4 修复：精确匹配——禁止子串包含
  // names: 处方中药名集合（已规范化）；target: 十八反/十九畏表中的药名
  function matchAny(names, targetList) {
    return targetList.find(t => names.has(t));
  }

  // ctx: { case, zhengInput, faZhengInput, formulaCode, formulaName,
  //        herbs: [{name,dose,role,prep}],
  //        patient?: {pregnant?:boolean, age?:number, gender?:string},
  //        herbsMeta?: {name:{min,max,range,usage}} }
  function check(ctx) {
    const hits = [];
    const c = ctx.case || {};
    const herbs = ctx.herbs || [];
    const names = herbNamesSet(herbs);

    // 患者妊娠状态：优先 ctx.patient，其次 ctx.case.pregnant / ctx.case.patient?.pregnant
    const patient = ctx.patient || c.patient || {};
    const isPregnant = !!(patient.pregnant || c.pregnant || (c.patient && c.patient.pregnant));
    const patientAge = patient.age || c.age || null;

    // 合并 herbsMeta（外部传入优先）
    const meta = Object.assign({}, herbsMeta, ctx.herbsMeta || {});

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

    // 4) 十八反（T-4：精确匹配）
    SHIBAFAN_PAIRS.forEach(p => {
      const hitA = matchAny(names, p.a);
      const hitB = matchAny(names, p.b);
      if (hitA && hitB) {
        hits.push(mk('TCM-FB-' + p.a[0], 'INCOMPAT', error('十八反：' + p.title),
          '方中同时出现“' + hitA + '”与“' + hitB + '”，属十八反配伍禁忌，原则上禁止同方。'));
      }
    });

    // 5) 十九畏（T-4：精确匹配）
    SHIJIUWEI_PAIRS.forEach(p => {
      const hitA = matchAny(names, p.a);
      const hitB = matchAny(names, p.b);
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

    // 7) 内置剂量超限（精确匹配）
    herbs.forEach(h => {
      if (!h || !h.name) return;
      const n = normalizeHerbName(h.name);
      const dose = parseFloat(h.dose);
      if (isNaN(dose)) return;
      // 精确命中（不再用 indexOf 双向包含，避免白附子误判为附子）
      if (DOSE_LIMITS[n]) {
        const lim = DOSE_LIMITS[n];
        if (dose > lim.max) {
          hits.push(mk('TCM-DS-' + n, 'DOSAGE', error(n + '剂量过大'),
            n + '用' + dose + 'g，超过常规上限' + lim.max + 'g。' + lim.note));
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

    // 8) 扩展规则（T-5：type-based 分发）
    (extraRules || []).forEach(r => {
      try {
        if (!r || !r.type) return;
        switch (r.type) {
          case 'herb_pair': {
            if (!r.a || !r.b) break;
            const hitA = r.a.find(n => names.has(n));
            const hitB = r.b.find(n => names.has(n));
            if (hitA && hitB) {
              hits.push(mk(r.id || 'TCM-EX', r.group || 'CUSTOM',
                r.severity === 'warn' ? warn(r.title || '配伍禁忌') : error(r.title || '配伍禁忌'),
                r.message || ('方中出现 ' + hitA + ' 与 ' + hitB),
                r.suggestion || '', r.basis || ''));
            }
            break;
          }
          case 'pregnancy_ban': {
            if (!isPregnant) break;
            (r.herbs || []).forEach(h => {
              if (names.has(h)) {
                hits.push(mk(r.id || 'TCM-PREG-BAN', r.group || 'SPECIAL_POP',
                  error(r.title || '孕妇禁用该药'),
                  '患者为孕妇，方中使用妊娠禁用药“' + h + '”，可致堕胎或胎儿畸形，必须撤除。',
                  r.suggestion || '请改用安全的同类药物。', r.basis || ''));
              }
            });
            break;
          }
          case 'pregnancy_caution': {
            if (!isPregnant) break;
            (r.herbs || []).forEach(h => {
              if (names.has(h)) {
                hits.push(mk(r.id || 'TCM-PREG-CAU', r.group || 'SPECIAL_POP',
                  warn(r.title || '孕妇慎用该药'),
                  '患者为孕妇，方中使用妊娠慎用药“' + h + '”，须权衡利弊，减量或避免使用。',
                  r.suggestion || '如需使用应小剂量短期，并告知患者。', r.basis || ''));
              }
            });
            break;
          }
          case 'decoction_first': {
            herbs.forEach(h => {
              const n = normalizeHerbName(h.name);
              if ((r.herbs || []).indexOf(n) >= 0) {
                const prep = norm(h.prep || '');
                if (!DECOCTION_FIRST_KEY.test(prep)) {
                  hits.push(mk(r.id || 'TCM-USG-XJ', r.group || 'USAGE',
                    warn(r.title || '该药宜先煎'),
                    '方中“' + n + '”属矿物/贝壳/有毒药，应先煎30-60分钟（有毒药须久煎减毒），未标注脚注。',
                    r.suggestion || '请在该味药右上角标注"先煎"。', r.basis || ''));
                }
              }
            });
            break;
          }
          case 'decoction_later': {
            herbs.forEach(h => {
              const n = normalizeHerbName(h.name);
              if ((r.herbs || []).indexOf(n) >= 0) {
                const prep = norm(h.prep || '');
                if (!DECOCTION_LATER_KEY.test(prep)) {
                  hits.push(mk(r.id || 'TCM-USG-HX', r.group || 'USAGE',
                    warn(r.title || '芳香药宜后下'),
                    '方中“' + n + '”含挥发油，久煎有效成分散失，应在煎成前5-10分钟放入，未标注脚注。',
                    r.suggestion || '请标注"后下"。', r.basis || ''));
                }
              }
            });
            break;
          }
          case 'decoction_wrap': {
            herbs.forEach(h => {
              const n = normalizeHerbName(h.name);
              if ((r.herbs || []).indexOf(n) >= 0) {
                const prep = norm(h.prep || '');
                if (!DECOCTION_WRAP_KEY.test(prep)) {
                  hits.push(mk(r.id || 'TCM-USG-BJ', r.group || 'USAGE',
                    warn(r.title || '该药宜包煎'),
                    '方中“' + n + '”为粉末/绒毛/细小种子，易混浊药液或刺激咽喉，应纱布包煎。',
                    r.suggestion || '请标注"包煎"。', r.basis || ''));
                }
              }
            });
            break;
          }
          case 'decoction_melt': {
            herbs.forEach(h => {
              const n = normalizeHerbName(h.name);
              if ((r.herbs || []).indexOf(n) >= 0) {
                const prep = norm(h.prep || '');
                if (!DECOCTION_MELT_KEY.test(prep)) {
                  hits.push(mk(r.id || 'TCM-USG-YH', r.group || 'USAGE',
                    warn(r.title || '胶类药宜烊化'),
                    '方中“' + n + '”为胶类药，入煎易粘锅粘他药，应单独蒸化后兑入药汁。',
                    r.suggestion || '请标注"烊化"。', r.basis || ''));
                }
              }
            });
            break;
          }
          case 'decoction_separate': {
            herbs.forEach(h => {
              const n = normalizeHerbName(h.name);
              if ((r.herbs || []).indexOf(n) >= 0) {
                const prep = norm(h.prep || '');
                if (!DECOCTION_SEPARATE_KEY.test(prep) && !DECOCTION_POWDER_KEY.test(prep)) {
                  hits.push(mk(r.id || 'TCM-USG-LJ', r.group || 'USAGE',
                    warn(r.title || '贵重药宜另煎'),
                    '方中“' + n + '”为贵重细料药，另炖取汁兑服可避免有效成分被他药吸附。',
                    r.suggestion || '请标注"另煎兑服"。', r.basis || ''));
                }
              }
            });
            break;
          }
          case 'dose_strict': {
            // 剧毒药剂量硬上限（r.limits: {药名: maxG}）
            const limits = r.limits || {};
            herbs.forEach(h => {
              const n = normalizeHerbName(h.name);
              const dose = parseFloat(h.dose);
              if (isNaN(dose)) return;
              if (typeof limits[n] === 'number' && dose > limits[n]) {
                hits.push(mk(r.id || 'TCM-DOSE-STRICT', r.group || 'DOSAGE',
                  error(r.title || '有毒药剂量超限'),
                  n + '用' + dose + 'g，超过药典上限' + limits[n] + 'g。' + (r.note || '须严格按《药典》剂量。'),
                  r.suggestion || '请先煎久煎，并在医师指导下使用。', r.basis || ''));
              }
            });
            break;
          }
          case 'dose_range_check': {
            // 对照 tcm-herbs.json dose_range 逐项检查
            herbs.forEach(h => {
              const n = normalizeHerbName(h.name);
              const dose = parseFloat(h.dose);
              if (isNaN(dose)) return;
              const m = meta[n];
              if (!m || m.max === null || m.max === undefined) return;
              // 朱砂特殊：不入煎剂，若 prep 未标冲服/入丸散则 error
              if (n === '朱砂' && !DECOCTION_POWDER_KEY.test(norm(h.prep || ''))) {
                hits.push(mk(r.id || 'TCM-DOSE-ZS', 'DOSAGE',
                  error('朱砂不得入煎剂'),
                  '朱砂含硫化汞，入煎则析出水银致汞中毒；必须研末冲服或入丸散。',
                  '请改"研末冲服 0.1-0.5g"，或改用朱砂安神丸成药。',
                  '《中国药典》2025版：朱砂0.1-0.5g，多入丸散服，不宜入煎剂。'));
                return;
              }
              if (dose > m.max) {
                hits.push(mk(r.id || 'TCM-DRANGE-' + n, r.group || 'DOSAGE',
                  error(n + '剂量超《药典》上限'),
                  n + '用' + dose + 'g，《药典》范围为' + (m.range || m.max + 'g') + '。',
                  r.suggestion || '请核对《药典》剂量。', r.basis || ''));
              } else if (m.max > 0 && dose >= m.max * 0.9) {
                hits.push(mk(r.id || 'TCM-DRANGE-W-' + n, r.group || 'DOSAGE',
                  warn(n + '剂量接近上限'),
                  n + '用' + dose + 'g，已达《药典》上限' + m.max + 'g 的90%以上，请复核。',
                  r.suggestion || '', r.basis || ''));
              }
            });
            break;
          }
          case 'junchen_complete': {
            // TCM-FMT-01：君臣佐使结构完整（部分方可合并佐使）
            if (herbs.length === 0) break;
            const roles = new Set(herbs.map(h => norm(h.role)).filter(Boolean));
            const missing = [];
            if (!roles.has('君')) missing.push('君');
            if (!roles.has('臣')) missing.push('臣');
            if (!roles.has('佐') && !roles.has('佐使')) missing.push('佐');
            if (!roles.has('使') && !roles.has('佐使')) missing.push('使');
            if (missing.length > 0) {
              hits.push(mk(r.id || 'TCM-JZ-COMPLETE', r.group || 'STRUCT',
                warn(r.title || '君臣佐使结构不完整'),
                '方中缺少：' + missing.join('、') + '。方剂应分清君臣佐使。',
                r.suggestion || '请为每味药标注 role（君/臣/佐/使）。', r.basis || ''));
            }
            break;
          }
          default:
            // 不识别的 type 静默跳过（保留医学文档价值）
            break;
        }
      } catch (e) { /* 单条规则异常不影响整体 */ }
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
      else if (h.group === 'INCOMPAT' || h.group === 'CUSTOM' || h.group === 'SPECIAL_POP') dimMap.compat.push(h);
      else if (h.group === 'DOSAGE' || h.group === 'USAGE') dimMap.dosage.push(h);
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

  global.TCMEngine = {
    load, check, score, DIMS,
    SHIBAFAN_PAIRS, SHIJIUWEI_PAIRS, DOSE_LIMITS,
    normalizeHerbName, herbNamesSet,
    buildHerbsMeta,
    get extraRules() { return extraRules; },
    set extraRules(v) { extraRules = v || []; },
    get herbsMeta() { return herbsMeta; },
    set herbsMeta(v) { herbsMeta = v || {}; }
  };
})(typeof window !== 'undefined' ? window : globalThis);

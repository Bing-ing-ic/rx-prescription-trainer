/* =====================================================================
 * rule-engine.js  处方规则引擎
 * 输入: visit_ctx = {
 *   disease, patient, normal_rx, iv_rx, rulesMeta, compatData
 * }
 * 输出: hits = [{rule_id, group, severity, title, message, basis, suggestion}]
 *
 * 升级记录：
 *  - 2026-11-09：对标《医院处方点评管理规范（2010）》《处方管理办法》
 *    《抗菌药物临床应用指导原则（2015版）》新增 12 条专业规则：
 *      NEW-01 无指征联用≥2种抗菌药（COMPAT/major）
 *      NEW-02 β内酰胺繁殖期杀菌+速效抑菌不合理联用（COMPAT/major）
 *      NEW-03 复方感冒药叠加单方对乙酰氨基酚（COMPAT/major）
 *      NEW-04 肾功能不全用肾毒性抗菌药未减量（SPECIAL_POP/critical）
 *      NEW-05 肝功能不全用肝毒性药（SPECIAL_POP/critical）
 *      NEW-06 模糊诊断仍开治疗药（FORMAT/minor）
 *      NEW-07 用法用量/给药途径缺失（FORMAT/minor）
 *      NEW-08 无指征重点监控辅助用药（INDICATION/major）
 *      NEW-09 儿童用可待因/异丙嗪/氨基糖苷类（SPECIAL_POP/critical）
 *      NEW-10 同通用名口服+静脉重复（COMPAT/major）
 *      NEW-11 孕妇用妊娠禁忌中成药（SPECIAL_POP/critical）
 *      NEW-12 病毒性疾病无指征用抗菌药（ABX/major）
 * ===================================================================== */
(function (global) {
  'use strict';

  // ---------- 工具 ----------
  function byId(list, id) { return list.find(r => r.rule_id === id); }

  // ------------------------------------------------------------------
  // 三级严重度推断（与 review.js 保持一致）
  //  error→major，warn→minor，pass→pass；下列 rule_id 的 error 升级 critical
  //  （禁忌证/超极量/特殊使用级/无指征输液/中药注射剂同瓶）
  // ------------------------------------------------------------------
  const CRITICAL_RULE_IDS = {
    'POP-01':1, 'SPEC-02':1, 'COMORBID-04':1, 'ALLERGY-01':1,
    'COMORBID-01':1, 'COMORBID-02':1, 'IV-08':1,
    'ABX-01':1, 'IV-05':1, 'IV-07':1, 'IV-01':1,
    'DOSE-01':1, 'DOSAGE-WT':1, 'SUR-05':1
  };
  const MAJOR_ON_WARN_RULE_IDS = { 'DUP-01':1, 'DUP-02':1 };

  function resolveLevel(ruleId, severity, explicitLevel) {
    // 旧 severity=pass 的中性提示不参与扣分，一律保持 pass
    if (severity === 'pass') return 'pass';
    if (explicitLevel === 'critical' || explicitLevel === 'major' ||
        explicitLevel === 'minor') return explicitLevel;
    if (explicitLevel === 'pass') return 'pass';
    if (severity === 'error') {
      if (CRITICAL_RULE_IDS[ruleId]) return 'critical';
      return 'major';
    }
    if (MAJOR_ON_WARN_RULE_IDS[ruleId]) return 'major';
    return 'minor';
  }

  // ------------------------------------------------------------------
  // 高频规则教学文案兜底：rule_id -> 教学四件套
  // （rulesMeta/rules.json 未提供 lesson_point 等字段时使用；提供了则优先用 rulesMeta）
  // ------------------------------------------------------------------
  const TEACHING_FALLBACK = {
    'POP-01':   { lesson_point:'18岁以下禁用喹诺酮，可致负重关节软骨损伤', correct_practice:'儿童改用β内酰胺类或大环内酯类，避免使用喹诺酮类', reference_guide:'《抗菌药物临床应用指导原则（2015版）》', related_topic:'QUINOLONE_PEDIATRIC' },
    'POP-02':   { lesson_point:'老年人输液过快/过量可诱发心衰', correct_practice:'滴速≤60ml/h，单次入量≤500ml，必要时减液体量', reference_guide:'《老年人静脉输液安全专家共识》', related_topic:'ELDERLY_IV' },
    'ABX-01':   { lesson_point:'特殊使用级抗菌药不得在门诊直接使用', correct_practice:'转入住院，经抗感染会诊并由高级职称医师审批后使用', reference_guide:'《抗菌药物临床应用分级管理目录（2024版）》', related_topic:'ABX_LEVEL' },
    'ABX-02':   { lesson_point:'限制使用级抗菌药须中级以上职称开具', correct_practice:'由主治医师及以上审核确认后方可使用', reference_guide:'《抗菌药物临床应用分级管理办法》', related_topic:'ABX_LEVEL' },
    'IV-01':    { lesson_point:'能口服不肌注，能肌注不输液', correct_practice:'有客观脱水/不能口服证据方可输液，否则改口服方案', reference_guide:'《关于做好医疗机构静脉输液安全管理工作的通知》', related_topic:'IV_INDICATION' },
    'IV-02':    { lesson_point:'有口服等效一线药时不应无理由选择静脉', correct_practice:'优先口服给药；确需静脉应注明 no_oral_alternative 等依据', reference_guide:'WHO 合理用药原则（优先口服）', related_topic:'IV_INDICATION' },
    'IV-05':    { lesson_point:'普通感冒/轻症胃肠炎等门诊负面清单疾病不得输液', correct_practice:'改为口服对症治疗+健康宣教，必要时复诊', reference_guide:'《医疗机构门诊静脉输液负面清单（2025版）》', related_topic:'IV_INDICATION' },
    'IV-06':    { lesson_point:'溶媒必须在药品说明书允许范围内', correct_practice:'按说明书选择 0.9%NaCl/5%GS 及规定体积，不随意替换', reference_guide:'药品说明书【用法用量】溶媒项；《静脉用药集中调配操作规程》', related_topic:'SOLVENT_COMPAT' },
    'IV-07':    { lesson_point:'中药注射剂严禁与其他药物同瓶混合输注', correct_practice:'中药注射剂单独配制、单独输注，前后冲管', reference_guide:'国家药监局中药注射剂安全性通报', related_topic:'TCM_INJECTION' },
    'IV-04':    { lesson_point:'老年/儿童/心肺肾功能不全者须减速滴注', correct_practice:'按药品 drip_speed_max 下调滴速，必要时心电监护', reference_guide:'《静脉治疗护理技术操作规范 WS/T 433》', related_topic:'ELDERLY_IV' },
    'INT-01':   { lesson_point:'喹诺酮与含钙/铝/铁/铋剂螯合显著降低吸收', correct_practice:'抗酸/铁剂与喹诺酮间隔≥2小时服用，或换用其他抗菌药', reference_guide:'左氧氟沙星说明书【药物相互作用】', related_topic:'DRUG_INTERACTION' },
    'DUP-01':   { lesson_point:'同一张处方不得重复开具同类药理作用药物', correct_practice:'同类药物只保留一种，避免叠加剂量与不良反应', reference_guide:'《医院处方点评管理规范》（不适宜处方）', related_topic:'DUPLICATE_THERAPY' },
    'IND-01':   { lesson_point:'所选药品必须与临床诊断相匹配', correct_practice:'对照本病种一线/二线推荐方案选药，诊断与用药一致', reference_guide:'《处方管理办法》第十四条', related_topic:'INDICATION_MATCH' },
    'DOSE-01':  { lesson_point:'单次剂量不得超出说明书规定范围', correct_practice:'按说明书 single_min~single_max 调整单次剂量并复核', reference_guide:'药品说明书【用法用量】', related_topic:'DOSAGE_SAFETY' },
    'DUR-01':   { lesson_point:'普通处方≤7日量、急诊≤3日量', correct_practice:'按病种与病情开具合理疗程，慢性病另办长期处方', reference_guide:'《处方管理办法》第十九条', related_topic:'DURATION' },
    'FMT-01':   { lesson_point:'每张处方不得超过5种药品（含溶媒）', correct_practice:'精简处方，删除非必需药物，必要时分方开具', reference_guide:'《处方管理办法》第十九条', related_topic:'PRESCRIPTION_FORMAT' },
    'FMT-05':   { lesson_point:'处方前记（姓名/性别/年龄/诊断/科别/日期）须完整', correct_practice:'补齐患者基本信息与临床诊断后再提交', reference_guide:'《处方管理办法》第五条', related_topic:'PRESCRIPTION_FORMAT' },
    'YN-01':    { lesson_point:'诊断必须与患者性别相符', correct_practice:'核对诊断与性别，撤销不符诊断或修正处方', reference_guide:'ICD-10 医保2.0版性别限定（云南医保两库规则）', related_topic:'INSURANCE_SCOPE' },
    'SPEC-01':  { lesson_point:'老年/儿童/肝肾功能不全须按体重或eGFR调整剂量', correct_practice:'起始减量、按kg或eGFR核算，必要时监测血药浓度', reference_guide:'《中国老年人潜在不适当用药目录（2024版）》；药品说明书【特殊人群】', related_topic:'SPECIAL_POP' },
    'SPEC-02':  { lesson_point:'药品禁忌证与患者基础疾病冲突时禁用', correct_practice:'立即停药，选择无禁忌的替代治疗方案', reference_guide:'药品说明书【禁忌】项；《处方管理办法》第十四条', related_topic:'CONTRAINDICATION' },
    // ---- 2026-11-09 新增 12 条规则的教学四件套兜底 ----
    'NEW-01':   { lesson_point:'抗菌药联合用药须有明确指征（重症/混合感染/防耐药），普通门诊不随意联用', correct_practice:'能单用不联用；确需联合须在病历中写明指征', reference_guide:'《抗菌药物临床应用指导原则（2015版）》联合治疗节', related_topic:'ABX_COMBINATION' },
    'NEW-02':   { lesson_point:'β-内酰胺繁殖期杀菌药与四环素/大环内酯速效抑菌药联用可拮抗疗效', correct_practice:'一般情况二选一；明确混合感染需序贯并在病历说明', reference_guide:'《抗菌药物临床应用指导原则（2015版）》药效学相互作用节', related_topic:'ABX_ANTAGONISM' },
    'NEW-03':   { lesson_point:'复方感冒药多已含对乙酰氨基酚，再叠加单方退热药易致肝损伤', correct_practice:'只选一种退热感冒药，查看成分表避免同类成分重复', reference_guide:'对乙酰氨基酚片说明书；《中国感冒用药专家共识》', related_topic:'DUPLICATE_INGREDIENT' },
    'NEW-04':   { lesson_point:'肾功能不全用氨基糖苷/万古霉素必须按eGFR减量并监测血药浓度', correct_practice:'按 eGFR 减量或延长间隔；必须使用时监测肾功能与血药浓度', reference_guide:'《抗菌药物临床应用指导原则（2015版）》肾功能减退用药表', related_topic:'RENAL_DOSE' },
    'NEW-05':   { lesson_point:'肝功能不全避免使用红霉素酯化物/利福平/异烟肼/大剂量对乙酰氨基酚', correct_practice:'选用肝毒性小的替代药；必须使用时监测肝功能', reference_guide:'《抗菌药物临床应用指导原则（2015版）》肝功能减退用药表', related_topic:'HEPATIC_DOSE' },
    'NEW-06':   { lesson_point:'临床诊断应明确具体，不得以"待查/自感不适"作为治疗性用药依据', correct_practice:'完善病史查体后明确诊断；诊断不明先检查对症', reference_guide:'《处方管理办法》第十九条；《医院处方点评管理规范》', related_topic:'DIAGNOSIS_CLARITY' },
    'NEW-07':   { lesson_point:'每味药必须写清频次与给药途径', correct_practice:'补全 qd/bid/tid 等频次与 po/iv/im 等给药途径', reference_guide:'《处方管理办法》第六条', related_topic:'PRESCRIPTION_FORMAT' },
    'NEW-08':   { lesson_point:'脑蛋白水解物/参麦/丹参/血栓通等重点监控辅助用药须严格按适应症使用', correct_practice:'核对说明书适应症与诊断一致性；不符者删除', reference_guide:'国卫办医函〔2019〕558号 第一批国家重点监控合理用药药品目录', related_topic:'MONITORED_DRUGS' },
    'NEW-09':   { lesson_point:'12岁以下儿童禁用可待因；婴幼儿禁用异丙嗪；慎用氨基糖苷类', correct_practice:'儿童镇咳改用右美沙芬/蜂蜜；抗过敏改用西替利嗪；抗感染避免氨基糖苷', reference_guide:'国家药监局药品说明书修订公告（2018/19、2021/8）', related_topic:'PEDIATRIC_ABX' },
    'NEW-10':   { lesson_point:'同通用名药不得同时口服+静滴；序贯治疗须有时点转换', correct_practice:'保留一种给药途径；确需序贯在 iv_reason 标注并写明转换时点', reference_guide:'《医院处方点评管理规范》；《抗菌药物临床应用指导原则》序贯疗法', related_topic:'DUPLICATE_ROUTE' },
    'NEW-11':   { lesson_point:'孕妇禁用破血/峻下/芳香走窜类中药（麝香、红花、三棱、莪术、水蛭等）', correct_practice:'妊娠期用药须中医妇科评估，选用安全替代', reference_guide:'《中国药典》一部妊娠禁忌药；《中药学》妊娠用药禁忌节', related_topic:'PREGNANCY_TCM' },
    'NEW-12':   { lesson_point:'病毒性感冒/流感不常规使用抗菌药', correct_practice:'对症支持；明确细菌并发症（黄脓涕>10天、肺炎）才用抗菌药', reference_guide:'《抗菌药物临床应用指导原则（2015版）》治疗性应用基本原则', related_topic:'ABX_VIRAL' }
  };

  // hit() 工厂：输出旧字段（rule_id/group/title/severity/message/basis/suggestion）+ 新字段
  // opts: { affected_items:[], aggregated_count, lesson_point, correct_practice,
  //         reference_guide, related_topic, severity_level }
  function hit(rule, severity, message, suggestion, opts) {
    rule = rule || { rule_id: 'UNKNOWN', group: 'FORMAT', title: '未知规则', basis: '' };
    opts = opts || {};
    const fb = TEACHING_FALLBACK[rule.rule_id] || {};
    const affected = Array.isArray(opts.affected_items) ? opts.affected_items.slice() : [];
    return {
      rule_id: rule.rule_id,
      group: rule.group,
      title: rule.title,
      severity: severity,
      message: message,
      basis: rule.basis,
      suggestion: suggestion || '',
      // ---- 新增字段 ----
      severity_level: resolveLevel(rule.rule_id, severity, opts.severity_level || rule.severity_level_hint),
      lesson_point:    opts.lesson_point    || rule.lesson_point    || fb.lesson_point    || '',
      correct_practice: opts.correct_practice|| rule.correct_practice|| fb.correct_practice|| '',
      reference_guide: opts.reference_guide || rule.reference_guide || fb.reference_guide || rule.basis || '',
      related_topic:   opts.related_topic   || rule.related_topic   || fb.related_topic   || '',
      affected_items:  affected,
      aggregated_count: opts.aggregated_count || affected.length || 1
    };
  }
  function pass(rule, msg) { return hit(rule, 'pass', msg || '通过', ''); }

  // 判断药品是否在处方里（按通用名匹配）
  function hasDrug(rx, genericName) {
    if (!rx || !rx.items) return false;
    return rx.items.some(it => it.drug.generic_name === genericName);
  }
  // 收集某处方内所有某 pharmacology_class 的药
  function drugsOfClass(rx, cls) {
    if (!rx || !rx.items) return [];
    return rx.items.filter(it => it.drug.pharmacology_class === cls);
  }
  // 收集 visit 内所有口服药 & 所有静脉药
  function collectRoutes(ctx) {
    const oral = [], iv = [];
    [ctx.normal_rx, ctx.iv_rx].forEach(rx => {
      if (!rx || !rx.items || !Array.isArray(rx.items)) return;
      rx.items.forEach(it => {
        if (!it || !it.drug) return;
        if (it.drug.dosage_form === 'solvent') return;
        if (['oral','sublingual','topical','im','sc'].includes(it.drug.dosage_form)) oral.push(it);
        if (it.drug.dosage_form === 'iv_drip') iv.push(it);
      });
    });
    return { oral, iv };
  }

  // ---------- 通用辅助 ----------
  // 喹诺酮类识别（兼容中文“喹诺酮类”与英文 quinolone 分类名）
  function isQuinolone(drug) {
    if (!drug) return false;
    const c = drug.pharmacology_class || '';
    return c === '喹诺酮类' || /quinol/i.test(c);
  }
  // 从剂量字符串解析出 mg 数值（兼容 mg/g/ug/μg）
  function parseDoseMg(str) {
    if (str == null) return null;
    const m = String(str).match(/([\d.]+)\s*(mg|g|ug|μg)/i);
    if (!m) return null;
    let v = parseFloat(m[1]);
    if (isNaN(v)) return null;
    const u = m[2].toLowerCase();
    if (u === 'g') v *= 1000;
    else if (u === 'ug' || u === 'μg') v /= 1000;
    return v;
  }
  // 单次最大剂量（mg），兼容 dose_range_json 中 mg / g 两种字段
  function doseMaxMg(drug) {
    const dr = (drug && drug.dose_range_json) || {};
    if (dr.single_max_mg != null) return dr.single_max_mg;
    if (dr.single_max_g != null) return dr.single_max_g * 1000;
    return null;
  }
  function doseMinMg(drug) {
    const dr = (drug && drug.dose_range_json) || {};
    if (dr.single_min_mg != null) return dr.single_min_mg;
    if (dr.single_min_g != null) return dr.single_min_g * 1000;
    return null;
  }
  // 输液指征强弱：弱指征 → error，强客观指征 → warn
  function isWeakIvReason(reason) {
    if (!reason) return true;
    const weak = ['fever', 'patient_request', 'patient', 'other', 'other_without_note', '患者要求', '发热', '其他'];
    return weak.includes(reason);
  }

  // 溶媒名归一化：把 "0.9%氯化钠注射液 100ml/袋" 拆成 { base(通用名), volMl(体积) }
  // compat.json 溶媒名带体积规格，而药品库通用名不带，必须按通用名+体积匹配，避免字符串整体相等 miss
  function splitSolvent(name) {
    if (!name) return { base: '', volMl: null };
    let s = String(name).trim();
    s = s.replace(/[/／]\s*(袋|瓶|支)$/g, '').trim();
    const m = s.match(/^(.*?)[\s,，]*(\d+(?:\.\d+)?)\s*(ml|mL|ML|毫升)\s*$/);
    if (m) return { base: m[1].replace(/\s+/g, ''), volMl: parseFloat(m[2]) };
    return { base: s.replace(/\s+/g, ''), volMl: null };
  }
  // 两条溶媒记录是否指同一溶媒（通用名相同；记录有明确体积时体积须一致，保留100ml/250ml区分）
  function solventMatch(recSolvent, selectedSolvent) {
    const a = splitSolvent(recSolvent), b = splitSolvent(selectedSolvent);
    if (!a.base || !b.base || a.base !== b.base) return false;
    if (a.volMl != null && b.volMl != null && a.volMl !== b.volMl) return false;
    return true;
  }

  // =====================================================================
  // 主入口
  // =====================================================================
  function run(ctx) {
    const hits = [];
    const R = {};
    ctx.rulesMeta.forEach(r => R[r.rule_id] = r);

    const disease = ctx.disease;
    const patient = ctx.patient;
    const normal = ctx.normal_rx;
    const iv = ctx.iv_rx;
    const compat = ctx.compatData;

    // ---------- 工具：统计药品项总数（含溶媒） ----------
    function totalItems(rx) { return rx && rx.items && Array.isArray(rx.items) ? rx.items.length : 0; }
    function therapeuticItems(rx) {
      if (!rx || !rx.items || !Array.isArray(rx.items)) return [];
      return rx.items.filter(it => it && it.drug && it.drug.dosage_form !== 'solvent');
    }

    // ====================== 1. 格式类 ======================
    // FMT-01 每张处方≤5种药品（含溶媒）：>5种 直接 error（法定上限）
    // FMT-01-EXT 教学分级叠加：6种 warn 提醒精简，>=7种 error 提示严重超标
    ['normal_rx','iv_rx'].forEach(k => {
      const rx = ctx[k];
      if (!rx) return;
      const n = totalItems(rx);
      if (n > 5) {
        // B1: affected_items = 该处方所有药品通用名
        const rxNames = (rx.items || []).map(it => it && it.drug ? it.drug.generic_name : '').filter(Boolean);
        hits.push(hit(R['FMT-01'], 'error',
          `当前处方共 ${n} 种药品（含溶媒），超过每张处方≤5种的法定上限。`,
          `删减至≤5种；确需超过须注明理由并经上级医师审核签字。`,
          { affected_items: rxNames }));
        if (R['FMT-01-EXT']) {
          if (n === 6) {
            hits.push(hit(R['FMT-01-EXT'], 'warn',
              `当前处方共 ${n} 种药品，已偏多，建议精简至≤5种。`,
              `复核是否有同类或辅助用药可剔除；避免无指征联用。`,
              { affected_items: rxNames }));
          } else if (n >= 7) {
            hits.push(hit(R['FMT-01-EXT'], 'error',
              `当前处方共 ${n} 种药品，严重超过≤5种的法定上限。`,
              `必须大幅精简；必要时分方开具或请上级医师会诊。`,
              { affected_items: rxNames }));
          }
        }
      }
    });

    // FMT-02 通用名
    ['normal_rx','iv_rx'].forEach(k => {
      const rx = ctx[k]; if (!rx || !rx.items || !Array.isArray(rx.items)) return;
      rx.items.forEach(it => {
        if (!it || !it.drug) return;
        if (!it.drug.generic_name) hits.push(hit(R['FMT-02'], 'error',
          `存在未填通用名的药品（仅商品名）。`, `必须使用药品通用名。`,
          { affected_items: [it.drug.trade_name || '未命名药品'] }));
      });
    });

    // FMT-03 模糊用法
    ['normal_rx','iv_rx'].forEach(k => {
      const rx = ctx[k]; if (!rx || !rx.items || !Array.isArray(rx.items)) return;
      rx.items.forEach(it => {
        if (!it || !it.drug) return;
        const txt = (it.frequency || '') + ' ' + (it.single_dose || '');
        if (/遵医嘱|自用|照说明|酌量/.test(txt)) {
          hits.push(hit(R['FMT-03'], 'error',
            `药品「${it.drug.generic_name}」用法中出现模糊表述：${txt.trim()}`,
            `必须写清频次与单次剂量。`,
            { affected_items: [it.drug.generic_name] }));
        }
      });
    });

    // FMT-04 法定公制单位 — 演示：剂量必须带单位
    ['normal_rx','iv_rx'].forEach(k => {
      const rx = ctx[k]; if (!rx || !Array.isArray(rx.items)) return;
      rx.items.forEach(it => {
        if (!it || !it.drug) return;
        if (it.drug.dosage_form === 'solvent') return;
        if (it.single_dose && !/\d+\s*(mg|g|ml|ug|μg|U|IU)/.test(it.single_dose)) {
          hits.push(hit(R['FMT-04'], 'warn',
            `「${it.drug.generic_name}」单次剂量「${it.single_dose}」未使用法定公制单位。`,
            `使用 mg/g/ml/μg 等法定单位。`,
            { affected_items: [it.drug.generic_name] }));
        }
      });
    });

    // FMT-05 前记字段完整性
    if (!patient.name || !patient.gender || patient.age == null || !disease.name) {
      hits.push(hit(R['FMT-05'], 'error', '处方前记字段不完整（姓名/性别/年龄/诊断）。',
        '补全前记。'));
    }

    // FMT-06 编号规则
    if (iv && iv.rx_id && !/^IV-/.test(iv.rx_id)) {
      hits.push(hit(R['FMT-06'], 'warn', '输液处方编号应以 IV- 开头。', '按 科室代码-YYYYMMDD-6位流水号 重编。'));
    }

    // ====================== 2. 适应症 ======================
    // IND-01 / IND-02 / IND-03：遍历治疗性药品，检查是否在 disease 推荐列表
    // 对症支持类药物（止咳/化痰/抗过敏/解热镇痛/缓解鼻塞）不判超适应症
    const symptomaticDrugs = /氨溴索|乙酰半胱氨酸|羧甲司坦|右美沙芬|复方甘草|可待因|氯雷他定|西替利嗪|苯海拉明|布洛芬|对乙酰氨基酚|双氯芬酸|塞来昔布|美洛昔康|酚咖|感冒灵|小柴胡|板蓝根|连花清瘟|肺力咳|急支|川贝|甲氧那明|茶碱|孟鲁司特|伪麻黄碱|氯苯那敏|银黄|清肺/;
    ['normal_rx','iv_rx'].forEach(k => {
      const rx = ctx[k]; if (!rx || !Array.isArray(rx.items)) return;
      therapeuticItems(rx).forEach(it => {
        const g = it.drug.generic_name;
        // 对症药不判超适应症
        if (symptomaticDrugs.test(g)) {
          hits.push(pass(R['IND-01'], `「${g}」为对症支持用药，合规。`));
          return;
        }
        const inFirst = (disease.first_line_oral || []).includes(g);
        const inSecond = (disease.second_line_iv || []).includes(g);
        if (inFirst || inSecond) {
          hits.push(pass(R['IND-01'], `「${g}」与诊断「${disease.name}」适应症匹配。`));
          // IND-03：乙类药品即使适应症匹配，也提示核对医保限定支付范围
          if (it.drug.medical_insurance_class === '乙') {
            hits.push(hit(R['IND-03'], 'warn',
              `「${g}」为医保乙类药品，须核对其限定支付范围是否覆盖「${disease.name}」。`,
              `如诊断不在医保限定支付目录，需补充诊断或由患者自费。`,
              { affected_items: [g] }));
          }
        } else {
          // IND-01：不在一线/二线推荐 → 超适应症 error
          // B1: affected_items = 与诊断不匹配的药品通用名
          hits.push(hit(R['IND-01'], 'error',
            `「${g}」不在「${disease.name}」的一线/二线推荐列表中，可能超适应症。`,
            `核对药品说明书适应症；或更换为推荐用药。`,
            { affected_items: [g] }));
          // IND-02：超说明书用药提示（与 IND-01 互补，提醒循证/审批）
          hits.push(hit(R['IND-02'], 'warn',
            `「${g}」未列入本病种推荐目录，属超说明书用药，须有循证依据并经审批。`,
            `超说明书用药应循证并经医院药事管理与药物治疗学委员会审批。`,
            { affected_items: [g] }));
        }
      });
    });

    // ====================== 3. 剂量 ======================
    ['normal_rx','iv_rx'].forEach(k => {
      const rx = ctx[k]; if (!rx || !Array.isArray(rx.items)) return;
      therapeuticItems(rx).forEach(it => {
        const maxMg = doseMaxMg(it.drug);
        const minMg = doseMinMg(it.drug);
        // 简单演示：若 single_dose 填了数字，检查是否在范围内
        if (it.single_dose && maxMg != null) {
          const v = parseDoseMg(it.single_dose);
          if (v != null) {
            if (v > maxMg * 1.5) {
              hits.push(hit(R['DOSE-01'], 'error',
                `「${it.drug.generic_name}」单次剂量 ${v}mg 超过说明书上限 ${maxMg}mg（1.5倍）。`,
                `下调至说明书范围。`,
                { affected_items: [it.drug.generic_name] }));
            } else if (v > maxMg) {
              hits.push(hit(R['DOSE-01'], 'warn',
                `「${it.drug.generic_name}」单次剂量 ${v}mg 略超说明书上限 ${maxMg}mg。`,
                `复核剂量。`,
                { affected_items: [it.drug.generic_name] }));
            } else if (minMg != null && v < minMg * 0.5) {
              hits.push(hit(R['DOSE-01'], 'warn',
                `「${it.drug.generic_name}」单次剂量 ${v}mg 低于说明书下限 ${minMg}mg 的一半，可能剂量不足。`,
                `复核给药剂量。`,
                { affected_items: [it.drug.generic_name] }));
            }
          }
        }
      });
    });

    // DOSE-02 肝肾功能（演示：patient.renal_insufficiency / hepatic_insufficiency=true 时提示）
    if (patient.renal_insufficiency || patient.hepatic_insufficiency) {
      ['normal_rx','iv_rx'].forEach(k => {
        const rx = ctx[k]; if (!rx || !Array.isArray(rx.items)) return;
        therapeuticItems(rx).forEach(it => {
          if (it.drug.liver_renal_note && /减量|不全|慎用/.test(it.drug.liver_renal_note)) {
            hits.push(hit(R['DOSE-02'], 'warn',
              `患者肝/肾功能不全，「${it.drug.generic_name}」需调整剂量：${it.drug.liver_renal_note}`,
              `按 eGFR/Child-Pugh 调整剂量。`,
              { affected_items: [it.drug.generic_name] }));
          }
        });
      });
    }

    // ====================== 4. 疗程 ======================
    // DUR-01 疗程上限（P3-1 慢性病长处方适配：依据《长期处方管理规范（试行）》国卫办医发〔2021〕17号，
    //   诊断明确、用药稳定的慢性病可开具 4-12 周长处方，不按普通处方7日上限告警）
    // P4-3 长处方前置校验：需长期稳定用药的慢性病病种（disease.long_term_required=true），
    //   若患者无 long_term_stable:true 标记（首次就诊/病情未控制），即使慢性病也 warn，
    //   提示先开 7 天观察、待方案稳定后再续长处方。
    const dx = ctx.disease || {};
    const isChronic = dx.chronic === true;
    const needLongTermStable = dx.long_term_required === true;
    const patientLongTermStable = !!(patient && patient.long_term_stable === true);
    const maxLongDays = Number(dx.max_long_rx_days) || 84; // 12周=84天
    ['normal_rx','iv_rx'].forEach(k => {
      const rx = ctx[k]; if (!rx) return;
      therapeuticItems(rx).forEach(it => {
        const d = parseFloat(it.duration_days);
        if (isNaN(d)) return;
        if (k !== 'normal_rx') return;
        if (isChronic && d >= 28) {
          // P4-3 患者画像校验：需要长期稳定用药的慢性病，未标记 long_term_stable 不允许直接开长处方
          if (needLongTermStable && !patientLongTermStable) {
            hits.push(hit(R['DUR-01'], 'warn',
              `慢性病「${dx.name || ''}」需长期稳定用药，但患者未标记 long_term_stable（首次就诊或病情未控制），不建议直接开 ${d} 天长处方。`,
              `先开 7 天观察疗效与耐受性，待方案稳定后再续长处方（≤12周）。`,
              { affected_items: [it.drug.generic_name] }));
            return;
          }
          // 慢性病长处方分支：28-84天不 warn，仅记录 pass 级"长处方"提示
          if (d <= maxLongDays) {
            hits.push(pass(R['DUR-01'],
              `慢性病长处方：疗程 ${d} 天（${Math.round(d/7*10)/10} 周），符合《长期处方管理规范》4-12周范围。`));
          } else {
            hits.push(hit(R['DUR-01'], 'warn',
              `慢性病长处方疗程 ${d} 天，超过 ${maxLongDays} 天（${Math.round(maxLongDays/7)} 周）上限。`,
              `长处方一般≤12周（84天）；超过需上级医师评估并备注。`,
              { affected_items: [it.drug.generic_name] }));
          }
        } else if (!isChronic && d > 7) {
          hits.push(hit(R['DUR-01'], 'warn',
            `普通处方疗程 ${d} 天，超过 7 日上限。`, `一般≤7日。`,
            { affected_items: [it.drug.generic_name] }));
        }
      });
    });

    // ====================== 5. 配伍 / 重复 ======================
    // DUP-01 处方内同类
    ['normal_rx','iv_rx'].forEach(k => {
      const rx = ctx[k]; if (!rx) return;
      const map = {};
      therapeuticItems(rx).forEach(it => {
        const c = it.drug.pharmacology_class;
        if (!map[c]) map[c] = [];
        map[c].push(it.drug.generic_name);
      });
      Object.keys(map).forEach(c => {
        if (map[c].length > 1) {
          // B1: DUP-01 affected_items = 重复的所有药品通用名
          hits.push(hit(R['DUP-01'], 'warn',
            `处方内药理分类「${c}」重复：${map[c].join(' + ')}`,
            `避免同类重复用药。`,
            { affected_items: map[c].slice() }));
        }
      });
    });

    // DUP-02 跨通道口服+静脉同类
    const { oral, iv: ivDrugs } = collectRoutes(ctx);
    const oralClasses = new Set(oral.map(it => it.drug.pharmacology_class));
    const ivClasses = new Set(ivDrugs.map(it => it.drug.pharmacology_class));
    const overlap = [...oralClasses].filter(c => ivClasses.has(c));
    if (overlap.length) {
      const reason = iv && iv.iv_reason;
      if (reason !== 'sequential_therapy') {
        overlap.forEach(c => {
          const oNames = oral.filter(it => it.drug.pharmacology_class === c).map(it => it.drug.generic_name);
          const iNames = ivDrugs.filter(it => it.drug.pharmacology_class === c).map(it => it.drug.generic_name);
          // B1: DUP-02 affected_items = 跨通道冲突的两组药品
          hits.push(hit(R['DUP-02'], 'warn',
            `同次就诊口服+静脉同类交叉：口服[${oNames.join(',')}] + 静滴[${iNames.join(',')}]，且 iv_reason 未选择"序贯治疗"。`,
            `如确为序贯治疗，请将 iv_reason 改为"序贯治疗"；否则删除其中一组。`,
            { affected_items: oNames.concat(iNames) }));
        });
      } else {
        overlap.forEach(c => {
          hits.push(pass(R['DUP-02'], `iv_reason=序贯治疗，同类口服+静脉联用合规。`));
        });
      }
    }

    // INT-01 喹诺酮 + 钙铝抗酸剂（演示：若处方内同时有喹诺酮和"含钙/铝"关键词药）
    const allRx = [...oral, ...ivDrugs];
    const fqItems = allRx.filter(it => isQuinolone(it.drug));
    const hasFq = fqItems.length > 0;
    if (hasFq) {
      const antacid = allRx.find(it => /钙|铝|镁|铋|铁/.test(it.drug.generic_name || ''));
      if (antacid) {
        // B1: affected_items = 喹诺酮药 + 抗酸药
        hits.push(hit(R['INT-01'], 'error',
          `喹诺酮类与「${antacid.drug.generic_name}」同处方：二价阳离子螯合显著降低喹诺酮吸收。`,
          `间隔≥2小时服用，或更换方案。`,
          { affected_items: fqItems.map(it => it.drug.generic_name).concat([antacid.drug.generic_name]) }));
      }
    }

    // INT-02 ACEI/ARB + 保钾利尿剂（演示）
    const aceiArbItems = allRx.filter(it => /普利|沙坦/.test(it.drug.generic_name || ''));
    const kspareItems = allRx.filter(it => /螺内酯|氨苯蝶啶|阿米洛利/.test(it.drug.generic_name || ''));
    if (aceiArbItems.length && kspareItems.length) {
      // B1: affected_items = ACEI/ARB + 保钾利尿剂
      hits.push(hit(R['INT-02'], 'warn',
        `ACEI/ARB 与保钾利尿剂联用，警惕高钾血症。`, `监测血钾。`,
        { affected_items: aceiArbItems.map(it => it.drug.generic_name).concat(kspareItems.map(it => it.drug.generic_name)) }));
    }

    // TCM-01 占位（B4: TCM 规则隔离 — 西医处方无中药时不触发，避免无关 pass 噪声）
    // 仅当处方中存在中药饮片/中成药/中药注射剂时才输出 TCM 占位提示；西医处方（无中药）时不推送。
    const tcmAllDrugs = [];
    [ctx.normal_rx, ctx.iv_rx].forEach(rx => {
      if (rx && Array.isArray(rx.items)) rx.items.forEach(it => { if (it && it.drug) tcmAllDrugs.push(it.drug); });
    });
    const hasTcmInRx = tcmAllDrugs.some(d =>
      d.is_tcm === true || d.is_tcm_injection === true ||
      /中药|中成药|饮片|中草药|方剂/.test(d.pharmacology_class || '')
    );
    if (hasTcmInRx) {
      hits.push(pass(R['TCM-01'], '本处方含中药/中成药；十八反十九畏规则待饮片录入后启用。'));
    }
    // 西医处方（无任何中药）时不推送 TCM-01，避免在西医处方点评中出现无关 TCM pass 条目。

    // ====================== 6. 特殊人群 ======================
    // POP-01 儿童喹诺酮
    if (patient.age < 18) {
      allRx.forEach(it => {
        if (isQuinolone(it.drug)) {
          // B1: affected_items = 触发规则的喹诺酮药品通用名（如 "左氧氟沙星片"）
          hits.push(hit(R['POP-01'], 'error',
            `患者实足年龄 ${patient.age} 岁（<18），禁用喹诺酮类「${it.drug.generic_name}」。`,
            `更换为青霉素/头孢类等儿童安全抗菌药。`,
            { affected_items: [it.drug.generic_name] }));
        }
      });
    }

    // POP-02 老年输液速度/入量（每条处方只报一次）
    if (patient.age >= 65 && iv && Array.isArray(iv.items) && iv.items.length) {
      const speed = parseFloat(iv.drip_speed_mlh);
      if (!isNaN(speed) && speed > 60) {
        hits.push(hit(R['POP-02'], 'warn',
          `老年患者滴速 ${speed}ml/h 偏快（建议≤60ml/h）。`, `减速并监测心肺。`,
          { affected_items: [] }));
      }
      const tv = parseFloat(iv.total_volume_ml);
      if (!isNaN(tv) && tv > 1000) {
        hits.push(hit(R['POP-02'], 'warn',
          `老年患者单次输液总量 ${tv}ml 偏大（建议≤500ml）。`, `分次输注或改口服。`,
          { affected_items: [] }));
      }
    }

    // ====================== 7. 抗菌药物分级 ======================
    // ABX-01 special 门诊拦截
    allRx.forEach(it => {
      if (it.drug.abx_level === 'special') {
        hits.push(hit(R['ABX-01'], 'error',
          `「${it.drug.generic_name}」属特殊使用级抗菌药（${it.drug.abx_level}），门诊不得直接使用。`,
          `需住院治疗并经高级职称会诊审批；本处方应删除该药。`,
          { affected_items: [it.drug.generic_name] }));
      }
    });

    // ABX-02 restricted 模拟确认
    const restrictedList = allRx.filter(it => it.drug.abx_level === 'restricted');
    if (restrictedList.length && ctx.restricted_confirmed) {
      restrictedList.forEach(it => {
        hits.push(pass(R['ABX-02'], `「${it.drug.generic_name}」为限制使用级，已由中级以上职称确认。`));
      });
    } else if (restrictedList.length && !ctx.restricted_confirmed) {
      restrictedList.forEach(it => {
        hits.push(hit(R['ABX-02'], 'warn',
          `「${it.drug.generic_name}」为限制使用级抗菌药，需中级以上职称确认。`,
          `请在弹窗中完成模拟确认。`,
          { affected_items: [it.drug.generic_name] }));
      });
    }

    // ====================== 8. 静脉输液专项 IV-01 ~ IV-09 ======================
    if (iv && iv.items && iv.items.length) {

      // IV-01 输液指征与疾病标签一致性
      // 弱指征（发热/患者要求/其他/未填）→ error；有客观证据（脱水/不能口服/序贯）→ warn
      if (disease.iv_suitability === 'usually_no_iv') {
        if (isWeakIvReason(iv.iv_reason)) {
          hits.push(hit(R['IV-01'], 'error',
            `疾病「${disease.name}」通常无需输液（usually_no_iv），且输液指征不充分（${iv.iv_reason || '未填写'}）。`,
            `请复核：确有脱水/不能进食/重症感染等客观指征？否则建议改口服方案。`,
            { affected_items: (iv.items||[]).filter(it => it.drug && it.drug.dosage_form === 'iv_drip').map(it => it.drug.generic_name) }));
        } else {
          hits.push(hit(R['IV-01'], 'warn',
            `疾病「${disease.name}」通常无需输液，学生选择了静脉通道（指征：${iv.iv_reason}）。`,
            `请补充客观指征证据；否则建议改口服方案。`,
            { affected_items: (iv.items||[]).filter(it => it.drug && it.drug.dosage_form === 'iv_drip').map(it => it.drug.generic_name) }));
        }
      }

      // IV-02 口服/肌注替代可行性：有一线口服方案却无充分理由选静脉 → warn
      if (Array.isArray(disease.first_line_oral) && disease.first_line_oral.length > 0 &&
          iv.items.some(it => it.drug && it.drug.dosage_form === 'iv_drip')) {
        if (isWeakIvReason(iv.iv_reason)) {
          hits.push(hit(R['IV-02'], 'warn',
            `「${disease.name}」有一线口服方案（${disease.first_line_oral.slice(0,3).join('、')}），却无充分理由选择静脉给药。`,
            `遵循“能口服不肌注，能肌注不输液”原则；如确需静脉，请补充指征。`,
            { affected_items: iv.items.filter(it => it.drug && it.drug.dosage_form === 'iv_drip').map(it => it.drug.generic_name) }));
        } else {
          hits.push(pass(R['IV-02'], `有客观输液指征（${iv.iv_reason}），口服替代不适用。`));
        }
      }

      // IV-03 专项字段完整性
      const missing = [];
      if (!iv.iv_reason) missing.push('iv_reason');
      if (!iv.solvent_name) missing.push('solvent_name');
      if (!iv.drip_speed_mlh) missing.push('drip_speed_mlh');
      if (missing.length) {
        hits.push(hit(R['IV-03'], 'error',
          `输液专项字段缺失：${missing.join('、')}`,
          `补全所有输液专项字段。`,
          { affected_items: [] }));
      } else {
        hits.push(pass(R['IV-03'], '输液专项字段完整。'));
      }

      // IV-04 输液量与速度个体化
      const speed = parseFloat(iv.drip_speed_mlh);
      const special = patient.age >= 65 || patient.age <= 3 || patient.heart_renal_insufficiency;
      iv.items.forEach(it => {
        if (it.drug.dosage_form === 'solvent') return;
        const max = it.drug.drip_speed_max_mlh;
        if (!isNaN(speed) && max && speed > max) {
          const sev = special ? 'error' : 'warn';
          hits.push(hit(R['IV-04'], sev,
            `${special ? '老年/儿童/心肺肾功能不全患者' : '患者'}滴速 ${speed}ml/h 超过「${it.drug.generic_name}」说明书上限 ${max}ml/h。`,
            `按说明书减速。`,
            { affected_items: [it.drug.generic_name] }));
        }
      });
      if (special) {
        const tv = parseFloat(iv.total_volume_ml);
        if (!isNaN(tv) && tv > 1000) {
          hits.push(hit(R['IV-04'], 'warn',
            `特殊人群单次输液总量 ${tv}ml 偏大（建议≤500ml）。`, `分次或改口服。`,
            { affected_items: [] }));
        }
      }

      // IV-05 门诊负面清单
      if (disease.negative_list_hit) {
        const hasIVDrug = iv.items.some(it => it.drug.dosage_form === 'iv_drip');
        if (hasIVDrug) {
          hits.push(hit(R['IV-05'], 'error',
            `诊断「${disease.name}」命中《门诊输液负面清单》（普通感冒/轻症高血压复诊/功能性消化不良/术后复诊等），却开具静脉给药。`,
            `门诊限输：改为口服/外用/随访。`,
            { affected_items: iv.items.filter(it => it.drug && it.drug.dosage_form === 'iv_drip').map(it => it.drug.generic_name) }));
        }
      }

      // 把拍平的 items 按输液组 group 分桶（同组=同一输液瓶）
      const ivGroupsMap = {};
      iv.items.forEach(it => {
        if (!it || !it.drug) return;
        const g = it.group || 1;
        (ivGroupsMap[g] = ivGroupsMap[g] || []).push(it);
      });

      // IV-06 溶媒-药物配伍（按输液组分别判定；溶媒按通用名+体积匹配，不再整串相等）
      Object.keys(ivGroupsMap).forEach(gk => {
        const gItems = ivGroupsMap[gk];
        const solventItem = gItems.find(it => it.drug.dosage_form === 'solvent');
        if (!solventItem) return;
        const solventName = (solventItem.drug.generic_name || '') + ' ' + (solventItem.drug.spec || '');
        gItems.forEach(it => {
          if (it.drug.dosage_form === 'solvent') return;
          const drugName = it.drug.generic_name;
          // 1) 先看药品自带 allowed_solvents_json（按通用名匹配）
          const allowed = it.drug.allowed_solvents_json || [];
          const hitAllowed = allowed.some(s => solventMatch(s, solventName));
          if (allowed.length && !hitAllowed) {
            hits.push(hit(R['IV-06'], 'error',
              `「${drugName}」说明书允许溶媒为：${allowed.join('、')}；所选溶媒「${solventName}」不在内。`,
              `更换为说明书指定溶媒。`,
              { affected_items: [drugName] }));
            return;
          }
          // 2) 再查 compat.json（按通用名+体积匹配）
          const rec = (compat.solvent_drug || []).find(r => r.drug === drugName && solventMatch(r.solvent, solventName));
          if (rec) {
            if (rec.compatibility === 'incompatible') {
              hits.push(hit(R['IV-06'], 'error',
                `溶媒-药物配伍禁忌：${solventName} + ${drugName}。${rec.note}`,
                `更换溶媒或药物。`,
                { affected_items: [drugName] }));
            } else if (rec.compatibility === 'caution') {
              hits.push(hit(R['IV-06'], 'warn',
                `溶媒-药物配伍需谨慎：${solventName} + ${drugName}。${rec.note}`,
                `建议更换为首选溶媒。`,
                { affected_items: [drugName] }));
            }
          }
        });
      });

      // IV-07 中药注射剂单独输注（按输液组判定：跨组不视为同瓶混合）
      Object.keys(ivGroupsMap).forEach(gk => {
        const gItems = ivGroupsMap[gk].filter(it => it.drug && it.drug.dosage_form !== 'solvent');
        const tcm = gItems.filter(it => it.drug.is_tcm_injection);
        const others = gItems.filter(it => it.drug.dosage_form === 'iv_drip' && !it.drug.is_tcm_injection);
        if (tcm.length && others.length) {
          hits.push(hit(R['IV-07'], 'error',
            `第${gk}组：中药注射剂「${tcm.map(d=>d.drug.generic_name).join('、')}」与其他药物「${others.map(d=>d.drug.generic_name).join('、')}」同瓶混合。`,
            `中药注射剂必须单独成组、单独输注，严禁混合配伍。`,
            { affected_items: tcm.map(d=>d.drug.generic_name).concat(others.map(d=>d.drug.generic_name)) }));
        }
      });

      // DD-01 同瓶药物-药物配伍（compat.json drug_drug，按输液组判定同瓶组合）
      const DD = compat.drug_drug || [];
      Object.keys(ivGroupsMap).forEach(gk => {
        const gDrugs = ivGroupsMap[gk]
          .filter(it => it.drug && it.drug.dosage_form === 'iv_drip' && !it.drug.is_tcm_injection)
          .map(it => it.drug.generic_name);
        for (let i = 0; i < gDrugs.length; i++) {
          for (let j = i + 1; j < gDrugs.length; j++) {
            const a = gDrugs[i], b = gDrugs[j];
            const rec = DD.find(r => (r.drug_a === a && r.drug_b === b) || (r.drug_a === b && r.drug_b === a));
            if (!rec) continue;
            if (rec.compatibility === 'incompatible') {
              hits.push(hit(R['DD-01'], 'error',
                `同瓶药物配伍禁忌（第${gk}组）：${a} + ${b}。${rec.note}`,
                `严禁同瓶混合，须分瓶分开输注。`,
                { affected_items: [a, b] }));
            } else if (rec.compatibility === 'caution') {
              hits.push(hit(R['DD-01'], 'warn',
                `同瓶药物配伍需谨慎（第${gk}组）：${a} + ${b}。${rec.note}`,
                `建议分瓶输注并加强监测。`,
                { affected_items: [a, b] }));
            }
          }
        }
      });

      // IV-08 皮试核查：需皮试药品未填皮试结果或皮试阳性仍使用 → error；阴性 → pass
      iv.items.forEach(it => {
        if (!it || !it.drug || !it.drug.skin_test_required) return;
        const result = it.skin_test_result;
        if (result == null || result === '' || result === 'pending') {
          hits.push(hit(R['IV-08'], 'error',
            `「${it.drug.generic_name}」需皮试，但未填写皮试结果。`,
            `用药前必须完成皮试并记录阴性结果。`,
            { affected_items: [it.drug.generic_name] }));
        } else if (result === 'positive' || result === '阳性') {
          hits.push(hit(R['IV-08'], 'error',
            `「${it.drug.generic_name}」皮试阳性，严禁使用。`,
            `更换为非青霉素/头孢类替代药物。`,
            { affected_items: [it.drug.generic_name] }));
        } else {
          hits.push(pass(R['IV-08'],
            `「${it.drug.generic_name}」皮试阴性（${result}），可使用。`));
        }
      });

      // IV-09 门诊输液处方量
      iv.items.forEach(it => {
        const d = parseFloat(it.duration_days);
        if (!isNaN(d) && d > 1) {
          hits.push(hit(R['IV-09'], 'warn',
            `门诊静脉输液疗程 ${d} 天，超过当日单次常规。`,
            `门诊输液一般≤1日量；超量须医务科审批。`,
            { affected_items: [it.drug.generic_name] }));
        }
      });

      // 儿童体重必填
      if (patient.age <= 14 && (!patient.weight || patient.weight <= 0)) {
        hits.push(hit(R['IV-04'], 'error',
          `儿童输液未填写体重。`, `按体重计算剂量与补液量。`,
          { affected_items: [] }));
      }
    }

    // ====================== 9. 云南省医保智能审方规则（第七批两库 2026.10） ======================
    // YN-01: 诊断与患者性别不符
    const femaleOnlyDx = ['妇科','月经','子宫','卵巢','输卵管','乳腺','妊娠','分娩','产后','盆腔炎','阴道炎','宫颈炎','更年期'];
    const maleOnlyDx = ['前列腺','睾丸','附睾','精囊','阴茎','包皮','勃起','早泄','遗精'];
    const dxName = (disease.name || '');
    if (patient.gender === '男' && femaleOnlyDx.some(k => dxName.includes(k))) {
      hits.push(hit(R['YN-01'], 'error',
        `诊断「${disease.name}」为女性专属疾病，但患者性别为男。`,
        `核对患者性别与诊断是否一致，如为鉴别诊断需说明理由。`,
        { affected_items: [] }));
    }
    if (patient.gender === '女' && maleOnlyDx.some(k => dxName.includes(k))) {
      hits.push(hit(R['YN-01'], 'error',
        `诊断「${disease.name}」为男性专属疾病，但患者性别为女。`,
        `核对患者性别与诊断是否一致。`,
        { affected_items: [] }));
    }

    // YN-02: 医保限适应症药品超范围支付（简化版：关键治疗药与诊断大类不匹配）
    const allRx2 = [ctx.normal_rx, ctx.iv_rx].filter(r => r && r.items && Array.isArray(r.items));
    const allDrugs2 = [];
    allRx2.forEach(rx => rx.items.forEach(it => { if (it && it.drug) allDrugs2.push(it.drug); }));
    // 合并症文本（P2-2：如 T2DM 合并高血压，患者 comorbidities 含"高血压"时，ACEI/CCB 仍属医保合理用药）
    const comorbsTxt = (Array.isArray(patient.comorbidities) ? patient.comorbidities.join(' ') : (patient.comorbidities||'')) + ' ' + (patient.note||'');
    // 降压药 vs 无高血压诊断
    const antihypertensiveDrugs = allDrugs2.filter(d => /氨氯地平|硝苯地平|美托洛尔|缬沙坦|厄贝沙坦|卡托普利|依那普利|氯沙坦/.test(d.generic_name||''));
    const hasAntihypertensive = antihypertensiveDrugs.length > 0;
    const hasHypertensionDx = /高血压|冠心病|心绞痛|TIA|短暂性脑缺血/.test(dxName) || /高血压|冠心病|心绞痛/.test(comorbsTxt);
    if (hasAntihypertensive && !hasHypertensionDx) {
      hits.push(hit(R['YN-02'], 'error',
        `开具了降压/心血管药物，但诊断「${disease.name}」不在高血压/冠心病适应症范围内，医保基金不予支付。`,
        `核对诊断与用药适应症，如为合并症需补充对应诊断。`,
        { affected_items: antihypertensiveDrugs.map(d => d.generic_name) }));
    }
    // 降糖药 vs 无糖尿病诊断
    const antidiabeticDrugs = allDrugs2.filter(d => /二甲双胍|格列美脲|格列齐特|胰岛素|阿卡波糖|西格列汀/.test(d.generic_name||''));
    const hasAntidiabetic = antidiabeticDrugs.length > 0;
    const hasDiabetesDx = /糖尿病/.test(dxName) || /糖尿病/.test(comorbsTxt);
    if (hasAntidiabetic && !hasDiabetesDx) {
      hits.push(hit(R['YN-02'], 'error',
        `开具了降糖药物，但诊断「${disease.name}」不在糖尿病适应症范围内，医保基金不予支付。`,
        `核对诊断与用药适应症，如为糖尿病需补充对应诊断。`,
        { affected_items: antidiabeticDrugs.map(d => d.generic_name) }));
    }

    // ====================== 10. 新增：特殊人群与相互作用增强 ======================
    // （原 FMT-01-EXT 已合并入 FMT-01：>5种药品一律 error，不再重复分级扣分）

    // SPEC-01: 特殊人群剂量自动换算与调整
    const isElderly = patient.age >= 65;
    const isChild = patient.age <= 14;
    const hasRenalIssue = patient.renal_insufficiency;
    const hasLiverIssue = patient.hepatic_insufficiency;

    if (isElderly || isChild || hasRenalIssue || hasLiverIssue) {
      const popDesc = isElderly ? '老年患者（≥65岁）' : isChild ? '儿童患者' :
                      hasRenalIssue ? '肾功能不全患者' : '肝功能不全患者';
      ['normal_rx','iv_rx'].forEach(k => {
        const rx = ctx[k]; if (!rx || !Array.isArray(rx.items)) return;
        therapeuticItems(rx).forEach(it => {
          // 检查老年患者是否用了成人常规剂量（简化判断：有single_dose且超过上限的70%）
          const maxMg = doseMaxMg(it.drug);
          if (isElderly && it.single_dose && maxMg != null) {
            const v = parseDoseMg(it.single_dose);
            if (v != null && v > maxMg * 0.7) {
              hits.push(hit(R['SPEC-01'], 'warn',
                `${popDesc}「${it.drug.generic_name}」单次剂量 ${v}mg，建议从常规剂量的半量开始滴定（约 ${Math.round(maxMg*0.5)}mg）。`,
                `老年患者起始剂量宜减半，根据耐受情况逐步调整。`,
                { affected_items: [it.drug.generic_name] }));
            }
          }
          // 儿童未按体重换算提示
          if (isChild && !patient.weight) {
            hits.push(hit(R['SPEC-01'], 'warn',
              `儿童患者「${it.drug.generic_name}」未填写体重，无法按 mg/kg 换算剂量。`,
              `请填写患儿体重，按 mg/kg 精确计算单次剂量。`,
              { affected_items: [it.drug.generic_name] }));
          }
          // 肝肾功能不全提示
          if ((hasRenalIssue || hasLiverIssue) && it.drug.liver_renal_note) {
            if (/减量|不全|慎用|禁用/.test(it.drug.liver_renal_note)) {
              hits.push(hit(R['SPEC-01'], 'warn',
                `${popDesc}「${it.drug.generic_name}」需调整剂量：${it.drug.liver_renal_note}`,
                `根据 eGFR/Child-Pugh 分级调整剂量，必要时更换药物。`,
                { affected_items: [it.drug.generic_name] }));
            }
          }
        });
      });
    }

    // SPEC-02: 禁忌症自动识别
    // 收集所有药品的禁忌症关键词
    const allWarnings = [];
    allDrugs2.forEach(d => {
      (d.special_warnings_json || []).forEach(w => allWarnings.push({drug: d.generic_name, warning: w}));
    });
    // 患者已知基础疾病/状态（简化：从disease.contraindications和patient推断）
    const patientFlags = {
      pregnancy: patient.pregnancy === true || /孕妇|妊娠/.test(patient.note||''),
      glaucoma: /青光眼/.test(patient.note||''),
      pepticUlcer: /消化性溃疡|胃溃疡|十二指肠溃疡/.test(patient.note||''),
      renalArteryStenosis: /肾动脉狭窄/.test(patient.note||''),
      hypotension: patient.bp_low === true,
      asthma: /哮喘/.test((disease.name||'') + (patient.note||'')),
    };
    // 检查禁忌症匹配
    allWarnings.forEach(({drug, warning}) => {
      if (patientFlags.pregnancy && /孕妇|妊娠|哺乳/.test(warning)) {
        hits.push(hit(R['SPEC-02'], 'error',
          `患者为孕妇/哺乳期，「${drug}」禁忌症：${warning}`,
          `妊娠期禁用药物，更换为妊娠安全级别更高的替代药。`,
          { affected_items: [drug] }));
      }
      if (patientFlags.glaucoma && /青光眼/.test(warning)) {
        hits.push(hit(R['SPEC-02'], 'error',
          `患者有青光眼，「${drug}」禁忌症：${warning}`,
          `青光眼禁用抗胆碱能药物，更换替代药。`,
          { affected_items: [drug] }));
      }
      if (patientFlags.pepticUlcer && /消化性溃疡|胃溃疡/.test(warning)) {
        hits.push(hit(R['SPEC-02'], 'warn',
          `患者有消化性溃疡病史，「${drug}」注意：${warning}`,
          `NSAIDs类药物可诱发消化道出血，建议联用PPI或更换为COX-2选择性抑制剂。`,
          { affected_items: [drug] }));
      }
      if (patientFlags.renalArteryStenosis && /肾动脉狭窄/.test(warning)) {
        hits.push(hit(R['SPEC-02'], 'error',
          `患者双侧肾动脉狭窄，「${drug}」禁忌症：${warning}`,
          `ACEI/ARB类药物在双侧肾动脉狭窄时禁用，更换为CCB类。`,
          { affected_items: [drug] }));
      }
    });

    // INTER-01: 药物相互作用深度审查（关键组合）
    const drugNames = allDrugs2.map(d => d.generic_name);
    const hasDrug = (name) => drugNames.some(n => n.includes(name));

    // SSRI + MAOI（5-羟色胺综合征）
    const ssriDrugs = drugNames.filter(n => /氟西汀|帕罗西汀|艾司西酞普兰|舍曲林|氟伏沙明/.test(n));
    const maoiDrugs = drugNames.filter(n => /吗氯贝胺|苯乙肼|反苯环丙胺/.test(n));
    if (ssriDrugs.length && maoiDrugs.length) {
      hits.push(hit(R['INTER-01'], 'error',
        `SSRI类抗抑郁药与MAOI类单胺氧化酶抑制剂合用，可致5-羟色胺综合征（高热、肌强直、意识障碍）。`,
        `两类药物禁用合用；停药后需间隔14天方可换用。`,
        { affected_items: ssriDrugs.concat(maoiDrugs) }));
    }
    // ACEI/ARB + 保钾利尿剂（高钾血症）
    const aceiArbDrugs = drugNames.filter(n => /卡托普利|依那普利|贝那普利|缬沙坦|厄贝沙坦|氯沙坦|替米沙坦/.test(n));
    const kSpareDrugs = drugNames.filter(n => /螺内酯|氨苯蝶啶|阿米洛利/.test(n));
    if (aceiArbDrugs.length && kSpareDrugs.length) {
      hits.push(hit(R['INTER-01'], 'error',
        `ACEI/ARB与保钾利尿剂合用，可致严重高钾血症（心律失常风险）。`,
        `合用时需监测血钾，或更换为噻嗪类利尿剂。`,
        { affected_items: aceiArbDrugs.concat(kSpareDrugs) }));
    }
    // 华法林 + NSAIDs（出血风险）
    const hasWarfarin = hasDrug('华法林');
    const nsaidDrugs = drugNames.filter(n => /布洛芬|双氯芬酸|萘普生|塞来昔布|美洛昔康|阿司匹林/.test(n));
    if (hasWarfarin && nsaidDrugs.length) {
      hits.push(hit(R['INTER-01'], 'error',
        `华法林与NSAIDs合用，显著增加消化道出血和颅内出血风险。`,
        `如需镇痛建议改用对乙酰氨基酚，或联用PPI保护胃黏膜。`,
        { affected_items: ['华法林'].concat(nsaidDrugs) }));
    }
    // 他汀 + 大环内酯类（横纹肌溶解）
    const statinDrugs = drugNames.filter(n => /阿托伐他汀|瑞舒伐他汀|辛伐他汀|普伐他汀/.test(n));
    const macrolideDrugs = drugNames.filter(n => /红霉素|克拉霉素|阿奇霉素/.test(n));
    if (statinDrugs.length && macrolideDrugs.length) {
      hits.push(hit(R['INTER-01'], 'error',
        `他汀类与大环内酯类抗生素合用，可显著增加横纹肌溶解风险（CYP3A4抑制）。`,
        `建议暂停他汀，或更换为头孢类/喹诺酮类抗生素。`,
        { affected_items: statinDrugs.concat(macrolideDrugs) }));
    }
    // 两种以上中枢抑制药合用（镇静叠加）
    const CNSDepressants = drugNames.filter(n => /阿普唑仑|佐匹克隆|艾司唑仑|地西泮|氯硝西泮|曲马多|奥氮平|利培酮/.test(n));
    if (CNSDepressants.length >= 2) {
      hits.push(hit(R['INTER-01'], 'warn',
        `同时使用多种中枢抑制药（${CNSDepressants.join('、')}），可致过度镇静、呼吸抑制。`,
        `避免联用两种以上中枢抑制剂；确需合用时需监测呼吸和意识状态。`,
        { affected_items: CNSDepressants.slice() }));
    }

    // ====================== 11. 检验检查单（LAB） ======================
    const labRx = ctx.lab_rx;
    const labItems = (labRx && Array.isArray(labRx.items)) ? labRx.items : [];
    const diseaseLabMap = ctx.disease_lab_map || {};
    const expectedRows = (disease && disease.code && diseaseLabMap[disease.code]) ? diseaseLabMap[disease.code] : [];
    const expectedCodes = new Set(expectedRows.map(r => r.exam_code));
    // 本病种是否存在异常指标（abnormal/high/low）
    const hasAbnormalInCase = expectedRows.some(r => r.status === 'abnormal' || r.status === 'high' || r.status === 'low');

    // 并列开具模型：医生有权只开药不开检验；未开检验时给 pass 级中性提示，不扣分
    if (labItems.length === 0) {
      hits.push(hit(R['LAB-03'], 'pass',
        `本次未开具检验检查项目。${hasAbnormalInCase ? '（本病例已有异常指标，如条件允许建议后续复查追踪。）' : ''}`,
        '',
        { affected_items: [] }));
    } else {
      // LAB-01 重复开具：同一 exam_code 出现 >1 次
      const codeCount = {};
      labItems.forEach(it => {
        const c = it.exam_code || (it.name || '');
        codeCount[c] = (codeCount[c] || 0) + 1;
      });
      const dupCodes = Object.keys(codeCount).filter(c => codeCount[c] > 1);
      if (dupCodes.length) {
        const dupNames = dupCodes.map(c => {
          const it = labItems.find(x => (x.exam_code || x.name) === c);
          return (it && it.name) ? it.name : c;
        });
        hits.push(hit(R['LAB-01'], 'error',
          `检验检查单存在重复项目：${dupNames.join('、')}（同一项目开具 ${dupCodes.map(c => codeCount[c]).join('、')} 次）。`,
          `删除重复行；同一申请单内一个检验项目只应开具一次，复查应在病程中另行申请。`,
          { affected_items: dupNames.slice() }));
      }

      // LAB-02 过度检查/适应症不符：已开项目不在本病种预期 exam_code 列表内
      const offTarget = labItems.filter(it => it.exam_code && !expectedCodes.has(it.exam_code));
      if (offTarget.length) {
        const names = offTarget.map(it => it.name + (it.abbr ? `（${it.abbr}）` : ''));
        hits.push(hit(R['LAB-02'], 'warn',
          `开具的检验检查项目「${names.join('、')}」与本病种「${disease.name}」常规评估项目无明显对应关系，存在无指征检查可能。`,
          `检验项目应与临床诊断相适应；如为鉴别诊断或合并症需要，请在病历中说明理由，否则建议删减。`,
          { affected_items: names.slice() }));
      }
    }

    // ====================== 12. 手术指征判断（SURGERY） ======================
    // ctx.surgery_rx = {decision, timing, procedure_id}；ctx.surgeryCase 为 surgeries.json 对应病例。
    // 未做手术决策（纯处方/纯检验就诊）时整组跳过，不扣分。
    const surgeryRx = ctx.surgery_rx;
    const surgeryCase = ctx.surgeryCase;
    if (surgeryRx && surgeryRx.decision && surgeryCase) {
      const std = surgeryCase.standard || {};
      const dxNameS = disease.name || '';
      const tLabel = id => (surgeryCase.timing_options || []).find(t => t.id === id)?.label || id || '';
      const pLabel = id => (surgeryCase.procedure_options || []).find(p => p.id === id)?.name || id || '';

      // SUR-01：有手术指征却选保守（延误治疗）
      if (std.decision === 'surgery' && surgeryRx.decision === 'conservative') {
        hits.push(hit(R['SUR-01'], 'error',
          `「${dxNameS}」具有明确手术指征，你选择了保守治疗，可能延误病情（穿孔/坏死/感染扩散等风险）。`,
          `本病种一经确诊应及时手术干预；仅在患者存在明确禁忌症不能耐受手术时方可保守，并须在病历中说明理由。`,
          { affected_items: [] }));
      }
      // SUR-02：无手术指征却选手术（过度医疗）
      else if (std.decision === 'conservative' && surgeryRx.decision === 'surgery') {
        hits.push(hit(R['SUR-02'], 'error',
          `「${dxNameS}」适宜保守治疗，你选择了手术治疗，存在过度医疗指征。`,
          `本例应先行保守治疗并随访；确有手术指征须有充分影像学/病情依据并经上级医师会诊。`,
          { affected_items: [] }));
      }
      // 决策方向正确 → 正向通过提示
      else if (std.decision === surgeryRx.decision) {
        hits.push(pass(R['SUR-01'],
          `手术指征决策与本病种标准一致（${std.decision === 'surgery' ? '拟手术治疗' : '保守治疗'}）。`));
      }

      // 以下仅在医生选择手术时进一步核对时机与术式
      if (std.decision === 'surgery' && surgeryRx.decision === 'surgery') {
        // SUR-03：手术时机选择错误
        if (surgeryRx.timing && surgeryRx.timing !== std.timing) {
          hits.push(hit(R['SUR-03'], 'warn',
            `手术时机选择欠妥：你选「${tLabel(surgeryRx.timing)}」，本病种宜「${tLabel(std.timing)}」。`,
            `按病情紧急程度定时机：急腹症/穿孔/大出血应急诊手术，限期病变完善检查后24-48小时内手术，择期病变可待炎症控制后手术。`,
            { affected_items: [] }));
        }
        // SUR-04：术式选择不当（未选首选术式）
        if (surgeryRx.procedure_id && surgeryRx.procedure_id !== std.procedure_id) {
          hits.push(hit(R['SUR-04'], 'warn',
            `术式与首选方案不一致：你选「${pLabel(surgeryRx.procedure_id)}」，本病种首选「${pLabel(std.procedure_id)}」。`,
            `首选术式通常创伤小、恢复快；改变术式须有术中发现或患者个体化依据（如穿孔、严重粘连）。`,
            { affected_items: [] }));
        }
        // SUR-05（禁忌症仍安排手术）：本病种 contraindications 为一般性禁忌宣教，
        // 具体患者是否真的存在禁忌由 SUR-01/SUR-02 决策方向覆盖；此处不重复扣分，避免对正确答案误报。
      }
    }

    // ====================== 13. 儿童体重 mg/kg 剂量核算（DOSAGE-WT） ======================
    // 仅当患者有体重且药品有 pediatric_dose 时触发；避免对成人无体重患者误报。
    const patientWeight = parseFloat(patient.weight);
    const hasWeight = !isNaN(patientWeight) && patientWeight > 0 && patientWeight < 200;
    if (hasWeight) {
      ['normal_rx','iv_rx'].forEach(k => {
        const rx = ctx[k]; if (!rx || !Array.isArray(rx.items)) return;
        therapeuticItems(rx).forEach(it => {
          const pd = it.drug.pediatric_dose;
          if (!pd) return;
          const g = it.drug.generic_name;
          // 解析单次剂量（mg 或 U）
          const doseStr = it.single_dose || '';
          // 胰岛素类用 U
          if (pd.basis === 'per_hour' && /胰岛素/.test(g)) {
            const m = String(doseStr).match(/([\d.]+)\s*(U|IU|u)/i);
            if (!m) return;
            const uPerHr = parseFloat(m[1]);
            const perKg = uPerHr / patientWeight;
            if (perKg > pd.unit_per_kg_max * 1.5) {
              hits.push(hit(R['DOSAGE-WT'], 'error',
                `「${g}」按 ${uPerHr} U/h 给予，患者 ${patientWeight}kg 折合 ${perKg.toFixed(3)} U/kg/h，超过儿童/DKA 推荐 ${pd.unit_per_kg_min}-${pd.unit_per_kg_max} U/kg/h 上限。`,
                `按 0.05-0.1 U/kg/h 静脉泵入，每小时复测血糖与血钾。`,
                { affected_items: [g] }));
            } else if (perKg > pd.unit_per_kg_max) {
              hits.push(hit(R['DOSAGE-WT'], 'warn',
                `「${g}」折合 ${perKg.toFixed(3)} U/kg/h，略高于推荐上限 ${pd.unit_per_kg_max} U/kg/h。`,
                `复核胰岛素泵速与血糖下降速率（每小时 3.9-6.1 mmol/L）。`,
                { affected_items: [g] }));
            }
            return;
          }
          const v = parseDoseMg(doseStr);
          if (v == null) return;
          // fixed_dose：布地奈德雾化等，按固定单次剂量区间
          if (pd.basis === 'fixed_dose') {
            if (v > pd.per_dose_mg_max) {
              hits.push(hit(R['DOSAGE-WT'], 'warn',
                `「${g}」单次 ${v}mg 超过儿童常用单次 ${pd.per_dose_mg_min}-${pd.per_dose_mg_max}mg 上限。`,
                `建议 ${pd.per_dose_mg_min}-${pd.per_dose_mg_max}mg/次 ${pd.interval||''}。`,
                { affected_items: [g] }));
            }
            return;
          }
          if (pd.basis === 'age_banded') {
            // 蒙脱石散：按年龄分档，不按体重核算，跳过重量计算但提示
            return;
          }
          // per_dose：单次 mg/kg
          if (pd.basis === 'per_dose') {
            const perKg = v / patientWeight;
            const cap = pd.max_single_mg;
            if (cap && v > cap) {
              hits.push(hit(R['DOSAGE-WT'], 'error',
                `「${g}」单次 ${v}mg 超过单次封顶 ${cap}mg（${pd.note||''}）。`,
                `下调至单次 ≤${cap}mg。`,
                { affected_items: [g] }));
            } else if (perKg > pd.mg_per_kg_max * 1.5) {
              hits.push(hit(R['DOSAGE-WT'], 'error',
                `「${g}」单次 ${v}mg / ${patientWeight}kg = ${perKg.toFixed(1)} mg/kg，超过儿童推荐 ${pd.mg_per_kg_min}-${pd.mg_per_kg_max} mg/kg/次 1.5 倍。`,
                `按 ${pd.mg_per_kg_max} mg/kg/次 折算，约 ${Math.round(pd.mg_per_kg_max*patientWeight)}mg/次 ${pd.interval||''}。`,
                { affected_items: [g] }));
            } else if (perKg > pd.mg_per_kg_max) {
              hits.push(hit(R['DOSAGE-WT'], 'warn',
                `「${g}」折合 ${perKg.toFixed(1)} mg/kg/次，略高于推荐上限 ${pd.mg_per_kg_max} mg/kg。`,
                `复核剂量：${pd.note||''}`,
                { affected_items: [g] }));
            } else if (perKg < pd.mg_per_kg_min * 0.5) {
              hits.push(hit(R['DOSAGE-WT'], 'warn',
                `「${g}」折合 ${perKg.toFixed(1)} mg/kg/次，低于推荐下限 ${pd.mg_per_kg_min} mg/kg 的一半，可能剂量不足。`,
                `建议 ${pd.mg_per_kg_min}-${pd.mg_per_kg_max} mg/kg/次。`,
                { affected_items: [g] }));
            }
            return;
          }
          // per_day：日剂量 = 单次 × 日次数；与 mg_per_kg_min/max 比较
          if (pd.basis === 'per_day') {
            const freqPerDay = ({'qd':1,'bid':2,'tid':3,'qid':4,'q8h':3,'q12h':2,'qn':1,'st':1,'prn':1,'q6h':4,'q12h':2})[it.frequency] || pd.doses_per_day || 3;
            const dailyMg = v * freqPerDay;
            const perKgPerDay = dailyMg / patientWeight;
            if (perKgPerDay > pd.mg_per_kg_max * 1.5) {
              hits.push(hit(R['DOSAGE-WT'], 'error',
                `「${g}」日剂量 ${dailyMg}mg / ${patientWeight}kg = ${perKgPerDay.toFixed(1)} mg/kg/天，超过儿童推荐 ${pd.mg_per_kg_min}-${pd.mg_per_kg_max} mg/kg/天 1.5 倍。`,
                `按 ${pd.mg_per_kg_max} mg/kg/天 分 ${pd.doses_per_day||freqPerDay} 次，约 ${Math.round(pd.mg_per_kg_max*patientWeight/freqPerDay)}mg/次。`,
                { affected_items: [g] }));
            } else if (perKgPerDay > pd.mg_per_kg_max) {
              hits.push(hit(R['DOSAGE-WT'], 'warn',
                `「${g}」日剂量折合 ${perKgPerDay.toFixed(1)} mg/kg/天，略高于推荐上限 ${pd.mg_per_kg_max} mg/kg/天。`,
                `复核：${pd.note||''}`,
                { affected_items: [g] }));
            }
            return;
          }
        });
      });
    }

    // ====================== 14. 过敏史 / 合并症 / 妊娠 ======================
    // ALLERGY-01：患者过敏史关键词匹配处方药品
    const allergyRaw = (patient.allergies || patient.allergy || '').toString().trim();
    if (allergyRaw) {
      // 拆关键词：按逗号/顿号/分号/空格切分；同时识别大类
      const allergyKeywords = allergyRaw.split(/[,，、;；\s]+/).map(s => s.trim()).filter(Boolean);
      // 大类扩展：青霉素类过敏 → 阿莫西林/氨苄西林/哌拉西林/头孢类（提示交叉）
      const betaLactamAllergy = allergyKeywords.some(k => /青霉素|阿莫西林|氨苄|哌拉西林|β内酰胺|内酰胺/.test(k));
      const sulfonamideAllergy = allergyKeywords.some(k => /磺胺|复方新诺明|柳氮/.test(k));
      const nsaidAllergy = allergyKeywords.some(k => /NSAID|非甾体|布洛芬|双氯芬酸|阿司匹林|对乙酰氨基酚/.test(k));
      allDrugs2.forEach(d => {
        const name = d.generic_name || '';
        // 1) 精确命中通用名
        const hitKw = allergyKeywords.find(k => k && (name.includes(k) || k.includes(name)));
        if (hitKw) {
          hits.push(hit(R['ALLERGY-01'], 'error',
            `患者既往药物过敏史：${allergyRaw}；本次处方「${name}」命中过敏关键词「${hitKw}」。`,
            `立即停用该药，更换为非交叉过敏替代药；必要时行皮试。`,
            { affected_items: [name] }));
          return;
        }
        // 2) 青霉素类过敏 → 任何青霉素/头孢类（教学提示交叉过敏）
        if (betaLactamAllergy && /阿莫西林|氨苄|哌拉西林|青霉素|苯唑西林|氯唑西林/.test(name)) {
          hits.push(hit(R['ALLERGY-01'], 'error',
            `患者自述青霉素类过敏，本次处方「${name}」同属青霉素类，禁用。`,
            `更换为大环内酯类/呼吸喹诺酮（成人）等非β-内酰胺类替代。`,
            { affected_items: [name] }));
        }
        // 3) 磺胺过敏 → 磺胺类
        if (sulfonamideAllergy && /磺胺|复方磺胺|柳氮|塞来昔布|格列/.test(name)) {
          hits.push(hit(R['ALLERGY-01'], 'error',
            `患者自述磺胺类过敏，本次处方「${name}」含磺胺结构。`,
            `更换为非磺胺类替代。`,
            { affected_items: [name] }));
        }
        // 4) NSAID 过敏 → 同类 NSAID
        if (nsaidAllergy && /布洛芬|双氯芬酸|萘普生|塞来昔布|美洛昔康|阿司匹林|洛索洛芬/.test(name)) {
          hits.push(hit(R['ALLERGY-01'], 'error',
            `患者自述 NSAID/解热镇痛药过敏，本次处方「${name}」同类。`,
            `如需镇痛考虑对乙酰氨基酚（若未过敏）或阿片类。`,
            { affected_items: [name] }));
        }
      });
    }

    // COMORBID-01~04：合并症禁忌
    const comorbs = Array.isArray(patient.comorbidities) ? patient.comorbidities :
                    (patient.comorbidities ? patient.comorbidities.toString().split(/[,，、;；]+/).map(s=>s.trim()).filter(Boolean) : []);
    const hasCom = (k) => comorbs.some(c => c.includes(k));
    if (comorbs.length) {
      // COMORBID-01 G6PD 缺乏
      if (hasCom('G6PD') || hasCom('蚕豆')) {
        const g6pdDrugs = allDrugs2.filter(d => /伯氨喹|磺胺|呋喃妥因|呋喃唑酮|蚕豆|萘啶酸|维生素K3|维生素K4/.test(d.generic_name||''));
        g6pdDrugs.forEach(d => {
          hits.push(hit(R['COMORBID-01'], 'error',
            `患者 G6PD 缺乏（蚕豆病），「${d.generic_name}」为氧化性药物，可诱发急性溶血。`,
            `禁用；感染时选用青霉素/头孢类等非氧化性抗菌药。`,
            { affected_items: [d.generic_name] }));
        });
      }
      // COMORBID-02 青光眼
      if (hasCom('青光眼')) {
        const glaucomDrugs = allDrugs2.filter(d => /阿托品|山莨菪碱|东莨菪碱|托吡卡胺|苯海拉明|异丙嗪|麻黄碱|伪麻黄碱|复方甘草/.test(d.generic_name||''));
        glaucomDrugs.forEach(d => {
          hits.push(hit(R['COMORBID-02'], 'error',
            `患者青光眼，「${d.generic_name}」具抗胆碱作用，可升高眼压诱发闭角型青光眼急性发作。`,
            `更换为无抗胆碱作用替代药；如需解痉用选择性平滑肌松弛药。`,
            { affected_items: [d.generic_name] }));
        });
      }
      // COMORBID-03 前列腺增生
      if (hasCom('前列腺')) {
        const bphDrugs = allDrugs2.filter(d => /阿托品|山莨菪碱|东莨菪碱|苯海拉明|异丙嗪|麻黄碱|伪麻黄碱|氯苯那敏|抗组胺/.test(d.generic_name||''));
        bphDrugs.forEach(d => {
          hits.push(hit(R['COMORBID-03'], 'warn',
            `患者前列腺增生，「${d.generic_name}」具抗胆碱/减充血作用，可能致急性尿潴留。`,
            `如必须使用需监测排尿；优先选用无抗胆碱副作用替代药。`,
            { affected_items: [d.generic_name] }));
        });
      }
    }
    // COMORBID-04 妊娠禁忌（独立判断：patient.pregnant=true 或 comorbidities 含妊娠）
    const isPregnant = patient.pregnant === true || patient.pregnancy === true ||
                       comorbs.some(c => /妊娠|孕/.test(c)) || /孕妇|妊娠/.test(patient.note||'');
    if (isPregnant) {
      const pregRe = /卡托普利|依那普利|贝那普利|缬沙坦|厄贝沙坦|氯沙坦|替米沙坦|阿托伐他汀|瑞舒伐他汀|辛伐他汀|左氧氟沙星|环丙沙星|莫西沙星|四环素|多西环素|米诺环素|华法林|异维A酸|甲氨蝶呤|利巴韦林|雌激素|孕激素|口服避孕药/;
      allDrugs2.forEach(d => {
        if (pregRe.test(d.generic_name||'')) {
          hits.push(hit(R['COMORBID-04'], 'error',
            `患者妊娠状态，「${d.generic_name}」为妊娠禁忌/D-X 类药物，可致胎儿畸形或流产。`,
            `更换为妊娠安全级别高（B/C 类）替代药；用药需产科医师会诊。`,
            { affected_items: [d.generic_name] }));
        }
      });
    }

    // ====================== 15. 经济性提示（ECON-01 / INS-02 / INS-03） ======================
    // ECON-01：同药理分类已有集采品种却开非集采药（warn，minor，仅提示不扣分）
    try {
      const classHasJtc = {};
      (ctx.drugDb || []).forEach(d => {
        if (d && d.pharmacology_class && d.jtc_batch) classHasJtc[d.pharmacology_class] = true;
      });
      allDrugs2.forEach(d => {
        if (!d || !d.pharmacology_class) return;
        if (!d.jtc_batch && classHasJtc[d.pharmacology_class]) {
          hits.push(hit(R['ECON-01'], 'warn',
            `「${d.generic_name}」（${d.spec||''}）未列入国家/地方集采中选目录，同类药理分类（${d.pharmacology_class}）已有集采品种，价格更低。`,
            `在疗效相当前提下，优先选用集采中选药品以降低患者负担。`,
            { affected_items: [d.generic_name] }));
        }
      });
    } catch (e) { /* drugDb 未注入时静默跳过 */ }

    // INS-02（B5 新增）：同通用名有集采中选品种却开非集采药（minor，仅提示不扣分）
    // 与 ECON-01 区别：ECON-01 按"药理大类"粗粒度提示；INS-02 按"通用名"精确提示——
    //   即 drugDb 中存在同一 generic_name 的集采中选记录，但本次开的是该通用名的非集采规格。
    try {
      const genericHasJtc = {};
      (ctx.drugDb || []).forEach(d => {
        if (d && d.generic_name && d.jtc_batch) genericHasJtc[d.generic_name] = true;
      });
      allDrugs2.forEach(d => {
        if (!d || !d.generic_name) return;
        if (!d.jtc_batch && genericHasJtc[d.generic_name]) {
          hits.push(hit(R['INS-02'], 'warn',
            `「${d.generic_name}」同通用名已有国家集采中选品种，本次开具的非集采规格（${d.spec||'规格未注明'}）价格更高。`,
            `在疗效与安全等效前提下，优先选用同通用名的集采中选规格以降低患者自付。`,
            { affected_items: [d.generic_name] }));
        }
      });
    } catch (e) { /* drugDb 未注入时静默跳过 */ }

    // INS-03（B5 新增）：开具了自费生物制剂但无医保指征（minor，仅提示不扣分）
    // 触发：drug.is_self_paid_biologic=true 或 generic_name 命中生物制剂关键词，且诊断不在医保限定支付目录
    try {
      const biologicRe = /单抗|注射液.*(英夫利西|阿达木|曲妥珠|利妥昔|贝伐珠|帕博利珠|纳武利尤|西妥昔|乌司奴|司美格鲁肽|利拉鲁肽|特立帕肽|雷帕明)/;
      allDrugs2.forEach(d => {
        if (!d || !d.generic_name) return;
        const isBiologic = d.is_self_paid_biologic === true || d.is_biologic === true ||
                           biologicRe.test(d.generic_name) || biologicRe.test(d.spec || '');
        if (!isBiologic) return;
        // 已显式标注医保指征（医保限定支付目录覆盖本病种）→ 不提示
        const dxTxt = (disease.name || '') + ' ' + (patient.note || '');
        const coveredByInsurance = /类风湿|强直性脊柱炎|银屑病|克罗恩|溃疡性结肠炎|肿瘤|白血病|淋巴瘤|糖尿病|骨质疏松|器官移植/.test(dxTxt);
        if (!coveredByInsurance) {
          hits.push(hit(R['INS-03'], 'warn',
            `「${d.generic_name}」属自费生物制剂/高价生物药，本次诊断「${disease.name}」不在其医保限定支付目录内，将全额自费。`,
            `请与患者充分沟通费用并确认其知情同意；如有医保适应症诊断请补充完整，或改用医保目录内替代方案。`,
            { affected_items: [d.generic_name] }));
        }
      });
    } catch (e) { /* 静默跳过 */ }

    // ====================== 16. 2026-11-09 新增 12 条三甲点评规则 ======================
    // 所有新规则包在 try/catch 中：任一规则异常不得影响主流程。
    try {
      // ---- 公共识别正则（宁漏勿滥，精准匹配） ----
      const ABX_NAME_RE = /青霉素|阿莫西林|氨苄西林|哌拉西林|美洛西林|苯唑西林|氯唑西林|头孢氨苄|头孢拉定|头孢呋辛|头孢克洛|头孢克肟|头孢地尼|头孢曲松|头孢他啶|头孢哌酮|头孢唑林|头孢噻肟|亚胺培南|美罗培南|厄他培南|左氧氟沙星|环丙沙星|莫西沙星|诺氟沙星|阿奇霉素|克拉霉素|罗红霉素|红霉素|多西环素|四环素|米诺环素|庆大霉素|阿米卡星|妥布霉素|奈替米星|链霉素|万古霉素|去甲万古霉素|替考拉宁|甲硝唑|替硝唑|奥硝唑|克林霉素|林可霉素|复方磺胺|磺胺甲噁唑|磺胺甲恶唑|磷霉素|呋喃妥因|利福平|异烟肼|吡嗪酰胺|乙胺丁醇/;
      const BETALACTAM_RE = /青霉素|阿莫西林|氨苄西林|哌拉西林|美洛西林|苯唑西林|氯唑西林|头孢|亚胺培南|美罗培南|厄他培南/;
      const STATIC_ABX_RE = /四环素|多西环素|米诺环素|红霉素|克拉霉素|阿奇霉素|罗红霉素|林可霉素|克林霉素/;
      const APAP_COMBO_RE = /感冒灵|氨酚黄那敏|酚麻美敏|复方氨酚|氨酚烷胺|酚咖|氨酚伪麻|美扑伪麻|白加黑|泰诺|快克|感康/;
      const RENAL_TOXIC_RE = /庆大霉素|阿米卡星|妥布霉素|奈替米星|链霉素|万古霉素|去甲万古霉素|替考拉宁|头孢克肟/;
      const HEPATO_TOXIC_RE = /依托红霉素|无味红霉素|红霉素酯|利福平|异烟肼|吡嗪酰胺/;
      const PED_HARD_RE = /可待因|复方磷酸可待因|异丙嗪|庆大霉素|阿米卡星|妥布霉素|奈替米星|链霉素/;
      const PREG_TCM_RE = /麝香|红花|桃仁|水蛭|虻虫|三棱|莪术|苏木|干漆|王不留行|益母草|川牛膝/;
      const AUX_MONITOR_RE = /脑蛋白水解物|参麦|丹参|香丹|血栓通|血塞通|醒脑静|神经节苷脂|胞磷胆碱|胞二磷胆碱|小牛血|骨肽|黄芪注射液|丹参酮|红花黄色素|舒血宁|银杏达莫|曲克芦丁/;
      const FUZZY_DX_RE = /待查|待诊|自感|不舒服|查体|体检/;
      const VIRAL_DX_RE = /普通感冒|病毒性感冒|流行性感冒|流感/;

      // 合并所有药品（含口服+静脉），与 allDrugs2 等价
      const allNew = [];
      [ctx.normal_rx, ctx.iv_rx].forEach(rx => {
        if (rx && Array.isArray(rx.items)) rx.items.forEach(it => {
          if (it && it.drug && it.drug.dosage_form !== 'solvent') allNew.push(it);
        });
      });
      const comorbsArr = Array.isArray(patient.comorbidities) ? patient.comorbidities :
                        (patient.comorbidities ? patient.comorbidities.toString().split(/[,，、;；]+/).map(s=>s.trim()).filter(Boolean) : []);
      const comorbsTxt = comorbsArr.join(' ') + ' ' + (patient.note || '');
      const hasRenalDisease = patient.renal_insufficiency === true || /肾衰|尿毒症|透析|肾功能不全|慢性肾|CKD/i.test(comorbsTxt);
      const hasHepaticDisease = patient.hepatic_insufficiency === true || /肝炎|肝硬化|肝功能不全|肝衰|脂肪肝/.test(comorbsTxt);
      const isPregnantNow = patient.pregnant === true || patient.pregnancy === true ||
                            comorbsArr.some(c => /妊娠|孕/.test(c)) || /孕妇|妊娠/.test(patient.note || '');

      // ---- NEW-12 病毒性疾病无指征用抗菌药（先判，便于后续联用规则复用） ----
      if (VIRAL_DX_RE.test(dxName)) {
        const viralAbx = allNew.filter(it => ABX_NAME_RE.test(it.drug.generic_name || ''));
        if (viralAbx.length) {
          hits.push(hit(R['NEW-12'], 'warn',
            `诊断「${disease.name}」为病毒性疾病（普通感冒/流感），无指征使用抗菌药「${viralAbx.map(it=>it.drug.generic_name).join('、')}」。`,
            `病毒性疾病以对症支持为主；出现细菌并发症（黄脓涕>10天、肺炎、中耳炎）方考虑抗菌药。`,
            { affected_items: viralAbx.map(it => it.drug.generic_name) }));
        }
      }

      // ---- NEW-01 无指征联用≥2种抗菌药 ----
      const abxItems = allNew.filter(it => ABX_NAME_RE.test(it.drug.generic_name || ''));
      const abxUniqueNames = [...new Set(abxItems.map(it => it.drug.generic_name))];
      if (abxUniqueNames.length >= 2) {
        // 例外：混合感染诊断关键词不报错（仅教学提示）
        const mixedInfection = /阑尾炎|腹膜炎|腹腔感染|胆管炎|败血症|脓毒症|吸入性肺炎|重症肺炎|牙周脓肿|盆腔脓肿/.test(dxName + comorbsTxt);
        hits.push(hit(R['NEW-01'], mixedInfection ? 'pass' : 'warn',
          mixedInfection
            ? `处方联用抗菌药「${abxUniqueNames.join('、')}」，诊断提示混合感染/重症，联合用药指征成立。`
            : `处方同时使用 ${abxUniqueNames.length} 种抗菌药：${abxUniqueNames.join('、')}；诊断「${disease.name}」未提示重症/混合感染，联合用药指征不充分。`,
          `单一药物可控制的感染不联用；确需联合（混合感染、重症、防耐药）须在病历写明指征。`,
          { affected_items: abxUniqueNames.slice() }));
      }

      // ---- NEW-02 β内酰胺繁殖期杀菌 + 四环素/大环内酯速效抑菌 ----
      const betaItems = allNew.filter(it => BETALACTAM_RE.test(it.drug.generic_name || ''));
      const staticItems = allNew.filter(it => STATIC_ABX_RE.test(it.drug.generic_name || ''));
      if (betaItems.length && staticItems.length) {
        hits.push(hit(R['NEW-02'], 'warn',
          `β-内酰胺类「${betaItems.map(it=>it.drug.generic_name).join('、')}」与速效抑菌药「${staticItems.map(it=>it.drug.generic_name).join('、')}」同处方联用，可能产生药效学拮抗。`,
          `一般情况二选一；如为CAP等明确混合感染需序贯或间隔给药，并在病历说明理由。`,
          { affected_items: betaItems.map(it=>it.drug.generic_name).concat(staticItems.map(it=>it.drug.generic_name)) }));
      }

      // ---- NEW-03 复方感冒药叠加单方对乙酰氨基酚 ----
      const apapSingle = allNew.filter(it => {
        const n = it.drug.generic_name || '';
        return /对乙酰氨基酚/.test(n) && !APAP_COMBO_RE.test(n);
      });
      const apapCombo = allNew.filter(it => APAP_COMBO_RE.test(it.drug.generic_name || ''));
      if (apapSingle.length && apapCombo.length) {
        hits.push(hit(R['NEW-03'], 'warn',
          `单方对乙酰氨基酚「${apapSingle.map(it=>it.drug.generic_name).join('、')}」与含对乙酰氨基酚的复方感冒药「${apapCombo.map(it=>it.drug.generic_name).join('、')}」叠加，易致日剂量超标、肝损伤。`,
          `只选用一种退热感冒药；查看复方制剂成分表，避免同类解热镇痛成分重复。`,
          { affected_items: apapSingle.map(it=>it.drug.generic_name).concat(apapCombo.map(it=>it.drug.generic_name)) }));
      }

      // ---- NEW-04 肾功能不全用肾毒性抗菌药 ----
      if (hasRenalDisease) {
        const renalTox = allNew.filter(it => RENAL_TOXIC_RE.test(it.drug.generic_name || ''));
        if (renalTox.length) {
          hits.push(hit(R['NEW-04'], 'error',
            `患者存在肾功能不全/透析/肾衰，仍使用肾毒性抗菌药「${renalTox.map(it=>it.drug.generic_name).join('、')}」，未按 eGFR 减量提示。`,
            `按 eGFR 减量或延长给药间隔，必须使用时监测血药浓度与肾功能；优先选肝肾双通道排泄药。`,
            { affected_items: renalTox.map(it => it.drug.generic_name) }));
        }
      }

      // ---- NEW-05 肝功能不全用肝毒性药 ----
      if (hasHepaticDisease) {
        const hepTox = allNew.filter(it => HEPATO_TOXIC_RE.test(it.drug.generic_name || ''));
        // 大剂量对乙酰氨基酚（>500mg/次）在肝功不全时也警示
        const apapHigh = allNew.filter(it => {
          const n = it.drug.generic_name || '';
          if (!/对乙酰氨基酚/.test(n)) return false;
          const v = parseDoseMg(it.single_dose);
          return v != null && v > 500;
        });
        const allHep = hepTox.concat(apapHigh);
        if (allHep.length) {
          hits.push(hit(R['NEW-05'], 'error',
            `患者存在肝功能不全/肝炎/肝硬化，使用肝毒性药物「${allHep.map(it=>it.drug.generic_name).join('、')}」，可诱发药物性肝损伤。`,
            `选用肝毒性小的替代药；必须使用时监测 ALT/AST/胆红素。`,
            { affected_items: allHep.map(it => it.drug.generic_name) }));
        }
      }

      // ---- NEW-06 模糊诊断仍开治疗药 ----
      if (FUZZY_DX_RE.test(dxName) && allNew.length) {
        hits.push(hit(R['NEW-06'], 'warn',
          `临床诊断「${disease.name}」为模糊诊断（待查/自感/不适/查体），却开具治疗性药物「${allNew.slice(0,5).map(it=>it.drug.generic_name).join('、')}${allNew.length>5?'等':''}」。`,
          `完善病史与查体后明确具体诊断；诊断不明时先检查对症，不开具体治疗药。`,
          { affected_items: allNew.map(it => it.drug.generic_name) }));
      }

      // ---- NEW-07 用法用量/给药途径缺失 ----
      allNew.forEach(it => {
        const g = it.drug.generic_name || '';
        const freq = it.frequency || it.freq || (it.drug && (it.drug.frequency || it.drug.freq)) || '';
        const route = it.drug.dosage_form || it.drug.route || '';
        if (!freq || !route) {
          hits.push(hit(R['NEW-07'], 'warn',
            `「${g}」用法信息缺失：${!freq ? '无频次(frequency)' : ''}${(!freq && !route) ? '、' : ''}${!route ? '无给药途径(dosage_form)' : ''}。`,
            `补全 qd/bid/tid/qid 等频次与 po/iv/im 等给药途径。`,
            { affected_items: [g] }));
        }
      });

      // ---- NEW-08 无指征重点监控辅助用药 ----
      const auxItems = allNew.filter(it => AUX_MONITOR_RE.test(it.drug.generic_name || ''));
      if (auxItems.length) {
        // 诊断是否与该类辅助用药适应症相关（粗略白名单）
        const auxDxOk = /脑梗死|脑出血|脑卒中|脑外伤|周围神经|冠心病|心绞痛|心肌梗死|脑供血|眩晕|骨折|骨质疏松|肿瘤|肝炎/.test(dxName + comorbsTxt);
        if (!auxDxOk) {
          hits.push(hit(R['NEW-08'], 'warn',
            `处方含国家重点监控辅助用药「${auxItems.map(it=>it.drug.generic_name).join('、')}」，但诊断「${disease.name}」不支持其说明书适应症。`,
            `严格按说明书适应症使用；不符者删除，改为循证治疗药。`,
            { affected_items: auxItems.map(it => it.drug.generic_name) }));
        }
      }

      // ---- NEW-09 儿童用可待因/异丙嗪/氨基糖苷类 ----
      if (patient.age != null && patient.age < 12) {
        const pedBad = allNew.filter(it => PED_HARD_RE.test(it.drug.generic_name || ''));
        if (pedBad.length) {
          hits.push(hit(R['NEW-09'], 'error',
            `患儿 ${patient.age} 岁（<12岁），使用儿童禁忌/慎用药物「${pedBad.map(it=>it.drug.generic_name).join('、')}」（可待因<12禁用；异丙嗪<2禁用；氨基糖苷类具耳肾毒性）。`,
            `儿童镇咳改用右美沙芬/蜂蜜；抗过敏改用西替利嗪/氯雷他定；抗感染避免氨基糖苷类。`,
            { affected_items: pedBad.map(it => it.drug.generic_name) }));
        }
      }

      // ---- NEW-10 同通用名口服+静脉重复 ----
      {
        const oralNames = new Set(oral.map(it => it.drug.generic_name));
        const ivNames = new Set(ivDrugs.map(it => it.drug.generic_name));
        const dupNames = [...oralNames].filter(n => ivNames.has(n));
        if (dupNames.length) {
          const reason = iv && iv.iv_reason;
          if (reason !== 'sequential_therapy') {
            hits.push(hit(R['NEW-10'], 'warn',
              `同一通用名「${dupNames.join('、')}」在口服组与静脉组同时开具，且 iv_reason 未标注序贯治疗。`,
              `保留一种给药途径；确需序贯应在 iv_reason 标注并写明转换时点。`,
              { affected_items: dupNames.slice() }));
          }
        }
      }

      // ---- NEW-11 孕妇用妊娠禁忌中成药 ----
      if (isPregnantNow) {
        const pregTcm = allNew.filter(it => PREG_TCM_RE.test(it.drug.generic_name || ''));
        if (pregTcm.length) {
          hits.push(hit(R['NEW-11'], 'error',
            `患者妊娠状态，使用妊娠禁忌中成药成分「${pregTcm.map(it=>it.drug.generic_name).join('、')}」（麝香/红花/三棱/莪术/水蛭等可兴奋子宫、致流产）。`,
            `立即停用；妊娠期用药须中医妇科评估，选用妊娠安全替代药。`,
            { affected_items: pregTcm.map(it => it.drug.generic_name) }));
        }
      }
    } catch (e) {
      // 新规则异常不得影响主流程
      if (typeof console !== 'undefined') console.warn('[rule-engine] NEW-XX section error:', e && e.message);
    }

    return hits;
  }

  global.RxRuleEngine = { run };
})(window);

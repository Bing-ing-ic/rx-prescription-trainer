/* =====================================================================
 * P3-1 中医汉方模块端到端跑批：10 个辨证病例完整处方提交
 * 运行: node test/e2e-tcm.js
 * 每个病例：构造完整 ctx（辨证/治法/选方/处方药味剂量）→ 跑 TCMEngine.check →
 *           统计命中规则数、error 数、warn 数、评分。
 * 验收：10 个病例均无 error（参考方本身正确）。
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// 浏览器环境 polyfill
global.window = global;
require(path.join(ROOT, 'js/tcm-engine.js'));
const TCMEngine = global.TCMEngine;

// 载入数据并注入（模拟 tcm-app boot()）
const herbsArr = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tcm-herbs.json'), 'utf8')).herbs;
const rulesArr = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tcm-rules.json'), 'utf8')).rules;
TCMEngine.extraRules = rulesArr.filter(r => r.type);
TCMEngine.herbsMeta = TCMEngine.buildHerbsMeta(herbsArr);

// 患者统一为成人（30-55 岁、非孕妇），避免触发小儿/老年规则干扰参考方校验
function adultPatient(age = 35, gender = '男') {
  return { name: '测试患者', gender, age, pregnant: false };
}

// 快捷构造药味
function H(name, dose, role, prep) {
  const o = { name, dose, role };
  if (prep) o.prep = prep;
  return o;
}

// ---------- 10 个辨证病例 ----------
const cases = [];

// 1. 风寒感冒 → 荆防败毒散（辛温解表）
cases.push({
  id: 'TCM-E2E-01',
  title: '风寒感冒（荆防败毒散）',
  build() {
    return {
      case: {
        syndrome_differentiation: '风寒束表证',
        treatment_principle: '辛温解表',
        reference_formula_code: 'JFBDS',
        formulas: ['荆防败毒散'],
      },
      patient: adultPatient(32, '男'),
      zhengInput: '风寒束表证',
      faZhengInput: '辛温解表',
      formulaCode: 'JFBDS',
      formulaName: '荆防败毒散',
      herbs: [
        H('荆芥', '6g', '君'),
        H('防风', '6g', '君'),
        H('羌活', '6g', '臣'),
        H('独活', '6g', '臣'),
        H('柴胡', '6g', '佐'),
        H('前胡', '6g', '佐'),
        H('枳壳', '6g', '佐'),
        H('桔梗', '6g', '佐'),
        H('茯苓', '10g', '佐'),
        H('川芎', '6g', '佐'),
        H('甘草', '3g', '使'),
      ],
    };
  },
});

// 2. 风热感冒 → 银翘散（辛凉解表）
cases.push({
  id: 'TCM-E2E-02',
  title: '风热感冒（银翘散）',
  build() {
    return {
      case: {
        syndrome_differentiation: '风热犯表证',
        treatment_principle: '辛凉解表，清热解毒',
        reference_formula_code: 'YQS',
        formulas: ['银翘散'],
      },
      patient: adultPatient(28, '女'),
      zhengInput: '风热犯表证',
      faZhengInput: '辛凉解表',
      formulaCode: 'YQS',
      formulaName: '银翘散',
      herbs: [
        H('金银花', '9g', '君'),
        H('连翘', '9g', '君'),
        H('薄荷', '6g', '臣', '后下'),
        H('牛蒡子', '9g', '臣'),
        H('荆芥', '6g', '佐'),
        H('淡豆豉', '6g', '佐'),
        H('桔梗', '6g', '佐'),
        H('淡竹叶', '4g', '佐'),
        H('芦根', '9g', '佐'),
        H('甘草', '5g', '使'),
      ],
    };
  },
});

// 3. 气虚感冒 → 参苏饮（益气解表）
cases.push({
  id: 'TCM-E2E-03',
  title: '气虚感冒（参苏饮）',
  build() {
    return {
      case: {
        syndrome_differentiation: '气虚外感证',
        treatment_principle: '益气解表',
        reference_formula_code: 'SSY',
        formulas: ['参苏饮'],
      },
      patient: adultPatient(50, '男'),
      zhengInput: '气虚外感证',
      faZhengInput: '益气解表',
      formulaCode: 'SSY',
      formulaName: '参苏饮',
      herbs: [
        H('人参', '6g', '君'),
        H('紫苏叶', '6g', '臣'),
        H('葛根', '10g', '臣'),
        H('半夏', '6g', '佐'),
        H('前胡', '6g', '佐'),
        H('茯苓', '10g', '佐'),
        H('陈皮', '6g', '佐'),
        H('枳壳', '6g', '佐'),
        H('桔梗', '6g', '佐'),
        H('木香', '6g', '佐'),
        H('甘草', '3g', '使'),
      ],
    };
  },
});

// 4. 风寒咳嗽 → 三拗汤（宣肺解表）
cases.push({
  id: 'TCM-E2E-04',
  title: '风寒咳嗽（三拗汤）',
  build() {
    return {
      case: {
        syndrome_differentiation: '风寒袭肺证',
        treatment_principle: '宣肺散寒',
        reference_formula_code: 'SAT',
        formulas: ['三拗汤'],
      },
      patient: adultPatient(35, '男'),
      zhengInput: '风寒袭肺证',
      faZhengInput: '宣肺散寒',
      formulaCode: 'SAT',
      formulaName: '三拗汤',
      herbs: [
        H('麻黄', '6g', '君'),
        H('苦杏仁', '6g', '臣'),
        H('甘草', '3g', '使'),
      ],
    };
  },
});

// 5. 风热咳嗽 → 桑菊饮（疏风清热，宣肺止咳）
cases.push({
  id: 'TCM-E2E-05',
  title: '风热咳嗽（桑菊饮）',
  build() {
    return {
      case: {
        syndrome_differentiation: '风热犯肺证',
        treatment_principle: '疏风清热，宣肺止咳',
        reference_formula_code: 'SYY',
        formulas: ['桑菊饮'],
      },
      patient: adultPatient(30, '女'),
      zhengInput: '风热犯肺证',
      faZhengInput: '疏风清热宣肺',
      formulaCode: 'SYY',
      formulaName: '桑菊饮',
      herbs: [
        H('桑叶', '9g', '君'),
        H('菊花', '9g', '君'),
        H('苦杏仁', '6g', '臣'),
        H('连翘', '6g', '臣'),
        H('薄荷', '3g', '佐', '后下'),
        H('桔梗', '6g', '佐'),
        H('芦根', '9g', '佐'),
        H('甘草', '3g', '使'),
      ],
    };
  },
});

// 6. 温燥咳嗽 → 桑杏汤（清宣温燥）
cases.push({
  id: 'TCM-E2E-06',
  title: '温燥咳嗽（桑杏汤）',
  build() {
    return {
      case: {
        syndrome_differentiation: '温燥犯肺证',
        treatment_principle: '清宣温燥，润肺止咳',
        reference_formula_code: 'SXT',
        formulas: ['桑杏汤'],
      },
      patient: adultPatient(40, '女'),
      zhengInput: '温燥犯肺证',
      faZhengInput: '清宣温燥润肺',
      formulaCode: 'SXT',
      formulaName: '桑杏汤',
      herbs: [
        H('桑叶', '6g', '君'),
        H('苦杏仁', '6g', '臣'),
        H('北沙参', '6g', '臣'),
        H('浙贝母', '6g', '佐'),
        H('淡豆豉', '6g', '佐'),
        H('栀子', '6g', '佐'),
        H('梨皮', '6g', '佐'),
      ],
    };
  },
});

// 7. 寒积便秘 → 大黄附子汤（温下）
cases.push({
  id: 'TCM-E2E-07',
  title: '寒积便秘（大黄附子汤）',
  build() {
    return {
      case: {
        syndrome_differentiation: '寒积内结证',
        treatment_principle: '温阳散寒，通便止痛',
        reference_formula_code: 'DHFZT',
        formulas: ['大黄附子汤'],
      },
      patient: adultPatient(55, '男'),
      zhengInput: '寒积内结证',
      faZhengInput: '温阳通便',
      formulaCode: 'DHFZT',
      formulaName: '大黄附子汤',
      herbs: [
        H('附子', '9g', '君', '先煎'),
        H('大黄', '6g', '臣', '后下'),
        H('细辛', '3g', '佐'),
      ],
    };
  },
});

// 8. 热积便秘 → 麻子仁丸（润肠泻热）
cases.push({
  id: 'TCM-E2E-08',
  title: '热积便秘（麻子仁丸）',
  build() {
    return {
      case: {
        syndrome_differentiation: '热积便秘证',
        treatment_principle: '润肠泻热，行气通便',
        reference_formula_code: 'MZRW',
        formulas: ['麻子仁丸'],
      },
      patient: adultPatient(45, '男'),
      zhengInput: '热积便秘证',
      faZhengInput: '润肠泻热',
      formulaCode: 'MZRW',
      formulaName: '麻子仁丸',
      herbs: [
        H('火麻仁', '15g', '君'),
        H('白芍', '9g', '臣'),
        H('枳实', '9g', '臣'),
        H('大黄', '9g', '佐', '后下'),
        H('厚朴', '9g', '佐'),
        H('苦杏仁', '9g', '佐'),
      ],
    };
  },
});

// 9. 气虚便秘 → 黄芪汤（益气润肠）
cases.push({
  id: 'TCM-E2E-09',
  title: '气虚便秘（黄芪汤）',
  build() {
    return {
      case: {
        syndrome_differentiation: '气虚便秘证',
        treatment_principle: '益气健脾，润肠通便',
        reference_formula_code: 'HST',
        formulas: ['黄芪汤'],
      },
      patient: adultPatient(55, '女'),
      zhengInput: '气虚便秘证',
      faZhengInput: '益气润肠',
      formulaCode: 'HST',
      formulaName: '黄芪汤',
      herbs: [
        H('黄芪', '15g', '君'),
        H('火麻仁', '12g', '臣'),
        H('陈皮', '9g', '佐'),
        H('蜂蜜', '30g', '佐使', '烊化'),
      ],
    };
  },
});

// 10. 阴虚便秘 → 增液汤（滋阴通便）
cases.push({
  id: 'TCM-E2E-10',
  title: '阴虚便秘（增液汤）',
  build() {
    return {
      case: {
        syndrome_differentiation: '阴虚肠燥证',
        treatment_principle: '滋阴清热，润肠通便',
        reference_formula_code: 'ZYT',
        formulas: ['增液汤'],
      },
      patient: adultPatient(50, '女'),
      zhengInput: '阴虚肠燥证',
      faZhengInput: '滋阴润肠',
      formulaCode: 'ZYT',
      formulaName: '增液汤',
      herbs: [
        H('玄参', '15g', '君'),
        H('麦冬', '12g', '臣'),
        H('生地黄', '15g', '臣'),
      ],
    };
  },
});

// ---------- 跑批 ----------
console.log('='.repeat(100));
console.log('P3-1 中医汉方端到端跑批（10 个辨证病例 · 参考方本身应无 error）');
console.log('='.repeat(100));

const rows = [];
let pass = 0, fail = 0;

cases.forEach((c, idx) => {
  const ctx = c.build();
  const hits = TCMEngine.check(ctx);
  const errs = hits.filter(h => h.severity === 'error');
  const warns = hits.filter(h => h.severity === 'warn');
  const s = TCMEngine.score(hits);
  const ok = errs.length === 0;
  if (ok) pass++; else fail++;
  rows.push({
    idx: idx + 1, id: c.id, title: c.title,
    total: hits.length, errors: errs.length, warns: warns.length,
    score: s.total, ok,
    errMsgs: errs.map(e => '[' + e.rule_id + '] ' + e.message),
    warnMsgs: warns.map(w => '[' + w.rule_id + '] ' + w.message),
  });
});

console.log('');
console.log(
  '#'.padEnd(3) +
  '病例'.padEnd(28) +
  '命中'.padEnd(6) +
  'error'.padEnd(7) +
  'warn'.padEnd(6) +
  '评分'.padEnd(7) +
  '结果'
);
console.log('-'.repeat(90));
rows.forEach(r => {
  console.log(
    String(r.idx).padEnd(3) +
    r.title.padEnd(28) +
    String(r.total).padEnd(6) +
    String(r.errors).padEnd(7) +
    String(r.warns).padEnd(6) +
    String(r.score).padEnd(7) +
    (r.ok ? '✅ PASS' : '❌ FAIL')
  );
});

console.log('');
console.log('='.repeat(100));
console.log('详细输出（error 与 warn）');
console.log('='.repeat(100));
rows.forEach(r => {
  if (!r.errMsgs.length && !r.warnMsgs.length) return;
  console.log('\n#' + r.idx + ' ' + r.title);
  r.errMsgs.forEach(m => console.log('  ❌ ERROR ' + m));
  r.warnMsgs.forEach(m => console.log('  ⚠️  WARN  ' + m));
});

console.log('');
console.log('='.repeat(100));
console.log('跑批结果：' + pass + '/10 病例无 error；' + fail + ' 个病例有 error');
console.log('验收标准：10 个参考方均无 error → ' + (pass === 10 ? '✅ 达标' : '❌ 未达标'));
console.log('='.repeat(100));

process.exit(fail > 0 ? 1 : 0);

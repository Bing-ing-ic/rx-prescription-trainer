/* =====================================================================
 * P2-2 端到端 QA 测试：10 个典型病例完整处方跑批
 * 运行: node test/e2e-cases.js
 * 每个病例：构造完整 visit_ctx → 跑 RxRuleEngine.run → 统计命中规则/error 数/评分
 * 验收：≥8 个病例无 error 级命中；有 error 的需分析原因。
 * ===================================================================== */
'use strict';
global.window = global;
const path = require('path');
const PROJECT_ROOT = path.join(__dirname, '..');
const rulesMeta = require(path.join(PROJECT_ROOT, 'data/rules.json')).rules;
const diseasesDb = require(path.join(PROJECT_ROOT, 'data/diseases.json')).diseases;
const drugsDb = require(path.join(PROJECT_ROOT, 'data/drugs.json')).drugs;
const compatData = require(path.join(PROJECT_ROOT, 'data/compat.json'));
const surgeryCases = require(path.join(PROJECT_ROOT, 'data/surgeries.json')).cases || {};
require(path.join(PROJECT_ROOT, 'js/rule-engine.js'));
const RxRuleEngine = global.window.RxRuleEngine;

// ---------- 辅助 ----------
function D(name) {
  const f = drugsDb.find(d => d.generic_name === name);
  if (!f) throw new Error('药品不存在: ' + name);
  return f;
}
// 按通用名+规格找溶媒
function Solvent(name, spec) {
  const f = drugsDb.find(d => d.generic_name === name && d.spec === spec && d.dosage_form === 'solvent');
  if (!f) throw new Error('溶媒不存在: ' + name + ' ' + spec);
  return f;
}
function it(drug, ov = {}) {
  return Object.assign({
    drug: typeof drug === 'string' ? D(drug) : drug,
    single_dose: '', frequency: '', duration_days: null,
    quantity: 1,
  }, ov);
}
function dx(code) {
  const d = diseasesDb.find(x => x.code === code);
  if (!d) throw new Error('病种不存在: ' + code);
  return d;
}
function baseCtx(over = {}) {
  return Object.assign({
    rulesMeta, compatData, drugDb: drugsDb,
    disease: dx('HTN-I10'),
    patient: { name: '测试患者', gender: '男', age: 40, weight: 65 },
    normal_rx: null, iv_rx: null,
    disease_lab_map: {},
    surgeryCase: null, surgery_rx: null,
  }, over);
}

// ---------- 10 个病例 ----------
const cases = [];

// 1. DKA：生理盐水 + 小剂量胰岛素 + 补钾
cases.push({
  id: 'KETOSIS-E11',
  title: 'DKA（2型糖尿病伴酮症）',
  build() {
    return baseCtx({
      disease: dx('KETOSIS-E11'),
      patient: { name: '患者A', gender: '男', age: 45, weight: 60 },
      iv_rx: {
        rx_id: 'IV-20261106-001',
        iv_reason: 'severe_dehydration',
        solvent_name: '0.9%氯化钠注射液 250ml/袋',
        drip_speed_mlh: 20,
        total_volume_ml: 500,
        items: [
          it(Solvent('0.9%氯化钠注射液', '250ml/袋'), { group: 1 }),
          it('普通胰岛素注射液', { group: 1, single_dose: '5U/h', frequency: 'st', duration_days: 1 }),
          it(Solvent('0.9%氯化钠注射液', '250ml/袋'), { group: 2 }),
          it('氯化钾注射液', { group: 2, single_dose: '10ml', frequency: 'st', duration_days: 1 }),
        ],
      },
    });
  },
  expect: '无 error（DKA 标准治疗：补液+小剂量胰岛素+补钾）',
});

// 2. 哮喘急性发作：沙丁胺醇雾化 + 布地奈德 + 全身激素
cases.push({
  id: 'ASTHMA-J45',
  title: '支气管哮喘急性发作',
  build() {
    return baseCtx({
      disease: dx('ASTHMA-J45'),
      patient: { name: '患者B', gender: '女', age: 30, weight: 65 },
      normal_rx: {
        rx_id: 'N-1',
        items: [
          it('沙丁胺醇雾化吸入溶液', { single_dose: '5mg', frequency: 'q20min', duration_days: 1 }),
          it('布地奈德', { single_dose: '1mg', frequency: 'bid', duration_days: 3 }),
        ],
      },
      iv_rx: {
        rx_id: 'IV-20261106-002',
        iv_reason: 'no_oral_alternative',
        solvent_name: '0.9%氯化钠注射液 100ml/袋',
        drip_speed_mlh: 30,
        total_volume_ml: 100,
        items: [
          it(Solvent('0.9%氯化钠注射液', '100ml/袋'), { group: 1 }),
          it('注射用甲泼尼龙琥珀酸钠', { group: 1, single_dose: '40mg', frequency: 'st', duration_days: 1 }),
        ],
      },
    });
  },
  expect: '无 error（SABA+ICS+全身激素）',
});

// 3. 急性阑尾炎：口服头孢呋辛酯+甲硝唑（非手术方案）
cases.push({
  id: 'APP-K35',
  title: '急性阑尾炎（口服非手术方案）',
  build() {
    return baseCtx({
      disease: dx('APP-K35'),
      patient: { name: '患者C', gender: '男', age: 25, weight: 60 },
      normal_rx: {
        rx_id: 'N-2',
        items: [
          it('头孢呋辛酯片', { single_dose: '250mg', frequency: 'bid', duration_days: 7 }),
          it('甲硝唑片', { single_dose: '400mg', frequency: 'tid', duration_days: 7 }),
        ],
      },
    });
  },
  expect: '无 error（口服覆盖革兰阴性+厌氧菌）',
});

// 4. 颈椎病（针灸模块，非西医处方引擎）
cases.push({
  id: 'ACUP-007',
  title: '颈椎病（针灸主穴命中）[针灸模块]',
  build() {
    // 西医规则引擎不处理针灸处方，直接构造一个空 ctx 用于冒烟
    return baseCtx({
      disease: { code: 'CERV-M50', name: '颈椎病（神经根型）', icd10: 'M50.100', first_line_oral: [], second_line_iv: [] },
      patient: { name: '患者D', gender: '女', age: 50, weight: 60 },
      normal_rx: { rx_id: 'N-3', items: [ it('布洛芬缓释胶囊', { single_dose: '300mg', frequency: 'bid', duration_days: 7 }) ] },
    });
  },
  expect: '非西医模块；针灸主穴应由 acup-engine 校验（此处仅冒烟）',
  nonWestern: true,
});

// 5. 便秘（中医汉方模块）
cases.push({
  id: 'TCM-010',
  title: '便秘（麻子仁丸/大承气汤）[中医模块]',
  build() {
    return baseCtx({
      disease: { code: 'TCM-010', name: '便秘', icd10: 'K59.000', first_line_oral: ['乳果糖口服液'], second_line_iv: [] },
      patient: { name: '患者E', gender: '女', age: 55, weight: 60 },
      normal_rx: { rx_id: 'N-4', items: [ it('乳果糖口服液', { single_dose: '15ml', frequency: 'qn', duration_days: 7 }) ] },
    });
  },
  expect: '非西医模块；辨证应由 tcm-engine 校验（此处仅冒烟）',
  nonWestern: true,
});

// 6. 2型糖尿病：二甲双胍 + 他汀 + ACEI（合并高血压）
cases.push({
  id: 'DM-E11',
  title: '2型糖尿病（合并高血压）',
  build() {
    return baseCtx({
      disease: dx('DM-E11'),
      patient: { name: '患者F', gender: '男', age: 55, weight: 70, comorbidities: ['高血压'] },
      normal_rx: {
        rx_id: 'N-5',
        items: [
          it('盐酸二甲双胍缓释片', { single_dose: '500mg', frequency: 'bid', duration_days: 30 }),
          it('阿托伐他汀钙片', { single_dose: '20mg', frequency: 'qn', duration_days: 30 }),
          it('卡托普利片', { single_dose: '12.5mg', frequency: 'tid', duration_days: 30 }),
        ],
      },
    });
  },
  expect: '无 error（降糖+调脂+降压，合并症 comorbidities 含高血压）',
});

// 7. 社区获得性肺炎：阿莫西林克拉维酸口服
cases.push({
  id: 'CAP-J18',
  title: '社区获得性肺炎（普通型）',
  build() {
    return baseCtx({
      disease: dx('CAP-J18'),
      patient: { name: '患者G', gender: '男', age: 40, weight: 70 },
      normal_rx: {
        rx_id: 'N-6',
        items: [
          it('阿莫西林克拉维酸钾片', { single_dose: '625mg', frequency: 'bid', duration_days: 7 }),
        ],
      },
    });
  },
  expect: '无 error（口服 β-内酰胺酶抑制剂合剂）',
});

// 8. 高血压：氨氯地平 + ACEI
cases.push({
  id: 'HTN-I10',
  title: '原发性高血压',
  build() {
    return baseCtx({
      disease: dx('HTN-I10'),
      patient: { name: '患者H', gender: '男', age: 50, weight: 75 },
      normal_rx: {
        rx_id: 'N-7',
        items: [
          it('苯磺酸氨氯地平片', { single_dose: '5mg', frequency: 'qd', duration_days: 30 }),
          it('卡托普利片', { single_dose: '12.5mg', frequency: 'tid', duration_days: 30 }),
        ],
      },
    });
  },
  expect: '无 error（CCB+ACEI 联合）',
});

// 9. 带状疱疹：阿昔洛韦 + 加巴喷丁
cases.push({
  id: 'HZ-B02',
  title: '带状疱疹（急性期）',
  build() {
    return baseCtx({
      disease: dx('HZ-B02'),
      patient: { name: '患者I', gender: '女', age: 65, weight: 60 },
      normal_rx: {
        rx_id: 'N-8',
        items: [
          it('阿昔洛韦片', { single_dose: '200mg', frequency: '5次/日', duration_days: 7 }),
          it('加巴喷丁胶囊', { single_dose: '300mg', frequency: 'tid', duration_days: 14 }),
        ],
      },
    });
  },
  expect: '无 error（抗病毒+神经痛）',
});

// 10. 腰椎间盘突出：NSAIDs + 甲钴胺（保守治疗，不过度手术）
cases.push({
  id: 'LUMB-M51',
  title: '腰椎间盘突出症（保守治疗）',
  build() {
    return baseCtx({
      disease: dx('LUMB-M51'),
      patient: { name: '患者J', gender: '男', age: 40, weight: 75 },
      normal_rx: {
        rx_id: 'N-9',
        items: [
          it('布洛芬缓释胶囊', { single_dose: '300mg', frequency: 'bid', duration_days: 7 }),
          it('甲钴胺片', { single_dose: '500μg', frequency: 'tid', duration_days: 30 }),
        ],
      },
    });
  },
  expect: '无 error（保守治疗 NSAIDs+营养神经，未触发 SUR-02 过度手术）',
});

// ---------- 跑批 ----------
console.log('='.repeat(100));
console.log('P2-2 端到端 QA 跑批（10 个典型病例）');
console.log('='.repeat(100));

const rows = [];
let pass = 0, fail = 0;

cases.forEach((c, idx) => {
  const ctx = c.build();
  const hits = RxRuleEngine.run(ctx);
  const errors = hits.filter(h => h.severity === 'error');
  const warns = hits.filter(h => h.severity === 'warn');
  const passes = hits.filter(h => h.severity === 'pass');
  // 评分：基础 100，每个 error -15，每个 warn -3，pass 不扣分
  const score = Math.max(0, 100 - errors.length * 15 - warns.length * 3);
  const ok = errors.length === 0;
  if (ok) pass++; else fail++;
  rows.push({
    idx: idx + 1, id: c.id, title: c.title,
    total: hits.length, errors: errors.length, warns: warns.length, passes: passes.length,
    score, ok, expect: c.expect, nonWestern: !!c.nonWestern,
    errorMsgs: errors.map(e => `[${e.rule_id}] ${e.message}`),
    warnMsgs: warns.map(w => `[${w.rule_id}] ${w.message}`),
  });
});

// 表格输出
console.log('');
console.log(
  '#'.padEnd(3) +
  '病例ID'.padEnd(16) +
  '命中'.padEnd(6) +
  'error'.padEnd(7) +
  'warn'.padEnd(6) +
  'pass'.padEnd(6) +
  '评分'.padEnd(6) +
  '结果'
);
console.log('-'.repeat(90));
rows.forEach(r => {
  console.log(
    String(r.idx).padEnd(3) +
    r.id.padEnd(16) +
    String(r.total).padEnd(6) +
    String(r.errors).padEnd(7) +
    String(r.warns).padEnd(6) +
    String(r.passes).padEnd(6) +
    String(r.score).padEnd(6) +
    (r.ok ? '✅ PASS' : '❌ FAIL') + (r.nonWestern ? ' (非西医模块)' : '')
  );
});

// 详细错误/warn 输出
console.log('');
console.log('='.repeat(100));
console.log('详细输出（仅列出 error 与 warn）');
console.log('='.repeat(100));
rows.forEach(r => {
  if (!r.errorMsgs.length && !r.warnMsgs.length) return;
  console.log(`\n#${r.idx} ${r.id} ${r.title}`);
  r.errorMsgs.forEach(m => console.log('  ❌ ERROR ' + m));
  r.warnMsgs.forEach(m => console.log('  ⚠️  WARN  ' + m));
});

// 总结
console.log('');
console.log('='.repeat(100));
console.log(`跑批结果：${pass}/10 病例无 error；${fail} 个病例有 error 需分析`);
console.log(`验收标准：≥8 个无 error  →  ${pass >= 8 ? '✅ 达标' : '❌ 未达标'}`);
console.log('='.repeat(100));

process.exit(fail >= 3 ? 1 : 0);  // 容忍 ≤2 个 error（多为非西医模块或教学提示）

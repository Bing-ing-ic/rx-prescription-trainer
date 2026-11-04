/* =====================================================================
 * rule-engine-test.js  处方规则引擎 Node 测试脚本
 * 运行：node test/rule-engine-test.js
 * ===================================================================== */
'use strict';
const path = require('path');

// ---- 浏览器 window 垫片，让 IIFE 挂载到 global ----
global.window = global;

const PROJECT_ROOT = path.join(__dirname, '..');
const rulesMeta = require(path.join(PROJECT_ROOT, 'data/rules.json')).rules;
const diseasesDb = require(path.join(PROJECT_ROOT, 'data/diseases.json')).diseases;
const drugsDb = require(path.join(PROJECT_ROOT, 'data/drugs.json')).drugs;
const compatData = require(path.join(PROJECT_ROOT, 'data/compat.json'));

require(path.join(PROJECT_ROOT, 'js/rule-engine.js'));
const RxRuleEngine = global.window.RxRuleEngine;

// ---- 工具：按通用名取药（同名取第一条字段最全的） ----
function D(name) {
  const found = drugsDb.filter(d => d.generic_name === name);
  if (!found.length) throw new Error(`药品不存在: ${name}`);
  return found[0];
}
function diseaseByCode(code) {
  const d = diseasesDb.find(x => x.code === code);
  if (!d) throw new Error(`疾病不存在: ${code}`);
  return d;
}
// 构造一个最小 item
function it(drugName, overrides = {}) {
  const drug = typeof drugName === 'string' ? D(drugName) : drugName;
  return Object.assign({
    drug,
    single_dose: '',
    frequency: '',
    duration_days: null,
  }, overrides);
}
// 构造 mock 疾病，便于隔离规则
function mockDisease(overrides = {}) {
  return Object.assign({
    code: 'MOCK', name: '模拟疾病', icd10: 'Z00',
    iv_suitability: 'usually_no_iv', negative_list_hit: false,
    first_line_oral: [], second_line_iv: [], contraindications: [],
  }, overrides);
}
// 构造 mock 患者
function patient(overrides = {}) {
  return Object.assign({ name: '张三', gender: '男', age: 40, weight: 60 }, overrides);
}
// 构造完整 context
function ctx(overrides = {}) {
  return Object.assign({
    rulesMeta,
    disease: mockDisease(),
    patient: patient(),
    normal_rx: null,
    iv_rx: null,
    compatData,
    restricted_confirmed: false,
  }, overrides);
}

// ---- 断言辅助 ----
// 收集某规则的 warn/error 命中（pass 不算违规）
function badHits(hits, ruleId) {
  return hits.filter(h => h.rule_id === ruleId && (h.severity === 'warn' || h.severity === 'error'));
}
function allHitsOf(hits, ruleId) {
  return hits.filter(h => h.rule_id === ruleId);
}

// ---- 测试用例集合 ----
// 每条用例：{ rule_id, case: 'pos'|'neg', name, build(), expect: 'pass'|'warn'|'error'|'none' }
//   pass  → 该规则不应产生 warn/error
//   warn  → 该规则应至少产生一条 warn
//   error → 该规则应至少产生一条 error
//   none  → 该规则完全不应出现任何命中（含 pass）
const cases = [];
function T(rule_id, c, name, build, expect) {
  cases.push({ rule_id, case: c, name, build, expect });
}

// ============ FMT-01 每张处方≤5种 ============
T('FMT-01', 'pos', '5种药品不触发', () => {
  const items = [it('头孢呋辛酯片', {single_dose:'250mg', frequency:'bid', duration_days:7})];
  for (let i=0;i<4;i++) items.push(it('苯磺酸氨氯地平片', {single_dose:'5mg', frequency:'qd', duration_days:7}));
  return ctx({ normal_rx: { rx_id:'N-1', items }, patient: patient({age:40}) });
}, 'pass');
T('FMT-01', 'neg', '6种药品触发error', () => {
  const items = [it('头孢呋辛酯片', {single_dose:'250mg', frequency:'bid', duration_days:7})];
  for (let i=0;i<5;i++) items.push(it('苯磺酸氨氯地平片', {single_dose:'5mg', frequency:'qd', duration_days:7}));
  return ctx({ normal_rx: { rx_id:'N-1', items } });
}, 'error');

// ============ FMT-01-EXT 分级扣分 ============
T('FMT-01-EXT', 'pos', '5种不触发EXT', () => {
  const items = [it('头孢呋辛酯片', {single_dose:'250mg', frequency:'bid', duration_days:7})];
  for (let i=0;i<4;i++) items.push(it('苯磺酸氨氯地平片', {single_dose:'5mg', frequency:'qd', duration_days:7}));
  return ctx({ normal_rx: { rx_id:'N-1', items } });
}, 'none');
T('FMT-01-EXT', 'neg', '6种触发warn', () => {
  const items = [it('头孢呋辛酯片', {single_dose:'250mg', frequency:'bid', duration_days:7})];
  for (let i=0;i<5;i++) items.push(it('苯磺酸氨氯地平片', {single_dose:'5mg', frequency:'qd', duration_days:7}));
  return ctx({ normal_rx: { rx_id:'N-1', items } });
}, 'warn');
T('FMT-01-EXT', 'neg', '7种触发error', () => {
  const items = [it('头孢呋辛酯片', {single_dose:'250mg', frequency:'bid', duration_days:7})];
  for (let i=0;i<6;i++) items.push(it('苯磺酸氨氯地平片', {single_dose:'5mg', frequency:'qd', duration_days:7}));
  return ctx({ normal_rx: { rx_id:'N-1', items } });
}, 'error');

// ============ FMT-02 通用名 ============
T('FMT-02', 'pos', '有通用名不触发', () =>
  ctx({ normal_rx: { rx_id:'N-1', items:[it('头孢呋辛酯片',{single_dose:'250mg',frequency:'bid',duration_days:7})] } }), 'pass');
T('FMT-02', 'neg', '缺通用名触发error', () => {
  const badDrug = Object.assign({}, D('头孢呋辛酯片'), { generic_name: '' });
  return ctx({ normal_rx: { rx_id:'N-1', items:[it(badDrug,{single_dose:'250mg',frequency:'bid',duration_days:7})] } });
}, 'error');

// ============ FMT-03 模糊用法 ============
T('FMT-03', 'pos', '明确用法不触发', () =>
  ctx({ normal_rx: { rx_id:'N-1', items:[it('头孢呋辛酯片',{single_dose:'250mg',frequency:'bid',duration_days:7})] } }), 'pass');
T('FMT-03', 'neg', '“遵医嘱”触发error', () =>
  ctx({ normal_rx: { rx_id:'N-1', items:[it('头孢呋辛酯片',{single_dose:'250mg',frequency:'遵医嘱',duration_days:7})] } }), 'error');

// ============ FMT-04 法定单位 ============
T('FMT-04', 'pos', 'mg单位不触发', () =>
  ctx({ normal_rx: { rx_id:'N-1', items:[it('头孢呋辛酯片',{single_dose:'250mg',frequency:'bid',duration_days:7})] } }), 'pass');
T('FMT-04', 'neg', '“1片”无单位触发warn', () =>
  ctx({ normal_rx: { rx_id:'N-1', items:[it('头孢呋辛酯片',{single_dose:'1片',frequency:'bid',duration_days:7})] } }), 'warn');

// ============ FMT-05 前记完整 ============
T('FMT-05', 'pos', '前记完整不触发', () =>
  ctx({ patient: patient({name:'张三',gender:'男',age:40}) }), 'pass');
T('FMT-05', 'neg', '缺姓名触发error', () =>
  ctx({ patient: patient({name:'', gender:'男', age:40}) }), 'error');

// ============ FMT-06 输液编号 ============
T('FMT-06', 'pos', 'IV-前缀不触发', () =>
  ctx({ iv_rx: { rx_id:'IV-20261104-000001', items:[it(D('0.9%氯化钠注射液'),{})] } }), 'pass');
T('FMT-06', 'neg', '无IV-前缀触发warn', () =>
  ctx({ iv_rx: { rx_id:'N-20261104-000001', items:[it(D('0.9%氯化钠注射液'),{})] } }), 'warn');

// ============ IND-01 适应症匹配 ============
T('IND-01', 'pos', '推荐药匹配通过', () =>
  ctx({ disease: diseaseByCode('CAP-J18'),
        normal_rx: { rx_id:'N-1', items:[it('头孢呋辛酯片',{single_dose:'250mg',frequency:'bid',duration_days:7})] } }), 'pass');
T('IND-01', 'neg', '非推荐药触发error', () =>
  ctx({ disease: diseaseByCode('CAP-J18'),
        normal_rx: { rx_id:'N-1', items:[it('奥美拉唑肠溶胶囊',{single_dose:'20mg',frequency:'qd',duration_days:7})] } }), 'error');

// ============ IND-02 超说明书提示 ============
T('IND-02', 'pos', '推荐药不触发IND-02', () =>
  ctx({ disease: diseaseByCode('CAP-J18'),
        normal_rx: { rx_id:'N-1', items:[it('头孢呋辛酯片',{single_dose:'250mg',frequency:'bid',duration_days:7})] } }), 'pass');
T('IND-02', 'neg', '非推荐药触发warn', () =>
  ctx({ disease: diseaseByCode('CAP-J18'),
        normal_rx: { rx_id:'N-1', items:[it('奥美拉唑肠溶胶囊',{single_dose:'20mg',frequency:'qd',duration_days:7})] } }), 'warn');

// ============ IND-03 乙类医保提示 ============
T('IND-03', 'pos', '甲类推荐药不触发', () =>
  ctx({ disease: diseaseByCode('HTN-I10'),
        normal_rx: { rx_id:'N-1', items:[it('苯磺酸氨氯地平片',{single_dose:'5mg',frequency:'qd',duration_days:30})] } }), 'pass');
T('IND-03', 'neg', '乙类推荐药触发warn', () => {
  // 构造一个乙类药，通用名放在 mock disease 的 first_line_oral 里
  const yiDrug = Object.assign({}, D('苯磺酸氨氯地平片'), { medical_insurance_class: '乙' });
  return ctx({ disease: mockDisease({ first_line_oral: ['模拟乙类药'] }),
    normal_rx: { rx_id:'N-1', items:[it(Object.assign({}, yiDrug, {generic_name:'模拟乙类药'}), {single_dose:'5mg',frequency:'qd',duration_days:7})] } });
}, 'warn');

// ============ DOSE-01 单次剂量 ============
T('DOSE-01', 'pos', '正常剂量不触发', () =>
  ctx({ normal_rx: { rx_id:'N-1', items:[it('头孢呋辛酯片',{single_dose:'250mg',frequency:'bid',duration_days:7})] } }), 'pass');
T('DOSE-01', 'neg', '超1.5倍上限触发error', () =>
  ctx({ normal_rx: { rx_id:'N-1', items:[it('头孢呋辛酯片',{single_dose:'1000mg',frequency:'bid',duration_days:7})] } }), 'error');
T('DOSE-01', 'neg', '略超上限触发warn', () =>
  ctx({ normal_rx: { rx_id:'N-1', items:[it('头孢呋辛酯片',{single_dose:'600mg',frequency:'bid',duration_days:7})] } }), 'warn');
// 克级剂量（注射用头孢呋辛钠 0.75-1.5g）归一化验证
T('DOSE-01', 'neg', '克级剂量超1.5倍触发error（g→mg归一化）', () =>
  ctx({ disease: diseaseByCode('CAP-J18'),
        iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'needs_iv',
          items:[it(D('0.9%氯化钠注射液'),{}), it('注射用头孢呋辛钠',{single_dose:'3g',frequency:'bid',duration_days:1, skin_test_result:'阴性'})] } }), 'error');

// ============ DOSE-02 肝肾调整 ============
T('DOSE-02', 'pos', '肾功能正常不触发', () =>
  ctx({ patient: patient({renal_insufficiency:false}),
        normal_rx: { rx_id:'N-1', items:[it('头孢呋辛酯片',{single_dose:'250mg',frequency:'bid',duration_days:7})] } }), 'pass');
T('DOSE-02', 'neg', '肾功能不全且药品需减量触发warn', () =>
  ctx({ patient: patient({renal_insufficiency:true}),
        normal_rx: { rx_id:'N-1', items:[it('头孢呋辛酯片',{single_dose:'250mg',frequency:'bid',duration_days:7})] } }), 'warn');

// ============ DUR-01 疗程 ============
T('DUR-01', 'pos', '7日疗程不触发', () =>
  ctx({ normal_rx: { rx_id:'N-1', items:[it('头孢呋辛酯片',{single_dose:'250mg',frequency:'bid',duration_days:7})] } }), 'pass');
T('DUR-01', 'neg', '10日疗程触发warn', () =>
  ctx({ normal_rx: { rx_id:'N-1', items:[it('头孢呋辛酯片',{single_dose:'250mg',frequency:'bid',duration_days:10})] } }), 'warn');

// ============ DUP-01 处方内同类重复 ============
T('DUP-01', 'pos', '不同分类不触发', () =>
  ctx({ normal_rx: { rx_id:'N-1', items:[
    it('头孢呋辛酯片',{single_dose:'250mg',frequency:'bid',duration_days:7}),
    it('苯磺酸氨氯地平片',{single_dose:'5mg',frequency:'qd',duration_days:7}),
  ] } }), 'pass');
T('DUP-01', 'neg', '两个同类触发warn', () =>
  ctx({ normal_rx: { rx_id:'N-1', items:[
    it('头孢呋辛酯片',{single_dose:'250mg',frequency:'bid',duration_days:7}),
    it('头孢呋辛酯片',{single_dose:'250mg',frequency:'bid',duration_days:7}),
  ] } }), 'warn');

// ============ DUP-02 跨通道同类 ============
T('DUP-02', 'pos', '序贯治疗不触发', () =>
  ctx({ disease: diseaseByCode('CAP-J18'),
        normal_rx: { rx_id:'N-1', items:[it('头孢呋辛酯片',{single_dose:'250mg',frequency:'bid',duration_days:7})] },
        iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'sequential_therapy',
          items:[it(D('0.9%氯化钠注射液'),{}), it('注射用头孢呋辛钠',{single_dose:'1.5g',frequency:'bid',duration_days:1, skin_test_result:'阴性'})] } }), 'pass');
T('DUP-02', 'neg', '口服+静滴同类无理由触发warn', () =>
  ctx({ disease: diseaseByCode('CAP-J18'),
        normal_rx: { rx_id:'N-1', items:[it('头孢呋辛酯片',{single_dose:'250mg',frequency:'bid',duration_days:7})] },
        iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'fever',
          items:[it(D('0.9%氯化钠注射液'),{}), it('注射用头孢呋辛钠',{single_dose:'1.5g',frequency:'bid',duration_days:1, skin_test_result:'阴性'})] } }), 'warn');

// ============ INT-01 喹诺酮+抗酸剂 ============
T('INT-01', 'pos', '单用喹诺酮不触发', () =>
  ctx({ normal_rx: { rx_id:'N-1', items:[it('左氧氟沙星片',{single_dose:'200mg',frequency:'qd',duration_days:7})] } }), 'pass');
T('INT-01', 'neg', '喹诺酮+铝碳酸镁触发error', () =>
  ctx({ normal_rx: { rx_id:'N-1', items:[
    it('左氧氟沙星片',{single_dose:'200mg',frequency:'qd',duration_days:7}),
    it('铝碳酸镁片',{single_dose:'500mg',frequency:'tid',duration_days:7}),
  ] } }), 'error');

// ============ INT-02 ACEI/ARB+保钾利尿剂 ============
T('INT-02', 'pos', '单用ACEI不触发', () =>
  ctx({ normal_rx: { rx_id:'N-1', items:[it('卡托普利片',{single_dose:'12.5mg',frequency:'tid',duration_days:7})] } }), 'pass');
T('INT-02', 'neg', 'ACEI+螺内酯触发warn', () =>
  ctx({ normal_rx: { rx_id:'N-1', items:[
    it('卡托普利片',{single_dose:'12.5mg',frequency:'tid',duration_days:7}),
    it('螺内酯片',{single_dose:'20mg',frequency:'bid',duration_days:7}),
  ] } }), 'warn');

// ============ POP-01 儿童喹诺酮 ============
T('POP-01', 'pos', '成人喹诺酮不触发', () =>
  ctx({ patient: patient({age:40}),
        normal_rx: { rx_id:'N-1', items:[it('左氧氟沙星片',{single_dose:'200mg',frequency:'qd',duration_days:7})] } }), 'pass');
T('POP-01', 'neg', '8岁儿童喹诺酮触发error', () =>
  ctx({ patient: patient({age:8, weight:25}),
        normal_rx: { rx_id:'N-1', items:[it('左氧氟沙星片',{single_dose:'200mg',frequency:'qd',duration_days:7})] } }), 'error');

// ============ POP-02 老年输液速度 ============
T('POP-02', 'pos', '老年慢滴不触发', () =>
  ctx({ patient: patient({age:78, weight:55}),
        iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'needs_iv', total_volume_ml:250,
          items:[it(D('0.9%氯化钠注射液'),{}), it('注射用头孢呋辛钠',{single_dose:'1.5g',frequency:'bid',duration_days:1, skin_test_result:'阴性'})] } }), 'pass');
T('POP-02', 'neg', '老年滴速80触发warn', () =>
  ctx({ patient: patient({age:78, weight:55}),
        iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:80, iv_reason:'needs_iv', total_volume_ml:250,
          items:[it(D('0.9%氯化钠注射液'),{}), it('注射用头孢呋辛钠',{single_dose:'1.5g',frequency:'bid',duration_days:1, skin_test_result:'阴性'})] } }), 'warn');

// ============ ABX-01 特殊使用级门诊 ============
T('ABX-01', 'pos', '非特殊级不触发', () =>
  ctx({ disease: diseaseByCode('CAP-J18'),
        iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'needs_iv',
          items:[it(D('0.9%氯化钠注射液'),{}), it('注射用头孢呋辛钠',{single_dose:'1.5g',frequency:'bid',duration_days:1, skin_test_result:'阴性'})] } }), 'pass');
T('ABX-01', 'neg', '美罗培南(特殊级)触发error', () =>
  ctx({ disease: diseaseByCode('CAP-J18'),
        iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'needs_iv',
          items:[it(D('0.9%氯化钠注射液'),{}), it('注射用美罗培南',{single_dose:'0.5g',frequency:'q8h',duration_days:1})] } }), 'error');

// ============ ABX-02 限制使用级确认 ============
T('ABX-02', 'pos', '已确认不触发', () =>
  ctx({ disease: diseaseByCode('CAP-J18'), restricted_confirmed: true,
        iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'needs_iv',
          items:[it(D('0.9%氯化钠注射液'),{}), it('注射用头孢呋辛钠',{single_dose:'1.5g',frequency:'bid',duration_days:1, skin_test_result:'阴性'})] } }), 'pass');
T('ABX-02', 'neg', '未确认触发warn', () =>
  ctx({ disease: diseaseByCode('CAP-J18'), restricted_confirmed: false,
        iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'needs_iv',
          items:[it(D('0.9%氯化钠注射液'),{}), it('注射用头孢呋辛钠',{single_dose:'1.5g',frequency:'bid',duration_days:1, skin_test_result:'阴性'})] } }), 'warn');

// ============ TCM-01 占位 ============
T('TCM-01', 'pos', '恒pass无违规', () => ctx({}), 'pass');

// ============ IV-01 输液指征 ============
T('IV-01', 'pos', 'needs_iv疾病不触发', () =>
  ctx({ disease: mockDisease({iv_suitability:'needs_iv', name:'重症感染'}),
        iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'needs_iv',
          items:[it(D('0.9%氯化钠注射液'),{}), it('注射用头孢呋辛钠',{single_dose:'1.5g',frequency:'bid',duration_days:1, skin_test_result:'阴性'})] } }), 'pass');
T('IV-01', 'neg', '通常无需输液+弱指征触发error', () =>
  ctx({ disease: mockDisease({iv_suitability:'usually_no_iv', name:'普通感冒'}),
        iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'fever',
          items:[it(D('0.9%氯化钠注射液'),{}), it('注射用头孢呋辛钠',{single_dose:'1.5g',frequency:'bid',duration_days:1, skin_test_result:'阴性'})] } }), 'error');

// ============ IV-02 口服替代 ============
T('IV-02', 'pos', '有客观指征不触发', () =>
  ctx({ disease: mockDisease({iv_suitability:'usually_no_iv', first_line_oral:['头孢呋辛酯片']}),
        iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'severe_dehydration',
          items:[it(D('0.9%氯化钠注射液'),{}), it('注射用头孢呋辛钠',{single_dose:'1.5g',frequency:'bid',duration_days:1, skin_test_result:'阴性'})] } }), 'pass');
T('IV-02', 'neg', '有口服方案却弱理由输液触发warn', () =>
  ctx({ disease: mockDisease({iv_suitability:'usually_no_iv', first_line_oral:['头孢呋辛酯片']}),
        iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'fever',
          items:[it(D('0.9%氯化钠注射液'),{}), it('注射用头孢呋辛钠',{single_dose:'1.5g',frequency:'bid',duration_days:1, skin_test_result:'阴性'})] } }), 'warn');

// ============ IV-03 专项字段 ============
T('IV-03', 'pos', '字段完整不触发', () =>
  ctx({ iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'needs_iv',
          items:[it(D('0.9%氯化钠注射液'),{})] } }), 'pass');
T('IV-03', 'neg', '缺iv_reason触发error', () =>
  ctx({ iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:null,
          items:[it(D('0.9%氯化钠注射液'),{})] } }), 'error');

// ============ IV-04 滴速个体化 ============
T('IV-04', 'pos', '成人合规滴速不触发', () =>
  ctx({ patient: patient({age:40}),
        iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'needs_iv', total_volume_ml:250,
          items:[it(D('0.9%氯化钠注射液'),{}), it('盐酸左氧氟沙星注射液',{single_dose:'200mg',frequency:'qd',duration_days:1})] } }), 'pass');
T('IV-04', 'neg', '特殊人群超滴速上限触发error', () =>
  ctx({ patient: patient({age:78, weight:55}),
        iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:80, iv_reason:'needs_iv', total_volume_ml:250,
          items:[it(D('0.9%氯化钠注射液'),{}), it('盐酸左氧氟沙星注射液',{single_dose:'200mg',frequency:'qd',duration_days:1})] } }), 'error');

// ============ IV-05 门诊负面清单 ============
T('IV-05', 'pos', '非负面清单不触发', () =>
  ctx({ disease: mockDisease({negative_list_hit:false}),
        iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'needs_iv',
          items:[it(D('0.9%氯化钠注射液'),{}), it('注射用头孢呋辛钠',{single_dose:'1.5g',frequency:'bid',duration_days:1, skin_test_result:'阴性'})] } }), 'pass');
T('IV-05', 'neg', '负面清单+静脉药触发error', () =>
  ctx({ disease: mockDisease({negative_list_hit:true, name:'普通感冒'}),
        iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'fever',
          items:[it(D('0.9%氯化钠注射液'),{}), it('注射用头孢呋辛钠',{single_dose:'1.5g',frequency:'bid',duration_days:1, skin_test_result:'阴性'})] } }), 'error');

// ============ IV-06 溶媒配伍 ============
T('IV-06', 'pos', '说明书指定溶媒不触发', () =>
  ctx({ disease: diseaseByCode('CAP-J18'),
        iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'needs_iv',
          items:[it(D('0.9%氯化钠注射液'),{}), it('注射用头孢呋辛钠',{single_dose:'1.5g',frequency:'bid',duration_days:1, skin_test_result:'阴性'})] } }), 'pass');
T('IV-06', 'neg', '5%GS配伍头孢呋辛触发error', () =>
  ctx({ disease: diseaseByCode('CAP-J18'),
        iv_rx: { rx_id:'IV-1', solvent_name:'5%葡萄糖注射液 250ml', drip_speed_mlh:40, iv_reason:'needs_iv',
          items:[it(D('5%葡萄糖注射液'),{}), it('注射用头孢呋辛钠',{single_dose:'1.5g',frequency:'bid',duration_days:1, skin_test_result:'阴性'})] } }), 'error');

// ============ IV-07 中药注射剂单独输注 ============
T('IV-07', 'pos', '中药注射剂单独输注通过', () =>
  ctx({ iv_rx: { rx_id:'IV-1', solvent_name:'5%葡萄糖注射液 250ml', drip_speed_mlh:30, iv_reason:'needs_iv',
          items:[it(D('5%葡萄糖注射液'),{}), it('清开灵注射液',{single_dose:'20ml',frequency:'qd',duration_days:1})] } }), 'pass');
T('IV-07', 'neg', '中药注射剂+其他药同瓶触发error', () =>
  ctx({ iv_rx: { rx_id:'IV-1', solvent_name:'5%葡萄糖注射液 250ml', drip_speed_mlh:30, iv_reason:'needs_iv',
          items:[it(D('5%葡萄糖注射液'),{}), it('清开灵注射液',{single_dose:'20ml',frequency:'qd',duration_days:1}),
                 it('维生素C注射液',{single_dose:'2g',frequency:'qd',duration_days:1})] } }), 'error');

// ============ IV-08 皮试 ============
T('IV-08', 'pos', '皮试阴性通过', () =>
  ctx({ disease: diseaseByCode('CAP-J18'),
        iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'needs_iv',
          items:[it(D('0.9%氯化钠注射液'),{}), it('注射用头孢呋辛钠',{single_dose:'1.5g',frequency:'bid',duration_days:1, skin_test_result:'阴性'})] } }), 'pass');
T('IV-08', 'neg', '需皮试未填结果触发error', () =>
  ctx({ disease: diseaseByCode('CAP-J18'),
        iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'needs_iv',
          items:[it(D('0.9%氯化钠注射液'),{}), it('注射用头孢呋辛钠',{single_dose:'1.5g',frequency:'bid',duration_days:1, skin_test_result: undefined})] } }), 'error');

// ============ IV-09 门诊输液量 ============
T('IV-09', 'pos', '1日量不触发', () =>
  ctx({ iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'needs_iv',
          items:[it(D('0.9%氯化钠注射液'),{}), it('注射用头孢呋辛钠',{single_dose:'1.5g',frequency:'bid',duration_days:1, skin_test_result:'阴性'})] } }), 'pass');
T('IV-09', 'neg', '3日输液触发warn', () =>
  ctx({ iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'needs_iv',
          items:[it(D('0.9%氯化钠注射液'),{}), it('注射用头孢呋辛钠',{single_dose:'1.5g',frequency:'bid',duration_days:3, skin_test_result:'阴性'})] } }), 'warn');

// ============ YN-01 性别与诊断 ============
T('YN-01', 'pos', '男患者普通诊断不触发', () =>
  ctx({ patient: patient({gender:'男'}), disease: mockDisease({name:'急性上呼吸道感染'}) }), 'pass');
T('YN-01', 'neg', '男患者盆腔炎触发error', () =>
  ctx({ patient: patient({gender:'男'}), disease: mockDisease({name:'盆腔炎性疾病'}) }), 'error');

// ============ YN-02 医保限适应症 ============
T('YN-02', 'pos', '降压药+高血压诊断不触发', () =>
  ctx({ patient: patient({gender:'男'}), disease: diseaseByCode('HTN-I10'),
        normal_rx: { rx_id:'N-1', items:[it('苯磺酸氨氯地平片',{single_dose:'5mg',frequency:'qd',duration_days:30})] } }), 'pass');
T('YN-02', 'neg', '降压药+感冒诊断触发error', () =>
  ctx({ patient: patient({gender:'男'}), disease: mockDisease({name:'急性上呼吸道感染'}),
        normal_rx: { rx_id:'N-1', items:[it('苯磺酸氨氯地平片',{single_dose:'5mg',frequency:'qd',duration_days:7})] } }), 'error');

// ============ SPEC-01 特殊人群剂量 ============
T('SPEC-01', 'pos', '成人常规剂量不触发', () =>
  ctx({ patient: patient({age:40}),
        normal_rx: { rx_id:'N-1', items:[it('苯磺酸氨氯地平片',{single_dose:'5mg',frequency:'qd',duration_days:7})] } }), 'pass');
T('SPEC-01', 'neg', '老人足量氨氯地平触发warn', () =>
  ctx({ patient: patient({age:78, weight:55}),
        normal_rx: { rx_id:'N-1', items:[it('苯磺酸氨氯地平片',{single_dose:'10mg',frequency:'qd',duration_days:7})] } }), 'warn');
T('SPEC-01', 'neg', '儿童未填体重触发warn', () =>
  ctx({ patient: patient({age:8, weight:0}),
        normal_rx: { rx_id:'N-1', items:[it('头孢呋辛酯片',{single_dose:'250mg',frequency:'bid',duration_days:7})] } }), 'warn');

// ============ SPEC-02 禁忌症识别 ============
T('SPEC-02', 'pos', '非孕妇用ACEI不触发', () =>
  ctx({ patient: patient({gender:'女', age:28, pregnancy:false}),
        normal_rx: { rx_id:'N-1', items:[it('卡托普利片',{single_dose:'12.5mg',frequency:'tid',duration_days:7})] } }), 'pass');
T('SPEC-02', 'neg', '孕妇用卡托普利触发error', () =>
  ctx({ patient: patient({gender:'女', age:28, pregnancy:true}),
        normal_rx: { rx_id:'N-1', items:[it('卡托普利片',{single_dose:'12.5mg',frequency:'tid',duration_days:7})] } }), 'error');
T('SPEC-02', 'neg', '青光眼用硝酸甘油触发error', () =>
  ctx({ patient: patient({gender:'男', age:60, note:'青光眼病史'}),
        normal_rx: { rx_id:'N-1', items:[it('硝酸甘油片',{single_dose:'0.5mg',frequency:'prn',duration_days:7})] } }), 'error');

// ============ INTER-01 深度相互作用 ============
T('INTER-01', 'pos', '单用华法林不触发', () => {
  const warfarin = { generic_name:'华法林钠片', dosage_form:'oral', pharmacology_class:'抗凝药', abx_level:'none', medical_insurance_class:'乙', special_warnings_json:[], dose_range_json:{single_min_mg:2.5, single_max_mg:5} };
  return ctx({ normal_rx: { rx_id:'N-1', items:[it(warfarin,{single_dose:'3mg',frequency:'qd',duration_days:7})] } });
}, 'pass');
T('INTER-01', 'neg', '华法林+阿司匹林触发error', () => {
  const warfarin = { generic_name:'华法林钠片', dosage_form:'oral', pharmacology_class:'抗凝药', abx_level:'none', medical_insurance_class:'乙', special_warnings_json:[], dose_range_json:{single_min_mg:2.5, single_max_mg:5} };
  return ctx({ normal_rx: { rx_id:'N-1', items:[
    it(warfarin,{single_dose:'3mg',frequency:'qd',duration_days:7}),
    it('阿司匹林肠溶片',{single_dose:'100mg',frequency:'qd',duration_days:7}),
  ] } });
}, 'error');
T('INTER-01', 'neg', '辛伐他汀+克拉霉素触发error', () =>
  ctx({ normal_rx: { rx_id:'N-1', items:[
    it('辛伐他汀片',{single_dose:'40mg',frequency:'qn',duration_days:30}),
    it('克拉霉素片',{single_dose:'500mg',frequency:'bid',duration_days:7}),
  ] } }), 'error');
T('INTER-01', 'neg', 'ACEI+保钾利尿剂触发error', () =>
  ctx({ normal_rx: { rx_id:'N-1', items:[
    it('卡托普利片',{single_dose:'12.5mg',frequency:'tid',duration_days:7}),
    it('螺内酯片',{single_dose:'20mg',frequency:'bid',duration_days:7}),
  ] } }), 'error');

// ============ 边界情况 ============
// 空处方
T('EDGE-EMPTY', 'pos', '空处方不崩溃', () =>
  ctx({ normal_rx: { rx_id:'N-1', items:[] }, iv_rx: null }), 'pass');
// 只有溶媒的输液
T('EDGE-SOLVENT-ONLY', 'pos', '只有溶媒不崩溃', () =>
  ctx({ iv_rx: { rx_id:'IV-1', solvent_name:'0.9%氯化钠注射液 100ml', drip_speed_mlh:40, iv_reason:'needs_iv',
        items:[it(D('0.9%氯化钠注射液'),{})] } }), 'pass');

// =====================================================================
// 运行
// =====================================================================
const results = [];
let passCount = 0, failCount = 0, crashCount = 0;

for (const c of cases) {
  let hits, err = null;
  try {
    hits = RxRuleEngine.run(c.build());
  } catch (e) {
    err = e;
  }
  const bad = err ? [] : badHits(hits, c.rule_id);
  const all = err ? [] : allHitsOf(hits, c.rule_id);
  let actual, ok = false;
  if (err) {
    actual = 'CRASH: ' + err.message;
    crashCount++;
  } else if (c.expect === 'pass') {
    ok = bad.length === 0;
    actual = bad.length ? `出现 ${bad.length} 条违规(${bad.map(h=>h.severity).join('/')})` : '无违规';
  } else if (c.expect === 'warn') {
    ok = bad.some(h => h.severity === 'warn');
    actual = bad.length ? `命中[${bad.map(h=>h.severity).join('/')}]` : '未命中';
  } else if (c.expect === 'error') {
    ok = bad.some(h => h.severity === 'error');
    actual = bad.length ? `命中[${bad.map(h=>h.severity).join('/')}]` : '未命中';
  } else if (c.expect === 'none') {
    ok = all.length === 0;
    actual = all.length ? `出现 ${all.length} 条` : '未出现';
  }
  if (ok) passCount++; else failCount++;
  results.push({ rule_id: c.rule_id, case: c.case, name: c.name, expect: c.expect, actual, ok, err });
}

// ---- 输出 ----
console.log('='.repeat(90));
console.log(`规则引擎测试  用例总数: ${cases.length}  通过: ${passCount}  失败: ${failCount}  崩溃: ${crashCount}`);
console.log('='.repeat(90));
let curRule = '';
for (const r of results) {
  if (r.rule_id !== curRule) { curRule = r.rule_id; console.log(''); }
  const mark = r.ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${r.rule_id.padEnd(14)} ${r.case==='pos'?'正例':'负例'} ${r.name}`);
  if (!r.ok) {
    console.log(`       预期: ${r.expect}  |  实际: ${r.actual}`);
    if (r.err) console.log(`       异常: ${r.err.stack.split('\n').slice(0,3).join('\n')}`);
  }
}
console.log('='.repeat(90));
console.log(`汇总: 通过 ${passCount}/${cases.length}`);

// 导出结果供报告生成
module.exports = { results, total: cases.length, passCount, failCount, crashCount };
if (require.main === module) {
  process.exit(failCount > 0 ? 1 : 0);
}

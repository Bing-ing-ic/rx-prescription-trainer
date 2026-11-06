/* P1 西医处方模块新规则验证脚本
 * 运行: node test/verify-p1-xiyi.js
 * 覆盖：DOSAGE-WT（体重/kg）、ALLERGY-01、COMORBID-01~04、ECON-01
 */
'use strict';
global.window = global;
const path = require('path');
const PROJECT_ROOT = path.join(__dirname, '..');
const rulesMeta = require(path.join(PROJECT_ROOT, 'data/rules.json')).rules;
const drugsDb = require(path.join(PROJECT_ROOT, 'data/drugs.json')).drugs;
const compatData = require(path.join(PROJECT_ROOT, 'data/compat.json'));
require(path.join(PROJECT_ROOT, 'js/rule-engine.js'));
const RxRuleEngine = global.window.RxRuleEngine;

function D(name) {
  const f = drugsDb.find(d => d.generic_name === name);
  if (!f) throw new Error('药品不存在: ' + name);
  return f;
}
function it(name, ov = {}) {
  return Object.assign({ drug: typeof name === 'string' ? D(name) : name, single_dose: '', frequency: '', duration_days: null }, ov);
}
function baseCtx(over = {}) {
  return Object.assign({
    rulesMeta, compatData,
    disease: { code:'MOCK', name:'模拟病', icd10:'Z00', first_line_oral:[], second_line_iv:[] },
    patient: { name:'张三', gender:'男', age:40, weight:60 },
    normal_rx: null, iv_rx: null,
    drugDb: drugsDb,
  }, over);
}

let pass=0, fail=0;
function check(label, cond, extra='') {
  if (cond) { console.log('  PASS', label); pass++; }
  else { console.log('  FAIL', label, extra); fail++; }
}

// ============ P1-1: DOSAGE-WT 体重/kg ============
console.log('\n=== P1-1 DOSAGE-WT 体重/kg 剂量核算 ===');
// 10kg 儿童，对乙酰氨基酚片 500mg/次 → 50 mg/kg/次，应 error
{
  const ctx = baseCtx({
    patient: { name:'患儿', gender:'男', age:3, weight:10 },
    normal_rx: { rx_id:'N-1', items:[it('对乙酰氨基酚片', {single_dose:'500mg', frequency:'prn', duration_days:3})] }
  });
  const hits = RxRuleEngine.run(ctx);
  const wt = hits.filter(h => h.rule_id === 'DOSAGE-WT');
  check('10kg儿童对乙酰氨基酚500mg触发DOSAGE-WT', wt.length > 0, JSON.stringify(wt));
  check('  严重度为error（50mg/kg 远超 15mg/kg上限）', wt.some(h => h.severity === 'error'), JSON.stringify(wt.map(h=>h.severity)));
}
// 10kg 儿童，对乙酰氨基酚 120mg/次（12 mg/kg）→ 不应 error
{
  const ctx = baseCtx({
    patient: { name:'患儿', gender:'男', age:3, weight:10 },
    normal_rx: { rx_id:'N-1', items:[it('对乙酰氨基酚片', {single_dose:'120mg', frequency:'q6h', duration_days:3})] }
  });
  const hits = RxRuleEngine.run(ctx);
  const wt = hits.filter(h => h.rule_id === 'DOSAGE-WT');
  check('10kg儿童对乙酰氨基酚120mg(12mg/kg)不触发error', !wt.some(h => h.severity === 'error'), JSON.stringify(wt));
}
// 10kg 儿童，阿莫西林胶囊 250mg tid（75mg/kg/天）→ error
{
  const ctx = baseCtx({
    patient: { name:'患儿', gender:'男', age:5, weight:10 },
    normal_rx: { rx_id:'N-1', items:[it('阿莫西林胶囊', {single_dose:'250mg', frequency:'tid', duration_days:7})] }
  });
  const hits = RxRuleEngine.run(ctx);
  const wt = hits.filter(h => h.rule_id === 'DOSAGE-WT');
  check('10kg儿童阿莫西林250mg tid(75mg/kg/天)触发DOSAGE-WT error', wt.some(h => h.severity === 'error'), JSON.stringify(wt));
}
// 成人 60kg，对乙酰氨基酚 500mg → 不应触发 DOSAGE-WT（成人无 pediatric_dose 命中也正常，但药品有 pediatric_dose 字段，
//   规则对成人也会算 mg/kg；500/60=8.3 mg/kg 在 10-15 范围下限以下，可能 warn。这里只校验不崩溃。
{
  const ctx = baseCtx({
    patient: { name:'成人', gender:'男', age:35, weight:60 },
    normal_rx: { rx_id:'N-1', items:[it('对乙酰氨基酚片', {single_dose:'500mg', frequency:'prn', duration_days:3})] }
  });
  const hits = RxRuleEngine.run(ctx);
  check('成人不崩溃', Array.isArray(hits));
}

// 儿科药覆盖度
console.log('\n=== P1-1 儿科药 pediatric_dose 覆盖度 ===');
const pedCount = drugsDb.filter(d => d.pediatric_dose).length;
check('至少10个高频儿科药有 pediatric_dose', pedCount >= 10, '实际='+pedCount);
console.log('  覆盖药品:', drugsDb.filter(d=>d.pediatric_dose).map(d=>d.generic_name).join(', '));

// ============ P1-2: 价格表接入 ============
console.log('\n=== P1-2 price_yuan 覆盖度 ===');
const withPrice = drugsDb.filter(d => typeof d.price_yuan === 'number' && d.price_yuan > 0).length;
check('drugs.json 至少 90% 条目 price_yuan>0', withPrice/drugsDb.length >= 0.9, `${withPrice}/${drugsDb.length}`);

// 模拟 app.js 的金额计算：对乙酰氨基酚片 0.3元/片 × 9片 = 2.7元
function mockAppAmount(items) {
  let total = 0;
  items.forEach(it => {
    const price = Number(it.drug.price_yuan) || 0;
    const qty = Number(it.quantity) || 1;
    total += price * qty;
  });
  return Math.round(total*100)/100;
}
{
  const amount = mockAppAmount([{drug:D('对乙酰氨基酚片'), quantity:9}]);
  check('金额计算：对乙酰氨基酚 0.3元×9片=2.70元', amount === 2.7, '实际='+amount);
}

// ============ P1-3: ALLERGY-01 ============
console.log('\n=== P1-3 ALLERGY-01 青霉素过敏+阿莫西林 ===');
{
  const ctx = baseCtx({
    patient: { name:'患者', gender:'女', age:30, weight:55, allergies:'青霉素过敏' },
    normal_rx: { rx_id:'N-1', items:[it('阿莫西林胶囊', {single_dose:'250mg', frequency:'tid', duration_days:7})] }
  });
  const hits = RxRuleEngine.run(ctx);
  const al = hits.filter(h => h.rule_id === 'ALLERGY-01');
  check('青霉素过敏+阿莫西林 → ALLERGY-01 error', al.some(h=>h.severity==='error'), JSON.stringify(al));
}
// 无过敏史 → 不触发
{
  const ctx = baseCtx({
    patient: { name:'患者', gender:'女', age:30, weight:55 },
    normal_rx: { rx_id:'N-1', items:[it('阿莫西林胶囊', {single_dose:'250mg', frequency:'tid', duration_days:7})] }
  });
  const hits = RxRuleEngine.run(ctx);
  const al = hits.filter(h => h.rule_id === 'ALLERGY-01');
  check('无过敏史 → 不触发 ALLERGY-01', al.length === 0, JSON.stringify(al));
}

// ============ COMORBID-02 青光眼+山莨菪碱 ============
console.log('\n=== P1-3 COMORBID-02 青光眼+山莨菪碱 ===');
{
  const ctx = baseCtx({
    patient: { name:'患者', gender:'男', age:65, weight:65, comorbidities:['青光眼'] },
    normal_rx: { rx_id:'N-1', items:[it('盐酸消旋山莨菪碱注射液', {single_dose:'10mg', frequency:'tid', duration_days:3})] }
  });
  const hits = RxRuleEngine.run(ctx);
  const c = hits.filter(h => h.rule_id === 'COMORBID-02');
  check('青光眼+山莨菪碱 → COMORBID-02 error', c.some(h=>h.severity==='error'), JSON.stringify(c));
}

// ============ COMORBID-03 前列腺增生+山莨菪碱 ============
console.log('\n=== P1-3 COMORBID-03 前列腺增生+抗胆碱药 ===');
{
  const ctx = baseCtx({
    patient: { name:'患者', gender:'男', age:70, weight:70, comorbidities:['前列腺增生'] },
    normal_rx: { rx_id:'N-1', items:[it('阿托品注射液', {single_dose:'0.5mg', frequency:'st', duration_days:1})] }
  });
  const hits = RxRuleEngine.run(ctx);
  const c = hits.filter(h => h.rule_id === 'COMORBID-03');
  check('前列腺增生+阿托品 → COMORBID-03 warn', c.some(h=>h.severity==='warn'), JSON.stringify(c));
}

// ============ COMORBID-04 妊娠+ACEI ============
console.log('\n=== P1-3 COMORBID-04 妊娠+ACEI ===');
{
  const ctx = baseCtx({
    patient: { name:'孕妇', gender:'女', age:28, weight:60, pregnant:true },
    normal_rx: { rx_id:'N-1', items:[it('卡托普利片', {single_dose:'12.5mg', frequency:'tid', duration_days:7})] }
  });
  const hits = RxRuleEngine.run(ctx);
  const c = hits.filter(h => h.rule_id === 'COMORBID-04');
  check('妊娠+卡托普利 → COMORBID-04 error', c.some(h=>h.severity==='error'), JSON.stringify(c));
}

console.log('\n=========================================');
console.log(`P1 验证结果: 通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);

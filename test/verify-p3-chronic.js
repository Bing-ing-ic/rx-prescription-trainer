/* P3-1 慢性病长处方规则适配验证
 * 运行: node test/verify-p3-chronic.js
 * 验收:
 *   - 高血压（chronic=true）开30天氨氯地平 → 不触发 DUR-01 warn（应记录 pass 长处方）
 *   - 急性肺炎（chronic=false）开14天头孢 → 正常触发 DUR-01 warn
 *   - 慢性病开90天（>84天上限）→ 仍 warn
 */
'use strict';
global.window = global;
const path = require('path');
const PROJECT_ROOT = path.join(__dirname, '..');
const rulesMeta = require(path.join(PROJECT_ROOT, 'data/rules.json')).rules;
const diseasesDb = require(path.join(PROJECT_ROOT, 'data/diseases.json')).diseases;
const drugsDb = require(path.join(PROJECT_ROOT, 'data/drugs.json')).drugs;
const compatData = require(path.join(PROJECT_ROOT, 'data/compat.json'));
require(path.join(PROJECT_ROOT, 'js/rule-engine.js'));
const RxRuleEngine = global.window.RxRuleEngine;

function D(name) {
  const f = drugsDb.find(d => d.generic_name === name);
  if (!f) throw new Error('药品不存在: ' + name);
  return f;
}
function dx(code) {
  const d = diseasesDb.find(x => x.code === code);
  if (!d) throw new Error('病种不存在: ' + code);
  return d;
}
function it(name, ov = {}) {
  return Object.assign({
    drug: typeof name === 'string' ? D(name) : name,
    single_dose: '', frequency: '', duration_days: null, quantity: 1,
  }, ov);
}
function baseCtx(over = {}) {
  return Object.assign({
    rulesMeta, compatData, drugDb: drugsDb,
    disease: dx('HTN-I10'),
    patient: { name: '测试患者', gender: '男', age: 45, weight: 65 },
    normal_rx: null, iv_rx: null,
  }, over);
}

let pass = 0, fail = 0;
function check(label, cond, extra = '') {
  if (cond) { console.log('  PASS', label); pass++; }
  else { console.log('  FAIL', label, extra); fail++; }
}

// ---------- 1. chronic 字段覆盖度 ----------
console.log('\n=== P3-1.1 chronic=true 病种覆盖度 ===');
const chronicList = diseasesDb.filter(d => d.chronic === true);
console.log(`  已标记 chronic=true 共 ${chronicList.length} 个:`);
chronicList.forEach(d => console.log(`    - ${d.code}  ${d.name}`));
check('至少 10 个慢性病种标记 chronic=true', chronicList.length >= 10, '实际=' + chronicList.length);
check('高血压 HTN-I10 标记 chronic=true', dx('HTN-I10').chronic === true);
check('2型糖尿病 DM-E11 标记 chronic=true', dx('DM-E11').chronic === true);
check('慢阻肺 COPD-J44 标记 chronic=true', dx('COPD-J44').chronic === true);
check('社区获得性肺炎 CAP-J18 未标记 chronic', dx('CAP-J18').chronic !== true);
check('急性阑尾炎 APP-K35 未标记 chronic', dx('APP-K35').chronic !== true);

// ---------- 2. 高血压开30天氨氯地平 → 不 warn ----------
console.log('\n=== P3-1.2 慢性病长处方（高血压 30 天氨氯地平）===');
{
  const ctx = baseCtx({
    disease: dx('HTN-I10'),
    normal_rx: {
      rx_id: 'N-1',
      items: [it('苯磺酸氨氯地平片', { single_dose: '5mg', frequency: 'qd', duration_days: 30 })],
    },
  });
  const hits = RxRuleEngine.run(ctx);
  const dur = hits.filter(h => h.rule_id === 'DUR-01');
  console.log('  DUR-01 命中:', JSON.stringify(dur.map(h => ({sev: h.severity, msg: h.message}))));
  check('高血压30天氨氯地平 → 不触发 DUR-01 warn', !dur.some(h => h.severity === 'warn'), JSON.stringify(dur));
  check('高血压30天氨氯地平 → 记录 pass 级长处方提示', dur.some(h => h.severity === 'pass' && /长处方/.test(h.message)), JSON.stringify(dur));
}

// ---------- 3. 急性肺炎开14天头孢 → 正常 warn ----------
console.log('\n=== P3-1.3 急性肺炎 14 天头孢（非慢性病）===');
{
  // 找一个头孢类药
  const cef = drugsDb.find(d => /头孢/.test(d.generic_name) && d.dosage_form === 'oral') || drugsDb.find(d => /头孢/.test(d.generic_name));
  const ctx = baseCtx({
    disease: dx('CAP-J18'),
    normal_rx: {
      rx_id: 'N-2',
      items: [it(cef.generic_name, { single_dose: '0.5g', frequency: 'tid', duration_days: 14 })],
    },
  });
  const hits = RxRuleEngine.run(ctx);
  const dur = hits.filter(h => h.rule_id === 'DUR-01');
  console.log('  DUR-01 命中:', JSON.stringify(dur.map(h => ({sev: h.severity, msg: h.message}))));
  check('急性肺炎14天 → 正常触发 DUR-01 warn', dur.some(h => h.severity === 'warn'), JSON.stringify(dur));
  check('急性肺炎14天 → 不记录长处方 pass', !dur.some(h => h.severity === 'pass'), JSON.stringify(dur));
}

// ---------- 4. 慢性病开90天（>84天）→ 仍 warn ----------
console.log('\n=== P3-1.4 慢性病超长处方（高血压 90 天）===');
{
  const ctx = baseCtx({
    disease: dx('HTN-I10'),
    normal_rx: {
      rx_id: 'N-3',
      items: [it('苯磺酸氨氯地平片', { single_dose: '5mg', frequency: 'qd', duration_days: 90 })],
    },
  });
  const hits = RxRuleEngine.run(ctx);
  const dur = hits.filter(h => h.rule_id === 'DUR-01');
  console.log('  DUR-01 命中:', JSON.stringify(dur.map(h => ({sev: h.severity, msg: h.message}))));
  check('高血压90天（>84天）→ 仍触发 DUR-01 warn', dur.some(h => h.severity === 'warn'), JSON.stringify(dur));
}

// ---------- 5. 慢性病28天（4周临界）→ 不 warn ----------
console.log('\n=== P3-1.5 慢性病临界（糖尿病 28 天）===');
{
  const ctx = baseCtx({
    disease: dx('DM-E11'),
    normal_rx: {
      rx_id: 'N-4',
      items: [it('盐酸二甲双胍缓释片', { single_dose: '0.5g', frequency: 'qd', duration_days: 28 })],
    },
  });
  const hits = RxRuleEngine.run(ctx);
  const dur = hits.filter(h => h.rule_id === 'DUR-01');
  check('糖尿病28天 → 不触发 DUR-01 warn', !dur.some(h => h.severity === 'warn'), JSON.stringify(dur));
}

console.log('\n=========================================');
console.log(`P3-1 验证结果: 通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);

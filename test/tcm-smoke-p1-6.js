/* tcm-smoke-p1-6.js  第三轮续作 C-P1-6 接通的 legacy 中医规则冒烟测试
 * 运行：node test/tcm-smoke-p1-6.js
 * 覆盖：herb_count / four_diagnosis / herb_name_norm / syndrome_contra_heatcold /
 *       syndrome_contra_deficiency_excess / meridian_match / junchen_dose_ratio /
 *       builtin_* no-op 不重复命中
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -- ' + detail : '')); }
}

global.window = global;
require(path.join(ROOT, 'js/tcm-engine.js'));
const TCMEngine = global.TCMEngine;

const herbsArr = (() => { const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tcm-herbs.json'), 'utf8')); return j.herbs || j; })();
const rulesArr = (() => { const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tcm-rules.json'), 'utf8')); return j.rules || []; })();
TCMEngine.extraRules = rulesArr.filter(r => r.type);
TCMEngine.herbsMeta = TCMEngine.buildHerbsMeta(herbsArr);

const baseCtx = { case: {}, zhengInput: '', faZhengInput: '', formulaCode: '', formulaName: '', patient: { pregnant: false, age: 30, gender: '男' } };
const hitIds = hits => hits.map(h => h.rule_id);
const hasRule = (hits, id) => hitIds(hits).indexOf(id) >= 0;

console.log('\n=== FMT-02 药味数量 ===');
{
  const few = TCMEngine.check({ ...baseCtx, herbs: [{ name: '甘草', dose: '6g', role: '使' }] });
  check('药味<4 触发 FMT-02 warn', hasRule(few, 'TCM-FMT-02'), hitIds(few).join(','));
  const many = TCMEngine.check({ ...baseCtx, herbs: Array.from({ length: 21 }, (_, i) => ({ name: '甘草', dose: '6g', role: '使' })) });
  check('药味>20 触发 FMT-02 warn', hasRule(many, 'TCM-FMT-02'), hitIds(many).join(','));
}

console.log('\n=== FMT-04 四诊完整 ===');
{
  const missing = TCMEngine.check({ ...baseCtx, case: { symptom_pool: { chief_complaint: [], tongue: [], pulse: [] } }, herbs: [{ name: '甘草', dose: '6g', role: '使' }] });
  check('主诉/舌脉缺失触发 FMT-04 error', hasRule(missing, 'TCM-FMT-04') && missing.some(h => h.rule_id === 'TCM-FMT-04' && h.severity === 'error'), hitIds(missing).join(','));
  const ok = TCMEngine.check({ ...baseCtx, case: { symptom_pool: { chief_complaint: ['咳嗽3天'], tongue: ['舌红苔薄白'], pulse: ['脉浮'] } }, herbs: [{ name: '甘草', dose: '6g', role: '使' }] });
  check('四诊完整不触发 FMT-04', !hasRule(ok, 'TCM-FMT-04'), hitIds(ok).join(','));
}

console.log('\n=== FMT-05 药名规范 ===');
{
  const alias = TCMEngine.check({ ...baseCtx, herbs: [{ name: '元参', dose: '10g', role: '臣' }] });
  check('别名「元参」触发 FMT-05 warn', hasRule(alias, 'TCM-FMT-05'), hitIds(alias).join(','));
  const canon = TCMEngine.check({ ...baseCtx, herbs: [{ name: '玄参', dose: '10g', role: '臣' }] });
  check('通用名「玄参」不误报 FMT-05', !hasRule(canon, 'TCM-FMT-05'), hitIds(canon).join(','));
}

console.log('\n=== INCOMPAT-04 寒热方向 ===');
{
  const cold = TCMEngine.check({ ...baseCtx, case: { syndrome_differentiation: '脾胃虚寒，畏寒肢冷、便溏苔白' }, herbs: [{ name: '黄连', dose: '3g', role: '臣' }, { name: '黄芩', dose: '3g', role: '佐' }] });
  check('寒证+≥2寒凉药触发 INCOMPAT-04 warn', hasRule(cold, 'TCM-INCOMPAT-04'), hitIds(cold).join(','));
  const heat = TCMEngine.check({ ...baseCtx, case: { syndrome_differentiation: '实热证，壮热口渴、舌红苔黄' }, herbs: [{ name: '干姜', dose: '6g', role: '臣' }, { name: '附子', dose: '6g', role: '佐' }] });
  check('热证+≥2温热药触发 INCOMPAT-04 warn', hasRule(heat, 'TCM-INCOMPAT-04'), hitIds(heat).join(','));
  const neutral = TCMEngine.check({ ...baseCtx, case: { syndrome_differentiation: '外感风邪' }, herbs: [{ name: '甘草', dose: '6g', role: '使' }] });
  check('无寒热关键词不误报 INCOMPAT-04', !hasRule(neutral, 'TCM-INCOMPAT-04'), hitIds(neutral).join(','));
}

console.log('\n=== INCOMPAT-05 虚实禁忌 ===');
{
  const def = TCMEngine.check({ ...baseCtx, case: { syndrome_differentiation: '脾胃虚寒，气短乏力' }, herbs: [{ name: '大黄', dose: '6g', role: '臣' }] });
  check('虚证+峻下药触发 INCOMPAT-05 error', def.some(h => h.rule_id === 'TCM-INCOMPAT-05' && h.severity === 'error'), def.filter(h => h.rule_id === 'TCM-INCOMPAT-05').map(h => h.severity + ':' + h.message).join(' | '));
  const exc = TCMEngine.check({ ...baseCtx, case: { syndrome_differentiation: '外感表实，发热便秘' }, herbs: [{ name: '人参', dose: '10g', role: '臣' }, { name: '阿胶', dose: '10g', role: '佐' }] });
  check('实证+≥2壅补药触发 INCOMPAT-05 warn', exc.some(h => h.rule_id === 'TCM-INCOMPAT-05' && h.severity === 'warn'), exc.filter(h => h.rule_id === 'TCM-INCOMPAT-05').map(h => h.severity).join(','));
}

console.log('\n=== SYN-05 归经匹配 ===');
{
  const miss = TCMEngine.check({ ...baseCtx, case: { syndrome_differentiation: '咳嗽，肺病证' }, herbs: [{ name: '当归', dose: '10g', role: '臣' }, { name: '大黄', dose: '6g', role: '佐' }] });
  check('肺证+无肺经药触发 SYN-05 warn', hasRule(miss, 'TCM-SYN-05'), hitIds(miss).join(','));
}

console.log('\n=== EFF-02 君臣剂量比例 ===');
{
  const bad = TCMEngine.check({ ...baseCtx, herbs: [{ name: '人参', dose: '6g', role: '君' }, { name: '当归', dose: '15g', role: '佐' }] });
  check('佐使剂量≥君药触发 EFF-02 warn', hasRule(bad, 'TCM-EFF-02'), hitIds(bad).join(','));
  const ok = TCMEngine.check({ ...baseCtx, herbs: [{ name: '人参', dose: '15g', role: '君' }, { name: '当归', dose: '6g', role: '佐' }] });
  check('君药剂量占优不误报 EFF-02', !hasRule(ok, 'TCM-EFF-02'), hitIds(ok).join(','));
}

console.log('\n=== builtin_* no-op 不重复命中 ===');
{
  const mixed = TCMEngine.check({ ...baseCtx, case: { syndrome_differentiation: '肝郁脾虚' }, herbs: [{ name: '甘草', dose: '6g', role: '使' }, { name: '人参', dose: '6g', role: '臣' }] });
  check('无十八反/十九畏命中（内置表已覆盖，legacy 不重复）', !mixed.some(h => /十八反|十九畏/.test(h.message || '')), hitIds(mixed).join(','));
}

console.log('\n==========================================');
console.log('PASS=' + pass + '  FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);

/* tcm-verify-p1.js  中医汉方模块 P1 修复验收脚本
 * 运行：node test/tcm-verify-p1.js
 * 覆盖：
 *   P1-1 川乌/制川乌/草乌/制草乌 剂量阈值统一为 3g；生川乌/生草乌 max=0 不得内服
 *   P1-2 乌头汤制川乌 6g→3g 且标先煎久煎；薏苡仁汤川乌→制川乌；TCM-022/023 同步
 *   P1-3 tcm-app.js 中 TCMEngine.check 调用处 ctx.patient 非空；孕妇+麝香触发 pregnancy_ban
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

// 浏览器环境 polyfill
global.window = global;
require(path.join(ROOT, 'js/tcm-engine.js'));
const TCMEngine = global.TCMEngine;

// 载入数据
const herbsArr = (() => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tcm-herbs.json'), 'utf8'));
  return j.herbs || j;
})();
const fmArr = (() => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tcm-formulas.json'), 'utf8'));
  return j.formulas || j;
})();
const caseArr = (() => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tcm-cases.json'), 'utf8'));
  return j.cases || j;
})();
const rulesArr = (() => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tcm-rules.json'), 'utf8'));
  return j.rules || [];
})();

// 注入外部规则与 herbsMeta（模拟 tcm-app boot()）
TCMEngine.extraRules = rulesArr.filter(r => r.type);
TCMEngine.herbsMeta = TCMEngine.buildHerbsMeta(herbsArr);

console.log('\n=== P1-1 川乌/制川乌剂量统一 ===');
const DL = TCMEngine.DOSE_LIMITS;
check('P1-1.1 DOSE_LIMITS.川乌.max === 3', DL['川乌'] && DL['川乌'].max === 3, 'max=' + (DL['川乌'] && DL['川乌'].max));
check('P1-1.2 DOSE_LIMITS.制川乌.max === 3', DL['制川乌'] && DL['制川乌'].max === 3, 'max=' + (DL['制川乌'] && DL['制川乌'].max));
check('P1-1.3 DOSE_LIMITS.草乌.max === 3', DL['草乌'] && DL['草乌'].max === 3, 'max=' + (DL['草乌'] && DL['草乌'].max));
check('P1-1.4 DOSE_LIMITS.制草乌.max === 3', DL['制草乌'] && DL['制草乌'].max === 3, 'max=' + (DL['制草乌'] && DL['制草乌'].max));
check('P1-1.5 DOSE_LIMITS.生川乌 存在且 max === 0', DL['生川乌'] && DL['生川乌'].max === 0, 'val=' + JSON.stringify(DL['生川乌']));
check('P1-1.6 DOSE_LIMITS.生草乌 存在且 max === 0', DL['生草乌'] && DL['生草乌'].max === 0, 'val=' + JSON.stringify(DL['生草乌']));

// dose_strict limits 对齐
const dsRule = rulesArr.find(r => r.type === 'dose_strict');
check('P1-1.7 rules.json dose_strict.limits.川乌 === 3', dsRule && dsRule.limits && dsRule.limits['川乌'] === 3,
  'limits=' + JSON.stringify(dsRule && dsRule.limits));
check('P1-1.8 rules.json dose_strict.limits.制川乌 === 3', dsRule && dsRule.limits && dsRule.limits['制川乌'] === 3);
check('P1-1.9 rules.json dose_strict.limits.制草乌 === 3', dsRule && dsRule.limits && dsRule.limits['制草乌'] === 3);

// 生川乌 1g 应触发 error（max=0，dose>0 即 error）
const rawWut = TCMEngine.check({
  case: {},
  herbs: [
    { name: '生川乌', dose: '1g', role: '君' },
    { name: '甘草', dose: '6g', role: '使' }
  ]
});
check('P1-1.10 生川乌1g 触发剂量 error（不得内服）',
  rawWut.some(h => h.severity === 'error' && /生川乌/.test(h.message || '')),
  rawWut.filter(h => h.severity === 'error').map(h => h.message).join(' | ') || '(无 error)');

// 制川乌 4g 应触发 error（>3g）
const overWut = TCMEngine.check({
  case: {},
  herbs: [
    { name: '制川乌', dose: '4g', role: '君', prep: '先煎' },
    { name: '甘草', dose: '6g', role: '使' }
  ]
});
check('P1-1.11 制川乌4g 触发剂量 error（>3g 上限）',
  overWut.some(h => h.severity === 'error' && /制川乌/.test(h.message || '')),
  overWut.filter(h => h.severity === 'error').map(h => h.message).join(' | ') || '(无 error)');

console.log('\n=== P1-2 乌头汤/薏苡仁汤剂量修正 ===');
const wut = fmArr.find(f => f.code === 'WUT');
const wutChu = wut && wut.composition.find(c => c.herb === '制川乌');
check('P1-2.1 乌头汤制川乌条目存在', !!wutChu);
const wutDose = wutChu ? parseFloat(wutChu.dose) : NaN;
check('P1-2.2 乌头汤制川乌剂量 ≤ 3g（实际=' + wutDose + 'g）', wutDose <= 3 && wutDose > 0, 'dose=' + (wutChu && wutChu.dose));
check('P1-2.3 乌头汤制川乌标注先煎/久煎',
  wutChu && /(先煎|久煎)/.test((wutChu.prep || '')),
  'prep=' + (wutChu && wutChu.prep));
check('P1-2.4 乌头汤 note 含"1.5g起始/小剂量"提示',
  wut && /(1\.5|小剂量|从小剂量)/.test(wut.note || ''),
  'note=' + (wut && wut.note));

const yyrs = fmArr.find(f => f.code === 'YYRS');
const yyrsChu = yyrs && yyrs.composition.find(c => /川乌/.test(c.herb));
check('P1-2.5 薏苡仁汤乌头类药存在', !!yyrsChu, '(未找到)');
check('P1-2.6 薏苡仁汤药名带"制"字（制川乌而非生川乌/川乌）',
  yyrsChu && /^制川乌$/.test(yyrsChu.herb),
  'herb=' + (yyrsChu && yyrsChu.herb));
check('P1-2.7 薏苡仁汤制川乌标注先煎',
  yyrsChu && /(先煎|久煎)/.test(yyrsChu.prep || ''),
  'prep=' + (yyrsChu && yyrsChu.prep));

// 病例同步
const c22 = caseArr.find(c => c.code === 'TCM-022');
const c23 = caseArr.find(c => c.code === 'TCM-023');
check('P1-2.8 TCM-022 contraindications 用"制川乌"表述',
  c22 && c22.contraindications.some(s => /制川乌/.test(s)),
  JSON.stringify(c22 && c22.contraindications));
check('P1-2.9 TCM-023 reference_herbs 含"制川乌"而非"川乌"',
  c23 && c23.reference_herbs.indexOf('制川乌') >= 0 && c23.reference_herbs.indexOf('川乌') < 0,
  JSON.stringify(c23 && c23.reference_herbs));

console.log('\n=== P1-3 tcm-app.js 把 patient 传给引擎 ===');
const appSrc = fs.readFileSync(path.join(ROOT, 'js/tcm-app.js'), 'utf8');
// 检查 submit() 中 TCMEngine.check 调用是否带 patient
const submitMatch = appSrc.match(/function submit\(\)\s*\{([\s\S]*?)\n  \}/);
check('P1-3.1 tcm-app.js submit() 函数存在', !!submitMatch);
const submitBody = submitMatch ? submitMatch[1] : '';
check('P1-3.2 submit() 中构造 patientCtx（含 pregnant/gender/age）',
  /patientCtx\s*=\s*\{/.test(submitBody) && /pregnant/.test(submitBody) && /gender/.test(submitBody) && /age/.test(submitBody));
check('P1-3.3 submit() 中 TCMEngine.check 入参带 patient: patientCtx',
  /TCMEngine\.check\(\{[\s\S]*?patient:\s*patientCtx/.test(submitBody));
check('P1-3.4 openRx() 中根据性别启用/禁用妊娠复选框',
  /openRx[\s\S]*?tcm-pregnant-flag/.test(appSrc) && /disabled\s*=\s*\(p\.gender\s*===\s*'男'\)/.test(appSrc));

// index.html 含妊娠复选框
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
check('P1-3.5 index.html 含 #tcm-pregnant-flag 复选框',
  /id="tcm-pregnant-flag"/.test(html));

// 端到端模拟：孕妇 + 麝香 → pregnancy_ban error
const e2e = TCMEngine.check({
  case: {},
  patient: { name: '测试', gender: '女', age: 28, pregnant: true },
  herbs: [
    { name: '麝香', dose: '0.1g', role: '佐', prep: '冲服' },
    { name: '木香', dose: '6g', role: '臣' }
  ]
});
check('P1-3.6 端到端：孕妇(patient.pregnant=true)+麝香 → pregnancy_ban error',
  e2e.some(h => h.severity === 'error' && /麝香/.test(h.message || '')),
  e2e.filter(h => h.severity === 'error').map(h => h.message).join(' | ') || '(无 error)');

// 非孕妇 + 麝香 → 不触发 pregnancy_ban
const e2e2 = TCMEngine.check({
  case: {},
  patient: { gender: '女', age: 30, pregnant: false },
  herbs: [
    { name: '麝香', dose: '0.1g', role: '佐', prep: '冲服' },
    { name: '木香', dose: '6g', role: '臣' }
  ]
});
check('P1-3.7 非孕妇+麝香 不触发 pregnancy_ban error（不误报）',
  !e2e2.some(h => h.rule_id === 'TCM-INCOMPAT-03' || /孕妇.*麝香/.test(h.message || '')),
  e2e2.filter(h => /孕妇/.test(h.message || '')).map(h => h.message).join(' | ') || '(无妊娠规则命中，符合预期)');

console.log('\n=== JSON 合法性 ===');
check('J.1 tcm-formulas.json 合法', (() => { try { JSON.parse(fs.readFileSync(path.join(ROOT,'data/tcm-formulas.json'),'utf8')); return true; } catch(e){ console.log('  err:', e.message); return false; } })());
check('J.2 tcm-cases.json 合法', (() => { try { JSON.parse(fs.readFileSync(path.join(ROOT,'data/tcm-cases.json'),'utf8')); return true; } catch(e){ console.log('  err:', e.message); return false; } })());
check('J.3 tcm-rules.json 合法', (() => { try { JSON.parse(fs.readFileSync(path.join(ROOT,'data/tcm-rules.json'),'utf8')); return true; } catch(e){ console.log('  err:', e.message); return false; } })());

console.log('\n=========================================');
console.log('  PASS=' + pass + '  FAIL=' + fail);
console.log('=========================================');
process.exit(fail > 0 ? 1 : 0);

/* tcm-verify-p2.js  中医汉方模块 P2 修复验收脚本
 * 运行：node test/tcm-verify-p2.js
 * 覆盖：
 *   P2-1 tcm-herbs.json 生川乌/制川乌/生草乌/制草乌 4 个独立条目；生品 max_dose=0 且 usage=外用
 *   P2-2 tcm-cases.json 至少 2 个病例含 patient.pregnant 字段；tcm-app.js 加载病例合并 patient
 *   P2-3 TCM-POP-02/03 带 type 与 limits；65岁+大黄→warn；5岁+朱砂→error
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

console.log('\n=== P2-1 川乌/草乌拆生品与制品 ===');
const names = herbsArr.map(h => h.name);
['生川乌', '制川乌', '生草乌', '制草乌'].forEach((n, i) => {
  const h = herbsArr.find(x => x.name === n);
  check('P2-1.' + (i+1) + ' 条目存在：' + n, !!h, h ? '' : '(未找到)');
});
const sChuan = herbsArr.find(x => x.name === '生川乌');
const sCao = herbsArr.find(x => x.name === '生草乌');
const zChuan = herbsArr.find(x => x.name === '制川乌');
const zCao = herbsArr.find(x => x.name === '制草乌');
check('P2-1.5 生川乌 max_dose === 0', sChuan && sChuan.max_dose === 0, 'max_dose=' + (sChuan && sChuan.max_dose));
check('P2-1.6 生川乌 dose_range === "外用"', sChuan && sChuan.dose_range === '外用', 'dose_range=' + (sChuan && sChuan.dose_range));
check('P2-1.7 生川乌 usage 含"外用"且含"剧毒/不得内服"', sChuan && /外用/.test(sChuan.usage || '') && /(剧毒|不得内服|严禁内服)/.test(sChuan.usage || ''), 'usage=' + (sChuan && sChuan.usage));
check('P2-1.8 生草乌 max_dose === 0', sCao && sCao.max_dose === 0, 'max_dose=' + (sCao && sCao.max_dose));
check('P2-1.9 生草乌 dose_range === "外用"', sCao && sCao.dose_range === '外用', 'dose_range=' + (sCao && sCao.dose_range));
check('P2-1.10 制川乌 dose_range 为内服剂量(1.5-3g)', zChuan && /1\.5[-–]3g/.test(zChuan.dose_range || ''), 'dose_range=' + (zChuan && zChuan.dose_range));
check('P2-1.11 制草乌 dose_range 为内服剂量(1.5-3g)', zCao && /1\.5[-–]3g/.test(zCao.dose_range || ''), 'dose_range=' + (zCao && zCao.dose_range));
check('P2-1.12 制草乌 max_dose === 3', zCao && zCao.max_dose === 3, 'max_dose=' + (zCao && zCao.max_dose));
check('P2-1.13 不再存在裸"川乌"/"草乌"条目（避免引擎误判生品内服）',
  !names.includes('川乌') && !names.includes('草乌'),
  'names 中残留=' + names.filter(n => n === '川乌' || n === '草乌').join(','));
// 生川乌内服应触发 error（DOSE_LIMITS 中 max=0）
const rawOral = TCMEngine.check({
  case: {},
  herbs: [
    { name: '生川乌', dose: '1g', role: '君' },
    { name: '甘草', dose: '6g', role: '使' }
  ]
});
check('P2-1.14 生川乌1g内服 触发剂量 error',
  rawOral.some(h => h.severity === 'error' && /生川乌/.test(h.message || '')),
  rawOral.filter(h => h.severity === 'error').map(h => h.message).join(' | ') || '(无 error)');

console.log('\n=== P2-2 病例库 patient.pregnant 自动置位 ===');
const withPregnant = caseArr.filter(c => c.patient && typeof c.patient.pregnant === 'boolean');
check('P2-2.1 至少 2 个病例含 patient.pregnant 字段', withPregnant.length >= 2,
  '实际=' + withPregnant.length + ' 个: ' + withPregnant.map(c => c.code).join(','));
const pregTrue = withPregnant.filter(c => c.patient.pregnant === true);
check('P2-2.2 至少 1 个病例 patient.pregnant === true（妊娠教学病例）', pregTrue.length >= 1,
  '实际=' + pregTrue.length + ' 个: ' + pregTrue.map(c => c.code + '(' + c.name + ')').join(','));
// 妊娠病例应为女性
const pregTrueFemale = pregTrue.every(c => c.patient.gender === '女');
check('P2-2.3 pregnant=true 的病例 gender 均为女', pregTrueFemale,
  pregTrue.map(c => c.code + ':' + c.patient.gender).join(','));
// tcm-app.js 源码检查
const appSrc = fs.readFileSync(path.join(ROOT, 'js/tcm-app.js'), 'utf8');
check('P2-2.4 pickPatient() 读取 c.patient.gender', /cp\.gender/.test(appSrc) && /c\.patient/.test(appSrc));
check('P2-2.5 pickPatient() 把 patient.pregnant 合并到返回对象', /patient\.pregnant\s*=\s*cp\.pregnant/.test(appSrc));
check('P2-2.6 openRx() 中根据 p.pregnant 自动勾选妊娠框', /pregBox\.checked\s*=\s*!pregBox\.disabled\s*&&\s*!!p\.pregnant/.test(appSrc));

// 端到端：模拟 TCM-013（妊娠+失眠）打开病例 → 患者应带 pregnant=true
const t013 = caseArr.find(c => c.code === 'TCM-013');
check('P2-2.7 TCM-013 病例 patient.pregnant === true', t013 && t013.patient && t013.patient.pregnant === true,
  JSON.stringify(t013 && t013.patient));
// 学员开朱砂 → pregnancy_ban error
const pregCase = TCMEngine.check({
  case: t013 || {},
  patient: { name: '测试孕妇', gender: '女', age: 28, pregnant: true },
  herbs: [
    { name: '朱砂', dose: '0.3g', role: '君', prep: '研末冲服' },
    { name: '黄连', dose: '3g', role: '臣' }
  ]
});
check('P2-2.8 妊娠病例+朱砂 → pregnancy_ban error（妊娠规则自动生效）',
  pregCase.some(h => h.severity === 'error' && (/孕妇/.test(h.message || '') || /妊娠禁用药/.test(h.message || '')) && /朱砂/.test(h.message || '')),
  pregCase.filter(h => h.severity === 'error').map(h => h.message).join(' | ') || '(无 error)');

console.log('\n=== P2-3 老年/小儿规则接通引擎 ===');
const pop02 = rulesArr.find(r => r.rule_id === 'TCM-POP-02');
const pop03 = rulesArr.find(r => r.rule_id === 'TCM-POP-03');
check('P2-3.1 TCM-POP-02 带 type=elderly_caution', pop02 && pop02.type === 'elderly_caution', 'type=' + (pop02 && pop02.type));
check('P2-3.2 TCM-POP-02 带 limits（harsh_herbs/toxic_herbs/age_threshold）',
  pop02 && pop02.limits && Array.isArray(pop02.limits.harsh_herbs) && Array.isArray(pop02.limits.toxic_herbs) && typeof pop02.limits.age_threshold === 'number',
  'limits=' + JSON.stringify(pop02 && pop02.limits).slice(0, 120));
check('P2-3.3 TCM-POP-03 带 type=pediatric_dose', pop03 && pop03.type === 'pediatric_dose', 'type=' + (pop03 && pop03.type));
check('P2-3.4 TCM-POP-03 带 limits（forbidden_herbs/caution_herbs/age_threshold）',
  pop03 && pop03.limits && Array.isArray(pop03.limits.forbidden_herbs) && Array.isArray(pop03.limits.caution_herbs) && typeof pop03.limits.age_threshold === 'number',
  'limits=' + JSON.stringify(pop03 && pop03.limits).slice(0, 120));

// 65岁老人 + 大黄10g → elderly_caution warn
const elderly = TCMEngine.check({
  case: {},
  patient: { name: '老张', gender: '男', age: 70, pregnant: false },
  herbs: [
    { name: '大黄', dose: '10g', role: '君', prep: '后下' },
    { name: '厚朴', dose: '9g', role: '臣' },
    { name: '枳实', dose: '9g', role: '佐' }
  ]
});
check('P2-3.5 65岁以上老人+大黄10g → elderly_caution warn',
  elderly.some(h => h.severity === 'warn' && (/老年/.test(h.message || '') || /老人/.test(h.message || '')) && /大黄/.test(h.message || '')),
  elderly.filter(h => /老年|老人|大黄/.test(h.message || '')).map(h => h.severity + ':' + h.message).join(' | ') || '(无命中)');

// 65岁老人 + 附子 → elderly_caution warn（有毒药）
const elderlyToxic = TCMEngine.check({
  case: {},
  patient: { name: '李伯', gender: '男', age: 72, pregnant: false },
  herbs: [
    { name: '附子', dose: '10g', role: '君', prep: '先煎' },
    { name: '干姜', dose: '6g', role: '臣' }
  ]
});
check('P2-3.6 65岁以上老人+附子 → elderly_caution warn（有毒药提示）',
  elderlyToxic.some(h => h.severity === 'warn' && /老年|老人/.test(h.message || '') && /附子/.test(h.message || '')),
  elderlyToxic.filter(h => /老年|老人|附子/.test(h.message || '')).map(h => h.severity + ':' + h.message).join(' | ') || '(无命中)');

// 5岁小儿 + 朱砂 → pediatric_dose error
const kid = TCMEngine.check({
  case: {},
  patient: { name: '小朋友', gender: '男', age: 5, pregnant: false },
  herbs: [
    { name: '朱砂', dose: '0.3g', role: '君', prep: '研末冲服' },
    { name: '黄连', dose: '3g', role: '臣' }
  ]
});
check('P2-3.7 5岁小儿+朱砂 → pediatric_dose error（小儿禁用药）',
  kid.some(h => h.severity === 'error' && /小儿/.test(h.message || '') && /朱砂/.test(h.message || '')),
  kid.filter(h => h.severity === 'error').map(h => h.message).join(' | ') || '(无 error)');

// 30岁成人 + 大黄10g → 不触发 elderly_caution（不应误报）
const adult = TCMEngine.check({
  case: {},
  patient: { name: '中年男', gender: '男', age: 40, pregnant: false },
  herbs: [
    { name: '大黄', dose: '10g', role: '君', prep: '后下' },
    { name: '厚朴', dose: '9g', role: '臣' }
  ]
});
check('P2-3.8 40岁成人+大黄 不触发 elderly_caution warn（不误报）',
  !adult.some(h => /老年|老人/.test(h.message || '') && /大黄/.test(h.message || '')),
  adult.filter(h => /老年|老人/.test(h.message || '')).map(h => h.message).join(' | ') || '(无老年规则命中，符合预期)');

console.log('\n=== JSON 合法性 ===');
check('J.1 tcm-herbs.json 合法', (() => { try { JSON.parse(fs.readFileSync(path.join(ROOT,'data/tcm-herbs.json'),'utf8')); return true; } catch(e){ console.log('  err:', e.message); return false; } })());
check('J.2 tcm-cases.json 合法', (() => { try { JSON.parse(fs.readFileSync(path.join(ROOT,'data/tcm-cases.json'),'utf8')); return true; } catch(e){ console.log('  err:', e.message); return false; } })());
check('J.3 tcm-rules.json 合法', (() => { try { JSON.parse(fs.readFileSync(path.join(ROOT,'data/tcm-rules.json'),'utf8')); return true; } catch(e){ console.log('  err:', e.message); return false; } })());

console.log('\n=========================================');
console.log('  PASS=' + pass + '  FAIL=' + fail);
console.log('=========================================');
process.exit(fail > 0 ? 1 : 0);

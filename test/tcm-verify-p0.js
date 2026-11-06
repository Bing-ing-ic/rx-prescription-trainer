/* tcm-verify-p0.js  中医汉方模块 P0 修复验收脚本
 * 运行：node test/tcm-verify-p0.js
 * 覆盖：T-1 / T-2 / T-3 / T-4 / T-5 + 条目数回归
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

// 浏览器环境 polyfill（tcm-engine.js 用 window/globalThis）
global.window = global;
require(path.join(ROOT, 'js/tcm-engine.js'));
const TCMEngine = global.TCMEngine;

console.log('\n=== T-1 朱砂剂量与朱砂安神丸 ===');
const herbs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tcm-herbs.json'), 'utf8'));
const herbsArr = herbs.herbs || herbs;
const zhusha = herbsArr.find(h => h.name === '朱砂');
check('T-1.1 朱砂条目存在', !!zhusha);
check('T-1.2 朱砂 max_dose ≤ 0.5', zhusha && typeof zhusha.max_dose === 'number' && zhusha.max_dose <= 0.5,
  'max_dose=' + (zhusha && zhusha.max_dose));
check('T-1.3 朱砂 usage 含"丸散"', zhusha && /丸散/.test(zhusha.usage || ''),
  'usage=' + (zhusha && zhusha.usage));
check('T-1.4 朱砂 usage 含"不入煎"', zhusha && /不入煎/.test(zhusha.usage || ''),
  'usage=' + (zhusha && zhusha.usage));

const formulas = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tcm-formulas.json'), 'utf8'));
const fmArr = formulas.formulas || formulas;
const zsast = fmArr.find(f => f.code === 'ZSAST');
const zsInFormula = zsast && zsast.composition.find(c => c.herb === '朱砂');
check('T-1.5 朱砂安神丸朱砂条目存在', !!zsInFormula);
check('T-1.6 朱砂安神丸朱砂剂量不再是 3g', zsInFormula && !/^3g$/.test(zsInFormula.dose),
  'dose=' + (zsInFormula && zsInFormula.dose));
check('T-1.7 朱砂安神丸朱砂标冲服/入丸/不入煎',
  zsInFormula && /(冲服|入丸|不入煎|研末)/.test((zsInFormula.prep || '') + (zsast.note || '')),
  'prep=' + (zsInFormula && zsInFormula.prep) + ' note=' + (zsast.note || ''));

const cases = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tcm-cases.json'), 'utf8'));
const caseArr = cases.cases || cases;
const tcm013 = caseArr.find(c => c.code === 'TCM-013');
const zsInCase = tcm013 && tcm013.reference_herbs.find(h => /^朱砂/.test(h));
check('T-1.8 TCM-013 朱砂标剂量与冲服',
  zsInCase && /0\.[1-5]/.test(zsInCase) && /(冲服|不入煎|丸散)/.test(zsInCase),
  'ref=' + zsInCase);

console.log('\n=== T-2 理中丸君药 ===');
const lzw = fmArr.find(f => f.code === 'LZW');
const junHerb = lzw && lzw.composition.find(c => c.role === '君');
check('T-2.1 理中丸君药 === 干姜', junHerb && junHerb.herb === '干姜',
  '君=' + (junHerb && junHerb.herb));
const chenHerb = lzw && lzw.composition.find(c => c.role === '臣');
check('T-2.2 理中丸臣药 === 人参', chenHerb && chenHerb.herb === '人参',
  '臣=' + (chenHerb && chenHerb.herb));

console.log('\n=== T-3 十八反表粘连修复 ===');
const luPair = TCMEngine.SHIBAFAN_PAIRS.find(p => p.a.indexOf('藜芦') >= 0);
check('T-3.1 藜芦反药组存在', !!luPair);
check('T-3.2 北沙参是独立条目', luPair && luPair.b.indexOf('北沙参') >= 0);
check('T-3.3 苦参是独立条目', luPair && luPair.b.indexOf('苦参') >= 0);
check('T-3.4 "北沙参苦参"粘连字符串已删除',
  luPair && !luPair.b.some(x => x === '北沙参苦参'));

// 藜芦+苦参 应触发十八反
const hitsLk = TCMEngine.check({
  case: {}, herbs: [
    { name: '藜芦', dose: '0.5g', role: '佐' },
    { name: '苦参', dose: '6g', role: '臣' }
  ]
});
const fbLk = hitsLk.find(h => h.rule_id && h.rule_id.indexOf('TCM-FB-') === 0);
check('T-3.5 藜芦+苦参 触发十八反', !!fbLk,
  fbLk ? fbLk.message : 'hits=' + JSON.stringify(hitsLk.map(h=>h.rule_id)));

// 藜芦+北沙参 应触发
const lbHits = TCMEngine.check({
  case: {}, herbs: [
    { name: '藜芦', dose: '0.5g', role: '佐' },
    { name: '北沙参', dose: '10g', role: '臣' }
  ]
});
check('T-3.6 藜芦+北沙参 触发十八反',
  lbHits.some(h => h.rule_id && h.rule_id.indexOf('TCM-FB-') === 0));

console.log('\n=== T-4 白附子不再误判为附子 ===');
// 处方含白附子 + 半夏，不应触发"乌头反半夏"
const bfzHits = TCMEngine.check({
  case: {}, herbs: [
    { name: '白附子', dose: '6g', role: '臣' },
    { name: '半夏', dose: '9g', role: '佐' },
    { name: '生姜', dose: '9g', role: '使' }
  ]
});
const bfzIncompat = bfzHits.find(h => h.rule_id === 'TCM-FB-川乌' || /乌头反/.test(h.title || ''));
check('T-4.1 白附子+半夏 不触发乌头反半夏', !bfzIncompat,
  bfzIncompat ? bfzIncompat.message : '(无)');

// 处方含附子 + 半夏，应触发十八反
const fzHits = TCMEngine.check({
  case: {}, herbs: [
    { name: '附子', dose: '6g', role: '君', prep: '先煎' },
    { name: '半夏', dose: '9g', role: '臣' }
  ]
});
const fzIncompat = fzHits.find(h => h.rule_id === 'TCM-FB-川乌' || /乌头反/.test(h.title || ''));
check('T-4.2 附子+半夏 触发十八反', !!fzIncompat,
  fzIncompat ? fzIncompat.message : '(未触发)');

// 白附子不应按附子剂量阈值报错（白附子6g安全）
const bfzDoseHits = TCMEngine.check({
  case: {}, herbs: [{ name: '白附子', dose: '6g', role: '臣' }]
});
check('T-4.3 白附子6g 不触发附子剂量超限',
  !bfzDoseHits.some(h => /白附子.*剂量过大/.test(h.message || '')));

console.log('\n=== T-5 外部规则接通 ===');
const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tcm-rules.json'), 'utf8'));
const rulesArr = rules.rules || [];
const typeCounts = {};
rulesArr.forEach(r => { if (r.type) typeCounts[r.type] = (typeCounts[r.type] || 0) + 1; });
console.log('  已接通 type 分布:', JSON.stringify(typeCounts));
check('T-5.1 存在 pregnancy_ban 规则', typeCounts.pregnancy_ban >= 1);
check('T-5.2 存在 pregnancy_caution 规则', typeCounts.pregnancy_caution >= 1);
check('T-5.3 存在 decoction_first 规则', typeCounts.decoction_first >= 1);
check('T-5.4 存在 decoction_later 规则', typeCounts.decoction_later >= 1);
check('T-5.5 存在 dose_strict 规则', typeCounts.dose_strict >= 1);
check('T-5.6 存在 dose_range_check 规则', typeCounts.dose_range_check >= 1);

// 把 rules 注入引擎
TCMEngine.extraRules = rulesArr.filter(r => r.type);
// 注入 herbsMeta（模拟 load() 行为）
TCMEngine.herbsMeta = TCMEngine.buildHerbsMeta(herbsArr);

// T-5.7 孕妇 + 麝香 → pregnancy_ban hit
const pregHits = TCMEngine.check({
  case: {}, patient: { pregnant: true, age: 28, gender: '女' },
  herbs: [
    { name: '麝香', dose: '0.1g', role: '佐', prep: '冲服' },
    { name: '木香', dose: '6g', role: '臣' }
  ]
});
check('T-5.7 孕妇+麝香 触发妊娠禁用药 error',
  pregHits.some(h => h.severity === 'error' && /麝香/.test(h.message || '')),
  pregHits.filter(h=>h.severity==='error').map(h=>h.message).join(' | ') || '(无 error)');

// T-5.8 孕妇 + 巴豆 → pregnancy_ban hit
const pregHits2 = TCMEngine.check({
  case: {}, patient: { pregnant: true },
  herbs: [{ name: '巴豆霜', dose: '0.1g', role: '佐' }]
});
check('T-5.8 孕妇+巴豆霜 触发妊娠禁用药 error',
  pregHits2.some(h => h.severity === 'error' && /巴豆/.test(h.message || '')));

// T-5.9 孕妇 + 红花 → pregnancy_caution warn（不再误报 error）
const pregHits3 = TCMEngine.check({
  case: {}, patient: { pregnant: true },
  herbs: [
    { name: '红花', dose: '6g', role: '臣' },
    { name: '当归', dose: '9g', role: '佐' }
  ]
});
check('T-5.9 孕妇+红花 触发妊娠慎用药 warn（非 error）',
  pregHits3.some(h => h.severity === 'warn' && /红花/.test(h.message || '')));

// T-5.10 剂量超限：石膏 100g（药典 15-60g）→ dose_range_check hit
const doseHits = TCMEngine.check({
  case: {},
  herbs: [
    { name: '石膏', dose: '100g', role: '君', prep: '先煎' },
    { name: '知母', dose: '9g', role: '臣' }
  ]
});
check('T-5.10 石膏100g 触发剂量超《药典》上限 error',
  doseHits.some(h => /TCM-DRANGE-石膏/.test(h.rule_id || '') || /石膏.*药典范围/.test(h.message || '')),
  doseHits.map(h=>h.rule_id+':'+h.message).join(' | '));

// T-5.11 先煎未标：牡蛎 15g 未标先煎 → decoction_first hit
const usgHits = TCMEngine.check({
  case: {},
  herbs: [
    { name: '牡蛎', dose: '15g', role: '臣' },
    { name: '柴胡', dose: '6g', role: '君' }
  ]
});
check('T-5.11 牡蛎未标先煎 触发先煎 warn',
  usgHits.some(h => /牡蛎/.test(h.message || '') && /先煎/.test(h.message || '')),
  usgHits.filter(h=>/先煎/.test(h.message||'')).map(h=>h.message).join(' | ') || '(无)');

// T-5.12 朱砂入煎（未标冲服）→ dose_range_check 中朱砂不入煎剂 error
const zsRawHits = TCMEngine.check({
  case: {},
  herbs: [
    { name: '朱砂', dose: '3g', role: '君' },  // 既超量又入煎
    { name: '黄连', dose: '6g', role: '臣' }
  ]
});
check('T-5.12 朱砂入煎3g 触发"不得入煎剂"error',
  zsRawHits.some(h => /朱砂.*入煎/.test(h.message || '')),
  zsRawHits.filter(h=>h.severity==='error').map(h=>h.message).join(' | '));

console.log('\n=== 条目数回归（不破坏现有功能）===');
check('R.1 tcm-herbs 条目数 > 0（未删条目）', herbsArr.length > 100, 'count=' + herbsArr.length);
check('R.2 tcm-formulas 条目数 ≥ 40（未删条目）', fmArr.length >= 40, 'count=' + fmArr.length);
check('R.3 tcm-cases 条目数 = 26', caseArr.length === 26, 'count=' + caseArr.length);
check('R.4 tcm-rules 条目数 ≥ 31', rulesArr.length >= 31, 'count=' + rulesArr.length);
check('R.5 朱砂条目仍在 tcm-herbs 中', !!zhusha);
check('R.6 朱砂安神丸仍在 tcm-formulas 中', !!zsast);
check('R.7 TCM-013 仍在 tcm-cases 中', !!tcm013);

console.log('\n=========================================');
console.log('  PASS=' + pass + '  FAIL=' + fail);
console.log('=========================================');
process.exit(fail > 0 ? 1 : 0);

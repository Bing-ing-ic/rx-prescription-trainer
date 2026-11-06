/* tcm-verify-p3.js  中医汉方模块 P3 扩展验收脚本
 * 运行：node test/tcm-verify-p3.js
 * 覆盖：
 *   P3-1 e2e-tcm.js 10 个辨证病例跑批无 error
 *   P3-2 pediatric_dose 扩展：所有药小儿超 1/2 warn、超 2/3 error；峻下药小儿即使合规也 warn
 *        - 5 岁 + 大黄 10g → warn
 *        - 5 岁 + 大黄 15g → error
 *   P3-3 elderly_caution 扩展：65+ 麻黄/桂枝 warn（温燥）、大黄/芒硝 warn（峻下）、附子/川乌 warn（有毒）
 *        - 70 岁 + 麻黄 10g → warn
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

// 载入数据并注入
const herbsArr = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tcm-herbs.json'), 'utf8')).herbs;
const rulesArr = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tcm-rules.json'), 'utf8')).rules;
TCMEngine.extraRules = rulesArr.filter(r => r.type);
TCMEngine.herbsMeta = TCMEngine.buildHerbsMeta(herbsArr);

// 工具：从 hits 中找匹配
function find(hits, opts) {
  return hits.find(h => {
    if (opts.severity && h.severity !== opts.severity) return false;
    if (opts.rulePrefix && !String(h.rule_id || '').startsWith(opts.rulePrefix)) return false;
    if (opts.herb && !new RegExp(opts.herb).test(h.message || '')) return false;
    if (opts.msg && !new RegExp(opts.msg).test(h.message || '')) return false;
    return true;
  });
}

console.log('\n=== P3-2 小儿剂量折算扩展到所有药 ===');

// P3-2.1 5 岁 + 大黄 10g → warn（>成人量1/2=7.5g，未超2/3=10g）
const k10 = TCMEngine.check({
  case: {},
  patient: { name: '小朋友', gender: '男', age: 5 },
  herbs: [
    { name: '大黄', dose: '10g', role: '君', prep: '后下' },
    { name: '甘草', dose: '3g', role: '使' }
  ]
});
check('P3-2.1 5岁+大黄10g → 小儿剂量 warn（>成人量1/2）',
  find(k10, { severity: 'warn', rulePrefix: 'TCM-PED', herb: '大黄' }),
  k10.filter(h => /小儿/.test(h.message)).map(h => h.severity + ':' + h.message).join(' | ') || '(无小儿命中)');

// P3-2.2 5 岁 + 大黄 15g → error（>成人量2/3=10g）
const k15 = TCMEngine.check({
  case: {},
  patient: { name: '小朋友', gender: '男', age: 5 },
  herbs: [
    { name: '大黄', dose: '15g', role: '君', prep: '后下' },
    { name: '甘草', dose: '3g', role: '使' }
  ]
});
check('P3-2.2 5岁+大黄15g → 小儿剂量 error（>成人量2/3）',
  find(k15, { severity: 'error', rulePrefix: 'TCM-PED', herb: '大黄' }),
  k15.filter(h => /小儿/.test(h.message)).map(h => h.severity + ':' + h.message).join(' | ') || '(无小儿命中)');

// P3-2.3 5 岁 + 大黄 6g（合规剂量）→ 仍因峻下药 warn
const kCompliant = TCMEngine.check({
  case: {},
  patient: { name: '小朋友', gender: '男', age: 5 },
  herbs: [
    { name: '大黄', dose: '6g', role: '君', prep: '后下' },
    { name: '甘草', dose: '3g', role: '使' }
  ]
});
check('P3-2.3 5岁+大黄6g（合规剂量）→ 仍因峻下药 warn',
  find(kCompliant, { severity: 'warn', rulePrefix: 'TCM-PED-HARSH', herb: '大黄' }),
  kCompliant.filter(h => /小儿/.test(h.message)).map(h => h.severity + ':' + h.message).join(' | ') || '(无小儿命中)');

// P3-2.4 一般药（非 caution_herbs 名单内）小儿超 1/2 也 warn：5 岁 + 金银花 9g（成人 max=15，1/2=7.5，2/3=10）
const kYin = TCMEngine.check({
  case: {},
  patient: { name: '小朋友', gender: '女', age: 5 },
  herbs: [
    { name: '金银花', dose: '9g', role: '君' },
    { name: '连翘', dose: '6g', role: '臣' }
  ]
});
check('P3-2.4 5岁+金银花9g（一般药，超成人量1/2但未超2/3）→ warn',
  find(kYin, { severity: 'warn', rulePrefix: 'TCM-PED-DOSE', herb: '金银花' }),
  kYin.filter(h => /小儿/.test(h.message)).map(h => h.severity + ':' + h.message).join(' | ') || '(无小儿命中)');

// P3-2.5 30 岁成人 + 大黄 10g → 不触发小儿 warn（不误报）
const adult = TCMEngine.check({
  case: {},
  patient: { name: '成人', gender: '男', age: 30 },
  herbs: [
    { name: '大黄', dose: '10g', role: '君', prep: '后下' },
    { name: '甘草', dose: '3g', role: '使' }
  ]
});
check('P3-2.5 30岁+大黄10g 不触发小儿 warn（不误报）',
  !find(adult, { rulePrefix: 'TCM-PED', herb: '大黄' }),
  adult.filter(h => /小儿/.test(h.message)).map(h => h.message).join(' | ') || '(无小儿命中，符合预期)');

console.log('\n=== P3-3 老年规则扩展（温燥/峻下/有毒三类 warn）===');

// P3-3.1 70 岁 + 麻黄 10g → warn（温燥发汗，防汗脱）
const e1 = TCMEngine.check({
  case: {},
  patient: { name: '李伯', gender: '男', age: 70 },
  herbs: [
    { name: '麻黄', dose: '10g', role: '君' },
    { name: '甘草', dose: '3g', role: '使' }
  ]
});
check('P3-3.1 70岁+麻黄10g → 老年温燥 warn',
  find(e1, { severity: 'warn', rulePrefix: 'TCM-ELDERLY', herb: '麻黄' }),
  e1.filter(h => /老年/.test(h.message)).map(h => h.severity + ':' + h.message).join(' | ') || '(无老年命中)');

// P3-3.2 70 岁 + 大黄 10g → warn（峻下，防脱水）
const e2 = TCMEngine.check({
  case: {},
  patient: { name: '王婆', gender: '女', age: 72 },
  herbs: [
    { name: '大黄', dose: '10g', role: '君', prep: '后下' },
    { name: '甘草', dose: '3g', role: '使' }
  ]
});
check('P3-3.2 70岁+大黄10g → 老年峻下 warn',
  find(e2, { severity: 'warn', rulePrefix: 'TCM-ELDERLY-PURGE', herb: '大黄' }),
  e2.filter(h => /老年/.test(h.message)).map(h => h.severity + ':' + h.message).join(' | ') || '(无老年命中)');

// P3-3.3 70 岁 + 附子 10g → warn（有毒，防蓄积）
const e3 = TCMEngine.check({
  case: {},
  patient: { name: '张伯', gender: '男', age: 75 },
  herbs: [
    { name: '附子', dose: '10g', role: '君', prep: '先煎' },
    { name: '干姜', dose: '6g', role: '臣' }
  ]
});
check('P3-3.3 70岁+附子10g → 老年有毒 warn',
  find(e3, { severity: 'warn', rulePrefix: 'TCM-ELDERLY-TOXIC', herb: '附子' }),
  e3.filter(h => /老年/.test(h.message)).map(h => h.severity + ':' + h.message).join(' | ') || '(无老年命中)');

// P3-3.4 70 岁 + 桂枝 → warn（温燥）
const e4 = TCMEngine.check({
  case: {},
  patient: { name: '赵婆', gender: '女', age: 68 },
  herbs: [
    { name: '桂枝', dose: '6g', role: '君' },
    { name: '甘草', dose: '3g', role: '使' }
  ]
});
check('P3-3.4 65岁+桂枝6g → 老年温燥 warn',
  find(e4, { severity: 'warn', rulePrefix: 'TCM-ELDERLY-WARM', herb: '桂枝' }),
  e4.filter(h => /老年/.test(h.message)).map(h => h.severity + ':' + h.message).join(' | ') || '(无老年命中)');

// P3-3.5 64 岁 + 大黄 → 不触发老年 warn（不误报）
const e5 = TCMEngine.check({
  case: {},
  patient: { name: '准老人', gender: '男', age: 64 },
  herbs: [
    { name: '大黄', dose: '10g', role: '君', prep: '后下' },
    { name: '甘草', dose: '3g', role: '使' }
  ]
});
check('P3-3.5 64岁+大黄 不触发老年 warn（不误报）',
  !find(e5, { rulePrefix: 'TCM-ELDERLY', herb: '大黄' }),
  e5.filter(h => /老年/.test(h.message)).map(h => h.message).join(' | ') || '(无老年命中，符合预期)');

console.log('\n=== P3-1 e2e-tcm.js 10 病例跑批无 error ===');
// 子进程跑 e2e-tcm.js
const { execSync } = require('child_process');
let e2eOk = false, e2eOut = '';
try {
  e2eOut = execSync('node test/e2e-tcm.js', { cwd: ROOT, encoding: 'utf8' });
  e2eOk = true;
} catch (e) {
  e2eOut = (e.stdout || '') + '\n' + (e.stderr || '');
}
const m = e2eOut.match(/跑批结果：(\d+)\/10 病例无 error/);
const passed = m ? parseInt(m[1], 10) : 0;
check('P3-1 e2e-tcm.js 10/10 病例无 error', e2eOk && passed === 10,
  '实际=' + (m ? m[1] : '?') + '/10');

console.log('\n=== JSON 合法性 ===');
check('J.1 tcm-herbs.json 合法', (() => { try { JSON.parse(fs.readFileSync(path.join(ROOT,'data/tcm-herbs.json'),'utf8')); return true; } catch(e){ return false; } })());
check('J.2 tcm-cases.json 合法', (() => { try { JSON.parse(fs.readFileSync(path.join(ROOT,'data/tcm-cases.json'),'utf8')); return true; } catch(e){ return false; } })());
check('J.3 tcm-rules.json 合法', (() => { try { JSON.parse(fs.readFileSync(path.join(ROOT,'data/tcm-rules.json'),'utf8')); return true; } catch(e){ return false; } })());

console.log('\n=========================================');
console.log('  PASS=' + pass + '  FAIL=' + fail);
console.log('=========================================');
process.exit(fail > 0 ? 1 : 0);

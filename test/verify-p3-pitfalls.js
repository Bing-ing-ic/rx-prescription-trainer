/* P3-3 诊断陷阱数据结构验证
 * 运行: node test/verify-p3-pitfalls.js
 * 验收:
 *   - diagnosis-pitfalls.json 合法 JSON
 *   - 至少 5 个陷阱
 *   - 每个陷阱含 wrong_diagnosis / correct_diagnosis / red_flags / teaching_tip
 *   - 5 个必备陷阱主题齐全（急腹症/胸痛/呼吸困难/关节痛/头痛）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const PROJECT_ROOT = path.join(__dirname, '..');

const data = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'data', 'diagnosis-pitfalls.json'), 'utf8'));
const pitfalls = data.pitfalls || [];

let pass = 0, fail = 0;
function check(label, cond, extra = '') {
  if (cond) { console.log('  PASS', label); pass++; }
  else { console.log('  FAIL', label, extra); fail++; }
}

console.log(`\n=== P3-3.1 陷阱数量 ===`);
pitfalls.forEach(p => console.log(`  [${p.trap_id}] ${p.title}`));
check('至少 5 个诊断陷阱', pitfalls.length >= 5, '实际=' + pitfalls.length);

console.log(`\n=== P3-3.2 必填字段完整性 ===`);
const required = ['trap_id', 'title', 'chief_complaint', 'wrong_diagnosis', 'correct_diagnosis', 'red_flags', 'key_workup', 'teaching_tip'];
pitfalls.forEach(p => {
  const missing = required.filter(f => !p[f] || (Array.isArray(p[f]) && p[f].length === 0));
  check(`[${p.trap_id}] 字段完整`, missing.length === 0, '缺失: ' + missing.join(','));
});

console.log(`\n=== P3-3.3 五大主题覆盖 ===`);
const themes = [
  { keyword: '消化性溃疡穿孔|溃疡穿孔', desc: '急腹症-溃疡穿孔', wrong: '急性阑尾炎' },
  { keyword: '主动脉夹层', desc: '胸痛-主动脉夹层', wrong: '急性ST段抬高型心肌梗死|心肌梗死' },
  { keyword: '慢阻肺|COPD|AECOPD', desc: '呼吸困难-AECOPD', wrong: '支气管哮喘' },
  { keyword: '化脓性关节炎', desc: '关节痛-化脓性关节炎', wrong: '痛风' },
  { keyword: '蛛网膜下腔出血', desc: '头痛-SAH', wrong: '偏头痛' },
];
themes.forEach(t => {
  const hit = pitfalls.find(p => new RegExp(t.keyword).test(p.correct_diagnosis));
  check(`主题: ${t.desc}`, !!hit, '未找到');
  if (hit) {
    check(`  误判方向: ${t.wrong}`, new RegExp(t.wrong).test(hit.wrong_diagnosis), '实际误判=' + hit.wrong_diagnosis);
  }
});

console.log(`\n=== P3-3.4 鉴别要点数组非空 ===`);
pitfalls.forEach(p => {
  check(`[${p.trap_id}] red_flags≥3条`, Array.isArray(p.red_flags) && p.red_flags.length >= 3, '实际=' + (p.red_flags || []).length);
  check(`[${p.trap_id}] key_workup≥3条`, Array.isArray(p.key_workup) && p.key_workup.length >= 3, '实际=' + (p.key_workup || []).length);
});

console.log('\n=========================================');
console.log(`P3-3 验证结果: 通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);

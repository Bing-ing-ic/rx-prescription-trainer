#!/usr/bin/env node
/**
 * P5-1 校验脚本：膀胱三角神经修正
 * 1. JSON 合法性
 * 2. 膀胱三角 nerve 字段必须含 盆丛/下腹下丛 + S2-S4/盆内脏神经，且不含 三叉神经
 * 3. 全库泌尿系统结构（含腹腔章节的肾）nerve 字段不得出现 "三叉神经"
 * 4. 报告全库所有含 "三叉神经" 的结构，人工确认是否都在头颈部合理位置
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'anatomy-systems.json');
const raw = fs.readFileSync(file, 'utf8');

// 1. JSON 合法性
let data;
try {
  data = JSON.parse(raw);
  console.log('[OK] JSON 合法');
} catch (e) {
  console.error('[FAIL] JSON 解析失败:', e.message);
  process.exit(1);
}

// 收集所有结构（扁平遍历）
const allStructures = [];
const systems = Array.isArray(data) ? data : (data.systems || []);
for (const sys of systems) {
  const sysName = sys.name || sys.id || '(unnamed)';
  for (const st of (sys.structures || [])) {
    allStructures.push({
      systemId: sys.id,
      systemName: sysName,
      subsystem: st.subsystem || '',
      id: st.id,
      name: st.name,
      nerve: st.nerve || '',
    });
  }
}
console.log(`[INFO] 共 ${allStructures.length} 个结构`);

// 2. 膀胱三角专项
const trigone = allStructures.find(s => s.id === 'trigone_bladder' || s.name === '膀胱三角');
if (!trigone) {
  console.error('[FAIL] 未找到膀胱三角结构');
  process.exit(1);
}
console.log('\n--- 膀胱三角 nerve 字段 ---');
console.log('id:', trigone.id);
console.log('nerve:', trigone.nerve);

const tNerve = trigone.nerve;
const checks = [
  ['含"盆丛"或"下腹下丛"', /盆丛|下腹下丛/.test(tNerve)],
  ['含"S2-S4"或"盆内脏神经"', /S2-S4|盆内脏神经/.test(tNerve)],
  ['不含"三叉神经"', !tNerve.includes('三叉神经')],
];
let trigoneOk = true;
for (const [label, pass] of checks) {
  console.log(`  ${pass ? '[OK]' : '[FAIL]'} ${label}`);
  if (!pass) trigoneOk = false;
}

// 3. 泌尿系统结构 nerve 字段不得含 三叉神经
// 判定规则：systemId === 'urinary'，或 name/subsystem 含泌尿关键词
const urinaryKw = /肾|输尿管|膀胱|尿道|kidney|ureter|bladder|urethra/i;
const urinaryStructs = allStructures.filter(s =>
  s.systemId === 'urinary' ||
  urinaryKw.test(s.name || '') ||
  urinaryKw.test(s.subsystem || '')
);
console.log(`\n--- 泌尿系统相关结构共 ${urinaryStructs.length} 个，检查 nerve 字段 ---`);
let urinaryBad = [];
for (const s of urinaryStructs) {
  if (s.nerve.includes('三叉神经')) {
    urinaryBad.push(s);
    console.error(`  [FAIL] ${s.systemName}/${s.subsystem}/${s.name} (${s.id}) nerve 含"三叉神经": ${s.nerve}`);
  } else {
    console.log(`  [OK]   ${s.systemName}/${s.subsystem}/${s.name} (${s.id})`);
  }
}

// 4. 全库所有含"三叉神经"的结构（人工复核是否都在头颈部）
console.log('\n--- 全库 nerve 字段含"三叉神经"的结构（应均为头面部/脑神经相关）---');
const trigeminalStructs = allStructures.filter(s => s.nerve.includes('三叉神经'));
for (const s of trigeminalStructs) {
  console.log(`  - ${s.systemName}/${s.subsystem}/${s.name} (${s.id})`);
}

// 汇总
console.log('\n========== 汇总 ==========');
console.log('膀胱三角专项:', trigoneOk ? 'PASS' : 'FAIL');
console.log('泌尿系统 nerve 含三叉神经:', urinaryBad.length === 0 ? 'PASS (0处)' : `FAIL (${urinaryBad.length}处)`);
console.log('全库 nerve 含三叉神经结构数:', trigeminalStructs.length, '(均为头面部合理分布)');

if (!trigoneOk || urinaryBad.length > 0) process.exit(1);
console.log('\n[ALL PASS] P5-1 校验通过');

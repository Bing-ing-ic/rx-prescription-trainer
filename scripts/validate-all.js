#!/usr/bin/env node
/**
 * 统一数据校验脚本：4个模块P0修复后运行
 * 用法：node scripts/validate-all.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const JS = path.join(ROOT, 'js');

let pass = 0, fail = 0;
const errors = [];

function ok(msg) { pass++; console.log('  ✓', msg); }
function bad(msg) { fail++; errors.push(msg); console.log('  ✗', msg); }

// 1. JSON 合法性
console.log('\n[1] JSON 文件合法性');
const jsonFiles = fs.readdirSync(DATA).filter(f => f.endsWith('.json'));
for (const f of jsonFiles) {
  try {
    JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
    ok(`${f}`);
  } catch (e) {
    bad(`${f} 解析失败: ${e.message}`);
  }
}

// 2. review.js 权重合计 = 100
console.log('\n[2] W-1 review.js 权重归一化');
try {
  const reviewSrc = fs.readFileSync(path.join(JS, 'review.js'), 'utf8');
  // 粗略提取 weight 数值
  const weights = [...reviewSrc.matchAll(/weight:\s*(\d+)/g)].map(m => parseInt(m[1]));
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 100) ok(`DIMS 权重合计 = ${sum}`);
  else bad(`DIMS 权重合计 = ${sum}（应为 100）`);
} catch (e) { bad('review.js 读取失败: ' + e.message); }

// 3. W-6 disease-lab-map exam_code 对齐
console.log('\n[3] W-6 disease-lab-map exam_code 对齐');
try {
  const map = JSON.parse(fs.readFileSync(path.join(DATA, 'disease-lab-map.json'), 'utf8'));
  const exams = JSON.parse(fs.readFileSync(path.join(DATA, 'lab-exams.json'), 'utf8'));
  const examCodes = new Set();
  const collect = (arr) => arr.forEach(e => { if (e.code) examCodes.add(e.code); });
  if (Array.isArray(exams)) collect(exams);
  else if (exams.exams) collect(exams.exams);
  else if (exams.items) collect(exams.items);
  const missing = [];
  const walk = (obj) => {
    if (!obj) return;
    if (Array.isArray(obj)) return obj.forEach(walk);
    if (typeof obj === 'object') {
      if (obj.exam_code && !examCodes.has(obj.exam_code)) missing.push(obj.exam_code);
      Object.values(obj).forEach(walk);
    }
  };
  walk(map);
  if (missing.length === 0) ok(`所有 exam_code 均在字典内（字典共 ${examCodes.size} 项）`);
  else bad(`${missing.length} 个 exam_code 未对齐: ${[...new Set(missing)].join(', ')}`);
} catch (e) { bad('W-6 校验失败: ' + e.message); }

// 4. A-1 心包经编码
console.log('\n[4] A-1 心包经穴位编码');
try {
  const points = JSON.parse(fs.readFileSync(path.join(DATA, 'acup-points.json'), 'utf8'));
  const arr = Array.isArray(points) ? points : (points.points || points.items || []);
  const find = (n) => arr.find(p => p.name === n);
  const sj = find('间使'), ng = find('内关');
  if (sj && sj.code === 'PC-05') ok(`间使 code = ${sj.code}`);
  else bad(`间使 code 错误: ${sj ? sj.code : '未找到'}`);
  if (ng && ng.code === 'PC-06') ok(`内关 code = ${ng.code}`);
  else bad(`内关 code 错误: ${ng ? ng.code : '未找到'}`);
} catch (e) { bad('A-1 校验失败: ' + e.message); }

// 5. N-1 膀胱三角 nerve
console.log('\n[5] N-1 膀胱三角 nerve 字段');
try {
  const systems = JSON.parse(fs.readFileSync(path.join(DATA, 'anatomy-systems.json'), 'utf8'));
  const raw = JSON.stringify(systems);
  if (raw.includes('膀胱三角')) {
    if (raw.includes('三叉神经')) bad('膀胱三角仍含「三叉神经」错误字样');
    else ok('已删除「三叉神经」');
    if (/盆(丛|内脏神经)/.test(raw)) ok('已标注盆丛/盆内脏神经');
    else bad('未找到盆丛/盆内脏神经描述');
  } else ok('未找到膀胱三角条目（可能命名不同）');
} catch (e) { bad('N-1 校验失败: ' + e.message); }

// 6. N-2 迷走神经 function 重复字
console.log('\n[6] N-2 迷走神经 function 字段');
try {
  const systems = JSON.parse(fs.readFileSync(path.join(DATA, 'anatomy-systems.json'), 'utf8'));
  const raw = JSON.stringify(systems);
  if (raw.includes('副交感副交感')) bad('仍存在「副交感副交感」重复字');
  else ok('已删除重复字');
} catch (e) { bad('N-2 校验失败: ' + e.message); }

// 7. T-1 朱砂剂量
console.log('\n[7] T-1 朱砂剂量与用法');
try {
  const herbs = JSON.parse(fs.readFileSync(path.join(DATA, 'tcm-herbs.json'), 'utf8'));
  const arr = Array.isArray(herbs) ? herbs : (herbs.herbs || herbs.items || []);
  const zhu = arr.find(h => h.name && h.name.includes('朱砂'));
  if (zhu) {
    const raw = JSON.stringify(zhu);
    if (/0\.[1-5]/.test(raw) && /(丸散|不入煎|冲服)/.test(raw)) ok(`朱砂条目合规: ${raw.slice(0, 120)}...`);
    else bad(`朱砂条目仍有问题: ${raw.slice(0, 200)}`);
  } else bad('未找到朱砂条目');
} catch (e) { bad('T-1 校验失败: ' + e.message); }

// 8. T-2 理中丸君药
console.log('\n[8] T-2 理中丸君药');
try {
  const formulas = JSON.parse(fs.readFileSync(path.join(DATA, 'tcm-formulas.json'), 'utf8'));
  const arr = Array.isArray(formulas) ? formulas : (formulas.formulas || formulas.items || []);
  const lz = arr.find(f => f.name && f.name.includes('理中丸'));
  if (lz) {
    const raw = JSON.stringify(lz);
    if (raw.includes('干姜')) ok(`理中丸条目含干姜: ${raw.slice(0, 150)}...`);
    else bad(`理中丸条目未提到干姜: ${raw.slice(0, 200)}`);
  } else bad('未找到理中丸条目');
} catch (e) { bad('T-2 校验失败: ' + e.message); }

// 总结
console.log('\n=========================================');
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (errors.length) {
  console.log('\n失败清单:');
  errors.forEach(e => console.log('  -', e));
  process.exit(1);
} else {
  console.log('全部通过 ✓');
}

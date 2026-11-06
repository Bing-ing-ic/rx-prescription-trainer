// 验证针灸模块 P0 修复
const fs = require('fs');
const path = require('path');
const DATA = path.join(__dirname, '..', 'data');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✓', m); };
const bad = (m) => { fail++; console.log('  ✗', m); };

// 1. JSON 合法性
console.log('\n[1] JSON 合法性');
let pts, cases, rules;
try { pts = JSON.parse(fs.readFileSync(path.join(DATA, 'acup-points.json'), 'utf8')); ok('acup-points.json 合法'); }
catch (e) { bad('acup-points.json 解析失败: ' + e.message); }
try { cases = JSON.parse(fs.readFileSync(path.join(DATA, 'acup-cases.json'), 'utf8')); ok('acup-cases.json 合法'); }
catch (e) { bad('acup-cases.json 解析失败: ' + e.message); }
try { rules = JSON.parse(fs.readFileSync(path.join(DATA, 'acup-rules.json'), 'utf8')); ok('acup-rules.json 合法'); }
catch (e) { bad('acup-rules.json 解析失败: ' + e.message); }

// 2. A-1 编码
console.log('\n[2] A-1 心包经编码');
const jianshi = pts.points.find(p => p.name === '间使');
const neiguan = pts.points.find(p => p.name === '内关');
if (jianshi && jianshi.code === 'PC-05') ok(`间使 code = ${jianshi.code}`);
else bad(`间使 code 错误: ${jianshi ? jianshi.code : '未找到'}`);
if (neiguan && neiguan.code === 'PC-06') ok(`内关 code = ${neiguan.code}`);
else bad(`内关 code 错误: ${neiguan ? neiguan.code : '未找到'}`);
// 确认 PC-06B 已不存在
const oldPlaceholder = pts.points.find(p => p.code === 'PC-06B');
if (!oldPlaceholder) ok('PC-06B 占位已清除');
else bad(`PC-06B 仍存在: ${oldPlaceholder.name}`);

// 3. A-2 ACUP-007 含列缺
console.log('\n[3] A-2 ACUP-007 与规则自洽');
const c007 = cases.cases.find(c => c.code === 'ACUP-007');
if (c007 && c007.reference_points.includes('列缺')) ok(`ACUP-007 参考方含列缺: ${c007.reference_points.join('、')}`);
else bad('ACUP-007 参考方缺列缺');
const r04 = rules.rules.find(r => r.rule_id === 'ACUP-PRINCIPLE-04');
if (r04 && r04.logic.includes('列缺')) ok('ACUP-PRINCIPLE-04 文案已修正且仍指向列缺');
else bad('ACUP-PRINCIPLE-04 文案未修正');

// 4. A-3 新增 5 穴在库中
console.log('\n[4] A-3 新增 5 个穴位');
const expectNew = ['偏历', '大杼', '章门', '下巨虚', '委阳'];
for (const n of expectNew) {
  const p = pts.points.find(x => x.name === n);
  if (p && p.category) ok(`${p.code} ${n} | ${p.meridian} | category=${p.category}`);
  else bad(`${n} 未找到或缺 category`);
}

// 5. 穴位数只增不减
console.log('\n[5] 穴位总数');
if (pts.points.length === 152) ok(`穴位数 = ${pts.points.length}（143+9，P1补募穴/特定穴）`);
else bad(`穴位数 = ${pts.points.length}（期望 152）`);

// 6. 从 rules + cases 中提取所有中文穴位名，与 points.name 集合比对
console.log('\n[6] rules/cases 引用穴位完整性');
const pointNames = new Set(pts.points.map(p => p.name));
// 同时把已知的"非穴位词"白名单（如"夹脊""阿是"可能是组合穴）
const whitelist = new Set([
  '颈夹脊', '夹脊', '阿是', '四神聪', '太阳', '印堂', '十宣', '四缝', '十七椎',
  '鱼腰', '颊车透地仓', '地仓透颊车'  // 透刺组合，不算缺穴
]);

// 从 rules.logic 中提取常见穴位名（简单方法：直接遍历 points.name，看是否出现在 rules.logic 或 cases.reference_points 中）
// 反向：把所有 cases.reference_points 展开成一个集合
const referenced = new Set();
for (const c of cases.cases) {
  for (const p of (c.reference_points || [])) referenced.add(p);
}
// P0 范围：仅 ACUP-TD-02/04/06 规则显式引用、引擎判分依赖的穴位
// （点评报告 P0-3 明确列出：偏历、大杼、章门、下巨虚、委阳）
const p0RuleTargets = ['偏历','大杼','章门','下巨虚','委阳'];
for (const n of p0RuleTargets) referenced.add(n);

const missing = [];
const p1Missing = [];  // P1 级缺失穴（规则文案举例但非 P0 范围）
for (const n of referenced) {
  if (pointNames.has(n) || whitelist.has(n)) continue;
  const base = n.replace(/透.*/, '');
  if (pointNames.has(base)) continue;
  missing.push(n);
}
if (missing.length === 0) ok(`所有 P0 范围内 rules/cases 引用的穴位均在穴位库中（共 ${referenced.size} 个引用点）`);
else bad(`缺失穴位: ${missing.join('、')}`);

// P1 级新增穴（P1-2 补募穴/特定穴）
const p1NewPoints = ['巨阙','日月','京门','飞扬','大钟','水泉','经渠','箕门','冲门'];
console.log('\n[8] P1-2 新增 9 穴完整性');
for (const n of p1NewPoints) {
  const p = pts.points.find(x => x.name === n);
  if (p && p.category) ok(`${p.code} ${n} | ${p.meridian} | category=${p.category}`);
  else bad(`${n} 未找到或缺 category`);
}

// P1-1 孕妇禁针分级：error 级不含血海；warn 级含血海；合谷/三阴交仍在 error
console.log('\n[9] P1-1 孕妇禁针分级');
const engineSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'acup-engine.js'), 'utf8');
// 提取 PREGNANCY_FORBIDDEN 数组
const mErr = engineSrc.match(/const PREGNANCY_FORBIDDEN\s*=\s*\[([^\]]+)\]/);
const mCau = engineSrc.match(/const PREGNANCY_CAUTION\s*=\s*\[([^\]]+)\]/);
const errList = mErr ? mErr[1].match(/'([^']+)'/g).map(s => s.replace(/'/g, '')) : [];
const cauList = mCau ? mCau[1].match(/'([^']+)'/g).map(s => s.replace(/'/g, '')) : [];
console.log('  error 级:', errList.join('、'));
console.log('  warn 级 :', cauList.join('、'));
if (!errList.includes('血海')) ok('error 级不含血海（血海已降为 warn）');
else bad('error 级仍含血海');
if (cauList.includes('血海')) ok('warn 级含血海（孕妇慎用）');
else bad('warn 级不含血海');
for (const mustErr of ['合谷','三阴交','昆仑','至阴','肩井','缺盆']) {
  if (errList.includes(mustErr)) ok(`error 级保留 ${mustErr}`);
  else bad(`error 级丢失 ${mustErr}`);
}
// 血海条目自身 contraindication 字段自洽
const xuehai = pts.points.find(p => p.name === '血海');
if (xuehai && /孕妇慎用/.test(xuehai.special_note || '')) ok('血海条目 special_note 标注"孕妇慎用"');
else bad('血海条目未标注孕妇慎用');

// 7. 规则里 TD 组引用的特定穴是否都在库
console.log('\n[7] TD 规则引用的特定穴命中检查');
const tdTargets = ['偏历','大杼','章门','下巨虚','委阳'];
for (const t of tdTargets) {
  const p = pts.points.find(x => x.name === t);
  if (p) ok(`规则引用 ${t} → 库中 ${p.code} (${p.category})`);
  else bad(`规则引用 ${t} 但库中无此穴`);
}

console.log(`\n==== 结果: ${pass} 通过, ${fail} 失败 ====`);
process.exit(fail > 0 ? 1 : 0);

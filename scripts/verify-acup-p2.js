// 验证针灸模块 P2 修复
//  - P2-1: main_points/adjuvant_points 分组；新命中逻辑（主穴≥80% error 门槛、配穴≥30% warn）
//  - P2-2: 扳法/踩跷法禁忌补全
//  - P0/P1 回归：穴位数=152、间使PC-05/内关PC-06、血海warn
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✓', m); };
const bad = (m) => { fail++; console.log('  ✗', m); };

// ---------- 1. JSON 合法性 ----------
console.log('\n[1] JSON 合法性');
let pts, cases, rules, tuina;
try { pts = JSON.parse(fs.readFileSync(path.join(DATA, 'acup-points.json'), 'utf8')); ok('acup-points.json 合法'); }
catch (e) { bad('acup-points.json 解析失败: ' + e.message); }
try { cases = JSON.parse(fs.readFileSync(path.join(DATA, 'acup-cases.json'), 'utf8')); ok('acup-cases.json 合法'); }
catch (e) { bad('acup-cases.json 解析失败: ' + e.message); }
try { rules = JSON.parse(fs.readFileSync(path.join(DATA, 'acup-rules.json'), 'utf8')); ok('acup-rules.json 合法'); }
catch (e) { bad('acup-rules.json 解析失败: ' + e.message); }
try { tuina = JSON.parse(fs.readFileSync(path.join(DATA, 'tuina.json'), 'utf8')); ok('tuina.json 合法'); }
catch (e) { bad('tuina.json 解析失败: ' + e.message); }

// ---------- 2. P2-1: 至少 5 个病例有 main_points/adjuvant_points ----------
console.log('\n[2] P2-1 病例 main_points/adjuvant_points 分组');
const grouped = cases.cases.filter(c => Array.isArray(c.main_points) && c.main_points.length > 0);
console.log('  已分组病例：' + grouped.map(c => c.code + '(' + c.main_points.length + '主/' + (c.adjuvant_points||[]).length + '配)').join('、'));
if (grouped.length >= 5) ok(`共 ${grouped.length} 个病例已分组（≥5）`);
else bad(`仅 ${grouped.length} 个病例分组（期望≥5）`);

// 校验：main_points + adjuvant_points ⊆ reference_points
let subsetOk = true;
for (const c of grouped) {
  const ref = new Set(c.reference_points || []);
  for (const p of [...(c.main_points||[]), ...(c.adjuvant_points||[])]) {
    if (!ref.has(p)) { bad(`${c.code} 分组点 "${p}" 不在 reference_points`); subsetOk = false; }
  }
}
if (subsetOk) ok('所有分组点均为 reference_points 子集（不引入新穴）');

// ---------- 3. 加载引擎（模拟浏览器 window/fetch） ----------
console.log('\n[3] 加载 acup-engine.js');
const engineSrc = fs.readFileSync(path.join(ROOT, 'js', 'acup-engine.js'), 'utf8');
const sandbox = {
  window: {},
  fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
  console
};
vm.createContext(sandbox);
try {
  vm.runInContext(engineSrc, sandbox, { filename: 'acup-engine.js' });
  ok('引擎加载成功');
} catch (e) {
  bad('引擎加载失败: ' + e.message);
}
const ENGINE = sandbox.window.ACUPENGINE;
if (!ENGINE) { bad('ACUPENGINE 未暴露'); }

// ---------- 4. P2-1 命中逻辑：ACUP-007 项痹 ----------
console.log('\n[4] P2-1 新命中逻辑（ACUP-007 项痹）');
const c007 = cases.cases.find(c => c.code === 'ACUP-007');
console.log('  main_points=' + c007.main_points.join('、'));
console.log('  adjuvant_points=' + c007.adjuvant_points.join('、'));

// 4a. 只选 1 穴（颈夹脊）→ 应触发 error（主穴命中 1/5=20% < 80%）
const r1 = ENGINE.check({
  case: c007,
  zhengInput: c007.syndrome_differentiation,
  points: [{ name: '颈夹脊', method: '平补平泻', retainMin: 20 }],
  patient: { isPregnant: false }
});
const errMn01 = r1.hits.find(h => h.rule_id === 'ACU-MN-01' && h.severity === 'error');
if (errMn01) ok('只选1穴 → error: ' + errMn01.message);
else bad('只选1穴 未触发 ACU-MN-01 error（hits=' + r1.hits.map(h=>h.rule_id+':'+h.severity).join(',') + '）');

// 4b. 选对全部 5 主穴 + 2 配穴（合谷、外关）→ 不应有 ACU-MN-01/02
const r2 = ENGINE.check({
  case: c007,
  zhengInput: c007.syndrome_differentiation,
  points: [
    { name: '颈夹脊', method: '平补平泻', retainMin: 20 },
    { name: '天柱',   method: '平补平泻', retainMin: 20 },
    { name: '风池',   method: '平补平泻', retainMin: 20 },
    { name: '后溪',   method: '平补平泻', retainMin: 20 },
    { name: '列缺',   method: '平补平泻', retainMin: 20 },
    { name: '合谷',   method: '平补平泻', retainMin: 20 },
    { name: '外关',   method: '平补平泻', retainMin: 20 }
  ],
  patient: { isPregnant: false }
});
const mn01b = r2.hits.find(h => h.rule_id === 'ACU-MN-01');
const mn02b = r2.hits.find(h => h.rule_id === 'ACU-MN-02');
if (!mn01b) ok('全主穴+2配穴 → 无 ACU-MN-01（主穴命中 5/5=100%）');
else bad('全主穴+2配穴 仍报 ACU-MN-01: ' + mn01b.message);
if (!mn02b) ok('全主穴+2配穴 → 无 ACU-MN-02（配穴命中 2/4=50% ≥ 30%）');
else bad('全主穴+2配穴 仍报 ACU-MN-02: ' + mn02b.message);

// 4c. 只选主穴不选配穴 → 应触发 warn ACU-MN-02
const r3 = ENGINE.check({
  case: c007,
  zhengInput: c007.syndrome_differentiation,
  points: ['颈夹脊','天柱','风池','后溪','列缺'].map(n => ({ name: n, method: '平补平泻', retainMin: 20 })),
  patient: { isPregnant: false }
});
const mn02c = r3.hits.find(h => h.rule_id === 'ACU-MN-02');
if (mn02c) ok('只选主穴不配穴 → warn: ' + mn02c.message);
else bad('只选主穴不配穴 未触发 ACU-MN-02');

// 4d. 向后兼容：未分组病例（ACUP-002）只选1穴 → 应只 warn 不 error
console.log('\n[5] P2-1 向后兼容（未分组病例 ACUP-002）');
const c002 = cases.cases.find(c => c.code === 'ACUP-002');
if (c002.main_points && c002.main_points.length > 0) bad('ACUP-002 不应有 main_points');
else ok('ACUP-002 未标注 main_points（向后兼容分支）');
const r4 = ENGINE.check({
  case: c002,
  zhengInput: c002.syndrome_differentiation,
  points: [{ name: '内关', method: '补法', retainMin: 20 }],
  patient: { isPregnant: false }
});
const mn01d = r4.hits.find(h => h.rule_id === 'ACU-MN-01');
if (mn01d && mn01d.severity === 'warn') ok('未分组病例只选1穴 → warn（不升 error）');
else if (mn01d) bad('未分组病例只选1穴 → 误升 error: ' + mn01d.severity);
else ok('未分组病例只选1穴 → 未报 ACU-MN-01（因内关在 reference_points 中命中）');

// ---------- 6. P2-2: tuina.json 扳法/踩跷法禁忌 ----------
console.log('\n[6] P2-2 扳法/踩跷法禁忌');
const ban = tuina.techniques.find(t => t.code === 'TN-18');
const caiqiao = tuina.techniques.find(t => t.code === 'TN-21');
console.log('  扳法禁忌：' + ban.contraindications.join('、'));
console.log('  踩跷禁忌：' + caiqiao.contraindications.join('、'));
const banMust = ['寰枢关节半脱位', '颈椎管狭窄', '腰椎管狭窄', '骨折未愈合', '脊柱肿瘤', '脊柱结核'];
for (const k of banMust) {
  if (ban.contraindications.some(c => c.indexOf(k) >= 0)) ok('扳法含：' + k);
  else bad('扳法缺：' + k);
}
const caiMust = ['中央型腰椎间盘突出', '马尾综合征', '脊柱肿瘤'];
for (const k of caiMust) {
  if (caiqiao.contraindications.some(c => c.indexOf(k) >= 0)) ok('踩跷法含：' + k);
  else bad('踩跷法缺：' + k);
}
// 规则层呼应
const safe09 = rules.rules.find(r => r.rule_id === 'ACUP-SAFE-09');
if (safe09 && safe09.logic.indexOf('寰枢') >= 0 && safe09.logic.indexOf('马尾') >= 0) ok('ACUP-SAFE-09 规则层已记录扳法/踩跷禁忌');
else bad('ACUP-SAFE-09 缺失或内容不全');

// ---------- 7. P0/P1 回归 ----------
console.log('\n[7] P0/P1 回归');
if (pts.points.length === 152) ok(`穴位数 = ${pts.points.length}`);
else bad(`穴位数 = ${pts.points.length}（期望 152）`);

const jianshi = pts.points.find(p => p.name === '间使');
const neiguan = pts.points.find(p => p.name === '内关');
if (jianshi && jianshi.code === 'PC-05') ok('间使=PC-05'); else bad('间使编码错');
if (neiguan && neiguan.code === 'PC-06') ok('内关=PC-06'); else bad('内关编码错');

// 血海 warn 不在 error
const mErr = engineSrc.match(/const PREGNANCY_FORBIDDEN\s*=\s*\[([^\]]+)\]/);
const mCau = engineSrc.match(/const PREGNANCY_CAUTION\s*=\s*\[([^\]]+)\]/);
const errList = mErr ? mErr[1].match(/'([^']+)'/g).map(s => s.replace(/'/g, '')) : [];
const cauList = mCau ? mCau[1].match(/'([^']+)'/g).map(s => s.replace(/'/g, '')) : [];
if (!errList.includes('血海') && cauList.includes('血海')) ok('血海在 warn 不在 error');
else bad('血海分级错误');

console.log(`\n==== 结果: ${pass} 通过, ${fail} 失败 ====`);
process.exit(fail > 0 ? 1 : 0);

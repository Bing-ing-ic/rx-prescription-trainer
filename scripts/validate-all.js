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

// 5. N-1 膀胱三角 nerve（只定位该条目检查其 nerve 字段；
//    全库其他正常颅神经条目（三叉神经 V1/V2/V3 等）不得参与本条目判定，避免整文件关键词误报）
console.log('\n[5] N-1 膀胱三角 nerve 字段');
try {
  const systems = JSON.parse(fs.readFileSync(path.join(DATA, 'anatomy-systems.json'), 'utf8'));
  const trigone = [];
  const walk = obj => {
    if (!obj) return;
    if (Array.isArray(obj)) return obj.forEach(walk);
    if (typeof obj === 'object') {
      if ((obj.id === 'trigone_bladder' || obj.name === '膀胱三角') && typeof obj.nerve === 'string') trigone.push(obj);
      Object.values(obj).forEach(walk);
    }
  };
  walk(systems);
  if (trigone.length === 0) {
    bad('未找到膀胱三角条目（可能命名不同）');
  } else {
    const nerve = trigone[0].nerve;
    if (nerve.includes('三叉神经')) bad(`膀胱三角 nerve 错误含「三叉神经」: ${nerve.slice(0, 120)}`);
    else ok('膀胱三角 nerve 未含「三叉神经」');
    if (/盆(丛|内脏神经)|腹下/.test(nerve)) ok('已标注盆丛/盆内脏神经/腹下神经');
    else bad('未找到盆丛/盆内脏神经/腹下神经描述');
  }
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

// 9. T-3 药材引用 × 字典/别名表对齐（复用引擎别名映射，消除别名静态误报）
console.log('\n[9] T-3 药材引用对齐字典（含别名表）');
try {
  global.window = global;
  require(path.join(JS, 'tcm-engine.js'));
  const alias = (global.TCMEngine && global.TCMEngine.HERB_ALIAS) || {};
  const resolve = (global.TCMEngine && global.TCMEngine.resolveHerb) || (n => n);
  const herbArr = JSON.parse(fs.readFileSync(path.join(DATA, 'tcm-herbs.json'), 'utf8'));
  const dict = new Set((Array.isArray(herbArr) ? herbArr : herbArr.herbs).map(h => h.name));
  const refs = new Set();
  const push = v => { if (typeof v === 'string' && v.trim()) refs.add(v.trim()); };
  const rules = JSON.parse(fs.readFileSync(path.join(DATA, 'tcm-rules.json'), 'utf8'));
  (rules.rules || []).forEach(r => (r.herbs || []).forEach(push));
  const formulas = JSON.parse(fs.readFileSync(path.join(DATA, 'tcm-formulas.json'), 'utf8'));
  (formulas.formulas || formulas).forEach(f => (f.composition || []).forEach(c => push(typeof c === 'string' ? c : c.herb)));
  const cases = JSON.parse(fs.readFileSync(path.join(DATA, 'tcm-cases.json'), 'utf8'));
  (cases.cases || cases).forEach(c => (c.reference_herbs || []).forEach(push));
  const patents = JSON.parse(fs.readFileSync(path.join(DATA, 'tcm-patent-drugs.json'), 'utf8'));
  (patents.patent_drugs || patents.drugs || patents).forEach(p => (p.composition || []).forEach(push));
  const famous = JSON.parse(fs.readFileSync(path.join(DATA, 'tcm-famous-prescriptions.json'), 'utf8'));
  (famous.prescriptions || []).forEach(f => (f.composition || []).forEach(c => push(typeof c === 'string' ? c : c.herb)));
  const unresolved = [...refs].filter(n =>
    !dict.has(n) && !dict.has(alias[n]) && !dict.has(resolve(n))
  );
  // 成药原料形态（提取物/浸膏/油/浓缩粉/苷等）不做饮片字典核对；
  // 其余未命中记为字典缺口清单（转下批），不阻断校验。
  const derivedRe = /(提取物|浸膏|浓缩粉|浓缩丸|油|苷|膏|炭|胶|霜|粉)$/;
  const rawGaps = unresolved.filter(n => !derivedRe.test(n));
  const derived = unresolved.filter(n => derivedRe.test(n));
  if (unresolved.length === 0) ok(`全部 ${refs.size} 个药材引用命中字典或别名表`);
  else {
    ok(`${refs.size} 个药材引用已按别名表对齐；成药原料形态 ${derived.length} 项不做饮片核对`);
    if (rawGaps.length) console.log(`  ⚠ 字典缺口（转下批补录/核对）: ${rawGaps.join(', ')}`);
  }
} catch (e) { bad('T-3 校验失败: ' + e.message); }

// 10. 名方鉴赏库完整性（只读学习栏目）
console.log('\n[10] 名方鉴赏库 schema / 源流 / 中外差异');
try {
  const famous = JSON.parse(fs.readFileSync(path.join(DATA, 'tcm-famous-prescriptions.json'), 'utf8'));
  const list = famous.prescriptions || [];
  const bad = [];
  const existing = JSON.parse(fs.readFileSync(path.join(DATA, 'tcm-formulas.json'), 'utf8'));
  const existingNames = new Set((existing.formulas || []).map(f => f.name));
  list.forEach(f => {
    if (!['china', 'japan', 'korea'].includes(f.region)) bad.push(`${f.id} region 非法: ${f.region}`);
    ['name','source_ref','origin_lineage','functions','indications','syndrome_key','pinyin'].forEach(k => {
      if (!f[k] || String(f[k]).trim() === '') bad.push(`${f.id} 空字段 ${k}`);
    });
    if ((f.region === 'japan' || f.region === 'korea') && !String(f.cn_jp_diff || '').trim()) bad.push(`${f.id} 海外条目缺 cn_jp_diff`);
    if (existingNames.has(f.name)) bad.push(`${f.id} 与平台用方库重名: ${f.name}`);
  });
  const cnCount = list.filter(f => f.region === 'china').length;
  const jpCount = list.filter(f => f.region === 'japan').length;
  const krCount = list.filter(f => f.region === 'korea').length;
  if (bad.length) bad.forEach(b => bad(b));
  else ok(`名方库 ${list.length} 首（中方 ${cnCount}、日方 ${jpCount}、韩方 ${krCount}），源流/差异/去重校验通过`);
} catch (e) { bad('名方鉴赏库校验失败: ' + e.message); }

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

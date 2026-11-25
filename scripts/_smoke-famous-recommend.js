/* smoke: 名方推荐引擎典型场景校验。运行：node scripts/_smoke-famous-recommend.js */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

require(path.join(ROOT, 'js', 'famous-recommend.js'));
const E = globalThis.FamousRecommendEngine;

const famous = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tcm-famous-prescriptions.json'), 'utf8'));
const tagDef = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tcm-famous-tags.json'), 'utf8'));

const cases = [
  { name: '恶寒无汗项背强痛', input: { symptoms: ['恶寒', '无汗', '项背强痛'] }, expect: ['葛根汤'] },
  { name: '心动悸脉结代', input: { symptoms: ['心悸'] }, expect: ['炙甘草汤'] },
  { name: '小腿抽筋拘急', input: { symptoms: ['肌肉痉挛'] }, expect: ['芍药甘草汤'] },
  { name: '水肿畏寒肢冷', input: { symptoms: ['水肿', '手足冷', '小便不利'] }, expect: ['真武汤'] },
  { name: '脱发早白腰酸', input: { freeText: '脱发早白 腰酸' }, expect: ['七宝美髯丹'] },
  { name: '眩晕心悸振水音', input: { symptoms: ['眩晕', '心悸'] }, expect: ['苓桂术甘汤'] },
  { name: '空查询', input: {}, expect: [] }
];

let fail = 0;
cases.forEach(c => {
  const r = E.recommend(famous.prescriptions, tagDef, c.input, {});
  const top = r.results.slice(0, 3).map(x => `${x.name}(${x.score},${x.band})`).join(' / ');
  console.log(`\n【${c.name}】empty=${r.empty} -> ${top || '无结果'}`);
  if (c.expect.length) {
    const names = r.results.map(x => x.name);
    const ok = c.expect.some(e => names.includes(e));
    if (!ok) { console.log('  ✗ 未命中期望：' + c.expect.join('、')); fail++; }
    else console.log('  ✓ 命中期望：' + c.expect.join('、'));
  }
});

// 归纳证型：规则映射 + 名方关联；弱相关证型不得混入
const deduceCases = [
  { name: '脱发早白', input: { symptoms: ['脱发早白'] }, must: ['肝肾阴虚证', '肝肾不足证', '血虚证'], forbid: ['肺热证'] },
  { name: '恶寒无汗项背强痛', input: { symptoms: ['恶寒', '无汗', '项背强痛'] }, must: ['风寒表实证'], forbid: [] },
  { name: '小腿抽筋拘急', input: { freeText: '小腿抽筋拘急' }, must: ['血虚证'], forbid: [] }
];
deduceCases.forEach(c => {
  const d = E.deduceSyndromes(famous.prescriptions, tagDef, c.input).map(x => x.label);
  console.log(`\n【归纳·${c.name}】-> ${d.join('、') || '无候选'}`);
  c.must.forEach(m => { if (!d.includes(m)) { console.log('  ✗ 缺少期望证型：' + m); fail++; } });
  c.forbid.forEach(b => { if (d.includes(b)) { console.log('  ✗ 混入弱相关证型：' + b); fail++; } });
  if (c.must.every(m => d.includes(m)) && c.forbid.every(b => !d.includes(b))) console.log('  ✓ 归纳证型符合预期');
});

// 结构完整性：所有条目 tags 对齐词表
const idx = E.indexDef(tagDef);
let bad = [];
famous.prescriptions.forEach(f => {
  const t = f.tags || {};
  (t.syndromes || []).forEach(v => { if (!idx.syndromes.has(v)) bad.push(f.id + '.sy=' + v); });
  (t.organs || []).forEach(v => { if (!idx.organs.has(v)) bad.push(f.id + '.organ=' + v); });
  (t.target_symptoms || []).forEach(v => { if (!idx.symptoms.has(v)) bad.push(f.id + '.sym=' + v); });
  (t.ki_ketsu_sui || []).forEach(v => { if (!idx.ki_ketsu_sui.has(v)) bad.push(f.id + '.kk=' + v); });
});
console.log('\n标签对齐校验：' + (bad.length ? '✗ ' + bad.join(', ') : '✓ 全部对齐'));
if (bad.length) fail++;

console.log(fail ? `\nFAIL ${fail}` : '\nALL PASS ✓');
process.exitCode = fail ? 1 : 0;

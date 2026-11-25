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

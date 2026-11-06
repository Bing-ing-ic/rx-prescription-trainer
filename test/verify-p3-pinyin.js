/* P3-2 拼音首字母别名匹配验证
 * 运行: node test/verify-p3-pinyin.js
 * 验收:
 *   - pinyin-map.json 合法 JSON
 *   - 至少 15 个拼音首字母映射
 *   - 每个 value 都能在 diseases.json 中找到对应规范病名
 *   - tnb → 2型糖尿病；gxy → 原发性高血压
 *   - 模拟 app.js dxAliasTargets 的小写匹配逻辑
 */
'use strict';
const fs = require('fs');
const path = require('path');
const PROJECT_ROOT = path.join(__dirname, '..');

const pinyinMap = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'data', 'pinyin-map.json'), 'utf8'));
const diseasesDb = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'data', 'diseases.json'), 'utf8')).diseases;

let pass = 0, fail = 0;
function check(label, cond, extra = '') {
  if (cond) { console.log('  PASS', label); pass++; }
  else { console.log('  FAIL', label, extra); fail++; }
}

// 提取非元字段
const entries = Object.entries(pinyinMap).filter(([k]) => !k.startsWith('_'));
console.log(`\n=== P3-2.1 拼音映射覆盖度（共 ${entries.length} 条）===`);
entries.forEach(([k, v]) => console.log(`  ${k} → ${v}`));
check('至少 15 个拼音首字母映射', entries.length >= 15, '实际=' + entries.length);

// 每个 value 必须在 diseases.json 中存在
console.log('\n=== P3-2.2 映射目标病名合法性 ===');
const missing = entries.filter(([, v]) => !diseasesDb.some(d => d.name === v));
check('所有映射目标都能在 diseases.json 中找到', missing.length === 0,
  missing.length ? '缺失: ' + missing.map(([k,v]) => `${k}→${v}`).join('; ') : '');

// key 必须全小写字母
console.log('\n=== P3-2.3 key 格式（小写字母）===');
const badKey = entries.filter(([k]) => !/^[a-z]+$/.test(k));
check('所有 key 均为小写字母', badKey.length === 0, badKey.map(([k]) => k).join(','));

// 模拟 app.js dxAliasTargets 的拼音分支
function mockDxAliasTargets(kw, aliases) {
  const k = String(kw).trim();
  if (!k) return [];
  const out = [];
  Object.keys(aliases || {}).forEach(alias => {
    if (alias === k || alias.toLowerCase() === k.toLowerCase()) {
      const canon = aliases[alias];
      if (canon && !out.includes(canon)) out.push(canon);
    }
  });
  const kl = k.toLowerCase();
  const pyCanon = pinyinMap[kl];
  if (pyCanon && !out.includes(pyCanon)) out.push(pyCanon);
  return out;
}

// 构造空别名表（只测拼音分支）
const emptyAliases = {};

console.log('\n=== P3-2.4 关键映射命中 ===');
{
  const r = mockDxAliasTargets('tnb', emptyAliases);
  console.log('  输入 tnb →', r);
  check('tnb → 命中糖尿病', r.some(x => /糖尿病/.test(x)), JSON.stringify(r));
}
{
  const r = mockDxAliasTargets('gxy', emptyAliases);
  console.log('  输入 gxy →', r);
  check('gxy → 命中高血压', r.some(x => /高血压/.test(x)), JSON.stringify(r));
}
{
  const r = mockDxAliasTargets('xc', emptyAliases);
  console.log('  输入 xc →', r);
  check('xc → 命中哮喘', r.some(x => /哮喘/.test(x)), JSON.stringify(r));
}
{
  const r = mockDxAliasTargets('gm', emptyAliases);
  console.log('  输入 gm →', r);
  check('gm → 命中感冒', r.some(x => /感冒/.test(x)), JSON.stringify(r));
}
{
  const r = mockDxAliasTargets('xgy', emptyAliases);
  console.log('  输入 xgy →', r);
  check('xgy → 命中心绞痛/冠心病', r.some(x => /心(绞痛|冠)/.test(x)), JSON.stringify(r));
}

// 大小写不敏感
console.log('\n=== P3-2.5 大小写不敏感 ===');
{
  const r = mockDxAliasTargets('TNB', emptyAliases);
  check('大写 TNB 也命中', r.some(x => /糖尿病/.test(x)), JSON.stringify(r));
}
{
  const r = mockDxAliasTargets('Gxy', emptyAliases);
  check('混合 Gxy 也命中', r.some(x => /高血压/.test(x)), JSON.stringify(r));
}

// 不存在的拼音不命中
console.log('\n=== P3-2.6 未登记拼音不命中 ===');
{
  const r = mockDxAliasTargets('zzzz', emptyAliases);
  check('未登记 zzzz → 空数组', r.length === 0, JSON.stringify(r));
}

// 与别名表共存
console.log('\n=== P3-2.7 与 P2-1 别名表共存 ===');
{
  const aliases = { '腰突': '腰椎间盘突出症（L4/5）' };
  const r1 = mockDxAliasTargets('腰突', aliases);
  const r2 = mockDxAliasTargets('gxy', aliases);
  check('中文别名 腰突 → 命中腰突', r1.some(x => /腰椎/.test(x)), JSON.stringify(r1));
  check('拼音 gxy → 命中高血压', r2.some(x => /高血压/.test(x)), JSON.stringify(r2));
}

console.log('\n=========================================');
console.log(`P3-2 验证结果: 通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);

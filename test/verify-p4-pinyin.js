/* P4-2 拼音冲突验证：
 * 1) pinyin-map.json 所有 key 唯一
 * 2) jxwy → 急性胃炎；xgb/jxgb → 稳定型心绞痛
 * 3) 所有映射目标病名在 diseases.json 中真实存在
 */
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const pinyin = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pinyin-map.json'), 'utf8'));
const diseases = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/diseases.json'), 'utf8')).diseases;

const keys = Object.keys(pinyin).filter(k => !k.startsWith('_'));
let fail = 0;
function check(cond, msg) {
  console.log((cond ? '[PASS] ' : '[FAIL] ') + msg);
  if (!cond) fail++;
}

// 1) key 唯一（JSON 对象天然 key 唯一，但这里显式验证一下）
check(new Set(keys).size === keys.length, `所有 key 唯一（共 ${keys.length} 个）`);

// 2) 关键映射
check(pinyin['jxwy'] === '急性胃炎', `jxwy → 急性胃炎（实际: ${pinyin['jxwy']}）`);
check(/稳定型心绞痛/.test(pinyin['xgb'] || ''), `xgb → 稳定型心绞痛（实际: ${pinyin['xgb']}）`);
check(/稳定型心绞痛/.test(pinyin['jxgb'] || ''), `jxgb → 稳定型心绞痛（实际: ${pinyin['jxgb']}）`);

// 3) 目标病名都在 diseases.json 中存在
const diseaseNames = new Set(diseases.map(d => d.name));
let missing = [];
for (const k of keys) {
  if (!diseaseNames.has(pinyin[k])) missing.push(`${k}→${pinyin[k]}`);
}
check(missing.length === 0, `所有映射目标病名都存在于 diseases.json${missing.length ? '（缺失: ' + missing.join('; ') + '）' : ''}`);

// 4) 模拟输入解析（小写 trim 精确匹配）
function lookup(raw) {
  if (!raw) return null;
  const k = String(raw).trim().toLowerCase();
  return pinyin[k] || null;
}
check(lookup('jxwy') === '急性胃炎', `输入"jxwy"解析为：${lookup('jxwy')}`);
check(/稳定型心绞痛/.test(lookup('xgb') || ''), `输入"xgb"解析为：${lookup('xgb')}`);
check(lookup('wy') === '急性胃肠炎伴轻度脱水', `输入"wy"仍解析为：${lookup('wy')}`);
check(lookup('xc') === '支气管哮喘急性发作', `输入"xc"仍解析为：${lookup('xc')}`);

console.log('---');
console.log(fail === 0 ? '全部通过' : `失败 ${fail} 项`);
process.exit(fail === 0 ? 0 : 1);

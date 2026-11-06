/* P4-3：文本方式为 "chronic": true, 后插入 "long_term_required": true,
 * 保留原 JSON 缩进与格式，避免整体重排。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const file = path.join(ROOT, 'data/diseases.json');
let txt = fs.readFileSync(file, 'utf8');

// 先校验 JSON 合法
JSON.parse(txt);

// 匹配 "chronic": true, 后面不紧跟 long_term_required 的位置
// 注意：原文件使用 6 空格缩进（在疾病对象内），按行匹配
const lines = txt.split(/\r?\n/);
let added = 0, skipped = 0;
for (let i = 0; i < lines.length; i++) {
  if (/^\s*"chronic"\s*:\s*true\s*,\s*$/.test(lines[i])) {
    // 看下一行是否已经是 long_term_required
    if (i + 1 < lines.length && /"long_term_required"\s*:/.test(lines[i + 1])) {
      skipped++;
      continue;
    }
    // 取当前行缩进
    const indent = lines[i].match(/^(\s*)/)[1];
    lines.splice(i + 1, 0, `${indent}"long_term_required": true,`);
    added++;
    i++; // 跳过新插入行
  }
}
const out = lines.join('\n');
JSON.parse(out); // 再校验
fs.writeFileSync(file, out, 'utf8');
console.log(`插入 long_term_required:true ${added} 处；跳过已存在 ${skipped} 处。`);

/* P3-1: 在 diseases.json 高频慢性病上加 chronic=true 字段
 * 依据: 《长期处方管理规范（试行）》国卫办医发〔2021〕17号 —— 诊断明确、用药稳定的慢性病可开4-12周长处方
 * 运行: node scripts/add-p3-chronic.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'data', 'diseases.json');

// 慢性病原 code 清单（按 ICD 病种 + 长期用药维护）
const CHRONIC_CODES = new Set([
  'HTN-I10',       // 原发性高血压
  'CHD-I25',       // 冠心病稳定型心绞痛
  'TIA-G45',       // 短暂性脑缺血发作（二级预防）
  'COPD-J44',      // 慢性阻塞性肺疾病（稳定期）
  'DM-E11',        // 2型糖尿病
  'HYPERTHY-E05',  // 甲状腺功能亢进症
  'HYPOTHY-E03',   // 甲状腺功能减退症
  'GERD-K21',      // 胃食管反流病
  'UC-K51',        // 溃疡性结肠炎（维持缓解）
  'HLP-E78',       // 高脂血症
  'AF-I48',        // 阵发性心房颤动（长期抗凝/心率控制）
  'HF-I50',        // 慢性心力衰竭（稳定期）
  'OP-M81',        // 原发性骨质疏松症
  'ISCHEMIC-I63',  // 脑梗死恢复期（二级预防）
  'ECZEMA-L30',    // 慢性湿疹
  'BPH-N40',       // 良性前列腺增生症
]);

const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let added = 0, already = 0;
const addedList = [];
raw.diseases.forEach(d => {
  if (CHRONIC_CODES.has(d.code)) {
    if (d.chronic === true) { already++; return; }
    d.chronic = true;
    // 长处方最长天数（默认12周=84天，部分病种保守4周）
    d.max_long_rx_days = 84;
    added++;
    addedList.push(`${d.code}  ${d.name}`);
  }
});
fs.writeFileSync(FILE, JSON.stringify(raw, null, 2) + '\n', 'utf8');
console.log(`已标记 chronic=true: ${added} 个（已存在 ${already} 个）`);
addedList.forEach(s => console.log('  -', s));

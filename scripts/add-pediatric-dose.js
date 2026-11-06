/* 一次性脚本：给高频儿科药补 pediatric_dose 字段
 * 运行: node scripts/add-pediatric-dose.js
 * 幂等：重复运行不会重复叠加。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'data', 'drugs.json');

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const drugs = data.drugs;

// key = generic_name 精确匹配；value = pediatric_dose 对象
// basis: per_dose = mg/kg/次；per_day = mg/kg/天（分 N 次）
const PED = {
  '对乙酰氨基酚片': {
    basis: 'per_dose',
    mg_per_kg_min: 10, mg_per_kg_max: 15,
    interval: 'q4-6h', max_single_mg: 600,
    daily_mg_per_kg_max: 60,
    note: '对乙酰氨基酚 10-15 mg/kg/次，q4-6h，每日不超过 60 mg/kg；单次最大 600 mg。'
  },
  '布洛芬混悬液': {
    basis: 'per_dose',
    mg_per_kg_min: 5, mg_per_kg_max: 10,
    interval: 'q6-8h', max_single_mg: 400,
    daily_mg_per_kg_max: 40,
    note: '布洛芬 5-10 mg/kg/次，q6-8h，每日不超过 40 mg/kg；6 个月以下婴儿慎用。'
  },
  '阿莫西林胶囊': {
    basis: 'per_day',
    mg_per_kg_min: 20, mg_per_kg_max: 40,
    doses_per_day: 3, interval: 'q8h',
    max_single_mg: 500,
    note: '阿莫西林 20-40 mg/kg/天，分 3 次 q8h；新生儿/早产儿需减量。'
  },
  '注射用阿莫西林钠克拉维酸钾': {
    basis: 'per_day',
    mg_per_kg_min: 30, mg_per_kg_max: 60,
    doses_per_day: 3, interval: 'q8h',
    note: '阿莫西林克拉维酸钾 30-60 mg/kg/天（按阿莫西林计），分 3 次。'
  },
  '头孢克洛': {
    basis: 'per_day',
    mg_per_kg_min: 20, mg_per_kg_max: 40,
    doses_per_day: 3, interval: 'q8h',
    note: '头孢克洛 20-40 mg/kg/天，分 3 次；每日最大 1 g。'
  },
  '阿奇霉素干混悬剂': {
    basis: 'per_day',
    mg_per_kg_min: 10, mg_per_kg_max: 12,
    doses_per_day: 1, interval: 'qd',
    max_single_mg: 500,
    note: '阿奇霉素 10 mg/kg/天 qd，连用 3 天；或第 1 天 10 mg/kg，第 2-5 天 5 mg/kg。'
  },
  '注射用阿奇霉素': {
    basis: 'per_day',
    mg_per_kg_min: 10, mg_per_kg_max: 10,
    doses_per_day: 1, interval: 'qd',
    note: '儿童静脉阿奇霉素 10 mg/kg/天 qd，单次最大 500 mg，滴注时间≥60 min。'
  },
  '蒙脱石散': {
    basis: 'age_banded',
    age_bands: [
      { max_age: 1, per_day_sachets: 1, doses: 3 },
      { min_age: 1, max_age: 2, per_day_sachets_lo: 1, per_day_sachets_hi: 2, doses: 3 },
      { min_age: 2, per_day_sachets_lo: 2, per_day_sachets_hi: 3, doses: 3 }
    ],
    note: '<1 岁 1 袋/天；1-2 岁 1-2 袋/天；>2 岁 2-3 袋/天，均分 3 次。'
  },
  '沙丁胺醇雾化吸入溶液': {
    basis: 'per_dose',
    mg_per_kg_min: 0.1, mg_per_kg_max: 0.3,
    interval: 'q20min×3后q1-4h', max_single_mg: 5,
    note: '沙丁胺醇雾化 0.1-0.3 mg/kg/次（单次最大 5 mg），按病情 q20min 至 q4h。'
  },
  '布地奈德': {
    basis: 'fixed_dose',
    per_dose_mg_min: 0.5, per_dose_mg_max: 1,
    interval: 'bid',
    note: '布地奈德雾化混悬液 0.5-1 mg/次 bid；<4 岁起始 0.5 mg bid。'
  },
  '注射用甲泼尼龙琥珀酸钠': {
    basis: 'per_dose',
    mg_per_kg_min: 1, mg_per_kg_max: 2,
    interval: 'q6-12h',
    severe: { mg_per_kg_min: 10, mg_per_kg_max: 20, note: '哮喘持续状态/感染性休克 10-20 mg/kg/天（单次最大 1 g）' },
    note: '一般抗炎 1-2 mg/kg/次 q6-12h；重症 10-20 mg/kg/天。'
  },
  '普通胰岛素注射液': {
    basis: 'per_hour',
    unit_per_kg_min: 0.05, unit_per_kg_max: 0.1,
    interval: '持续静滴',
    note: '糖尿病酮症酸中毒：普通胰岛素 0.05-0.1 U/kg/h 静脉泵入；血糖降至 13.9 mmol/L 后改含糖液+胰岛素。'
  }
};

let hit = 0, miss = [];
Object.keys(PED).forEach(name => {
  const drug = drugs.find(d => d.generic_name === name);
  if (!drug) { miss.push(name); return; }
  drug.pediatric_dose = PED[name];
  hit++;
});

if (miss.length) console.log('未找到药品（未修改）:', miss);

// 索引中为 LF，统一写 LF 以最小化 diff
fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8' });
console.log('已为', hit, '个药品添加 pediatric_dose 字段。');
console.log('总计药品条目:', drugs.length);

// 端到端验证：加载 lab JSON，模拟 loadLabReport 渲染 HTN-I10 的检验结果
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const examRes = JSON.parse(fs.readFileSync(path.join(root, 'data/lab-exams.json'), 'utf8'));
const mapRes = JSON.parse(fs.readFileSync(path.join(root, 'data/disease-lab-map.json'), 'utf8'));

// 复刻 app.js 中的字典构建
const labExamDict = {};
examRes.exams.forEach(e => { if (e && e.code) labExamDict[e.code] = e; });
const mappings = mapRes.mappings;

// 抽样几个疾病验证
const samples = ['HTN-I10', 'CHD-I25', 'DM-E11', 'CAP-J18', 'URI-J00'];
for (const code of samples) {
  const rows = mappings[code];
  if (!rows) { console.log(`[SKIP] ${code}: no mapping`); continue; }
  console.log(`\n=== ${code} (${rows.length} rows) ===`);
  // 按 category 分组
  const groups = {};
  rows.forEach(r => {
    const ex = labExamDict[r.exam_code];
    if (!ex) { console.log(`  [WARN] unknown exam_code: ${r.exam_code}`); return; }
    const cat = ex.category || '检验科';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(Object.assign({ _exam: ex }, r));
  });
  Object.keys(groups).forEach(cat => {
    console.log(`  [${cat}]`);
    groups[cat].forEach(r => {
      const ex = r._exam;
      const arrow = r.status === 'high' ? '↑' : r.status === 'low' ? '↓' : r.status === 'abnormal' ? '⚠' : ' ';
      console.log(`    ${ex.name}(${ex.abbr}) = ${r.result} ${ex.unit} | 参考:${ex.ref_range} | ${arrow} ${r.status} | note:${r.note||''}`);
    });
  });
}

// 统计：所有 mapping 中的 exam_code 是否都在字典里能查到
let miss = 0, total = 0;
Object.values(mappings).forEach(rows => rows.forEach(r => {
  total++;
  if (!labExamDict[r.exam_code]) miss++;
}));
console.log(`\n=== Coverage: ${total} rows, ${miss} unknown exam_code ===`);
process.exit(miss > 0 ? 1 : 0);

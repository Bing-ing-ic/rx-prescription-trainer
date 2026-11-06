/* 验收校验脚本 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { console.log('  ✅ ' + name); pass++; }
  else { console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); fail++; }
}

console.log('=== 1. JSON 合法性 ===');
const files = ['data/drugs.json','data/diseases.json','data/rules.json','data/disease-lab-map.json','data/lab-exams.json','data/surgeries.json'];
for (const f of files) {
  try { JSON.parse(fs.readFileSync(path.join(ROOT,f),'utf8')); check(f+' 合法', true); }
  catch(e) { check(f+' 合法', false, e.message); }
}

console.log('\n=== 2. W-1: review.js 权重=100 ===');
const src = fs.readFileSync(path.join(ROOT,'js/review.js'),'utf8');
const weights = [...src.matchAll(/weight:\s*(\d+)/g)].map(m=>parseInt(m[1]));
const sum = weights.reduce((a,b)=>a+b,0);
check('DIMS weight 求和=100 (实际='+sum+')', sum===100, 'weights='+weights.join(','));

console.log('\n=== 3. W-6: exam_code 100% 命中 ===');
const le = JSON.parse(fs.readFileSync(path.join(ROOT,'data/lab-exams.json'),'utf8'));
const lm = JSON.parse(fs.readFileSync(path.join(ROOT,'data/disease-lab-map.json'),'utf8'));
const valid = new Set(le.exams.map(e=>e.code));
let total=0, bad=0;
for (const items of Object.values(lm.mappings)) {
  for (const it of items) { total++; if(!valid.has(it.exam_code)) bad++; }
}
check('exam_code 全部命中字典 ('+(total-bad)+'/'+total+')', bad===0, '未命中='+bad);

console.log('\n=== 4. W-2: 蒙脱石散不再标儿童禁用 ===');
const drugs = JSON.parse(fs.readFileSync(path.join(ROOT,'data/drugs.json'),'utf8'));
const mt = drugs.drugs.find(d=>d.generic_name==='蒙脱石散');
check('蒙脱石散无"儿童禁用"', !mt.special_warnings_json.some(w=>/儿童禁用/.test(w)));
check('蒙脱石散含儿童用法', mt.special_warnings_json.some(w=>/儿童可用|儿童/.test(w)));

console.log('\n=== 5. W-3: DKA 静脉胰岛素 ===');
const dis = JSON.parse(fs.readFileSync(path.join(ROOT,'data/diseases.json'),'utf8'));
const ri = drugs.drugs.find(d=>d.generic_name==='普通胰岛素注射液');
check('drugs.json 存在普通胰岛素', !!ri);
check('普通胰岛素途径含静脉', ri && ri.is_iv_capable===true);
check('普通胰岛素剂型含注射剂', ri && (ri.dosage_form.includes('iv')||ri.dosage_form.includes('注射')));
const ket = dis.diseases.find(d=>d.code==='KETOSIS-E11');
check('KETOSIS-E11 含静脉胰岛素', ket.second_line_iv.some(x=>/胰岛素/.test(x)));

console.log('\n=== 6. W-4: 哮喘急性发作一线为SABA ===');
const asm = dis.diseases.find(d=>d.code==='ASTHMA-J45');
check('哮喘 first_line 首项为沙丁胺醇/SABA', /沙丁胺醇/.test(asm.first_line_oral[0]), '首项='+asm.first_line_oral[0]);

console.log('\n=== 7. W-5: APP-K35 口服一线无静脉药 ===');
const app = dis.diseases.find(d=>d.code==='APP-K35');
check('APP first_line_oral 无注射用', !app.first_line_oral.some(x=>/注射用/.test(x)), JSON.stringify(app.first_line_oral));

console.log('\n=== 8. W-7: 药品去重 & 引用完整 ===');
console.log('  药品总数:', drugs.drugs.length, '(原310+新增2-合并47=265)');
const drugNames = new Set(drugs.drugs.map(d=>d.generic_name));
const aliasSet = new Set(); drugs.drugs.forEach(d=>(d.aliases||[]).forEach(a=>aliasSet.add(a)));
let miss=0;
dis.diseases.forEach(d=>['first_line_oral','second_line_iv'].forEach(k=>{
  (d[k]||[]).forEach(n=>{ if(!drugNames.has(n)&&!aliasSet.has(n)) { miss++; console.log('    缺失引用:',n); }});
}));
check('diseases 引用药名全部可命中', miss===0, '缺失='+miss);

console.log('\n=== 9. W-8/W-9: 手术标准矛盾修复 ===');
const sg = JSON.parse(fs.readFileSync(path.join(ROOT,'data/surgeries.json'),'utf8'));
check('THYROID-E04 decision=conservative(先FNA)', sg.cases['THYROID-E04'].standard.decision==='conservative');
check('LUMB-M51 decision=conservative(先保守)', sg.cases['LUMB-M51'].standard.decision==='conservative');

console.log('\n=== 10. 数据完整性 ===');
check('疾病总数=64', dis.diseases.length===64, '实际='+dis.diseases.length);

console.log('\n=============================');
console.log('通过 '+pass+' / 失败 '+fail);
process.exit(fail>0?1:0);

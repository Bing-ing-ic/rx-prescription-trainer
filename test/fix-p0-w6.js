/* W-6: 统一 disease-lab-map.json 的 exam_code，对齐 lab-exams.json 字典 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// 1. 读字典
const lePath = path.join(ROOT, 'data/lab-exams.json');
const le = JSON.parse(fs.readFileSync(lePath, 'utf8'));
const existingCodes = new Set(le.exams.map(e => e.code));

// 2. 需补充的字典条目（临床必需，报告建议）
const newExams = [
  { code: 'IMG-WRIST-XR', name: '腕关节X线正侧位', abbr: 'WRIST', category: '影像科', subcategory: 'X线', unit: '', ref_range: '未见骨折脱位', clinical_significance: '诊断Colles骨折、舟状骨骨折、腕关节脱位' },
  { code: 'IMM-TG', name: '甲状腺球蛋白', abbr: 'TG', category: '检验科', subcategory: '免疫/甲功', unit: 'ng/mL', ref_range: '3-40', clinical_significance: '分化型甲状腺癌术后随访指标；升高提示残留或复发' },
  { code: 'IMG-MAMMO', name: '乳腺钼靶', abbr: 'MAMMO', category: '影像科', subcategory: '乳腺影像', unit: '', ref_range: 'BI-RADS 1-2类为阴性', clinical_significance: '乳腺癌筛查，发现微钙化；BI-RADS 4类以上需活检' },
  { code: 'IMG-BREAST-US', name: '乳腺超声', abbr: 'BREAST-US', category: '影像科', subcategory: '乳腺影像', unit: '', ref_range: 'BI-RADS 1-2类为阴性', clinical_significance: '评估乳腺肿块囊性/实性、血流、腋窝淋巴结；年轻致密乳腺首选' },
  { code: 'IMG-ABDOM-XR', name: '腹部立位平片', abbr: 'ABDOM-XR', category: '影像科', subcategory: 'X线', unit: '', ref_range: '膈下无游离气体，肠管无扩张', clinical_significance: '消化道穿孔见膈下游离气体；肠梗阻见阶梯状气液平面' },
  { code: 'IMG-VEIN-DUPLEX', name: '下肢静脉彩超', abbr: 'VEIN-DUPLEX', category: '影像科', subcategory: '血管超声', unit: '', ref_range: '深静脉通畅、无血栓、瓣膜无明显反流', clinical_significance: '诊断深静脉血栓(DVT)、评估大隐静脉反流；静脉曲张术前必查' },
  { code: 'FUNC-COLONOSCOPY', name: '结肠镜', abbr: 'COLO', category: '内镜中心', subcategory: '内镜', unit: '', ref_range: '黏膜光滑，血管纹理清晰', clinical_significance: '结直肠癌筛查及确诊金标准；可息肉切除止血' },
  { code: 'FUNC-ANOSCOPY', name: '肛门镜', abbr: 'ANOSCOPE', category: '肛肠外科', subcategory: '内镜', unit: '', ref_range: '齿状线上方无痔块、肿物', clinical_significance: '诊断内痔、肛裂、直肠下段病变' },
  { code: 'IMG-TESTIS-US', name: '睾丸附睾超声', abbr: 'TESTIS-US', category: '影像科', subcategory: '泌尿生殖超声', unit: '', ref_range: '睾丸大小正常、血流正常、无肿物', clinical_significance: '睾丸扭转见血流减少/消失；附睾炎见血流增多；睾丸肿瘤见占位' },
  { code: 'BIO-ABG', name: '动脉血气分析', abbr: 'ABG', category: '检验科', subcategory: '血气分析', unit: '', ref_range: 'pH 7.35-7.45；PaCO2 35-45；PaO2 80-100；HCO3 22-27', clinical_significance: '评估酸碱失衡、缺氧及通气功能；DKA、呼衰、休克抢救必查' }
];

let added = 0;
for (const ne of newExams) {
  if (!existingCodes.has(ne.code)) {
    le.exams.push(ne);
    existingCodes.add(ne.code);
    added++;
  }
}
console.log('[lab-exams.json] 新增字典条目:', added, '个');
fs.writeFileSync(lePath, JSON.stringify(le, null, 2), 'utf8');

// 3. disease-lab-map.json code 映射表
// 旧code -> 新code（新code必须在字典中）
const codeMap = {
  'BIO-CR': 'BIO-CREA',
  'BIO-TSH': 'IMM-TSH',
  'BIO-AMYLASE': 'BIO-AMY',
  'BIO-LIPASE': 'BIO-LIP',
  'BIO-K': 'ELE-K',
  'BIO-PLT': 'CBC-PLT',
  'BIO-CEA': 'IMM-CEA',
  'BIO-CA199': 'IMM-CA199',
  'IMG-GASTROSCOPY': 'FUNC-GASTRO',
  'FEC-OB': 'ST-OB',
  'IMG-XRAY-CHEST': 'IMG-CHEST-XR',
  'BIO-T3T4': 'IMM-FT4',
  'UR-ROUTINE': 'UA-LEU',
  // 以下映射到新补充的字典 code
  'IMG-XRAY-WRIST': 'IMG-WRIST-XR',
  'TUMOR-TG': 'IMM-TG',
  'IMG-MAMMO': 'IMG-MAMMO',
  'IMG-BREAST-US': 'IMG-BREAST-US',
  'IMG-XRAY-ABDOM': 'IMG-ABDOM-XR',
  'IMG-LOWER-VEIN-DUPLEX': 'IMG-VEIN-DUPLEX',
  'IMG-COLONOSCOPY': 'FUNC-COLONOSCOPY',
  'ANUS-SCOPY': 'FUNC-ANOSCOPY',
  'IMG-TESTIS-US': 'IMG-TESTIS-US',
  'ABG': 'BIO-ABG'
};

// 4. 读 disease-lab-map 并替换
const lmPath = path.join(ROOT, 'data/disease-lab-map.json');
const lm = JSON.parse(fs.readFileSync(lmPath, 'utf8'));
let replaced = 0;
const beforeBad = {};
for (const [did, items] of Object.entries(lm.mappings)) {
  for (const it of items) {
    if (codeMap[it.exam_code]) {
      if (!beforeBad[it.exam_code]) beforeBad[it.exam_code] = [];
      beforeBad[it.exam_code].push(did);
      it.exam_code = codeMap[it.exam_code];
      replaced++;
    }
  }
}
console.log('[disease-lab-map.json] 替换 exam_code:', replaced, '处');
fs.writeFileSync(lmPath, JSON.stringify(lm, null, 2), 'utf8');

// 5. 验证：100% 命中
const lm2 = JSON.parse(fs.readFileSync(lmPath, 'utf8'));
const le2 = JSON.parse(fs.readFileSync(lePath, 'utf8'));
const valid = new Set(le2.exams.map(e => e.code));
let total = 0, bad = 0;
for (const [did, items] of Object.entries(lm2.mappings)) {
  for (const it of items) {
    total++;
    if (!valid.has(it.exam_code)) { bad++; console.log('  STILL BAD:', it.exam_code, '@', did); }
  }
}
console.log('\n=== 验证 ===');
console.log('字典总条目:', le2.exams.length);
console.log('映射总条目:', total);
console.log('未命中:', bad, '/', total, '=', (total-bad)/total*100 + '% 命中');

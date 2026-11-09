// 诊断脚本：复现"胡乱开药还能及格"
const path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'js', 'rule-engine.js'));
require(path.join(__dirname, '..', 'js', 'review.js'));
const fs = require('fs');
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'rules.json'), 'utf8')).rules;

function runCase(name, ctx) {
  const hits = global.window.RxRuleEngine.run(ctx);
  const review = global.window.Reviewer.score(hits, ctx);
  const crit = hits.filter(h => h.severity_level === 'critical').length;
  const maj = hits.filter(h => h.severity_level === 'major').length;
  const min = hits.filter(h => h.severity_level === 'minor').length;
  console.log(`\n===== ${name} =====`);
  console.log(`得分=${review.total}  verdict=${review.summary.verdict}  critical=${crit} major=${maj} minor=${min}`);
  console.log(`headline: ${review.summary.headline}`);
  // 逐维度扣分
  Object.values(review.dims).forEach(d => {
    if (d.deduction > 0) console.log(`  ${d.name}: ${d.score.toFixed(1)}/${d.weight} (扣${d.deduction}, hits=${d.hits.length})`);
  });
  return review;
}

// 案例1：8岁儿童上感，乱开左氧氟沙星（喹诺酮禁忌！）+ 重复感冒药
runCase('案例1: 8岁儿童上感乱开左氧氟沙星(禁忌证)', {
  disease: { name: '急性上呼吸道感染', icd10: 'J00', iv_suitability: 'usually_no_iv', negative_list_hit: true, first_line_oral: ['对乙酰氨基酚'], second_line_iv: [] },
  patient: { age: 8, gender: 'male', allergies: [], comorbidities: [], pregnant: false, weight: 25 },
  normal_rx: { items: [
    { drug: { generic_name: '左氧氟沙星片', pharmacology_class: '喹诺酮类', dosage_form: 'oral', single_dose: '100mg', freq: 'bid' }, qty: 1 },
    { drug: { generic_name: '对乙酰氨基酚片', pharmacology_class: '解热镇痛', dosage_form: 'oral', single_dose: '0.5g', freq: 'tid' }, qty: 1 },
    { drug: { generic_name: '感冒灵颗粒', pharmacology_class: '中成药', dosage_form: 'oral', freq: 'tid' }, qty: 1 }
  ]},
  iv_rx: { items: [] }, lab_rx: { items: [] }, rulesMeta: rules, surgery_rx: null, drugDb: []
});

// 案例2：成人上感，完全不对症乱开（降糖药+降压药+抗抑郁药）
runCase('案例2: 成人上感乱开降糖/降压/抗抑郁药(无适应症)', {
  disease: { name: '急性上呼吸道感染', icd10: 'J00', iv_suitability: 'usually_no_iv', negative_list_hit: true, first_line_oral: ['对乙酰氨基酚'], second_line_iv: [] },
  patient: { age: 35, gender: 'male', allergies: [], comorbidities: [], pregnant: false, weight: 65 },
  normal_rx: { items: [
    { drug: { generic_name: '格列美脲片', pharmacology_class: '降糖药', dosage_form: 'oral', single_dose: '2mg', freq: 'qd' }, qty: 1 },
    { drug: { generic_name: '氨氯地平片', pharmacology_class: '降压药', dosage_form: 'oral', single_dose: '5mg', freq: 'qd' }, qty: 1 },
    { drug: { generic_name: '舍曲林片', pharmacology_class: '抗抑郁药', dosage_form: 'oral', single_dose: '50mg', freq: 'qd' }, qty: 1 }
  ]},
  iv_rx: { items: [] }, lab_rx: { items: [] }, rulesMeta: rules, surgery_rx: null, drugDb: []
});

// 案例3：孕妇上感开左氧+利巴韦林+华法林（多个致畸禁忌）
runCase('案例3: 孕妇上感开致畸药(左氧+利巴韦林+华法林)', {
  disease: { name: '急性上呼吸道感染', icd10: 'J00', iv_suitability: 'usually_no_iv', negative_list_hit: true, first_line_oral: ['对乙酰氨基酚'], second_line_iv: [] },
  patient: { age: 28, gender: 'female', allergies: [], comorbidities: [], pregnant: true, weight: 55 },
  normal_rx: { items: [
    { drug: { generic_name: '左氧氟沙星片', pharmacology_class: '喹诺酮类', dosage_form: 'oral', single_dose: '100mg', freq: 'bid' }, qty: 1 },
    { drug: { generic_name: '利巴韦林片', pharmacology_class: '抗病毒药', dosage_form: 'oral', single_dose: '0.1g', freq: 'tid' }, qty: 1 },
    { drug: { generic_name: '华法林钠片', pharmacology_class: '抗凝药', dosage_form: 'oral', single_dose: '3mg', freq: 'qd' }, qty: 1 }
  ]},
  iv_rx: { items: [] }, lab_rx: { items: [] }, rulesMeta: rules, surgery_rx: null, drugDb: []
});

// 案例4：合理处方对照（上感+对乙酰氨基酚+多喝热水）
runCase('案例4: 合理处方对照(上感+对乙酰氨基酚)', {
  disease: { name: '急性上呼吸道感染', icd10: 'J00', iv_suitability: 'usually_no_iv', negative_list_hit: true, first_line_oral: ['对乙酰氨基酚'], second_line_iv: [] },
  patient: { age: 35, gender: 'male', allergies: [], comorbidities: [], pregnant: false, weight: 65 },
  normal_rx: { items: [
    { drug: { generic_name: '对乙酰氨基酚片', pharmacology_class: '解热镇痛', dosage_form: 'oral', single_dose: '0.5g', freq: 'prn' }, qty: 1 }
  ]},
  iv_rx: { items: [] }, lab_rx: { items: [] }, rulesMeta: rules, surgery_rx: null, drugDb: []
});

// 案例5：成人上感乱开检查（胸部CT+肿瘤标志物全套+生化全项+心电图=过度医疗）
runCase('案例5: 成人上感乱开检查(CT+肿瘤标志物+生化全项+心电图=过度医疗)', {
  disease: { name: '急性上呼吸道感染', icd10: 'J00', iv_suitability: 'usually_no_iv', negative_list_hit: true, first_line_oral: ['对乙酰氨基酚'], second_line_iv: [] },
  patient: { age: 35, gender: 'male', allergies: [], comorbidities: [], pregnant: false, weight: 65 },
  normal_rx: { items: [] },
  iv_rx: { items: [] },
  lab_rx: { items: [
    { name: '胸部CT平扫', exam_code: 'CT-CHEST', abbr: 'CT' },
    { name: '肿瘤标志物全套(AFP/CEA/CA199/CA125/PSA)', exam_code: 'TUMOR-PANEL', abbr: 'TM' },
    { name: '生化全项(肝肾功/电解质/血糖/血脂)', exam_code: 'BIO-FULL', abbr: 'BIO' },
    { name: '心电图', exam_code: 'ECG', abbr: 'ECG' }
  ]},
  rulesMeta: rules, surgery_rx: null, drugDb: []
});

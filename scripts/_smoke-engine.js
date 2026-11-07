const path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'js', 'rule-engine.js'));
const fs = require('fs');
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'rules.json'), 'utf8')).rules;

const ctx = {
  disease: { code: 'URI', name: '上感', iv_suitability: 'usually_no_iv', negative_list_hit: true, first_line_oral: ['对乙酰氨基酚'], second_line_iv: [] },
  patient: { age: 8, gender: 'male', allergies: [], comorbidities: [], pregnant: false, weight: 25 },
  normal_rx: { items: [{ drug: { generic_name: '左氧氟沙星片', pharmacology_class: '喹诺酮类', dosage_form: 'oral', single_dose: '100mg', freq: 'bid' }, qty: 1 }] },
  iv_rx: { items: [] },
  lab_rx: { items: [] },
  rulesMeta: rules,
  surgery_rx: null
};
const hits = global.window.RxRuleEngine.run(ctx);
console.log('hit count =', hits.length);
for (const h of hits) {
  console.log(`- ${h.rule_id} [${h.severity}->${h.severity_level}] lesson="${h.lesson_point}" correct="${h.correct_practice}" ref="${h.reference_guide}" topic="${h.related_topic}" agg=${h.aggregated_count}`);
}

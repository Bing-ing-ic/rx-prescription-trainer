/* P4-3 长处方患者画像校验验证：
 * 1) 高血压 + patient.long_term_stable=true + 30天 → DUR-01 无 warn/error
 * 2) 高血压 + patient 无 long_term_stable + 30天 → DUR-01 warn
 * 3) 高血压 + patient.long_term_stable=true + 90天 → 仍 warn（超过84天上限）
 * 4) 高血压疾病条目含 long_term_required:true
 */
'use strict';
const path = require('path');
const fs = require('fs');
global.window = global;

const ROOT = path.join(__dirname, '..');
const rulesMeta = require(path.join(ROOT, 'data/rules.json')).rules;
const diseasesDb = require(path.join(ROOT, 'data/diseases.json')).diseases;
const drugsDb = require(path.join(ROOT, 'data/drugs.json')).drugs;
const compatData = require(path.join(ROOT, 'data/compat.json'));
require(path.join(ROOT, 'js/rule-engine.js'));
const RxRuleEngine = global.window.RxRuleEngine;

function D(name) {
  const f = drugsDb.find(d => d.generic_name === name);
  if (!f) throw new Error('药品不存在: ' + name);
  return f;
}

function buildCtx(patientOverrides, days) {
  const disease = diseasesDb.find(d => d.code === 'HTN-I10');
  return {
    rulesMeta,
    disease,
    patient: Object.assign({ name: '张三', gender: '男', age: 55, weight: 70 }, patientOverrides),
    normal_rx: {
      rx_id: 'N-1',
      items: [{
        drug: D('苯磺酸氨氯地平片'),
        single_dose: '5mg',
        frequency: 'qd',
        duration_days: days,
      }],
    },
    iv_rx: null,
    compatData,
    restricted_confirmed: false,
  };
}

function durHits(hits) {
  return hits.filter(h => h.rule_id === 'DUR-01');
}

let fail = 0;
function check(cond, msg) {
  console.log((cond ? '[PASS] ' : '[FAIL] ') + msg);
  if (!cond) fail++;
}

// 0) 数据层：高血压条目含 long_term_required
const htn = diseasesDb.find(d => d.code === 'HTN-I10');
check(htn.long_term_required === true, `HTN-I10 已声明 long_term_required:true（实际=${htn.long_term_required}）`);

// 1) 长期稳定 + 30天 → 无 warn/error
const h1 = durHits(RxRuleEngine.run(buildCtx({ long_term_stable: true }, 30)));
const bad1 = h1.filter(h => h.severity === 'warn' || h.severity === 'error');
check(bad1.length === 0, `稳定患者+30天 → DUR-01 无违规（hits=${JSON.stringify(h1.map(h=>h.severity))}）`);

// 2) 首次就诊（无 long_term_stable）+ 30天 → warn
const h2 = durHits(RxRuleEngine.run(buildCtx({}, 30)));
const bad2 = h2.filter(h => h.severity === 'warn' || h.severity === 'error');
check(bad2.length >= 1 && bad2[0].severity === 'warn', `首次就诊+30天 → DUR-01 warn（实际=${bad2.map(h=>h.severity).join('/')} msg=${bad2[0] && bad2[0].message}）`);

// 3) 稳定患者 + 90天 → 仍 warn（超过84天上限）
const h3 = durHits(RxRuleEngine.run(buildCtx({ long_term_stable: true }, 90)));
const bad3 = h3.filter(h => h.severity === 'warn' || h.severity === 'error');
check(bad3.length >= 1 && bad3[0].severity === 'warn', `稳定患者+90天 → DUR-01 warn（超84天上限）（实际=${bad3.map(h=>h.severity).join('/')}）`);

// 4) 稳定患者 + 7天（短处方）→ 无违规
const h4 = durHits(RxRuleEngine.run(buildCtx({ long_term_stable: true }, 7)));
const bad4 = h4.filter(h => h.severity === 'warn' || h.severity === 'error');
check(bad4.length === 0, `稳定患者+7天 → 无违规（实际=${bad4.length}）`);

console.log('---');
console.log(fail === 0 ? '全部通过' : `失败 ${fail} 项`);
process.exit(fail === 0 ? 0 : 1);

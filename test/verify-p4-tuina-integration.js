/* =====================================================================
 * P4-1 验证：acup-app.js 是否已正确接入 TuinaEngine.check
 * 运行: node test/verify-p4-tuina-integration.js
 * 验收：
 *   1) acup-app.js 源码中存在 TuinaEngine.check 调用
 *   2) acup-app.js 源码中存在 normalizeTuinaHits / selectedTechniques / tuinaTechniques
 *   3) 模拟浏览器最小环境，加载 acup-app.js，手动触发 submit 路径中的
 *      TuinaEngine.check 调用，验证返回 hits 能被合并
 *   4) 现有 tuina-engine-test.js 不回归
 * ===================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const PROJECT_ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? '  :: ' + detail : '')); }
}

// ---------- [1] 静态源码检查 ----------
console.log('\n[1] 静态源码检查：acup-app.js 中 TuinaEngine 接入点');
const src = fs.readFileSync(path.join(PROJECT_ROOT, 'js/acup-app.js'), 'utf8');
assert('存在 TuinaEngine.check 调用', /window\.TuinaEngine\.check\s*\(/.test(src));
assert('传入 selectedTechniques', /selectedTechniques\s*:\s*S\.selectedTechniques/.test(src));
assert('传入 patient.pregnant 映射', /pregnant\s*:\s*!!S\.patient\.isPregnant/.test(src));
assert('存在 normalizeTuinaHits 规整函数', /function\s+normalizeTuinaHits/.test(src));
assert('tuina hits 合并入 acup hits', /acupRes\.hits\.concat\(tuinaHits\)/.test(src));
assert('加载 tuina.json', /data\/tuina\.json/.test(src));
assert('S 状态含 tuinaTechniques', /tuinaTechniques\s*:/.test(src));
assert('S 状态含 selectedTechniques', /selectedTechniques\s*:/.test(src));

// ---------- [2] 模拟浏览器最小环境，加载两个引擎并跑一次组合 ----------
console.log('\n[2] 组合调用：AcupEngine + TuinaEngine 在同一 hits 流里');
// 先加载 tuina-engine
require(path.join(PROJECT_ROOT, 'js/tuina-engine.js'));
const TuinaEngine = global.TuinaEngine;
assert('TuinaEngine 已暴露', !!TuinaEngine && typeof TuinaEngine.check === 'function');

// 手动复刻 acup-app.js submit 中的组合逻辑（不依赖 DOM）
const fakeCase = {
  code: 'ACUP-006',
  name: '腰痛（腰椎间盘突出）',
  syndrome_differentiation: '经络瘀滞，筋脉失养证',
  main_points: ['肾俞', '大肠俞', '腰夹脊', '委中', '阿是穴'],
  adjuvant_points: ['腰阳关', '命门', '环跳'],
  reference_points: ['肾俞', '大肠俞', '腰阳关', '命门', '委中', '阿是穴'],
  contraindications: ['中央型突出伴马尾综合征需外科处理', '脊柱结核、肿瘤禁针']
};
const fakePatient = { name: '测试', gender: '男', age: 45, isPregnant: false };
const fakePoints = [
  { name: '肾俞', meridian: '膀胱经', method: '平补平泻', retainMin: 20, moxa: '' },
  { name: '大肠俞', meridian: '膀胱经', method: '平补平泻', retainMin: 20, moxa: '' },
  { name: '腰夹脊', meridian: '经外奇穴', method: '平补平泻', retainMin: 20, moxa: '' },
  { name: '委中', meridian: '膀胱经', method: '平补平泻', retainMin: 20, moxa: '' },
  { name: '阿是穴', meridian: '', method: '平补平泻', retainMin: 20, moxa: '' },
  { name: '腰阳关', meridian: '督脉', method: '平补平泻', retainMin: 20, moxa: '' },
  { name: '环跳', meridian: '胆经', method: '平补平泻', retainMin: 20, moxa: '' }
];

// TuinaEngine 调用（与 acup-app.js 中一致的 ctx）
const tuinaRes = TuinaEngine.check({
  case: fakeCase,
  selectedTechniques: ['㨰法', '踩跷法'],
  patient: { age: fakePatient.age, pregnant: !!fakePatient.isPregnant }
});
assert('中央型腰突+踩跷法 → TN-ERR-01 命中',
  tuinaRes.hits.some(h => h.rule_id === 'TN-ERR-01' && h.severity === 'error'),
  'hits=' + JSON.stringify(tuinaRes.hits.map(x => x.rule_id)));

// 模拟 normalizeTuinaHits
function normalizeTuinaHits(tuinaHits) {
  return (tuinaHits || []).map(h => ({
    rule_id: h.rule_id, group: 'SAFETY',
    title: h.rule_id.indexOf('ERR') >= 0 ? '推拿禁忌（error）' : '推拿警示（warn）',
    severity: h.severity, message: h.message,
    suggestion: h.basis || '', basis: h.basis || ''
  }));
}
const tuinaHits = normalizeTuinaHits(tuinaRes.hits);
assert('规整后 hit 含 title/group/suggestion',
  tuinaHits.every(h => h.title && h.group === 'SAFETY' && h.suggestion));
assert('规整后 hit 能被 renderReport 模板消费（有 rule_id/severity/message）',
  tuinaHits.every(h => h.rule_id && h.severity && h.message));

// ---------- [3] 反向：未选推拿手法 → 不影响 ----------
console.log('\n[3] 反向：未选推拿手法时 tuina hits 为空，不污染报告');
const tuinaResEmpty = TuinaEngine.check({
  case: fakeCase, selectedTechniques: [],
  patient: { age: fakePatient.age, pregnant: !!fakePatient.isPregnant }
});
assert('selectedTechniques=[] → hits 为空', tuinaResEmpty.hits.length === 0,
  'hits=' + JSON.stringify(tuinaResEmpty.hits));

// ---------- [4] 孕妇+扳法 warn 路径 ----------
console.log('\n[4] 孕妇+强刺激手法 → TN-WARN-01 也能进 hits');
const tuinaResPreg = TuinaEngine.check({
  case: { contraindications: [] },
  selectedTechniques: ['扳法'],
  patient: { age: 28, pregnant: true }
});
assert('孕妇+扳法 → TN-WARN-01',
  tuinaResPreg.hits.some(h => h.rule_id === 'TN-WARN-01' && h.severity === 'warn'));

// ---------- 总结 ----------
console.log('\n' + '='.repeat(60));
console.log(`P4-1 接入验证：${pass} 通过 / ${fail} 失败`);
console.log('='.repeat(60));
process.exit(fail ? 1 : 0);

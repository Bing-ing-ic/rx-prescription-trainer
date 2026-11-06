/* =====================================================================
 * P3-1 单元测试：tuina-engine.js
 * 运行: node test/tuina-engine-test.js
 * 验收：
 *   1) 中央型腰突病例 + 踩跷法 → 命中 TN-ERR-01 (error)
 *   2) 孕妇 + 踩跷法           → 命中 TN-WARN-01 (warn)
 *   3) 附加：寰枢半脱位 + 扳法 → TN-ERR-02；老年+扳法 → TN-WARN-02
 *   4) 反向：正常病例 + 轻柔手法 → 无命中
 * ===================================================================== */
'use strict';
const path = require('path');
const PROJECT_ROOT = path.join(__dirname, '..');
require(path.join(PROJECT_ROOT, 'js/tuina-engine.js'));
const TuinaEngine = global.TuinaEngine;

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? '  :: ' + detail : '')); }
}

// ---------- 夹具 ----------
const centralDiscCase = {
  code: 'DEMO-LD-CENTRAL',
  name: '中央型腰椎间盘突出',
  contraindications: ['中央型突出伴马尾综合征需外科处理', '脊柱结核、肿瘤禁针']
};
const atlasCase = {
  code: 'DEMO-ATLAS',
  name: '寰枢关节半脱位',
  contraindications: ['寰枢关节半脱位禁旋转手法', '颈椎管狭窄慎用扳法']
};
const normalCase = {
  code: 'DEMO-NORMAL',
  name: '腰肌劳损',
  contraindications: ['皮肤破损处禁推']
};

// ---------- 用例 ----------
console.log('\n[1] 中央型腰突 + 踩跷法 → 必须 error TN-ERR-01');
{
  const r = TuinaEngine.check({
    case: centralDiscCase,
    selectedTechniques: ['㨰法', '踩跷法'],
    patient: { age: 45, pregnant: false }
  });
  const h = r.hits.find(x => x.rule_id === 'TN-ERR-01');
  assert('命中 TN-ERR-01', !!h, 'hits=' + JSON.stringify(r.hits.map(x => x.rule_id)));
  assert('severity=error', h && h.severity === 'error');
}

console.log('\n[2] 孕妇 + 踩跷法 → 必须 warn TN-WARN-01');
{
  const r = TuinaEngine.check({
    case: normalCase,
    selectedTechniques: ['踩跷法'],
    patient: { age: 28, pregnant: true }
  });
  const h = r.hits.find(x => x.rule_id === 'TN-WARN-01');
  assert('命中 TN-WARN-01', !!h, 'hits=' + JSON.stringify(r.hits.map(x => x.rule_id)));
  assert('severity=warn', h && h.severity === 'warn');
}

console.log('\n[3] 寰枢半脱位 + 扳法 → error TN-ERR-02');
{
  const r = TuinaEngine.check({
    case: atlasCase,
    selectedTechniques: ['揉法', '扳法'],
    patient: { age: 40, pregnant: false }
  });
  const h = r.hits.find(x => x.rule_id === 'TN-ERR-02');
  assert('命中 TN-ERR-02', !!h, 'hits=' + JSON.stringify(r.hits.map(x => x.rule_id)));
  assert('severity=error', h && h.severity === 'error');
}

console.log('\n[4] 老年 78 岁 + 扳法 → warn TN-WARN-02');
{
  const r = TuinaEngine.check({
    case: normalCase,
    selectedTechniques: ['扳法'],
    patient: { age: 78, pregnant: false }
  });
  const h = r.hits.find(x => x.rule_id === 'TN-WARN-02');
  assert('命中 TN-WARN-02', !!h, 'hits=' + JSON.stringify(r.hits.map(x => x.rule_id)));
  assert('severity=warn', h && h.severity === 'warn');
}

console.log('\n[5] 反向：正常病例 + 仅轻柔手法 → 无命中');
{
  const r = TuinaEngine.check({
    case: normalCase,
    selectedTechniques: ['㨰法', '揉法', '摩法'],
    patient: { age: 35, pregnant: false }
  });
  assert('hits 为空', r.hits.length === 0, 'hits=' + JSON.stringify(r.hits));
}

console.log('\n[6] 边界：70 岁整 + 扳法 → 不应触发 TN-WARN-02（阈值 >70）');
{
  const r = TuinaEngine.check({
    case: normalCase,
    selectedTechniques: ['扳法'],
    patient: { age: 70, pregnant: false }
  });
  assert('70 岁不触发 warn', !r.hits.find(x => x.rule_id === 'TN-WARN-02'),
    'hits=' + JSON.stringify(r.hits.map(x => x.rule_id)));
}

// ---------- 总结 ----------
console.log('\n' + '='.repeat(60));
console.log(`tuina-engine 测试：${pass} 通过 / ${fail} 失败`);
console.log('='.repeat(60));
process.exit(fail ? 1 : 0);

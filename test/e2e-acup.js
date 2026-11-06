/* =====================================================================
 * P3-2 针灸模块端到端测试：6 个典型病例完整处方跑批
 * 运行: node test/e2e-acup.js
 * 每个病例：构造正确处方（主穴 + 辨证 + 补泻手法）→ 跑 ACUPENGINE.check
 * 输出：主穴命中数 / 配穴命中数 / error 数 / 是否通过
 * 验收：6 个病例全部 0 error 即通过（warn 为教学提示，不计失败）
 * ===================================================================== */
'use strict';
global.window = global;
const path = require('path');
const PROJECT_ROOT = path.join(__dirname, '..');

const casesDb = require(path.join(PROJECT_ROOT, 'data/acup-cases.json')).cases;
require(path.join(PROJECT_ROOT, 'js/acup-engine.js'));
const ACUPENGINE = global.window.ACUPENGINE;

// ---------- 6 个典型病例处方 ----------
const scripts = [
  { caseCode: 'ACUP-001', points: ['阳白', '颊车', '地仓', '翳风', '合谷'], method: '平补平泻' },
  { caseCode: 'ACUP-004', points: ['照海', '申脉', '神门', '安眠'],                 method: '补法' },
  { caseCode: 'ACUP-006', points: ['肾俞', '大肠俞', '腰夹脊', '委中'],             method: '平补平泻' },
  { caseCode: 'ACUP-007', points: ['颈夹脊', '天柱', '风池', '后溪', '列缺'],       method: '平补平泻' },
  { caseCode: 'ACUP-012', points: ['中脘', '足三里', '内关', '公孙'],               method: '平补平泻' },
  { caseCode: 'ACUP-015', points: ['三阴交', '中极', '次髎', '地机'],               method: '平补平泻' }
];

const rows = [];
let pass = 0, fail = 0;

scripts.forEach((s, idx) => {
  const c = casesDb.find(x => x.code === s.caseCode);
  if (!c) throw new Error('病例不存在: ' + s.caseCode);

  const pts = s.points.map(name => ({
    name,
    method: s.method,
    retainMin: 20
  }));

  const result = ACUPENGINE.check({
    case: c,
    zhengInput: c.syndrome_differentiation,
    points: pts,
    patient: { isPregnant: false, age: 35 }
  });

  // 主穴 / 配穴命中统计
  const mainPts = (c.main_points || []).map(p => typeof p === 'string' ? p : p.name);
  const adjPts  = (c.adjuvant_points || []).map(p => typeof p === 'string' ? p : p.name);
  const picked  = new Set(s.points);
  const mainHits = mainPts.filter(p => picked.has(p));
  const adjHits  = adjPts.filter(p => picked.has(p));

  const errorHits = result.hits.filter(h => h.severity === 'error');
  const warnHits   = result.hits.filter(h => h.severity === 'warn');
  const ok = errorHits.length === 0;
  if (ok) pass++; else fail++;

  rows.push({
    idx: idx + 1,
    code: c.code,
    name: c.name,
    main: mainHits.length + '/' + mainPts.length,
    adj:  adjHits.length  + '/' + adjPts.length,
    errors: errorHits.length,
    warns: warnHits.length,
    score: result.score.total,
    ok,
    errorMsgs: errorHits.map(h => '[' + h.rule_id + '] ' + h.message),
    warnMsgs: warnHits.map(h => '[' + h.rule_id + '] ' + h.message)
  });
});

// ---------- 输出 ----------
console.log('='.repeat(100));
console.log('P3-2 针灸 6 病例 e2e 跑批');
console.log('='.repeat(100));
console.log(
  '#'.padEnd(3) +
  '病例号'.padEnd(12) +
  '名称'.padEnd(22) +
  '主穴'.padEnd(10) +
  '配穴'.padEnd(10) +
  'error'.padEnd(7) +
  'warn'.padEnd(6) +
  '评分'.padEnd(7) +
  '结果'
);
console.log('-'.repeat(100));
rows.forEach(r => {
  console.log(
    String(r.idx).padEnd(3) +
    r.code.padEnd(12) +
    r.name.padEnd(22) +
    r.main.padEnd(10) +
    r.adj.padEnd(10) +
    String(r.errors).padEnd(7) +
    String(r.warns).padEnd(6) +
    String(r.score).padEnd(7) +
    (r.ok ? '✅ PASS' : '❌ FAIL')
  );
});

console.log('');
console.log('='.repeat(100));
console.log('详细 error / warn（教学提示）');
console.log('='.repeat(100));
rows.forEach(r => {
  if (!r.errorMsgs.length && !r.warnMsgs.length) return;
  console.log(`\n#${r.idx} ${r.code} ${r.name}`);
  r.errorMsgs.forEach(m => console.log('  ❌ ERROR ' + m));
  r.warnMsgs.forEach(m => console.log('  ⚠️  WARN  ' + m));
});

console.log('');
console.log('='.repeat(100));
console.log(`跑批结果：${pass}/${rows.length} 病例 0 error 通过`);
console.log(`验收标准：6/6 全过  →  ${pass === rows.length ? '✅ 达标' : '❌ 未达标'}`);
console.log('='.repeat(100));

process.exit(fail ? 1 : 0);

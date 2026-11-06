/* =====================================================================
 * P3-2 解剖学模块端到端测验：5 个高频考点小测验跑批
 * 运行: node test/e2e-anat.js
 * 每个小测验：从 data/anatomy-quiz.json 取出目标题 → 校验数据完整性
 *            → 模拟一名"答对参考答案"的学生作答 → 统计题目数/答对数/得分
 * 验收：5 个小测验全部通过（题目存在、答案索引合法、参考答案与预期临床事实一致）。
 * ===================================================================== */
'use strict';
const path = require('path');
const PROJECT_ROOT = path.join(__dirname, '..');
const quizDb = require(path.join(PROJECT_ROOT, 'data/anatomy-quiz.json'));

const questions = quizDb.questions || [];
const byId = new Map(questions.map(q => [q.id, q]));

// ---------- 5 个解剖小测验（id + 该题正确选项应命中的临床事实文本） ----------
const quizzes = [
  {
    id: 'QUIZ-PTERION',
    title: '翼点（脑膜中动脉前支）',
    items: [
      { qid: 'id-pterion', expectAnswerText: '翼点' }
    ]
  },
  {
    id: 'QUIZ-DIAPHRAGM-HIATUS',
    title: '膈三裂孔（T8腔静脉孔 / T10食管裂孔 / T12主动脉裂孔）',
    items: [
      { qid: 'id-diaphragm', expectAnswerText: '第10胸椎' }
    ]
  },
  {
    id: 'QUIZ-ESOPHAGUS-STENOSIS',
    title: '食管三处生理性狭窄',
    items: [
      { qid: 'id-esophagus-stenosis', expectAnswerText: '25 cm' }
    ]
  },
  {
    id: 'QUIZ-CALOT-TRIANGLE',
    title: 'Calot三角（胆囊三角）',
    items: [
      { qid: 'id-calot', expectAnswerText: '胆总管' }
    ]
  },
  {
    id: 'QUIZ-RIGHT-BRONCHUS',
    title: '右主支气管（异物坠入）',
    items: [
      { qid: 'id-bronchus', expectAnswerText: '右主支气管' }
    ]
  }
];

// ---------- 单题作答与数据完整性校验 ----------
function validateQuestion(q) {
  const errs = [];
  if (!q || typeof q !== 'object') { errs.push('题目不存在'); return errs; }
  if (!q.prompt || !String(q.prompt).trim()) errs.push('题干为空');
  if (!Array.isArray(q.options) || q.options.length < 2) errs.push('选项数<2');
  if (typeof q.answer !== 'number' || q.answer < 0 || q.answer >= q.options.length) errs.push('answer索引越界');
  if (!q.explanation || !String(q.explanation).trim()) errs.push('解析为空');
  if (Array.isArray(q.options)) {
    const seen = new Set();
    q.options.forEach(o => { if (seen.has(o)) errs.push('选项重复: ' + o); seen.add(o); });
  }
  return errs;
}

function runQuiz(quiz) {
  let total = 0, correct = 0;
  const detail = [];
  for (const it of quiz.items) {
    total++;
    const q = byId.get(it.qid);
    const errs = validateQuestion(q);
    if (errs.length) {
      detail.push({ qid: it.qid, ok: false, msg: '数据错误: ' + errs.join('；') });
      continue;
    }
    // 模拟学生选择参考答案（q.answer），并核对该选项文本是否符合预期临床事实
    const chosen = q.answer;
    const chosenText = q.options[chosen];
    const factOk = chosenText === it.expectAnswerText;
    const ok = factOk;
    if (ok) correct++;
    detail.push({
      qid: it.qid, ok,
      msg: ok
        ? `参考答案=${chosenText}（符合预期：${it.expectAnswerText}）`
        : `参考答案=${chosenText}，但预期=${it.expectAnswerText}`
    });
  }
  const score = total === 0 ? 0 : Math.round(correct / total * 100);
  return { total, correct, score, detail, pass: total > 0 && correct === total };
}

// ---------- 跑批 ----------
console.log('='.repeat(96));
console.log('P3-2 解剖学模块端到端测验跑批（5 个高频考点小测验）');
console.log('题库版本: ' + quizDb.version + '  |  题库总题数: ' + questions.length);
console.log('='.repeat(96));

const rows = quizzes.map(qz => Object.assign({ id: qz.id, title: qz.title }, runQuiz(qz)));

console.log('');
console.log(
  '#'.padEnd(3) +
  '测验ID'.padEnd(26) +
  '题目数'.padEnd(7) +
  '答对数'.padEnd(7) +
  '得分'.padEnd(7) +
  '结果'
);
console.log('-'.repeat(96));
rows.forEach((r, i) => {
  console.log(
    String(i + 1).padEnd(3) +
    r.id.padEnd(26) +
    String(r.total).padEnd(7) +
    String(r.correct).padEnd(7) +
    String(r.score).padEnd(7) +
    (r.pass ? '✅ PASS' : '❌ FAIL')
  );
});

console.log('');
console.log('='.repeat(96));
console.log('逐题明细');
console.log('='.repeat(96));
rows.forEach((r, i) => {
  console.log(`\n#${i + 1} ${r.id}  ${r.title}`);
  r.detail.forEach(d => {
    console.log(`   ${d.ok ? '✅' : '❌'} [${d.qid}] ${d.msg}`);
  });
});

const passCount = rows.filter(r => r.pass).length;
console.log('');
console.log('='.repeat(96));
console.log(`跑批结果：${passCount}/${rows.length} 个小测验全部通过`);
console.log(`验收标准：5/5 通过  →  ${passCount === rows.length ? '✅ 达标' : '❌ 未达标'}`);
console.log('='.repeat(96));

process.exit(passCount === rows.length ? 0 : 1);

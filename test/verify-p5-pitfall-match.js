/* P5-3 诊断陷阱输入模糊匹配逻辑验证 */
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'diagnosis-pitfalls.json'), 'utf8'));

function normalizeDiagText(s) {
  return String(s || '').trim().toLowerCase()
    .replace(/[\s,，。.、；;：:！!？?（）()\[\]【】"'’‘'~～\-—_/\\]+/g, '');
}
function pitfallMatchUserInput(userInput, p) {
  const ui = normalizeDiagText(userInput);
  if (ui.length < 2) return false;
  const correct = p.correct_diagnosis || '';
  const cands = new Set();
  const main = correct.toLowerCase()
    .replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '')
    .replace(/[\s,，。.、；;：:！!？?（）()\[\]【】"'’‘'~～\-—_/\\]+/g, '');
  if (main.length >= 3) cands.add(main);
  const parenRe = /[（(]([^）)]+)[）)]/g;
  let m;
  while ((m = parenRe.exec(correct)) !== null) {
    const inner = normalizeDiagText(m[1]);
    if (inner.length >= 2) cands.add(inner);
  }
  const core = main.replace(/^(急性|慢性|急|慢|原发性|继发性|自发性|外伤性|右侧?|左侧?|双侧|老年|儿童|中年)/, '');
  if (core.length >= 3) cands.add(core);
  const aliasTable = [
    { hit: ['消化性溃疡穿孔', '十二指肠溃疡穿孔'], aliases: ['溃疡穿孔', '穿孔', '十二指肠穿孔', '胃穿孔', '板状腹'] },
    { hit: ['主动脉夹层', 'stanford'],           aliases: ['夹层', '主动脉夹层', 'stanford', '双上肢血压差'] },
    { hit: ['慢性阻塞性肺疾病'],                  aliases: ['慢阻肺', 'copd', 'aecopd', '阻塞性肺疾病', '肺气肿'] },
    { hit: ['化脓性关节炎'],                      aliases: ['化脓性关节炎', '关节化脓', '金葡菌', '金黄色葡萄球菌'] },
    { hit: ['蛛网膜下腔出血'],                    aliases: ['蛛网膜下出血', 'sah', '蛛网膜下', '蛛网膜', '雷击样头痛'] },
  ];
  const lowerCorrect = correct.toLowerCase();
  aliasTable.forEach(row => {
    if (row.hit.some(k => lowerCorrect.includes(k.toLowerCase()))) {
      row.aliases.forEach(a => cands.add(normalizeDiagText(a)));
    }
  });
  for (const c of cands) {
    if (c.length >= 2 && ui.includes(c)) return true;
  }
  return false;
}

let pass = 0, fail = 0;
function check(p, input, expected) {
  const got = pitfallMatchUserInput(input, p);
  const ok = got === expected;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} | "${input}" vs [${p.trap_id}] expected=${expected} got=${got} | cands=${[...new Set([p.correct_diagnosis, p.wrong_diagnosis])].join(' / ')}`);
}

data.pitfalls.forEach(p => {
  console.log(`\n=== ${p.trap_id} | correct=${p.correct_diagnosis} | wrong=${p.wrong_diagnosis} ===`);
  // 应判对：完整正确诊断、关键词、缩写
  check(p, p.correct_diagnosis, true);
  check(p, p.wrong_diagnosis, false);
  // 各病种关键词用例
  if (p.trap_id === 'PIT-ABDOMEN-01') {
    check(p, '溃疡穿孔', true);
    check(p, '穿孔', true);
    check(p, '十二指肠溃疡穿孔', true);
    check(p, '阑尾炎', false);
    check(p, '急性阑尾炎', false);
  }
  if (p.trap_id === 'PIT-CHEST-01') {
    check(p, '主动脉夹层', true);
    check(p, '夹层', true);
    check(p, 'Stanford A型', true);
    check(p, '心梗', false);
    check(p, '急性心肌梗死', false);
  }
  if (p.trap_id === 'PIT-DYSPNEA-01') {
    check(p, '慢阻肺', true);
    check(p, 'AECOPD', true);
    check(p, '慢性阻塞性肺疾病', true);
    check(p, '哮喘', false);
    check(p, '支气管哮喘', false);
  }
  if (p.trap_id === 'PIT-JOINT-01') {
    check(p, '化脓性关节炎', true);
    check(p, '金葡菌感染', true);
    check(p, '痛风', false);
    check(p, '痛风性关节炎', false);
  }
  if (p.trap_id === 'PIT-HEADACHE-01') {
    check(p, '蛛网膜下腔出血', true);
    check(p, '蛛网膜下出血', true);
    check(p, 'SAH', true);
    check(p, '偏头痛', false);
  }
});

console.log(`\n==== RESULT: pass=${pass} fail=${fail} ====`);
process.exit(fail > 0 ? 1 : 0);

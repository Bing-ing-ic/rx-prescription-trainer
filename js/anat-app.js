/* =====================================================================
 * anat-app.js  系统解剖学模块业务逻辑
 *  - 8大系统浏览 / 结构详情 / 测验引擎（识别/配对/问答）/ 临床案例
 *  - localStorage 写入 rx-profile-history 与 rx-mistakes，module='解剖学'
 * ===================================================================== */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);

  const S = {
    systems: [], questions: [], cases: [],
    currentSystem: null,       // 当前浏览的系统对象
    currentStruct: null,       // 当前查看的结构
    quiz: {
      pool: [], idx: 0, score: 0, answers: [], // answers: [{q, correct:0|5|10, type}]
      matchSel: null           // 配对题当前选中的左项
    },
    currentCase: null
  };

  async function loadJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + ' ' + r.status);
    return r.json();
  }

  // ---------- 视图切换（覆盖之前所有模块的 showView） ----------
  const ALL_VIEWS = [
    'view-home','view-rx','view-report','view-radar','view-mistakes','view-stats','view-drugs',
    'view-tcm-home','view-tcm-case','view-tcm-rx','view-tcm-report',
    'view-acup-home','view-acup-case','view-acup-rx','view-acup-report',
    'view-anat-home','view-anat-system','view-anat-detail','view-anat-quiz','view-anat-cases'
  ];
  function showView(id) {
    ALL_VIEWS.forEach(v => { const el = $(v); if (el) el.classList.add('hidden'); });
    const el = $(id); if (el) el.classList.remove('hidden');
    window.scrollTo(0, 0);
  }
  window.__showView = showView;

  // ---------- 数据加载 ----------
  async function boot() {
    try {
      const [sj, qj, cj] = await Promise.all([
        loadJSON('data/anatomy-systems.json').catch(() => null),
        loadJSON('data/anatomy-quiz.json').catch(() => null),
        loadJSON('data/anatomy-cases.json').catch(() => null)
      ]);
      S.systems = (sj && sj.systems) || [];
      S.questions = (qj && qj.questions) || [];
      S.cases = (cj && cj.cases) || [];
      if (S.systems.length === 0) {
        const tip = $('anat-data-tip'); if (tip) tip.classList.remove('hidden');
      }
      renderSystemGrid();
      renderCaseList();
    } catch (e) {
      console.warn('Anatomy data load failed:', e);
      const tip = $('anat-data-tip'); if (tip) tip.classList.remove('hidden');
    }
  }

  // ---------- 首页：8大系统卡片 ----------
  function renderSystemGrid() {
    const grid = $('anat-system-grid');
    if (!grid) return;
    if (S.systems.length === 0) {
      grid.innerHTML = '<div class="muted" style="text-align:center;padding:20px;">解剖学系统数据加载中…</div>';
      return;
    }
    grid.innerHTML = S.systems.map(s => {
      const cnt = (s.structures || []).length;
      return `<div class="anat-system-card" data-sys="${s.id}">
        <div class="asc-icon">${s.icon || '🦴'}</div>
        <div class="asc-name">${s.name}</div>
        <div class="asc-count">${cnt} 个结构</div>
      </div>`;
    }).join('');
    grid.querySelectorAll('.anat-system-card').forEach(el => {
      el.onclick = () => {
        const id = el.getAttribute('data-sys');
        const sys = S.systems.find(x => x.id === id);
        if (sys) openSystem(sys);
      };
    });
  }

  // ---------- 系统视图：结构列表 ----------
  function openSystem(sys) {
    S.currentSystem = sys;
    $('anat-system-title').textContent = (sys.icon || '') + ' ' + sys.name;
    // 子分类筛选
    const sel = $('anat-subsystem-filter');
    const subs = Array.from(new Set((sys.structures || []).map(x => x.subsystem).filter(Boolean)));
    sel.innerHTML = '<option value="">全部子分类</option>' +
      subs.map(x => `<option value="${x}">${x}</option>`).join('');
    $('anat-struct-search').value = '';
    renderStructList();
    showView('view-anat-system');
  }

  function renderStructList() {
    const list = $('anat-struct-list');
    if (!list || !S.currentSystem) return;
    const kw = ($('anat-struct-search').value || '').toLowerCase().trim();
    const sub = $('anat-subsystem-filter').value;
    const items = (S.currentSystem.structures || []).filter(s =>
      (!sub || s.subsystem === sub) &&
      (!kw || (s.name || '').toLowerCase().indexOf(kw) >= 0 ||
              (s.latin || '').toLowerCase().indexOf(kw) >= 0)
    );
    if (items.length === 0) {
      list.innerHTML = '<div class="muted" style="padding:16px;text-align:center;">无匹配结构</div>';
      return;
    }
    list.innerHTML = items.map(s => `
      <div class="anat-struct-item" data-id="${s.id}">
        <div class="asi-main">
          <b>${s.name}</b>
          <small class="asi-latin">${s.latin || ''}</small>
        </div>
        <div class="asi-sub">${s.subsystem || ''}</div>
      </div>`).join('');
    list.querySelectorAll('.anat-struct-item').forEach(el => {
      el.onclick = () => {
        const id = el.getAttribute('data-id');
        const st = (S.currentSystem.structures || []).find(x => x.id === id);
        if (st) openDetail(st);
      };
    });
  }

  // ---------- 结构详情 ----------
  function openDetail(st) {
    S.currentStruct = st;
    $('anat-detail-name').textContent = st.name + (st.latin ? '（' + st.latin + '）' : '');
    const tags = (st.exam_points || []).map(t => `<span class="anat-exam-tag">🎯 ${t}</span>`).join('');
    $('anat-detail-body').innerHTML = `
      <div class="anat-detail-card">
        <div class="anat-detail-section">
          <div class="ads-label">📍 位置</div>
          <div class="ads-body">${st.location || '-'}</div>
        </div>
        <div class="anat-detail-section">
          <div class="ads-label">🔗 毗邻关系</div>
          <div class="ads-body">${st.relations || '-'}</div>
        </div>
        <div class="anat-detail-section">
          <div class="ads-label">⚙️ 功能</div>
          <div class="ads-body">${st.function || '-'}</div>
        </div>
        <div class="anat-detail-section">
          <div class="ads-label">🏥 临床意义</div>
          <div class="ads-body">${st.clinical || '-'}</div>
        </div>
        ${tags ? `<div class="anat-detail-section">
          <div class="ads-label">🎯 考点标记</div>
          <div class="ads-tags">${tags}</div>
        </div>` : ''}
      </div>`;
    showView('view-anat-detail');
  }

  // ---------- 测验引擎 ----------
  function startQuiz() {
    if (S.questions.length === 0) { alert('解剖学测验数据尚未就绪。'); return; }
    const diff = $('anat-quiz-diff').value;
    let pool = S.questions.slice();
    if (diff !== 'all') pool = pool.filter(q => q.difficulty === diff);
    if (pool.length < 10) pool = S.questions.slice();
    // 随机抽10题
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    S.quiz.pool = pool.slice(0, 10);
    S.quiz.idx = 0;
    S.quiz.score = 0;
    S.quiz.answers = [];
    $('anat-quiz-result').classList.add('hidden');
    $('anat-quiz-card').classList.remove('hidden');
    renderQuizQuestion();
    showView('view-anat-quiz');
  }

  function renderQuizQuestion() {
    const q = S.quiz.pool[S.quiz.idx];
    $('anat-quiz-progress').textContent = `第 ${S.quiz.idx + 1} / ${S.quiz.pool.length} 题　当前得分 ${S.quiz.score}`;
    const box = $('anat-quiz-card');
    if (!q) return;

    let body = '';
    if (q.type === 'identify') {
      body = `
        <div class="aq-prompt">${q.prompt}</div>
        <div class="anat-quiz-options" id="anat-quiz-options">
          ${(q.options || []).map((opt, i) => `<button class="anat-quiz-option" data-i="${i}">${opt}</button>`).join('')}
        </div>
        <div class="aq-feedback hidden" id="aq-feedback"></div>
        <button class="btn btn-primary hidden" id="anat-btn-quiz-next">下一题 →</button>`;
    } else if (q.type === 'match') {
      const left = q.pairs_left || [];
      const right = (q.pairs_right || []).slice().sort(() => Math.random() - 0.5);
      body = `
        <div class="aq-prompt">${q.prompt}<br><small class="muted">点击左侧结构，再点击右侧对应项完成配对</small></div>
        <div class="anat-match-wrap">
          <div class="anat-match-col" id="anat-match-left">
            ${left.map((l, i) => `<button class="anat-match-item" data-side="l" data-i="${i}">${l}</button>`).join('')}
          </div>
          <div class="anat-match-col" id="anat-match-right">
            ${right.map((r, i) => `<button class="anat-match-item" data-side="r" data-i="${i}">${r}</button>`).join('')}
          </div>
        </div>
        <div class="aq-feedback hidden" id="aq-feedback"></div>
        <button class="btn btn-primary hidden" id="anat-btn-quiz-next">下一题 →</button>`;
      S.quiz.matchSel = null;
      S.quiz._matchRightOrder = right; // 保存乱序后的右列
    } else if (q.type === 'qa') {
      body = `
        <div class="aq-prompt">${q.prompt}</div>
        <div class="aq-feedback hidden" id="aq-feedback"></div>
        <button class="btn" id="anat-btn-show-answer">📖 显示参考答案</button>
        <div class="aq-answer hidden" id="aq-answer"></div>
        <div class="aq-selfeval hidden" id="aq-selfeval">
          <span class="muted">自评：</span>
          <button class="btn btn-type" data-self="10">✅ 完全答对（+10）</button>
          <button class="btn btn-type" data-self="5">🟡 部分正确（+5）</button>
          <button class="btn btn-type" data-self="0">❌ 未答对（+0）</button>
        </div>`;
    }
    box.innerHTML = body;

    // 绑定选项
    if (q.type === 'identify') {
      box.querySelectorAll('#anat-quiz-options .anat-quiz-option').forEach(btn => {
        btn.onclick = () => {
          const i = +btn.getAttribute('data-i');
          // 数据中 answer 为正确选项的索引（数字），按索引比较
          const correct = (i === q.answer);
          box.querySelectorAll('.anat-quiz-option').forEach((b, bi) => {
            b.disabled = true;
            if (bi === q.answer) b.classList.add('correct');
            else if (bi === i) b.classList.add('wrong');
          });
          const fb = $('aq-feedback');
          fb.classList.remove('hidden');
          const ansText = (q.options || [])[q.answer] || q.answer;
          fb.innerHTML = (correct ? '✅ 回答正确。' : '❌ 正确答案：<b>' + ansText + '</b>') +
            `<br><span class="muted">${q.explanation || ''}</span>`;
          S.quiz.score += correct ? 10 : 0;
          S.quiz.answers.push({ q, score: correct ? 10 : 0, correct });
          $('anat-btn-quiz-next').classList.remove('hidden');
          $('anat-quiz-progress').textContent = `第 ${S.quiz.idx + 1} / ${S.quiz.pool.length} 题　当前得分 ${S.quiz.score}`;
        };
      });
    } else if (q.type === 'match') {
      // 数据中 answer 为索引数组 [rightIdxForLeft0, rightIdxForLeft1, ...]，转换为文本对
      const leftList = q.pairs_left || [];
      const rightList = q.pairs_right || [];
      const pairs = (q.answer || []).map((ri, li) => [leftList[li], rightList[ri]]);
      let matched = 0;
      box.querySelectorAll('.anat-match-item').forEach(btn => {
        btn.onclick = () => {
          if (btn.classList.contains('matched')) return;
          const side = btn.getAttribute('data-side');
          if (side === 'l') {
            box.querySelectorAll('#anat-match-left .anat-match-item').forEach(b => b.classList.remove('sel'));
            btn.classList.add('sel');
            S.quiz.matchSel = btn;
          } else if (side === 'r' && S.quiz.matchSel) {
            const lText = S.quiz.matchSel.textContent;
            const rText = btn.textContent;
            // 判断配对：answer 是 [[leftName, rightName], ...]
            const ok = pairs.some(p => p[0] === lText && p[1] === rText);
            if (ok) {
              btn.classList.add('matched-correct');
              S.quiz.matchSel.classList.add('matched-correct');
              S.quiz.matchSel.classList.remove('sel');
              S.quiz.matchSel = null;
              matched++;
              if (matched === left.length) {
                const fb = $('aq-feedback');
                fb.classList.remove('hidden');
                fb.innerHTML = `✅ 配对完成，全部正确！<br><span class="muted">${q.explanation || ''}</span>`;
                S.quiz.score += 10;
                S.quiz.answers.push({ q, score: 10, correct: true });
                $('anat-btn-quiz-next').classList.remove('hidden');
                $('anat-quiz-progress').textContent = `第 ${S.quiz.idx + 1} / ${S.quiz.pool.length} 题　当前得分 ${S.quiz.score}`;
              }
            } else {
              btn.classList.add('wrong');
              setTimeout(() => btn.classList.remove('wrong'), 600);
            }
          }
        };
      });
    } else if (q.type === 'qa') {
      $('anat-btn-show-answer').onclick = () => {
        $('aq-answer').classList.remove('hidden');
        // 数据中答案要点字段为 answer_points
        const pts = q.answer_points || q.answer || [];
        $('aq-answer').innerHTML = `
          <div class="aq-answer-box">
            <b>参考答案要点：</b>
            <ul>${pts.map(p => `<li>${p}</li>`).join('')}</ul>
            <p class="muted">${q.explanation || ''}</p>
          </div>`;
        $('aq-selfeval').classList.remove('hidden');
        $('anat-btn-show-answer').classList.add('hidden');
      };
      box.querySelectorAll('#aq-selfeval .btn-type').forEach(btn => {
        btn.onclick = () => {
          const s = +btn.getAttribute('data-self');
          S.quiz.score += s;
          S.quiz.answers.push({ q, score: s, correct: s === 10 });
          box.querySelectorAll('#aq-selfeval .btn-type').forEach(b => b.disabled = true);
          $('aq-feedback').classList.remove('hidden');
          $('aq-feedback').innerHTML = `已记录：${s === 10 ? '完全答对' : s === 5 ? '部分正确' : '未答对'}（+${s}）`;
          $('anat-btn-quiz-next').classList.remove('hidden');
          $('anat-quiz-progress').textContent = `第 ${S.quiz.idx + 1} / ${S.quiz.pool.length} 题　当前得分 ${S.quiz.score}`;
        };
      });
    }

    const nextBtn = $('anat-btn-quiz-next');
    if (nextBtn) nextBtn.onclick = nextQuizQuestion;
  }

  function nextQuizQuestion() {
    S.quiz.idx++;
    if (S.quiz.idx >= S.quiz.pool.length) {
      finishQuiz();
    } else {
      renderQuizQuestion();
    }
  }

  function finishQuiz() {
    const total = S.quiz.score;
    $('anat-quiz-card').classList.add('hidden');
    $('anat-quiz-result').classList.remove('hidden');
    const arc = $('anat-quiz-score-arc');
    const C = 326.7;
    arc.style.strokeDashoffset = C - C * total / 100;
    $('anat-quiz-score').textContent = total;
    const grade = total >= 85 ? '优秀' : total >= 70 ? '良好' : total >= 60 ? '合格' : '需加强';
    $('anat-quiz-grade').textContent = grade;
    $('anat-quiz-meta').textContent = `共 ${S.quiz.pool.length} 题 · ${new Date().toLocaleString()}`;
    // 保存到历史
    saveQuizHistory(total);
  }

  function saveQuizHistory(total) {
    const arr = JSON.parse(localStorage.getItem('rx-profile-history') || '[]');
    // 按题型算 radar 维度
    const ans = S.quiz.answers;
    const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 80;
    const identifyScores = ans.filter(a => a.q.type === 'identify').map(a => a.score);
    const matchScores = ans.filter(a => a.q.type === 'match').map(a => a.score);
    const qaScores = ans.filter(a => a.q.type === 'qa').map(a => a.score);
    arr.unshift({
      t: Date.now(), total: total, module: '解剖学',
      disease: '测验' + S.quiz.pool.length + '题',
      radar: {
        format: avg(identifyScores.length ? identifyScores : [80]),
        match: avg(matchScores.length ? matchScores : [80]),
        dose: avg(qaScores.length ? qaScores : [80]),
        route: 80, compat: 80, special: 80, ess: 80, abx: 80
      }
    });
    localStorage.setItem('rx-profile-history', JSON.stringify(arr.slice(0, 20)));
    // 错题入库
    const wrong = ans.filter(a => a.score < 10);
    if (wrong.length) {
      const m = JSON.parse(localStorage.getItem('rx-mistakes') || '[]');
      m.unshift({
        t: Date.now(), module: '解剖学', disease: '解剖学测验', score: total,
        errors: wrong.map(a => ({
          rule_id: a.q.id || '',
          title: (a.q.prompt || '').slice(0, 40),
          message: a.q.explanation || '',
          suggestion: ''
        })),
        warns: []
      });
      localStorage.setItem('rx-mistakes', JSON.stringify(m.slice(0, 100)));
    }
  }

  // ---------- 临床案例 ----------
  function renderCaseList() {
    const box = $('anat-case-list');
    if (!box) return;
    if (S.cases.length === 0) {
      box.innerHTML = '<div class="muted" style="padding:16px;text-align:center;">临床案例数据加载中…</div>';
      return;
    }
    box.innerHTML = S.cases.map(c => `
      <div class="anat-case-card" data-id="${c.id}">
        <div class="acc-head">
          <span class="tag tag-diff">${c.difficulty || '初级'}</span>
          <b>${c.title}</b>
        </div>
        <div class="acc-meta muted">${c.system || ''}${c.subsystem ? ' · ' + c.subsystem : ''}</div>
      </div>`).join('');
    box.querySelectorAll('.anat-case-card').forEach(el => {
      el.onclick = () => {
        const id = el.getAttribute('data-id');
        const c = S.cases.find(x => x.id === id);
        if (c) openCase(c);
      };
    });
  }

  function openCase(c) {
    S.currentCase = c;
    $('anat-case-list').classList.add('hidden');
    $('anat-case-detail').classList.remove('hidden');
    $('anat-case-detail-body').innerHTML = `
      <div class="case-card">
        <div class="case-card-head">
          <span class="tag tag-diff">${c.difficulty || '初级'}</span>
          <span class="case-title">${c.title}</span>
        </div>
        <div class="case-meta muted">${c.system || ''}</div>
        <div class="case-body">
          <p><b>【情景】</b>${c.scenario || ''}</p>
          <p><b>【问题】</b>${c.question || ''}</p>
        </div>
        <button class="btn btn-primary" id="anat-btn-show-case-answer">🔓 显示解析</button>
        <div id="anat-case-answer" class="hidden" style="margin-top:14px;">
          <div class="anat-detail-section">
            <div class="ads-label">🔑 关键结构</div>
            <div class="ads-body">${(c.key_structures || []).join('、')}</div>
          </div>
          <div class="anat-detail-section">
            <div class="ads-label">💡 解析</div>
            <div class="ads-body">${c.answer || ''}</div>
          </div>
          ${c.exam_point ? `<div class="anat-detail-section">
            <div class="ads-label">🎯 考点</div>
            <div class="ads-tags"><span class="anat-exam-tag">🎯 ${c.exam_point}</span></div>
          </div>` : ''}
        </div>
      </div>`;
    $('anat-btn-show-case-answer').onclick = () => {
      $('anat-case-answer').classList.remove('hidden');
      $('anat-btn-show-case-answer').classList.add('hidden');
    };
  }

  function backCaseList() {
    $('anat-case-detail').classList.add('hidden');
    $('anat-case-list').classList.remove('hidden');
    S.currentCase = null;
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    $('anat-btn-learn').onclick = () => {
      if (S.systems.length === 0) { alert('解剖学系统数据加载中，请稍候。'); return; }
      openSystem(S.systems[0]);
    };
    $('anat-btn-quiz').onclick = startQuiz;
    $('anat-btn-cases').onclick = () => showView('view-anat-cases');
    $('anat-btn-back-home').onclick = () => showView('view-anat-home');
    $('anat-struct-search').oninput = () => renderStructList();
    $('anat-subsystem-filter').onchange = () => renderStructList();
    $('anat-btn-back-list').onclick = () => showView('view-anat-system');
    $('anat-btn-quiz-home').onclick = () => showView('view-anat-home');
    $('anat-btn-quiz-start').onclick = startQuiz;
    $('anat-btn-quiz-again').onclick = startQuiz;
    $('anat-btn-cases-home').onclick = () => showView('view-anat-home');
    $('anat-btn-back-cases').onclick = backCaseList;
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    boot();
  });
})();

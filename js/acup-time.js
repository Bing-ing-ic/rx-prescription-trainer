/* =====================================================================
 * acup-time.js  子午流注 · 按时取穴（针灸时间医学教学板块）
 *  - 十二时辰配经时间轴 / 时辰→经络→穴位联动
 *  - 纳子法本经补母泻子表
 *  - 灵龟八法八脉交会配穴
 *  - 知识点测验；穴位与现有 acup-points.json 库联动，未收录穴名降级为文字展示
 *  纯静态、无构建链；不改动现有模块逻辑
 * ===================================================================== */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);

  const S = { data: null, points: [], active: 0, quizAns: [] };

  function loadJSON(url) {
    return fetch(url).then(r => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
  }

  function findPoint(name) {
    return S.points.find(p => p.name === name) || null;
  }

  // 中文经络名 -> img/meridians/ 分经图文件名（与 acup-app.js 保持一致）
  const MERIDIAN_IMG_MAP = {
    '手太阴肺经': 'LU-lung', '手阳明大肠经': 'LI-large-intestine',
    '足阳明胃经': 'ST-stomach', '足太阴脾经': 'SP-spleen',
    '手少阴心经': 'HT-heart', '手太阳小肠经': 'SI-small-intestine',
    '足太阳膀胱经': 'BL-bladder', '足少阴肾经': 'KI-kidney',
    '手厥阴心包经': 'PC-pericardium', '手少阳三焦经': 'TE-sanjiao',
    '足少阳胆经': 'GB-gallbladder', '足厥阴肝经': 'LR-liver',
    '任脉': 'RN-ren', '督脉': 'GV-du', '经外奇穴': 'EX-extra-points'
  };
  const MERIDIAN_CHART_URL = 'img/acup-meridian-chart.jpg';

  // 穴位定位图四级回退：局部特写 -> 奇穴特写 -> 所属经络分经图 -> 总图
  function loadPointImage(p) {
    const img = $('tp-img'), wrap = $('tp-img-wrap');
    if (!img) return;
    const py = (p.pinyin || '').toLowerCase();
    const merStem = p.meridian ? MERIDIAN_IMG_MAP[p.meridian] : null;
    const chain = [];
    if (py) chain.push('img/meridians/point-' + py + '.jpg');
    if (py) chain.push('img/meridians/EX-point-' + py + '.jpg');
    if (merStem) chain.push('img/meridians/' + merStem + '.jpg');
    chain.push(MERIDIAN_CHART_URL);
    let i = 0;
    (function tryNext() {
      if (i >= chain.length) { if (wrap) wrap.style.display = 'none'; return; }
      const src = chain[i++];
      img.onerror = () => { console.warn('[time] 穴位图回退:', src); tryNext(); };
      img.onload = () => { if (wrap) wrap.style.display = ''; };
      img.src = src;
    })();
  }

  // 本机当前时辰（23-1 子，1-3 丑 …），返回 shichen 索引；无法判定返回 -1
  function currentShichenIndex() {
    const h = new Date().getHours();
    // [start, end, index]，区间左闭右开；子时跨 23 与 0
    if (h === 23 || h < 1) return 0;
    if (h >= 1 && h < 3) return 1;
    if (h >= 3 && h < 5) return 2;
    if (h >= 5 && h < 7) return 3;
    if (h >= 7 && h < 9) return 4;
    if (h >= 9 && h < 11) return 5;
    if (h >= 11 && h < 13) return 6;
    if (h >= 13 && h < 15) return 7;
    if (h >= 15 && h < 17) return 8;
    if (h >= 17 && h < 19) return 9;
    if (h >= 19 && h < 21) return 10;
    if (h >= 21 && h < 23) return 11;
    return -1;
  }

  function goHome() {
    if (typeof window.__showView === 'function') window.__showView('view-acup-home');
  }

  /* ---------------- 入口与数据加载 ---------------- */
  async function boot() {
    try {
      const [dj, pj] = await Promise.all([
        loadJSON('data/acup-time-medicine.json').catch(() => null),
        loadJSON('data/acup-points.json').catch(() => null)
      ]);
      S.data = dj;
      S.points = (pj && pj.points) || (Array.isArray(pj) ? pj : []);
      if (!dj) { const d = $('time-meta'); if (d) d.innerHTML = '<div class="acup-map-empty">时间医学数据未加载</div>'; return; }
      renderMeta();
      renderShichenGrid();
      renderDetail(S.active);
      renderNazi();
      renderLinggui();
      renderQuiz();
    } catch (e) { console.warn('Acup time data load failed:', e); }
  }

  function renderMeta() {
    const m = S.data.meta;
    const el = $('time-meta');
    if (!el) return;
    el.innerHTML =
      `<div class="time-meta-title">${m.title}</div>` +
      `<div class="time-meta-sub">${m.subtitle}</div>` +
      `<p class="time-meta-note">${m.note}</p>`;
  }

  /* ---------------- 十二时辰时间轴 ---------------- */
  function renderShichenGrid() {
    const grid = $('time-shichen-grid');
    if (!grid) return;
    const now = currentShichenIndex();
    grid.innerHTML = S.data.shichen.map((s, i) => `
      <button type="button" class="time-sc-card ${i === S.active ? 'active' : ''} ${i === now ? 'now' : ''}" data-i="${i}">
        <span class="ts-name">${s.name}${i === now ? ' · 现在' : ''}</span>
        <span class="ts-hour">${s.hour}</span>
        <span class="ts-meridian">${s.meridian.replace(/^(手|足)/, '')}</span>
      </button>`).join('');
    grid.querySelectorAll('.time-sc-card').forEach(btn => {
      btn.onclick = () => {
        S.active = +btn.getAttribute('data-i');
        grid.querySelectorAll('.time-sc-card').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        renderDetail(S.active);
      };
    });
  }

  function pointChips(names, prefix) {
    return names.map((n, k) => {
      const hit = findPoint(n);
      return `<button type="button" class="time-pt-chip ${hit ? '' : 'missing'}" data-name="${n}" data-prefix="${prefix || ''}" data-k="${k}">${n}${hit ? '' : '（教材穴）'}</button>`;
    }).join('');
  }

  function bindPointChips(scope) {
    (scope || document).querySelectorAll('.time-pt-chip').forEach(btn => {
      btn.onclick = () => openPoint(btn.getAttribute('data-name'));
    });
  }

  function renderDetail(i) {
    const s = S.data.shichen[i];
    const el = $('time-detail');
    if (!el) return;
    el.innerHTML = `
      <div class="td-head">
        <span class="td-shichen">${s.name}</span>
        <span class="td-hour">${s.hour}</span>
      </div>
      <div class="td-organ">当令：<b>${s.organ}</b> · <b>${s.meridian}</b>（五行属${s.element}）</div>
      <div class="td-row"><span class="td-label">养生要点</span><span>${s.regimen}</span></div>
      <div class="td-row"><span class="td-label">取穴要点</span><span>${s.acup_note}</span></div>
      <div class="td-row"><span class="td-label">纳子法</span>
        <span>补母穴：${pointChips([s.mother_point], 'm')}　泻子穴：${pointChips([s.child_point], 'c')}</span>
      </div>
      <div class="td-row"><span class="td-label">代表穴</span><span>${pointChips(s.representative_points, 'r')}</span></div>`;
    bindPointChips(el);
  }

  /* ---------------- 纳子法 ---------------- */
  function renderNazi() {
    const n = S.data.nazi;
    const intro = $('nazi-intro');
    if (intro) intro.innerHTML = `<b>原则：</b>${n.principle}<br>${n.intro}`;
    const tbl = $('nazi-table');
    if (!tbl) return;
    tbl.innerHTML = `
      <thead><tr>
        <th>经脉</th><th>脏腑</th><th>五行</th>
        <th>母穴（补）</th><th>母穴五行</th><th>子穴（泻）</th><th>子穴五行</th>
      </tr></thead>
      <tbody>${n.table.map(r => `
        <tr>
          <td><b>${r.meridian}</b></td><td>${r.organ}</td><td>${r.element}</td>
          <td>${pointChips([r.mother])}</td><td class="muted">${r.mother_el}</td>
          <td>${pointChips([r.child])}</td><td class="muted">${r.child_el}</td>
        </tr>`).join('')}</tbody>`;
    bindPointChips(tbl);
    const song = $('nazi-song');
    if (song) song.innerHTML = `<b>十二经子母穴补泻歌：</b>${n.song}`;
  }

  /* ---------------- 灵龟八法 ---------------- */
  function renderLinggui() {
    const lg = S.data.linggui;
    const intro = $('lg-intro');
    if (intro) intro.textContent = lg.intro;
    const grid = $('lg-grid');
    if (!grid) return;
    grid.innerHTML = lg.pairs.map(p => `
      <div class="lg-card">
        <div class="lg-pair">
          <div class="lg-point">
            <button type="button" class="time-pt-chip" data-name="${p.point1}">${p.point1}</button>
            <small class="lg-code">${p.code1}</small><small class="lg-vessel">${p.vessel1}</small>
          </div>
          <span class="lg-link">配对</span>
          <div class="lg-point">
            <button type="button" class="time-pt-chip" data-name="${p.point2}">${p.point2}</button>
            <small class="lg-code">${p.code2}</small><small class="lg-vessel">${p.vessel2}</small>
          </div>
        </div>
        <div class="lg-indication">主治：${p.indication}</div>
        <div class="lg-detail muted">${p.details}</div>
      </div>`).join('');
    bindPointChips(grid);
  }

  /* ---------------- 穴位详情弹窗（板块自用） ---------------- */
  function openPoint(name) {
    const p = findPoint(name);
    const mask = $('modal-time-point');
    if (!mask) return;
    const wrap = $('tp-img-wrap');
    if (!p) {
      $('tp-name').innerHTML = `${name} <small style="font-weight:400;color:#64748b;font-size:13px;">教材标准穴名</small>`;
      if (wrap) wrap.style.display = 'none';
      $('tp-body').innerHTML = `<div class="ap-row muted">该穴为纳子法/八脉交会标准穴名，未收录进本平台穴位库；定位、主治以人卫《针灸学》教材为准。</div>`;
      mask.classList.remove('hidden');
      return;
    }
    const chips = (Array.isArray(p.indications) ? p.indications : (p.indications ? [p.indications] : []))
      .map(i => `<span class="ap-chip">${i}</span>`).join('');
    $('tp-name').innerHTML = `${p.name} <small style="font-weight:400;color:#64748b;font-size:13px;">${p.code || ''} · ${p.meridian || ''}</small>`;
    if (wrap) wrap.style.display = '';
    loadPointImage(p);
    $('tp-body').innerHTML = `
      <div class="ap-row"><span class="ap-label">【定位】</span>${p.location || '-'}</div>
      <div class="ap-row"><span class="ap-label">【类属】</span>${p.category || '-'}　<span class="ap-label">【功用】</span>${p.functions || '-'}</div>
      <div class="ap-row"><span class="ap-label">【主治】</span>${chips || '-'}</div>
      <div class="ap-row"><span class="ap-label">【操作】</span>${p.needling_method || '-'}</div>
      ${p.special_note ? `<div class="ap-note">⚠ ${p.special_note}</div>` : ''}`;
    mask.classList.remove('hidden');
  }

  /* ---------------- 测验 ---------------- */
  function renderQuiz() {
    const box = $('time-quiz');
    if (!box) return;
    S.quizAns = new Array(S.data.quiz.length).fill(-1);
    box.innerHTML = S.data.quiz.map((q, qi) => `
      <div class="quiz-item" data-qi="${qi}">
        <div class="quiz-q">${qi + 1}. ${q.q}</div>
        <div class="quiz-opts">
          ${q.options.map((o, oi) => `<button type="button" class="quiz-opt" data-qi="${qi}" data-oi="${oi}">${String.fromCharCode(65 + oi)}. ${o}</button>`).join('')}
        </div>
        <div class="quiz-fb" id="quiz-fb-${qi}"></div>
      </div>`).join('');
    box.querySelectorAll('.quiz-opt').forEach(btn => {
      btn.onclick = () => answer(+btn.getAttribute('data-qi'), +btn.getAttribute('data-oi'));
    });
  }

  function answer(qi, oi) {
    const q = S.data.quiz[qi];
    S.quizAns[qi] = oi;
    const item = document.querySelector(`.quiz-item[data-qi="${qi}"]`);
    if (!item) return;
    item.querySelectorAll('.quiz-opt').forEach(b => {
      const k = +b.getAttribute('data-oi');
      b.classList.remove('correct', 'wrong', 'disabled');
      if (k === q.answer) b.classList.add('correct');
      else if (k === oi) b.classList.add('wrong');
      b.classList.add('disabled');
    });
    const fb = $(`quiz-fb-${qi}`);
    if (fb) fb.innerHTML = (oi === q.answer ? '<span style="color:#15803d;">✅ 回答正确。</span>' : '<span style="color:#b91c1c;">❌ 回答错误。</span>') + `<span class="muted"> ${q.explain}</span>`;
    const score = $('time-quiz-score');
    if (score) {
      const done = S.quizAns.filter(a => a >= 0).length;
      const right = S.quizAns.filter((a, k) => a >= 0 && a === S.data.quiz[k].answer).length;
      score.innerHTML = done < S.quizAns.length
        ? `已答 ${done}/${S.quizAns.length} 题 · 正确 ${right} 题`
        : `<b>测验完成：${right}/${S.quizAns.length} 题正确（${Math.round(right / S.quizAns.length * 100)} 分）</b>`;
    }
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindEvents() {
    const back = $('acup-time-back');
    if (back) back.onclick = goHome;
    const close = $('tp-close');
    if (close) close.onclick = () => $('modal-time-point').classList.add('hidden');
    const mask = $('modal-time-point');
    if (mask) mask.onclick = e => { if (e.target === mask) mask.classList.add('hidden'); };
    const entry = $('acup-btn-time');
    if (entry) entry.onclick = () => {
      if (typeof window.__showView === 'function') window.__showView('view-acup-time');
      else { document.querySelectorAll('.view').forEach(v => v.classList.add('hidden')); const t = $('view-acup-time'); if (t) t.classList.remove('hidden'); }
      if (!S.data) boot();
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    boot();
  });
})();

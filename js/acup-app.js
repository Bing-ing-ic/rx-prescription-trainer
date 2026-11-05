/* =====================================================================
 * acup-app.js  针灸推拿模块业务逻辑
 * ===================================================================== */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);

  const S = {
    cases: [], points: [],
    case: null, patient: null,
    zhengOk: false,
    items: []   // [{name, meridian, method, retainMin, moxa}]
  };

  const SURNAMES = ['张','李','王','赵','刘','陈','杨','黄','周','吴'];
  const GIVEN_M = ['伟','强','军','磊','勇','刚','健','涛'];
  const GIVEN_F = ['芳','娜','敏','静','艳','娟','霞','燕'];

  function pickPatient(c) {
    const gender = (c && c.gender) || (Math.random() > 0.5 ? '男' : '女');
    const sn = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
    const gn = gender === '男' ? GIVEN_M[Math.floor(Math.random()*GIVEN_M.length)] : GIVEN_F[Math.floor(Math.random()*GIVEN_F.length)];
    const age = (c && c.age_range) ? Math.floor(c.age_range[0] + Math.random()*(c.age_range[1]-c.age_range[0])) : Math.floor(25 + Math.random()*45);
    return { name: sn + gn, gender, age, isPregnant: gender === '女' && age >= 20 && age <= 35 && Math.random() < 0.15 };
  }

  async function loadJSON(url) {
    const r = await fetch(url); if (!r.ok) throw new Error(url.status); return r.json();
  }
  async function boot() {
    try {
      const [cj, pj, rj] = await Promise.all([
        loadJSON('data/acup-cases.json').catch(() => null),
        loadJSON('data/acup-points.json').catch(() => null),
        loadJSON('data/acup-rules.json').catch(() => null)
      ]);
      S.cases = (cj && cj.cases) || (Array.isArray(cj) ? cj : []);
      S.points = (pj && pj.points) || (Array.isArray(pj) ? pj : []);
      if (rj && rj.rules) window.ACUPENGINE.extraRules = rj.rules;
      if (S.cases.length === 0) { const t = $('acup-data-tip'); if (t) t.classList.remove('hidden'); }
      renderMeridianFilter();
      renderPointList('');
      initMap();
    } catch (e) { console.warn('Acup data load failed:', e); }
  }

  function showView(id) {
    ['view-home','view-rx','view-report','view-radar','view-mistakes','view-stats','view-drugs',
     'view-tcm-home','view-tcm-case','view-tcm-rx','view-tcm-report',
     'view-acup-home','view-acup-case','view-acup-rx','view-acup-report','view-acup-map'].forEach(v => {
      const el = $(v); if (el) el.classList.add('hidden');
    });
    const el = $(id); if (el) el.classList.remove('hidden');
    window.scrollTo(0, 0);
  }
  window.__showView = showView;

  function newCase() {
    if (S.cases.length === 0) { alert('针灸病例数据尚未就绪。'); return; }
    const diff = document.querySelector('input[name="acup-diff"]:checked');
    const d = diff ? diff.value : 'all';
    let pool = S.cases; if (d !== 'all') pool = pool.filter(c => c.difficulty === d);
    if (pool.length === 0) pool = S.cases;
    S.case = pool[Math.floor(Math.random() * pool.length)];
    S.patient = pickPatient(S.case);
    S.zhengOk = false; S.items = [];
    renderCase();
    showView('view-acup-case');
  }

  function renderCase() {
    const c = S.case, p = S.patient;
    $('acup-case-diff').textContent = c.difficulty || '初级';
    $('acup-case-meta').innerHTML = `患者：${p.name} · ${p.gender} · ${p.age}岁${p.isPregnant ? '（育龄女性，注意妊娠禁忌）' : ''}　科别：针灸科`;
    const s = c.symptom_pool || {};
    const first = a => Array.isArray(a) ? (a[0] || '-') : (a || '-');
    $('acup-case-body').innerHTML = `
      <p><b>【主诉】</b>${first(s.chief_complaint)}</p>
      <p><b>【病史】</b>${first(s.history)}</p>
      <p><b>【舌象】</b>${first(s.tongue)}</p>
      <p><b>【脉象】</b>${first(s.pulse)}</p>
      <p><b>【查体】</b>${first(s.exam)}</p>
    `;
    const dl = $('acup-zheng-list');
    if (dl) {
      const opts = [c.syndrome_differentiation, ...(c.differential || [])].filter(Boolean);
      dl.innerHTML = Array.from(new Set(opts)).map(z => `<option value="${z}">`).join('');
    }
    $('acup-zheng-feedback').innerHTML = '';
    $('acup-open-row').classList.add('hidden');
  }

  function checkZheng() {
    const input = ($('acup-zheng-input').value || '').trim();
    if (!input) { $('acup-zheng-feedback').innerHTML = '<span style="color:#b91c1c;">请输入证型。</span>'; return; }
    const ref = (S.case.syndrome_differentiation || '').trim();
    const ok = input === ref || (ref && (ref.indexOf(input) >= 0 || input.indexOf(ref) >= 0));
    if (ok) {
      S.zhengOk = true;
      $('acup-zheng-feedback').innerHTML = `<span style="color:#15803d;">✅ 辨证正确：${ref}</span>`;
      $('acup-open-row').classList.remove('hidden');
    } else {
      S.zhengOk = false;
      $('acup-zheng-feedback').innerHTML = `<span style="color:#b91c1c;">❌ 辨证待斟酌。</span>`;
    }
  }

  function openRx() {
    if (!S.zhengOk) { alert('请先确认辨证。'); return; }
    const p = S.patient;
    $('acup-p-name').textContent = p.name;
    $('acup-p-gender').textContent = p.gender;
    $('acup-p-age').textContent = p.age;
    $('acup-p-zheng').textContent = S.case.syndrome_differentiation || '';
    $('acup-p-fazheng').textContent = S.case.treatment_principle || '';
    $('acup-p-date').textContent = new Date().toLocaleDateString();
    $('acup-rx-no').textContent = 'ACU-' + Date.now().toString().slice(-6);
    // 默认载入参考主穴
    S.items = [];
    (S.case.reference_points || []).forEach(n => {
      const pt = S.points.find(x => x.name === n);
      S.items.push({ name: n, meridian: pt ? pt.meridian : '', method: '平补平泻', retainMin: 20, moxa: '' });
    });
    renderItems();
    renderPointList('');
    showView('view-acup-rx');
  }

  function renderMeridianFilter() {
    const sel = $('acup-meridian-filter');
    if (!sel) return;
    const ms = Array.from(new Set(S.points.map(p => p.meridian).filter(Boolean))).sort();
    sel.innerHTML = '<option value="">全部经络</option>' + ms.map(m => `<option value="${m}">${m}</option>`).join('');
  }

  function renderPointList(kw) {
    const list = $('acup-point-list');
    if (!list) return;
    const k = (kw || '').toLowerCase();
    const m = $('acup-meridian-filter').value;
    const items = S.points.filter(p =>
      (!k || p.name.toLowerCase().indexOf(k) >= 0 || (p.pinyin || '').indexOf(k) >= 0) &&
      (!m || p.meridian === m)
    );
    if (items.length === 0) { list.innerHTML = '<div style="padding:10px;color:#94a3b8;">无匹配穴位</div>'; return; }
    list.innerHTML = items.slice(0, 80).map(p => {
      const picked = S.items.some(it => it.name === p.name);
      return `
      <div class="acup-point-item ${picked ? 'selected' : ''}" data-pt="${p.name}">
        <span><b>${p.name}</b> <span class="meridian-tag">${p.meridian || ''}</span></span>
        <small class="muted">${(p.indication || '').slice(0, 26)}</small>
      </div>`;
    }).join('');
    list.querySelectorAll('.acup-point-item').forEach(el => {
      el.onclick = () => {
        const p = S.points.find(x => x.name === el.getAttribute('data-pt'));
        if (!p) return;
        if (S.items.some(it => it.name === p.name)) return; // 已选：静默，视觉上已 selected
        S.items.push({ name: p.name, meridian: p.meridian || '', method: '平补平泻', retainMin: 20, moxa: '' });
        renderItems();
        const curKw = ($('acup-point-search') || {}).value || '';
        renderPointList(curKw);
      };
    });
  }

  function renderItems() {
    const tb = $('acup-items');
    $('acup-point-count').textContent = '已选 ' + S.items.length + ' 穴';
    if (S.items.length === 0) { tb.innerHTML = '<tr><td colspan="6" style="color:#94a3b8;padding:14px;">请在上方搜索并选择穴位</td></tr>'; return; }
    tb.innerHTML = S.items.map((it, i) => `
      <tr>
        <td>${i+1}</td>
        <td><b>${it.name}</b></td>
        <td>${it.meridian || ''}</td>
        <td>
          <select data-i="${i}" data-k="method">
            ${['补法','泻法','平补平泻'].map(m => `<option ${it.method===m?'selected':''}>${m}</option>`).join('')}
          </select>
        </td>
        <td><input type="number" value="${it.retainMin}" data-i="${i}" data-k="retainMin" style="width:60px;"></td>
        <td>
          <select data-i="${i}" data-k="moxa">
            ${['','艾灸','温针灸','拔罐','无'].map(m => `<option ${it.moxa===m?'selected':''}>${m||'无'}</option>`).join('')}
          </select>
        </td>
      </tr>`).join('');
    tb.querySelectorAll('select,input').forEach(el => {
      el.onchange = () => {
        const i = +el.getAttribute('data-i'), k = el.getAttribute('data-k');
        S.items[i][k] = el.value;
      };
    });
  }

  function submit() {
    if (!S.zhengOk) { alert('请先确认辨证。'); return; }
    if (S.items.length === 0) { alert('请至少选择一个穴位。'); return; }
    const zhengInput = ($('acup-zheng-input').value || '').trim();
    const hits = window.ACUPENGINE.check({
      case: S.case, zhengInput, points: S.items, patient: S.patient
    }).hits;
    const review = window.ACUPENGINE.score(hits);
    renderReport(review, hits, zhengInput);
    saveHistory(review, hits);
    showView('view-acup-report');
  }

  function renderReport(review, hits, zhengInput) {
    const arc = $('acup-score-arc');
    const C = 326.7;
    arc.style.strokeDashoffset = C - C * review.total / 100;
    $('acup-r-score').textContent = review.total;
    const grade = review.total >= 85 ? '优秀' : review.total >= 70 ? '良好' : review.total >= 60 ? '合格' : '需加强';
    $('acup-r-grade').textContent = grade;
    $('acup-r-meta').textContent = `${S.patient.name} · ${S.case.name || ''} · ${new Date().toLocaleString()}`;
    $('acup-dim-grid').innerHTML = Object.values(review.dims).map(d => {
      const verdict = d.hits.some(h => h.severity === 'error') ? 'error' : d.hits.some(h => h.severity === 'warn') ? 'warn' : 'pass';
      return `
      <div class="dim-card acup-dim ${verdict}">
        <div class="dim-name">${d.name}</div>
        <div class="dim-bar"><div class="dim-fill" style="width:${d.score/d.weight*100}%"></div></div>
        <div class="dim-num">${Math.round(d.score)}/${d.weight}</div>
      </div>`;
    }).join('');
    $('acup-cnt-err').textContent = review.errorCount;
    $('acup-cnt-warn').textContent = review.warnCount;
    $('acup-cnt-pass').textContent = Math.max(0, hits.length - review.errorCount - review.warnCount);
    $('acup-hit-list').innerHTML = hits.length === 0
      ? '<div class="hit-item pass">✅ 未命中错误规则</div>'
      : hits.map(h => `
        <div class="hit-item ${h.severity}">
          <b>[${h.rule_id}] ${h.title}</b><br>
          <span class="muted">${h.message}</span><br>
          ${h.suggestion ? `<span class="sug">💡 ${h.suggestion}</span>` : ''}
        </div>`).join('');
    $('acup-diff-box').innerHTML = `
      <div style="font-size:13px;line-height:1.9;">
        <p><b>参考证型：</b>${S.case.syndrome_differentiation || '-'}　<b>你辨证：</b>${zhengInput || '-'}</p>
        <p><b>参考治法：</b>${S.case.treatment_principle || '-'}</p>
        <p><b>参考主穴：</b>${(S.case.reference_points || []).join('、') || '-'}</p>
        <p><b>你处方：</b>${S.items.map(i => `${i.name}（${i.method}${i.moxa?'/' + i.moxa:''}）`).join('，')}</p>
      </div>`;
  }

  function saveHistory(review, hits) {
    const arr = JSON.parse(localStorage.getItem('rx-profile-history') || '[]');
    arr.unshift({
      t: Date.now(), total: review.total, module: '针灸推拿',
      disease: S.case.name || '', disease_code: S.case.code || '',
      radar: {
        format: review.dims.zheng.score / review.dims.zheng.weight * 100,
        match: review.dims.main.score / review.dims.main.weight * 100,
        dose: review.dims.method.score / review.dims.method.weight * 100,
        route: review.dims.peixue.score / review.dims.peixue.weight * 100,
        compat: review.dims.safety.score / review.dims.safety.weight * 100,
        special: 80, ess: 80, abx: 80
      }
    });
    localStorage.setItem('rx-profile-history', JSON.stringify(arr.slice(0, 20)));
    const errors = hits.filter(h => h.severity === 'error');
    const warns = hits.filter(h => h.severity === 'warn');
    if (errors.length || warns.length) {
      const m = JSON.parse(localStorage.getItem('rx-mistakes') || '[]');
      m.unshift({
        t: Date.now(), module: '针灸推拿', disease: S.case.name || '', score: review.total,
        errors: errors.map(e => ({ rule_id: e.rule_id, title: e.title, message: e.message, suggestion: e.suggestion })),
        warns: warns.map(w => ({ rule_id: w.rule_id, title: w.title, message: w.message }))
      });
      localStorage.setItem('rx-mistakes', JSON.stringify(m.slice(0, 100)));
    }
  }

  /* ============ 经络穴位图浏览 ============ */
  const MERIDIAN_ORDER = [
    '手太阴肺经','手阳明大肠经','足阳明胃经','足太阴脾经',
    '手少阴心经','手太阳小肠经','足太阳膀胱经','足少阴肾经',
    '手厥阴心包经','手少阳三焦经','足少阳胆经','足厥阴肝经',
    '任脉','督脉','经外奇穴'
  ];

  function initMap() {
    const sel = $('acup-map-meridian');
    if (!sel) return;
    const present = Array.from(new Set(S.points.map(p => p.meridian).filter(Boolean)));
    const ordered = MERIDIAN_ORDER.filter(m => present.indexOf(m) >= 0)
      .concat(present.filter(m => MERIDIAN_ORDER.indexOf(m) < 0));
    sel.innerHTML = '<option value="">全部经络</option>' +
      ordered.map(m => `<option value="${m}">${m}（${S.points.filter(p=>p.meridian===m).length}穴）</option>`).join('');
    renderMapPoints();
    sel.onchange = () => renderMapPoints();
    const s = $('acup-map-search');
    if (s) s.oninput = () => renderMapPoints();
    const back = $('acup-map-back');
    if (back) back.onclick = () => showView('view-acup-home');
    const btn = $('acup-btn-map');
    if (btn) btn.onclick = () => { renderMapPoints(); showView('view-acup-map'); };
    const close = $('ap-close');
    if (close) close.onclick = () => $('modal-acup-point').classList.add('hidden');
    const mask = $('modal-acup-point');
    if (mask) mask.onclick = e => { if (e.target === mask) mask.classList.add('hidden'); };
  }

  function renderMapPoints() {
    const box = $('acup-map-points');
    if (!box) return;
    const m = $('acup-map-meridian') ? $('acup-map-meridian').value : '';
    const k = ($('acup-map-search') ? $('acup-map-search').value : '').toLowerCase();
    const list = S.points.filter(p =>
      (!m || p.meridian === m) &&
      (!k || p.name.toLowerCase().indexOf(k) >= 0 || (p.pinyin || '').indexOf(k) >= 0)
    );
    // 按经络顺序、穴号排序
    list.sort((a, b) => {
      const ma = MERIDIAN_ORDER.indexOf(a.meridian), mb = MERIDIAN_ORDER.indexOf(b.meridian);
      if (ma !== mb) return (ma < 0 ? 99 : ma) - (mb < 0 ? 99 : mb);
      return (a.code || '').localeCompare(b.code || '');
    });
    if (list.length === 0) {
      box.innerHTML = '<div class="acup-map-empty">无匹配穴位</div>';
      return;
    }
    box.innerHTML = list.map(p => `
      <div class="acup-map-point-card" data-code="${p.code}" role="button" tabindex="0">
        <div class="mc-top"><span class="mc-name">${p.name}</span><span class="mc-code">${p.code || ''}</span></div>
        <div class="mc-meridian">${p.meridian || ''} · ${p.category || ''}</div>
      </div>`).join('');
    box.querySelectorAll('.acup-map-point-card').forEach(el => {
      const open = () => {
        const p = S.points.find(x => x.code === el.getAttribute('data-code'));
        if (p) openPointDetail(p);
      };
      el.onclick = open;
      el.onkeydown = e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      };
    });
  }

  function openPointDetail(p) {
    document.querySelectorAll('.acup-map-point-card.active').forEach(el => el.classList.remove('active'));
    const card = document.querySelector(`.acup-map-point-card[data-code="${p.code}"]`);
    if (card) card.classList.add('active');
    $('ap-name').innerHTML = `${p.name} <small style="font-weight:400;color:#64748b;font-size:13px;">${p.code||''} · ${p.meridian||''}</small>`;
    const chips = (Array.isArray(p.indications) ? p.indications : (p.indications ? [p.indications] : []))
      .map(i => `<span class="ap-chip">${i}</span>`).join('');
    $('ap-body').innerHTML = `
      <div class="ap-row"><span class="ap-label">【定位】</span>${p.location || '-'}</div>
      <div class="ap-row"><span class="ap-label">【类属】</span>${p.category || '-'}　<span class="ap-label">【功用】</span>${p.functions || '-'}</div>
      <div class="ap-row"><span class="ap-label">【主治】</span>${chips || '-'}</div>
      <div class="ap-row"><span class="ap-label">【操作】</span>${p.needling_method || '-'}</div>
      ${p.special_note ? `<div class="ap-note">⚠ ${p.special_note}</div>` : ''}
    `;
    $('modal-acup-point').classList.remove('hidden');
  }

  function bindEvents() {
    $('acup-btn-new').onclick = newCase;
    $('acup-btn-zheng-check').onclick = checkZheng;
    $('acup-btn-back-home').onclick = () => showView('view-acup-home');
    $('acup-btn-open-rx').onclick = openRx;
    $('acup-btn-back-case').onclick = () => showView('view-acup-case');
    $('acup-btn-print').onclick = () => window.print();
    $('acup-btn-submit').onclick = submit;
    $('acup-report-home').onclick = () => showView('view-acup-home');
    $('acup-btn-retry').onclick = () => { showView('view-acup-home'); newCase(); };
    $('acup-point-search').oninput = e => renderPointList(e.target.value);
    $('acup-meridian-filter').onchange = e => renderPointList($('acup-point-search').value);
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    boot();
  });
})();

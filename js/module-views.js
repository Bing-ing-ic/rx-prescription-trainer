/* =====================================================================
 * module-views.js  跨模块数据打通
 *  - 能力画像：追加三模块得分分类卡
 *  - 错题本：追加模块筛选 chips
 *  - 学习统计：追加三模块训练次数/平均分
 *  - 不修改 app.js 现有函数，只在共享视图内追加面板
 * ===================================================================== */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const MODULES = ['西医', '中医汉方', '针灸推拿'];

  function readHistory() { try { return JSON.parse(localStorage.getItem('rx-profile-history') || '[]'); } catch (e) { return []; } }
  function readMistakes() { try { return JSON.parse(localStorage.getItem('rx-mistakes') || '[]'); } catch (e) { return []; } }
  function modOf(h) { return h.module || '西医'; }

  // ---------- 能力画像：追加模块均分 ----------
  function enhanceRadar() {
    if ($('module-breakdown-radar')) return;
    const box = document.createElement('div');
    box.className = 'history-box';
    box.id = 'module-breakdown-radar';
    box.innerHTML = '<h3>分模块能力</h3><div class="module-stat-row" id="radar-modules"></div>';
    const hist = $('history-list');
    if (hist && hist.parentNode) hist.parentNode.insertBefore(box, hist.nextSibling);
    renderRadarModules();
  }
  function renderRadarModules() {
    const el = $('radar-modules'); if (!el) return;
    const hist = readHistory();
    const groups = {}; MODULES.forEach(m => groups[m] = []);
    hist.forEach(h => { const m = modOf(h); (groups[m] = groups[m] || []).push(h.total); });
    el.innerHTML = MODULES.map(m => {
      const arr = groups[m] || [];
      const avg = arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : '--';
      const cls = m === '中医汉方' ? 'msc-tcm' : m === '针灸推拿' ? 'msc-acup' : '';
      return `<div class="module-stat-card ${cls}">
        <div class="msc-num">${avg}</div>
        <div class="msc-label">${m}（${arr.length}次）</div>
      </div>`;
    }).join('');
  }

  // ---------- 错题本：追加筛选 chips ----------
  function enhanceMistakes() {
    if ($('module-filter-row')) return;
    const row = document.createElement('div');
    row.className = 'module-filter-row';
    row.id = 'module-filter-row';
    row.innerHTML = '<span class="muted" style="line-height:24px;">按模块筛选：</span>' +
      '<button class="module-filter-chip active" data-mf="">全部</button>' +
      MODULES.map(m => `<button class="module-filter-chip" data-mf="${m}">${m}</button>`).join('');
    const list = $('mistakes-list');
    if (list && list.parentNode) list.parentNode.insertBefore(row, list);
    row.querySelectorAll('.module-filter-chip').forEach(c => {
      c.onclick = () => {
        row.querySelectorAll('.module-filter-chip').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        filterMistakes(c.getAttribute('data-mf'));
      };
    });
  }
  let mfFilter = '';
  function filterMistakes(m) {
    mfFilter = m;
    // 给 app.js 渲染出的 mistake-card 加 module badge 与隐藏
    const cards = document.querySelectorAll('#mistakes-list .mistake-card');
    cards.forEach(card => {
      const mod = card.getAttribute('data-mod') || '西医';
      card.style.display = (!m || mod === m) ? '' : 'none';
    });
  }

  // ---------- 学习统计：追加分模块统计 ----------
  function enhanceStats() {
    if ($('module-stats-row')) return;
    const box = document.createElement('div');
    box.className = 'stats-section';
    box.innerHTML = '<h3>🧩 分模块训练统计</h3><div class="module-stat-row" id="module-stats-row"></div>';
    const trend = $('score-trend');
    if (trend && trend.parentNode) trend.parentNode.insertBefore(box, trend.nextSibling);
    renderModuleStats();
  }
  function renderModuleStats() {
    const el = $('module-stats-row'); if (!el) return;
    const hist = readHistory();
    const groups = {}; MODULES.forEach(m => groups[m] = []);
    hist.forEach(h => { const m = modOf(h); (groups[m] = groups[m] || []).push(h.total); });
    el.innerHTML = MODULES.map(m => {
      const arr = groups[m] || [];
      const avg = arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(1) : '--';
      const best = arr.length ? Math.max(...arr) : '--';
      const cls = m === '中医汉方' ? 'msc-tcm' : m === '针灸推拿' ? 'msc-acup' : '';
      return `<div class="module-stat-card ${cls}">
        <div class="msc-num">${arr.length}</div>
        <div class="msc-label">${m} 次<br>平均 ${avg} · 最高 ${best}</div>
      </div>`;
    }).join('');
  }

  // ---------- 给错题卡打模块标记 ----------
  function tagMistakeCards() {
    const arr = readMistakes();
    const cards = document.querySelectorAll('#mistakes-list .mistake-card');
    cards.forEach((card, i) => {
      const rec = arr[i];
      if (!rec) return;
      const mod = rec.module || '西医';
      card.setAttribute('data-mod', mod);
      if (!card.querySelector('.module-badge')) {
        const badge = document.createElement('span');
        badge.className = 'module-badge ' + (mod === '中医汉方' ? 'mb-tcm' : mod === '针灸推拿' ? 'mb-acup' : 'mb-western');
        badge.textContent = mod;
        const head = card.querySelector('.mistake-head');
        if (head) head.insertBefore(badge, head.children[1] || null);
      }
    });
    filterMistakes(mfFilter);
  }

  // ---------- 拦截 data-goto：等 app.js 渲染后追加面板 ----------
  function hook() {
    document.querySelectorAll('[data-goto="radar"],[data-goto="mistakes"],[data-goto="stats"]').forEach(b => {
      b.addEventListener('click', function () {
        setTimeout(() => {
          if (b.getAttribute('data-goto') === 'radar') { enhanceRadar(); renderRadarModules(); }
          if (b.getAttribute('data-goto') === 'mistakes') { enhanceMistakes(); tagMistakeCards(); }
          if (b.getAttribute('data-goto') === 'stats') { enhanceStats(); renderModuleStats(); }
        }, 60);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', hook);
})();

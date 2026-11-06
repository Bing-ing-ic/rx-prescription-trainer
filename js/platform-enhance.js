/* =====================================================================
 * platform-enhance.js  平台增强补丁（2026-11-05）
 *  1. 知识点速查（view-quickref）：跨模块检索药品/中药/方剂/穴位/解剖/疾病
 *  2. 学习统计分模块增强（view-stats）：模块 tab + 知识点掌握度
 *  3. 错题本增强（view-mistakes）：筛选栏 + 单条移除 + 重练
 *  4. 经络图分经显示（view-acup-map）：选经络切换分经图，onerror 回退总图
 *  5. 全局 BUG 补丁：localStorage 容错、视图切换状态残留等
 *  不改动原有业务 JS，只在共享视图上追加/替换渲染。
 * ===================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 安全 localStorage 读写（file:// 协议下可能抛异常） ---------- */
  var store = {
    get: function (k) {
      try { return localStorage.getItem(k); } catch (e) { return null; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, v); } catch (e) { /* 忽略隐私模式异常 */ }
    },
    remove: function (k) {
      try { localStorage.removeItem(k); } catch (e) {}
    },
    getJSON: function (k, def) {
      try {
        var s = localStorage.getItem(k);
        return s ? JSON.parse(s) : def;
      } catch (e) { return def; }
    },
    setJSON: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
    }
  };

  /* ---------- 拼音首字母（轻量，用于中文关键词辅助） ---------- */
  // 仅做包含匹配：用户输入 "alldp" 时，匹配药品自带的 pinyin 字段；
  // 对中药/方剂/穴位数据里的 pinyin 字段直接包含匹配即可，无需自建拼音表。

  /* =====================================================================
   * 一、知识点速查
   * ===================================================================== */
  var QR = {
    data: null,        // {drugs, herbs, formulas, points, anatStructs, diseases}
    loading: false,
    lastKw: '',
    lastCat: ''
  };

  async function qrLoadAll() {
    if (QR.data || QR.loading) return QR.data;
    QR.loading = true;
    var wrap = $('quickref-results');
    if (wrap) wrap.innerHTML = '<p class="muted center" style="padding:30px;">⏳ 正在加载知识库…</p>';
    function get(url, fallback) {
      return fetch(url).then(function (r) { return r.ok ? r.json() : fallback; }).catch(function () { return fallback; });
    }
    var results = await Promise.all([
      get('data/drugs.json', { drugs: [] }),
      get('data/tcm-herbs.json', { herbs: [] }),
      get('data/tcm-formulas.json', { formulas: [] }),
      get('data/acup-points.json', { points: [] }),
      get('data/anatomy-systems.json', { systems: [] }),
      get('data/diseases.json', { diseases: [] })
    ]);
    var anatStructs = [];
    (results[4].systems || []).forEach(function (sys) {
      (sys.structures || []).forEach(function (st) {
        anatStructs.push({
          id: st.id, name: st.name, latin: st.latin,
          system: sys.name, subsystem: st.subsystem,
          location: st.location, function: st.function,
          clinical: st.clinical, relations: st.relations,
          exam_points: st.exam_points
        });
      });
    });
    QR.data = {
      drugs: results[0].drugs || [],
      herbs: results[1].herbs || [],
      formulas: results[2].formulas || [],
      points: results[3].points || [],
      anatStructs: anatStructs,
      diseases: results[5].diseases || []
    };
    QR.loading = false;
    qrSearch(QR.lastKw, QR.lastCat);
    return QR.data;
  }

  function qrHit(text, kw) {
    if (!kw) return true;
    var t = (text || '').toLowerCase();
    return t.indexOf(kw.toLowerCase()) >= 0;
  }

  function qrSearch(kw, cat) {
    QR.lastKw = kw = (kw || '').trim();
    QR.lastCat = cat = cat || '';
    if (!QR.data) { qrLoadAll(); return; }
    var box = $('quickref-results');
    if (!box) return;
    var countEl = $('quickref-count');
    if (!kw) {
      box.innerHTML = '<p class="muted center" style="padding:40px 12px;">输入关键词开始检索，数据来自本地知识库。</p>';
      if (countEl) countEl.textContent = '';
      return;
    }
    var d = QR.data;
    var sections = [];
    var total = 0;

    if (!cat || cat === 'drug') {
      var list = d.drugs.filter(function (x) {
        return qrHit(x.generic_name, kw) || qrHit(x.brand_name, kw) ||
               qrHit(x.pharmacology_class, kw) || qrHit(x.pinyin, kw) ||
               qrHit(x.pinyin_code, kw);
      }).slice(0, 30);
      if (list.length) {
        total += list.length;
        sections.push({
          title: '💊 药品', color: '#1e6091', items: list.map(function (x) {
            var dr = x.dose_range_json || {};
            return {
              key: 'drug-' + x.generic_name,
              name: x.generic_name,
              sub: (x.pharmacology_class || '') + (x.brand_name ? ' · ' + x.brand_name : ''),
              meta: '常用单次 ' + (dr.single_min_mg || '?') + '-' + (dr.single_max_mg || '?') + 'mg ' + (dr.default_freq || ''),
              payload: { type: 'drug', obj: x }
            };
          })
        });
      }
    }

    if (!cat || cat === 'herb') {
      var hlist = d.herbs.filter(function (x) {
        return qrHit(x.name, kw) || qrHit(x.pinyin, kw) || qrHit(x.category, kw) || qrHit(x.functions, kw);
      }).slice(0, 30);
      if (hlist.length) {
        total += hlist.length;
        sections.push({
          title: '🌿 中药', color: '#5b8c5a', items: hlist.map(function (x) {
            return {
              key: 'herb-' + x.name,
              name: x.name,
              sub: (x.category || '') + ' · ' + (x.nature || '') + (x.taste ? ' ' + x.taste : ''),
              meta: '常用量 ' + (x.dose_range || '-'),
              payload: { type: 'herb', obj: x }
            };
          })
        });
      }
    }

    if (!cat || cat === 'formula') {
      var flist = d.formulas.filter(function (x) {
        return qrHit(x.name, kw) || qrHit(x.pinyin, kw) || qrHit(x.functions, kw) ||
               (Array.isArray(x.composition) && x.composition.some(function (c) { return qrHit(c.herb, kw); }));
      }).slice(0, 30);
      if (flist.length) {
        total += flist.length;
        sections.push({
          title: '📜 方剂', color: '#8b6f3f', items: flist.map(function (x) {
            var herbs = (x.composition || []).map(function (c) { return c.herb; }).join('、');
            return {
              key: 'formula-' + x.name,
              name: x.name,
              sub: (x.source || '') + ' · ' + (x.category || ''),
              meta: herbs ? '组成：' + herbs.slice(0, 30) : '',
              payload: { type: 'formula', obj: x }
            };
          })
        });
      }
    }

    if (!cat || cat === 'point') {
      var plist = d.points.filter(function (x) {
        return qrHit(x.name, kw) || qrHit(x.pinyin, kw) || qrHit(x.meridian, kw) || qrHit(x.functions, kw);
      }).slice(0, 40);
      if (plist.length) {
        total += plist.length;
        sections.push({
          title: '📍 穴位', color: '#7c5cbf', items: plist.map(function (x) {
            var ind = Array.isArray(x.indications) ? x.indications.join('、') : (x.indications || '');
            return {
              key: 'point-' + x.code,
              name: x.name + ' ' + (x.code || ''),
              sub: (x.meridian || '') + (x.category ? ' · ' + x.category : ''),
              meta: ind ? '主治：' + ind.slice(0, 30) : '',
              payload: { type: 'point', obj: x }
            };
          })
        });
      }
    }

    if (!cat || cat === 'anat') {
      var alist = d.anatStructs.filter(function (x) {
        return qrHit(x.name, kw) || qrHit(x.latin, kw) || qrHit(x.system, kw) ||
               qrHit(x.function, kw) || qrHit(x.subsystem, kw);
      }).slice(0, 30);
      if (alist.length) {
        total += alist.length;
        sections.push({
          title: '🫀 解剖结构', color: '#c1432e', items: alist.map(function (x) {
            return {
              key: 'anat-' + x.id,
              name: x.name + (x.latin ? ' <small style="font-weight:400;color:#94a3b8;">' + x.latin + '</small>' : ''),
              sub: (x.system || '') + (x.subsystem ? ' · ' + x.subsystem : ''),
              meta: (x.function || '').slice(0, 40),
              payload: { type: 'anat', obj: x }
            };
          })
        });
      }
    }

    if (!cat || cat === 'disease') {
      var dislist = d.diseases.filter(function (x) {
        return qrHit(x.name, kw) || qrHit(x.icd10, kw) || qrHit(x.code, kw);
      }).slice(0, 30);
      if (dislist.length) {
        total += dislist.length;
        sections.push({
          title: '🏥 疾病', color: '#0f766e', items: dislist.map(function (x) {
            var fl = (x.first_line_oral || []).join('、');
            return {
              key: 'dis-' + x.code,
              name: x.name,
              sub: 'ICD-10：' + (x.icd10 || x.code || '-'),
              meta: fl ? '常用口服：' + fl.slice(0, 30) : '',
              payload: { type: 'disease', obj: x }
            };
          })
        });
      }
    }

    if (countEl) countEl.textContent = '共 ' + total + ' 条结果';
    if (total === 0) {
      box.innerHTML = '<p class="muted center" style="padding:40px 12px;">未找到与 “' + escapeHtml(kw) + '” 相关的内容，换个关键词试试。</p>';
      return;
    }
    box.innerHTML = sections.map(function (sec) {
      return '<div class="qr-section">' +
        '<div class="qr-section-title" style="border-left:4px solid ' + sec.color + ';">' + sec.title +
        ' <small class="muted">(' + sec.items.length + ')</small></div>' +
        '<div class="qr-card-grid">' +
        sec.items.map(function (it) {
          return '<div class="qr-card" data-qr="' + escapeHtml(it.key) + '">' +
            '<div class="qr-card-name">' + it.name + '</div>' +
            '<div class="qr-card-sub">' + escapeHtml(it.sub || '') + '</div>' +
            (it.meta ? '<div class="qr-card-meta">' + escapeHtml(it.meta) + '</div>' : '') +
            '</div>';
        }).join('') +
        '</div></div>';
    }).join('');

    // 绑定卡片点击
    box.querySelectorAll('.qr-card').forEach(function (card) {
      card.onclick = function () {
        var key = card.getAttribute('data-qr');
        for (var i = 0; i < sections.length; i++) {
          var it = sections[i].items.find(function (x) { return x.key === key; });
          if (it) { qrShowDetail(it.payload); break; }
        }
      };
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function qrShowDetail(payload) {
    var nameEl = $('qr-detail-name'), bodyEl = $('qr-detail-body');
    if (!nameEl || !bodyEl) return;
    var o = payload.obj, h = '';
    if (payload.type === 'drug') {
      var dr = o.dose_range_json || {};
      h = '<table class="qr-detail-table">' +
        row('通用名', o.generic_name) + row('商品名', o.brand_name || '-') +
        row('分类', o.pharmacology_class || '-') + row('剂型', o.dosage_form || '-') +
        row('规格', o.spec || '-') +
        row('常用剂量', '单次 ' + (dr.single_min_mg || '?') + '-' + (dr.single_max_mg || 'mg') + '，日最大 ' + (dr.daily_max_mg || '-') + 'mg，' + (dr.default_freq || '')) +
        row('抗菌药分级', o.abx_level || '无') + row('医保', o.medical_insurance_class || '-') +
        row('基药', o.essential_medicine ? '是' : '否') + row('价格', '¥' + (o.price_yuan != null ? o.price_yuan : '-')) +
        row('肝肾注意', o.liver_renal_note || '-') +
        row('特殊警示', (o.special_warnings_json || []).join('；') || '-') +
        '</table>';
      nameEl.textContent = '💊 ' + o.generic_name;
    } else if (payload.type === 'herb') {
      h = '<table class="qr-detail-table">' +
        row('药名', o.name) + row('拼音', o.pinyin || '-') +
        row('分类', o.category || '-') + row('性味', (o.nature || '') + ' ' + (o.taste || '')) +
        row('归经', o.meridian || '-') + row('常用量', o.dose_range || '-') +
        row('功效', o.functions || '-') +
        row('主治', (o.indications || []).join('、') || '-') +
        row('禁忌', (o.contraindications || []).join('；') || '-') +
        row('配伍', o.incompatibility || '-') +
        '</table>';
      nameEl.textContent = '🌿 ' + o.name;
    } else if (payload.type === 'formula') {
      var comp = (o.composition || []).map(function (c) {
        return '<tr><td>' + escapeHtml(c.herb) + '</td><td>' + escapeHtml(c.role || '') + '</td><td>' + escapeHtml(c.dose || '') + '</td></tr>';
      }).join('');
      h = '<table class="qr-detail-table">' +
        row('方名', o.name) + row('出处', o.source || '-') + row('类别', o.category || '-') +
        '</table>' +
        '<h4 style="margin:12px 0 6px;">组成（君臣佐使）</h4>' +
        '<table class="qr-detail-table"><thead><tr><th>药味</th><th>角色</th><th>剂量</th></tr></thead><tbody>' + comp + '</tbody></table>' +
        rowInline('功效', o.functions) + rowInline('主治', o.indications) +
        rowInline('禁忌', (o.contraindications || []).join('；')) +
        rowInline('化裁', (o.modified || []).join('；'));
      nameEl.textContent = '📜 ' + o.name;
    } else if (payload.type === 'point') {
      var chips = (Array.isArray(o.indications) ? o.indications : (o.indications ? [o.indications] : []))
        .map(function (i) { return '<span class="ap-chip">' + escapeHtml(i) + '</span>'; }).join('');
      h = '<table class="qr-detail-table">' +
        row('穴名', o.name + ' (' + (o.code || '') + ')') +
        row('归经', o.meridian || '-') + row('类属', o.category || '-') +
        row('定位', o.location || '-') + row('功用', o.functions || '-') +
        row('刺法', o.needling_method || '-') +
        '</table>' + '<h4 style="margin:10px 0 6px;">主治</h4><div>' + chips + '</div>' +
        (o.special_note ? '<div class="ap-note" style="margin-top:10px;">⚠ ' + escapeHtml(o.special_note) + '</div>' : '');
      nameEl.textContent = '📍 ' + o.name;
    } else if (payload.type === 'anat') {
      h = '<table class="qr-detail-table">' +
        row('结构', o.name + (o.latin ? ' (' + o.latin + ')' : '')) +
        row('所属系统', (o.system || '') + (o.subsystem ? ' · ' + o.subsystem : '')) +
        row('位置', o.location || '-') + row('功能', o.function || '-') +
        row('毗邻', o.relations || '-') + row('临床要点', o.clinical || '-') +
        '</table>' +
        ((o.exam_points && o.exam_points.length) ? '<h4 style="margin:10px 0 6px;">考点</h4><ul class="qr-exam-list">' +
          o.exam_points.map(function (e) { return '<li>' + escapeHtml(e) + '</li>'; }).join('') + '</ul>' : '');
      nameEl.textContent = '🫀 ' + o.name;
    } else if (payload.type === 'disease') {
      var sp = o.symptom_pool || {};
      h = '<table class="qr-detail-table">' +
        row('病名', o.name) + row('ICD-10', o.icd10 || o.code || '-') +
        row('难度', o.difficulty || '-') +
        row('一线口服药', (o.first_line_oral || []).join('、') || '-') +
        row('二线输液药', (o.second_line_iv || []).join('、') || '无') +
        row('鉴别诊断', (o.differential || []).join('；') || '-') +
        row('禁忌/注意', (o.contraindications || []).join('；') || o.special_population_note || '-') +
        '</table>' +
        '<h4 style="margin:10px 0 6px;">典型主诉</h4><div class="muted">' +
        ((sp.chief_complaint || []).slice(0, 2).map(escapeHtml).join('<br>')) + '</div>';
      nameEl.textContent = '🏥 ' + o.name;
    }
    bodyEl.innerHTML = h;
    $('modal-quickref').classList.remove('hidden');
  }
  function row(k, v) { return '<tr><td class="qr-k">' + escapeHtml(k) + '</td><td>' + escapeHtml(v || '-') + '</td></tr>'; }
  function rowInline(k, v) { return '<h4 style="margin:10px 0 4px;">' + escapeHtml(k) + '</h4><div class="muted">' + escapeHtml(v || '-') + '</div>'; }

  function qrInit() {
    var input = $('quickref-input');
    if (!input) return;
    var catSel = $('quickref-cat');
    var timer = null;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { qrSearch(input.value, catSel.value); }, 180);
    });
    if (catSel) catSel.addEventListener('change', function () { qrSearch(input.value, catSel.value); });
    document.querySelectorAll('.qr-hot-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        input.value = b.getAttribute('data-kw');
        qrSearch(input.value, catSel.value);
        input.focus();
      });
    });
    var closeBtn = $('qr-detail-close');
    if (closeBtn) closeBtn.onclick = function () { $('modal-quickref').classList.add('hidden'); };
    var mask = $('modal-quickref');
    if (mask) mask.onclick = function (e) { if (e.target === mask) mask.classList.add('hidden'); };
  }

  /* =====================================================================
   * 二、学习统计分模块增强
   * ===================================================================== */
  var STATS = {
    activeModule: ''   // '' = 全部
  };

  function readHistorySafe() { return store.getJSON('rx-profile-history', []); }
  function readMistakesSafe() { return store.getJSON('rx-mistakes', []); }

  function moduleOf(h) { return h.module || '西医'; }
  var ALL_MODULES = ['', '西医', '中医汉方', '针灸推拿', '解剖学'];
  var MODULE_LABEL = { '': '全部', '西医': '西医处方', '中医汉方': '中医汉方', '针灸推拿': '针灸推拿', '解剖学': '解剖学' };

  function injectStatsTabs() {
    if ($('stats-module-tabs')) return;
    var head = document.querySelector('#view-stats .report-head');
    if (!head) return;
    var tabs = document.createElement('div');
    tabs.className = 'stats-module-tabs';
    tabs.id = 'stats-module-tabs';
    tabs.innerHTML = ALL_MODULES.map(function (m) {
      return '<button class="stats-tab' + (m === STATS.activeModule ? ' active' : '') + '" data-sm="' + m + '">' +
        MODULE_LABEL[m] + '</button>';
    }).join('');
    head.appendChild(tabs);
    tabs.querySelectorAll('.stats-tab').forEach(function (b) {
      b.onclick = function () {
        STATS.activeModule = b.getAttribute('data-sm');
        tabs.querySelectorAll('.stats-tab').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        renderEnhancedStats();
      };
    });
  }

  function renderEnhancedStats() {
    var hist = readHistorySafe();
    var ms = STATS.activeModule;
    var filtered = ms ? hist.filter(function (h) { return moduleOf(h) === ms; }) : hist;

    // 基础卡片
    var total = filtered.length;
    setText('stat-total', total);
    if (total > 0) {
      var scores = filtered.map(function (h) { return h.total; });
      var avg = Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / total);
      var best = Math.max.apply(null, scores);
      var pass = scores.filter(function (s) { return s >= 60; }).length;
      setText('stat-avg', avg);
      setText('stat-best', best);
      setText('stat-pass-rate', Math.round(pass / total * 100) + '%');
    } else {
      setText('stat-avg', '--'); setText('stat-best', '--'); setText('stat-pass-rate', '--');
    }

    // 趋势
    var trendBox = $('score-trend');
    if (trendBox) {
      if (total > 0) {
        var recent = filtered.slice(0, 10).reverse();
        trendBox.innerHTML = '<div class="trend-chart">' + recent.map(function (h) {
          var hgt = Math.max(4, h.total / 100 * 120);
          return '<div class="trend-bar-wrap" title="' + escapeHtml(h.disease || '') + '"><div class="trend-bar" style="height:' + hgt + 'px"></div><div class="trend-label">' + h.total + '</div></div>';
        }).join('') + '</div>';
      } else {
        trendBox.innerHTML = '<p class="muted">暂无数据</p>';
      }
    }

    // 疾病分布
    var distBox = $('disease-dist');
    if (distBox) {
      var src = filtered.filter(function (h) { return h.disease; });
      if (src.length) {
        var dist = {};
        src.forEach(function (h) { dist[h.disease] = (dist[h.disease] || 0) + 1; });
        var sorted = Object.entries(dist).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10);
        var maxC = Math.max.apply(null, sorted.map(function (s) { return s[1]; }));
        distBox.innerHTML = sorted.map(function (e) {
          return '<div class="dist-row"><span class="dist-name">' + escapeHtml(e[0]) + '</span>' +
            '<div class="dist-bar-wrap"><div class="dist-bar" style="width:' + (e[1] / maxC * 100) + '%"></div></div>' +
            '<span class="dist-count">' + e[1] + '次</span></div>';
        }).join('');
      } else {
        distBox.innerHTML = '<p class="muted">暂无数据</p>';
      }
    }

    // 知识点掌握度（从错题本按规则类型聚合）
    renderKnowledgeMastery(ms);

    // 隐藏 module-views.js 注入的旧分模块卡（已被 tab 取代，避免重复）
    var oldBox = $('module-stats-row');
    if (oldBox && oldBox.parentNode) oldBox.parentNode.style.display = 'none';
  }

  function setText(id, v) { var el = $(id); if (el) el.textContent = v; }

  // 规则 ID → 规则类型中文
  function ruleTypeOf(ruleId) {
    if (!ruleId) return '其他';
    var s = String(ruleId).toUpperCase();
    var segs = s.split('-');
    // TCM-/ACUP- 前缀时取第二段作为分类
    var cls = segs[0];
    if ((cls === 'TCM' || cls === 'ACUP') && segs.length > 1) cls = segs[1];
    var map = {
      'FMT': '格式', 'IND': '适应症', 'DOSE': '剂量', 'DUR': '疗程',
      'DUP': '重复用药', 'INT': '相互作用', 'INTER': '相互作用',
      'POP': '特殊人群', 'ABX': '抗菌药分级', 'IV': '输液', 'YN': '医保',
      'SPEC': '特殊', 'DD': '诊断', 'TCM': '中药配伍',
      'INCOMPAT': '中药配伍', 'SYN': '辨证', 'EFF': '功效主治',
      'PRINCIPLE': '选穴原则', 'PEIPEI': '配穴', 'TD': '特定穴/禁忌'
    };
    return map[cls] || '其他';
  }

  function renderKnowledgeMastery(ms) {
    var boxId = 'knowledge-mastery-box';
    var box = $(boxId);
    if (!box) {
      box = document.createElement('div');
      box.className = 'stats-section';
      box.id = boxId;
      box.innerHTML = '<h3>🎯 知识点掌握度（按规则类型）</h3><div id="knowledge-mastery-body"></div>';
      var distSec = $('disease-dist');
      if (distSec && distSec.parentNode) distSec.parentNode.insertBefore(box, distSec.nextSibling);
    }
    var body = $('knowledge-mastery-body');
    if (!body) return;
    var mistakes = readMistakesSafe();
    var filtered = ms ? mistakes.filter(function (m) { return (m.module || '西医') === ms; }) : mistakes;

    // 统计每类规则的错误命中次数
    var agg = {};
    filtered.forEach(function (m) {
      (m.errors || []).forEach(function (e) {
        var t = ruleTypeOf(e.rule_id);
        agg[t] = agg[t] || { err: 0, warn: 0 };
        agg[t].err++;
      });
      (m.warns || []).forEach(function (w) {
        var t = ruleTypeOf(w.rule_id);
        agg[t] = agg[t] || { err: 0, warn: 0 };
        agg[t].warn++;
      });
    });
    var entries = Object.entries(agg).sort(function (a, b) {
      return (b[1].err + b[1].warn) - (a[1].err + a[1].warn);
    });
    if (!entries.length) {
      body.innerHTML = '<p class="muted">暂无错题数据。完成几次处方后，这里会按规则类型统计你的薄弱点。</p>';
      return;
    }
    var maxHits = Math.max.apply(null, entries.map(function (e) { return e[1].err + e[1].warn; }));
    body.innerHTML = '<div class="km-grid">' + entries.map(function (e) {
      var t = e[0], v = e[1];
      var total = v.err + v.warn;
      var pct = Math.round(total / maxHits * 100);
      var cls = v.err > 0 ? 'km-bad' : 'km-warn';
      return '<div class="km-card ' + cls + '">' +
        '<div class="km-name">' + escapeHtml(t) + '</div>' +
        '<div class="km-bar-wrap"><div class="km-bar" style="width:' + pct + '%"></div></div>' +
        '<div class="km-num">错误 ' + v.err + ' · 警告 ' + v.warn + '</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  /* =====================================================================
   * 三、错题本增强（筛选 + 单条移除 + 重练）
   * ===================================================================== */
  var MF = { mod: '', sev: '', rtype: '', time: '' };

  function injectMistakesFilter() {
    if ($('mistakes-filter-bar')) return;
    var list = $('mistakes-list');
    if (!list) return;
    // 移除 module-views.js 注入的旧 chip 行（我们的筛选栏更全）
    var oldChip = $('module-filter-row');
    if (oldChip && oldChip.parentNode) oldChip.parentNode.removeChild(oldChip);

    var bar = document.createElement('div');
    bar.className = 'mistakes-filter-bar';
    bar.id = 'mistakes-filter-bar';
    bar.innerHTML =
      '<select id="mf-mod"><option value="">全部模块</option>' +
        '<option>西医</option><option>中医汉方</option><option>针灸推拿</option><option>解剖学</option></select>' +
      '<select id="mf-sev"><option value="">全部错误类型</option>' +
        '<option value="error">错误 error</option><option value="warn">警告 warn</option></select>' +
      '<select id="mf-rtype"><option value="">全部规则类型</option>' +
        ['格式', '适应症', '剂量', '疗程', '重复用药', '相互作用', '特殊人群', '抗菌药分级', '输液', '医保',
         '中药配伍', '辨证', '功效主治', '选穴原则', '配穴', '特定穴/禁忌', '其他']
        .map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select>' +
      '<select id="mf-time"><option value="">全部时间</option>' +
        '<option value="7">最近7天</option><option value="30">最近30天</option></select>';
    list.parentNode.insertBefore(bar, list);

    ['mf-mod', 'mf-sev', 'mf-rtype', 'mf-time'].forEach(function (id) {
      var el = $(id);
      if (el) el.onchange = function () {
        MF.mod = $('mf-mod').value; MF.sev = $('mf-sev').value;
        MF.rtype = $('mf-rtype').value; MF.time = $('mf-time').value;
        renderEnhancedMistakes();
      };
    });
  }

  function mistakePassFilter(m) {
    if (MF.mod && (m.module || '西医') !== MF.mod) return false;
    if (MF.time) {
      var days = parseInt(MF.time, 10);
      if (Date.now() - (m.t || 0) > days * 86400000) return false;
    }
    var errs = m.errors || [], warns = m.warns || [];
    if (MF.sev === 'error' && errs.length === 0) return false;
    if (MF.sev === 'warn' && warns.length === 0) return false;
    if (MF.rtype) {
      var hit = errs.concat(warns).some(function (r) { return ruleTypeOf(r.rule_id) === MF.rtype; });
      if (!hit) return false;
    }
    return true;
  }

  function renderEnhancedMistakes() {
    var arr = readMistakesSafe();
    var box = $('mistakes-list');
    if (!box) return;
    var filtered = arr.map(function (m, i) { return { m: m, idx: i }; }).filter(function (x) { return mistakePassFilter(x.m); });

    if (filtered.length === 0) {
      box.innerHTML = '<p class="muted center">' + (arr.length === 0 ? '暂无错题，继续保持！🎉' : '当前筛选条件下暂无错题。') + '</p>';
      return;
    }
    box.innerHTML = filtered.map(function (x) {
      var m = x.m, i = x.idx;
      var mod = m.module || '西医';
      var modCls = mod === '中医汉方' ? 'mb-tcm' : mod === '针灸推拿' ? 'mb-acup' : mod === '解剖学' ? 'mb-anat' : 'mb-western';
      var timeStr = new Date(m.t || Date.now()).toLocaleString();
      var score = m.score != null ? m.score : '--';
      var scoreCls = score >= 80 ? 'good' : score >= 60 ? 'mid' : 'bad';
      return '<div class="mistake-card" data-midx="' + i + '" data-mod="' + escapeHtml(mod) + '">' +
        '<div class="mistake-head">' +
          '<span class="module-badge ' + modCls + '">' + escapeHtml(mod) + '</span>' +
          '<span class="tag tag-diff">' + escapeHtml(m.disease || '未知病例') + '</span>' +
          '<span class="muted">' + timeStr + '</span>' +
          '<span class="score-badge ' + scoreCls + '">' + score + '分</span>' +
        '</div>' +
        ((m.errors || []).length ? '<div class="mistake-errors"><h4>❌ 错误（' + m.errors.length + '）</h4>' +
          m.errors.map(function (e) {
            return '<div class="mistake-item error"><b>[' + escapeHtml(e.rule_id || '') + ']</b> ' + escapeHtml(e.title || '') +
              '<br><span class="muted">' + escapeHtml(e.message || '') + '</span>' +
              '<br><span class="sug">💡 ' + escapeHtml(e.suggestion || '掌握相关知识点') + '</span></div>';
          }).join('') + '</div>' : '') +
        ((m.warns || []).length ? '<div class="mistake-warns"><h4>⚠️ 警告（' + m.warns.length + '）</h4>' +
          m.warns.map(function (w) {
            return '<div class="mistake-item warn"><b>[' + escapeHtml(w.rule_id || '') + ']</b> ' + escapeHtml(w.title || '') +
              '<br><span class="muted">' + escapeHtml(w.message || '') + '</span></div>';
          }).join('') + '</div>' : '') +
        '<div class="mistake-actions no-print">' +
          '<button class="btn btn-sm qr-retry-btn" data-mod="' + escapeHtml(mod) + '">🔁 重练此题</button>' +
          '<button class="btn btn-sm btn-danger qr-remove-btn" data-midx="' + i + '">🗑 移除此条</button>' +
        '</div>' +
      '</div>';
    }).join('');

    // 绑定移除
    box.querySelectorAll('.qr-remove-btn').forEach(function (b) {
      b.onclick = function () {
        if (!confirm('确定移除此条错题？')) return;
        var idx = parseInt(b.getAttribute('data-midx'), 10);
        var all = readMistakesSafe();
        all.splice(idx, 1);
        store.setJSON('rx-mistakes', all);
        renderEnhancedMistakes();
      };
    });
    // 绑定重练
    box.querySelectorAll('.qr-retry-btn').forEach(function (b) {
      b.onclick = function () {
        var mod = b.getAttribute('data-mod');
        retryByModule(mod);
      };
    });
  }

  function retryByModule(mod) {
    // 切换到对应模块首页并触发新病例
    // 先切模块 tab
    var tab = document.querySelector('.module-tab[data-module="' +
      (mod === '西医' ? 'western' : mod === '中医汉方' ? 'tcm' : mod === '针灸推拿' ? 'acup' : 'anat') + '"]');
    if (tab) tab.click();
    setTimeout(function () {
      try {
        if (mod === '西医' && window.__newCase) window.__newCase();
        else if (mod === '中医汉方' && document.getElementById('tcm-btn-new')) document.getElementById('tcm-btn-new').click();
        else if (mod === '针灸推拿' && document.getElementById('acup-btn-new')) document.getElementById('acup-btn-new').click();
        else if (mod === '解剖学') {
          // 解剖学跳到首页/测验
          var q = document.getElementById('anat-btn-quiz');
          if (q) q.click();
        }
      } catch (e) { console.warn('retryByModule failed', e); }
    }, 120);
  }

  /* =====================================================================
   * 四、经络图分经显示
   * ===================================================================== */
  var MERIDIAN_IMG = {
    '手太阴肺经': 'img/meridians/LU-lung.jpg',
    '手阳明大肠经': 'img/meridians/LI-large-intestine.jpg',
    '足阳明胃经': 'img/meridians/ST-stomach.jpg',
    '足太阴脾经': 'img/meridians/SP-spleen.jpg',
    '手少阴心经': 'img/meridians/HT-heart.jpg',
    '手太阳小肠经': 'img/meridians/SI-small-intestine.jpg',
    '足太阳膀胱经': 'img/meridians/BL-bladder.jpg',
    '足少阴肾经': 'img/meridians/KI-kidney.jpg',
    '手厥阴心包经': 'img/meridians/PC-pericardium.jpg',
    '手少阳三焦经': 'img/meridians/TE-sanjiao.jpg',
    '足少阳胆经': 'img/meridians/GB-gallbladder.jpg',
    '足厥阴肝经': 'img/meridians/LR-liver.jpg',
    '任脉': 'img/meridians/RN-ren.jpg',
    '督脉': 'img/meridians/GV-du.jpg',
    '经外奇穴': 'img/meridians/EX-extra-points.jpg'
  };
  var FALLBACK_IMG = 'img/acup-meridian-chart.jpg';

  // 每张经络图的实际像素尺寸（用 System.Drawing 核实），切换 src 时同步 width/height 属性，
  // 浏览器据此保持原始比例渲染，避免横版/竖版图被写死的 1300x867 拉伸变形。
  var MERIDIAN_IMG_SIZE = {
    'img/acup-meridian-chart.jpg': [1300, 867],   // 总图：横版三视图
    'img/meridians/EX-extra-points.jpg': [1300, 1300] // 经外奇穴：方图
  };
  // 14 张分经图全部为 1672x2508 竖版人体图
  (function () {
    var list = [
      'img/meridians/LU-lung.jpg','img/meridians/LI-large-intestine.jpg','img/meridians/ST-stomach.jpg',
      'img/meridians/SP-spleen.jpg','img/meridians/HT-heart.jpg','img/meridians/SI-small-intestine.jpg',
      'img/meridians/BL-bladder.jpg','img/meridians/KI-kidney.jpg','img/meridians/PC-pericardium.jpg',
      'img/meridians/TE-sanjiao.jpg','img/meridians/GB-gallbladder.jpg','img/meridians/LR-liver.jpg',
      'img/meridians/RN-ren.jpg','img/meridians/GV-du.jpg'
    ];
    for (var i = 0; i < list.length; i++) MERIDIAN_IMG_SIZE[list[i]] = [1672, 2508];
  })();

  // 常用穴位定位特写图（code -> 局部解剖特写）
  var POINT_CLOSEUP_IMG = {
    'LI-04': 'img/meridians/EX-point-hegu.jpg',
    'ST-36': 'img/meridians/EX-point-zusanli.jpg',
    'PC-06': 'img/meridians/EX-point-neiguan.jpg',
    'SP-06': 'img/meridians/EX-point-sanyinjiao.jpg',
    'RN-04': 'img/meridians/EX-point-guanyuan.jpg',
    'KI-01': 'img/meridians/EX-point-yongquan.jpg'
  };

  function hookMeridianMap() {
    var sel = $('acup-map-meridian');
    if (!sel) return;
    var img = $('acup-map-img');
    var caption = $('acup-map-caption');
    if (!img) return;

    function apply() {
      var m = sel.value;
      var src = m && MERIDIAN_IMG[m] ? MERIDIAN_IMG[m] : FALLBACK_IMG;
      // 避免重复加载同一张
      if (img.getAttribute('src') === src) return;
      img.onerror = function () {
        // 分经图不存在时回退总图：同步尺寸和布局类，避免总图被按竖版比例渲染变形
        if (img.getAttribute('src') !== FALLBACK_IMG) {
          img.onerror = null; // 防止循环
          var sz = MERIDIAN_IMG_SIZE[FALLBACK_IMG] || [1300, 867];
          img.width = sz[0]; img.height = sz[1];
          var b = document.querySelector('.acup-map-body');
          if (b) b.classList.add('mode-chart');
          img.src = FALLBACK_IMG;
        }
      };
      // 同步更新 width/height 属性：浏览器据此保持原始比例，CSS 的 height:auto 才不会拉伸
      var size = MERIDIAN_IMG_SIZE[src] || [1300, 867];
      img.width = size[0];
      img.height = size[1];
      if ('decoding' in img) img.decoding = 'async';
      // 切换布局模式：总图（横版三视图）单列居中放大；分经图/奇穴走双栏左图右列表
      var body = document.querySelector('.acup-map-body');
      if (body) {
        if (src === FALLBACK_IMG) body.classList.add('mode-chart');
        else body.classList.remove('mode-chart');
      }
      img.src = src;
      if (caption) {
        caption.textContent = m ? (m + ' 穴位图') : '十四经常用腧穴（十二经脉 + 任脉 + 督脉）';
      }
    }
    // 监听下拉变化（acup-app.js 已绑定 onchange 渲染穴位列表，我们叠加一个监听）
    sel.addEventListener('change', apply);
    // 初始应用一次
    apply();
  }

  // 点击穴位卡片时，在详情弹窗顶部注入该穴的局部解剖定位特写图
  function hookPointCloseup() {
    // 注入特写图样式（避免改动压缩版 css）
    if (!document.getElementById('ap-closeup-style')) {
      var st = document.createElement('style');
      st.id = 'ap-closeup-style';
      st.textContent =
        '.ap-closeup{display:block;max-width:100%;max-height:340px;width:auto;height:auto;' +
        'margin:0 auto 12px;border-radius:8px;border:1px solid #e2e8f0;box-shadow:0 2px 8px rgba(0,0,0,.08);}';
      document.head.appendChild(st);
    }
    document.addEventListener('click', function (e) {
      var card = e.target.closest('.acup-map-point-card');
      if (!card) return;
      var code = card.getAttribute('data-code');
      var src = code && POINT_CLOSEUP_IMG[code];
      if (!src) return;
      // 等待 acup-app.min.js 把弹窗内容渲染好
      setTimeout(function () {
        var body = $('ap-body');
        if (!body) return;
        var old = body.querySelector('.ap-closeup');
        if (old) old.remove();
        var img = document.createElement('img');
        img.src = src;
        img.className = 'ap-closeup';
        img.alt = '穴位定位特写';
        img.loading = 'lazy';
        img.onerror = function () { img.remove(); };
        body.insertBefore(img, body.firstChild);
      }, 30);
    }, true);
  }

  /* =====================================================================
   * 五、全局 BUG 补丁 / 导航路由
   * ===================================================================== */
  function hookNavigation() {
    // 拦截 data-goto="quickref"
    document.querySelectorAll('[data-goto="quickref"]').forEach(function (b) {
      b.addEventListener('click', function () {
        showViewOnly('view-quickref');
        qrLoadAll();
      });
    });

    // 任何导航/模块 tab 点击时，隐藏速查页（因为 app.js 的 show() 列表不含 view-quickref）
    document.querySelectorAll('.nav-btn, .module-tab, [data-goto]').forEach(function (b) {
      if (b.getAttribute('data-goto') === 'quickref') return;
      b.addEventListener('click', function () {
        var qr = $('view-quickref');
        if (qr) qr.classList.add('hidden');
      });
    });

    // 拦截 stats / mistakes 导航，在 app.js 渲染后增强
    document.querySelectorAll('[data-goto="stats"]').forEach(function (b) {
      b.addEventListener('click', function () {
        setTimeout(function () { injectStatsTabs(); renderEnhancedStats(); }, 80);
      });
    });
    document.querySelectorAll('[data-goto="mistakes"]').forEach(function (b) {
      b.addEventListener('click', function () {
        setTimeout(function () { injectMistakesFilter(); renderEnhancedMistakes(); }, 80);
      });
    });

    // 清空错题本按钮：清空后重新渲染增强版
    var clearMis = $('btn-clear-mistakes');
    if (clearMis) clearMis.addEventListener('click', function () {
      setTimeout(function () { injectMistakesFilter(); renderEnhancedMistakes(); }, 100);
    });
    // 清空历史按钮：清空后重新渲染增强统计
    var clearHist = $('btn-clear-history');
    if (clearHist) clearHist.addEventListener('click', function () {
      setTimeout(function () { renderEnhancedStats(); }, 100);
    });
  }

  // 通用视图切换（只切换显示，不触发业务渲染）
  function showViewOnly(id) {
    var ids = [
      'view-home','view-rx','view-report','view-radar','view-mistakes','view-stats','view-drugs','view-pitfalls',
      'view-tcm-home','view-tcm-case','view-tcm-rx','view-tcm-report',
      'view-acup-home','view-acup-map','view-acup-case','view-acup-rx','view-acup-report',
      'view-anat-home','view-anat-atlas','view-anat-system','view-anat-detail','view-anat-quiz','view-anat-cases',
      'view-quickref'
    ];
    ids.forEach(function (v) { var el = $(v); if (el) el.classList.add('hidden'); });
    var target = $(id);
    if (target) target.classList.remove('hidden');
    window.scrollTo(0, 0);
    // 关闭移动菜单
    var nav = $('main-nav');
    if (nav) nav.classList.remove('open');
  }

  // 视图切换时关闭弹窗
  document.addEventListener('click', function (e) {
    if (e.target.closest('.nav-btn, .module-tab, [data-goto]')) {
      ['modal-quickref', 'modal-drug-detail', 'modal-acup-point'].forEach(function (id) {
        var m = $(id); if (m) m.classList.add('hidden');
      });
    }
  }, true);

  /* ---------- 启动 ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    qrInit();
    hookNavigation();
    hookPointCloseup();
    // 经络图可能在 acup-app.js 之后才初始化好 select，延迟轮询
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if ($('acup-map-meridian')) { hookMeridianMap(); clearInterval(timer); }
      else if (tries > 30) clearInterval(timer);
    }, 200);
  });

})();

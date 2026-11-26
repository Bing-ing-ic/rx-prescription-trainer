/*
 * medical-assist.js  全站 AI 辅助通用服务层（纯前端适配，无 UI 框架依赖）
 *
 * 与具体模块引擎解耦：现代医学 / 汉方 / 针灸 / 解剖 / 错题复盘等场景，
 * 统一通过 MedicalAssist.ask({scene, module, context, candidates, question}) 调用。
 * 代理或模型不可用时静默降级为 { ok:false, reason }，纯规则视图不受影响。
 *
 * 面板按场景驱动：角色身份、主题色、副标题与紧凑度由 SCENE_META 决定；
 * 红线不变——规则结论为准、只渲染白名单内关联实体、免责脚注固定展示、不可达静默降级。
 *
 * 全局：window.MedicalAssist
 */
(function (global) {
  'use strict';

  // 与代理 Worker SCENES 注册表保持一致；新增场景两端同步追加。
  var SCENES = [
    'rx_diagnosis',
    'rx_review',
    'tcm_zheng',
    'tcm_formula_diff',
    'acup_point',
    'anat_explain',
    'mistake_review',
    'quickref_explain'
  ];

  // 场景元信息：theme 映射 CSS 主题色；compact 为错题等内嵌紧凑变体。
  var SCENE_META = {
    rx_diagnosis: {
      icon: '🩺', theme: 'wx', compact: false,
      title: '诊断思路助教', sub: '梳理支持与鉴别依据，不下最终诊断、不开药',
      trigger: 'AI 诊断思路'
    },
    rx_review: {
      icon: '💊', theme: 'wx', compact: false,
      title: '处方点评助教', sub: '点评用药依据与错因改进，不调整剂量疗程',
      trigger: 'AI 处方点评'
    },
    tcm_zheng: {
      icon: '🌿', theme: 'tcm', compact: false,
      title: '辨证思路助教', sub: '讲解病机与舌脉依据，不直接开方',
      trigger: 'AI 辨证思路'
    },
    tcm_formula_diff: {
      icon: '📜', theme: 'tcm', compact: false,
      title: '类方辨析助教', sub: '在候选方范围内比较功用与主治侧重',
      trigger: 'AI 类方辨析'
    },
    acup_point: {
      icon: '📌', theme: 'acup', compact: false,
      title: '选穴配穴助教', sub: '解释已选穴位配伍逻辑，不新增穴位',
      trigger: 'AI 选穴说明'
    },
    anat_explain: {
      icon: '🦴', theme: 'anat', compact: false,
      title: '结构讲解助教', sub: '结合位置、毗邻与功能辅助记忆',
      trigger: 'AI 结构讲解'
    },
    mistake_review: {
      icon: '✏️', theme: 'warn', compact: true,
      title: '错题复盘助教', sub: '讲清错因并给出复习建议',
      trigger: 'AI 错题复盘'
    },
    quickref_explain: {
      icon: '📚', theme: 'info', compact: false,
      title: '知识库讲解助教', sub: '基于检索条目补充解释，不编造信息',
      trigger: 'AI 补充讲解'
    }
  };

  function metaOf(scene) {
    return SCENE_META[scene] || {
      icon: '🤖', theme: 'info', compact: false,
      title: 'AI 教学助教', sub: '仅作讲解、鉴别与纠错辅助', trigger: 'AI 辅助解读'
    };
  }

  var state = {
    endpoint: '',          // 代理地址；空=未接入
    enabled: true,         // 总开关
    timeoutMs: 25000,      // 单次解读请求超时（覆盖模型实测 10–15s + 冷启动余量）
    pingTimeoutMs: 8000,   // 连通性探测超时
    retryTimes: 1,         // 瞬时抖动自动重试次数（超时/限流不重试）
    pingCache: { at: 0, ok: false, reason: 'unavailable' }
  };

  var PING_OK_TTL = 60000;
  var PING_FAIL_TTL = 10000;

  function configure(opts) {
    opts = opts || {};
    if ('endpoint' in opts) state.endpoint = String(opts.endpoint || '');
    if ('enabled' in opts) state.enabled = !!opts.enabled;
    if (opts.timeoutMs) state.timeoutMs = Number(opts.timeoutMs);
  }

  function scenes() { return SCENES.slice(); }

  function isConfigured() { return !!state.endpoint; }

  async function ping() {
    var now = Date.now();
    var cached = state.pingCache;
    var ttl = cached.ok ? PING_OK_TTL : PING_FAIL_TTL;
    if (now - cached.at < ttl) {
      return { ok: cached.ok, reason: cached.reason };
    }
    if (!state.endpoint) {
      state.pingCache = { at: now, ok: false, reason: 'unavailable' };
      return { ok: false, reason: 'unavailable' };
    }
    try {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, state.pingTimeoutMs);
      var resp = await fetch(state.endpoint.replace(/\/+$/, '') + '/healthz', { signal: ctrl.signal });
      clearTimeout(timer);
      if (!resp.ok) throw new Error('http ' + resp.status);
      var data = await resp.json();
      var ok = !!(data.ok && data.enabled !== false && data.configured !== false);
      state.pingCache = { at: now, ok: ok, reason: ok ? '' : 'unavailable' };
      return { ok: ok, reason: ok ? '' : 'unavailable' };
    } catch (e) {
      state.pingCache = { at: now, ok: false, reason: 'unavailable' };
      return { ok: false, reason: 'unavailable' };
    }
  }

  async function isEnabled() {
    if (!state.enabled || !state.endpoint) return false;
    var p = await ping();
    return p.ok;
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  // 单次请求：区分超时 / 限流围栏 / 上游错误 / 网络异常。
  async function requestOnce(payload) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, state.timeoutMs);
    try {
      var resp = await fetch(state.endpoint.replace(/\/+$/, '') + '/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene: payload.scene,
          module: payload.module || '',
          context: payload.context || {},
          candidates: payload.candidates || [],
          question: payload.question || '',
          locale: 'zh'
        }),
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (!resp.ok) {
        var reason = resp.status === 429 ? 'rejected' : 'unavailable';
        return { ok: false, reason: reason, httpStatus: resp.status };
      }
      var data = await resp.json();
      if (!data.ok) return { ok: false, reason: data.reason || 'unavailable' };
      return {
        ok: true,
        scene: data.scene || payload.scene,
        summary: data.summary || '',
        points: Array.isArray(data.points) ? data.points : [],
        related: Array.isArray(data.related) ? data.related : [],
        caveat: data.caveat || '',
        model: data.model || ''
      };
    } catch (e) {
      clearTimeout(timer);
      return { ok: false, reason: (e && e.name === 'AbortError') ? 'timeout' : 'unavailable' };
    }
  }

  // 仅瞬时网络/上游抖动（unavailable）做有限次自动重试；超时、限流围栏、报文类错误不重试。
  var RETRYABLE = { unavailable: true };

  async function ask(payload) {
    payload = payload || {};
    if (!state.enabled || !state.endpoint) return { ok: false, reason: 'unavailable' };
    if (SCENES.indexOf(payload.scene) < 0) return { ok: false, reason: 'bad_scene' };

    var out = await requestOnce(payload);
    var attempts = 0;
    while (!out.ok && RETRYABLE[out.reason] && attempts < state.retryTimes) {
      attempts += 1;
      await sleep(900);
      out = await requestOnce(payload);
    }
    return out;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function skeletonHtml() {
    return '<div class="assist-skeleton" aria-hidden="true">' +
      '<span></span><span></span><span></span></div>' +
      '<p class="assist-status-text">模型生成较慢，请稍候…</p>';
  }

  function downText(reason) {
    if (reason === 'timeout') return '响应超时，以下为规则结论。';
    if (reason === 'rejected') return '辅助繁忙被限流，以下为规则结论。';
    return '辅助暂不可用，以下为规则结论。';
  }

  function renderResult(out) {
    var html = '';
    if (out.summary) {
      html += '<p class="assist-summary">' + escapeHtml(out.summary) + '</p>';
    }
    if (out.points && out.points.length) {
      html += '<ul class="assist-points">' + out.points.map(function (p) {
        return '<li>' + escapeHtml(p) + '</li>';
      }).join('') + '</ul>';
    }
    if (out.related && out.related.length) {
      html += '<div class="assist-related"><span class="assist-related-label">关联候选</span>' +
        out.related.map(function (r) {
          return '<span class="assist-chip">' + escapeHtml(r) + '</span>';
        }).join('') + '</div>';
    }
    var foot = '';
    if (out.model) foot += '<span class="assist-model">模型：' + escapeHtml(out.model) + '</span>';
    foot += '<button type="button" class="assist-retry">🔁 重新分析</button>';
    html += '<div class="assist-foot">' + foot + '</div>';
    if (out.caveat) {
      html += '<div class="assist-caveat">⚠ ' + escapeHtml(out.caveat) + '</div>';
    }
    return html;
  }

  // 通用面板构造器：各模块把锚点 DOM + 场景报文传入，统一渲染头部 / 折叠区 / 懒请求 / 降级。
  // 未配置代理时直接返回 null，锚点保持原样，纯规则视图不受影响。
  function mountPanel(anchor, payload, opts) {
    if (!anchor || typeof document === 'undefined') return null;
    if (!isConfigured()) return null;
    opts = opts || {};

    var meta = metaOf(payload.scene);
    var themeCls = 'assist-panel--' + meta.theme;
    var compactCls = meta.compact ? ' assist-panel--compact' : '';

    var wrap = document.createElement('div');
    wrap.className = 'assist-panel' + compactCls;
    wrap.setAttribute('data-scene', payload.scene || '');
    wrap.setAttribute('data-theme', meta.theme);

    var triggerLabel = opts.buttonLabel || ('🤖 ' + meta.trigger);

    wrap.innerHTML =
      '<div class="assist-head">' +
        '<span class="assist-badge" aria-hidden="true">' + meta.icon + '</span>' +
        '<div class="assist-head-text">' +
          '<div class="assist-title">' + escapeHtml(meta.title) + '</div>' +
          '<div class="assist-sub">' + escapeHtml(meta.sub) + '</div>' +
        '</div>' +
        '<button type="button" class="assist-toggle">' + escapeHtml(triggerLabel) + '</button>' +
      '</div>' +
      '<div class="assist-body" hidden></div>';

    anchor.appendChild(wrap);

    var body = wrap.querySelector('.assist-body');
    var toggle = wrap.querySelector('.assist-toggle');
    var loaded = false;   // 是否已成功取过结果（缓存，避免重复请求）
    var busy = false;

    async function load() {
      busy = true;
      toggle.disabled = true;
      body.hidden = false;
      body.innerHTML = skeletonHtml();
      var out = await ask(payload);
      busy = false;
      toggle.disabled = false;
      if (!out.ok) {
        body.innerHTML =
          '<div class="assist-status is-down">' +
            '<span class="assist-status-icon">⚠️</span>' +
            '<span class="assist-status-text">' + escapeHtml(downText(out.reason)) + '</span>' +
            '<button type="button" class="assist-retry">🔁 重试</button>' +
          '</div>';
        bindRetry();
        return;
      }
      loaded = true;
      body.innerHTML = renderResult(out);
      bindRetry();
    }

    function bindRetry() {
      var retry = body.querySelector('.assist-retry');
      if (retry) retry.onclick = function (e) { e.stopPropagation(); load(); };
    }

    toggle.onclick = function () {
      if (busy) return;
      if (!body.hidden) { body.hidden = true; return; }
      body.hidden = false;
      if (!loaded) { load(); }
    };

    return { el: wrap, refresh: function () { load(); } };
  }

  // 自举：加载时读取全局注入配置（index.html 内 __ASSIST_CONFIG__），各模块无需重复 configure。
  if (global.__ASSIST_CONFIG__) configure(global.__ASSIST_CONFIG__);

  global.MedicalAssist = {
    VERSION: '2.0.0',
    configure: configure,
    scenes: scenes,
    metaOf: metaOf,
    isConfigured: isConfigured,
    ping: ping,
    isEnabled: isEnabled,
    ask: ask,
    mountPanel: mountPanel
  };
})(typeof window !== 'undefined' ? window : globalThis);

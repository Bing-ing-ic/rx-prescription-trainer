/*
 * medical-assist.js  全站 AI 辅助通用服务层（纯前端适配，无 UI 依赖）
 *
 * 与具体模块引擎解耦：现代医学 / 汉方 / 针灸 / 解剖 / 错题复盘等场景，
 * 统一通过 MedicalAssist.ask({scene, module, context, candidates, question}) 调用。
 * 代理或模型不可用时静默降级为 { ok:false, reason }，纯规则视图不受影响。
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

  var state = {
    endpoint: '',          // 代理地址，如 https://rx-trainer-assist.xxx.workers.dev ；空=未接入
    enabled: true,         // 总开关
    timeoutMs: 15000,
    pingTtl: 60000,
    pingCache: { at: 0, ok: false, reason: 'unavailable' }
  };

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
    if (now - state.pingCache.at < state.pingTtl) {
      return { ok: state.pingCache.ok, reason: state.pingCache.reason };
    }
    if (!state.endpoint) {
      state.pingCache = { at: now, ok: false, reason: 'unavailable' };
      return { ok: false, reason: 'unavailable' };
    }
    try {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 5000);
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

  async function ask(payload) {
    payload = payload || {};
    if (!state.enabled || !state.endpoint) return { ok: false, reason: 'unavailable' };
    if (SCENES.indexOf(payload.scene) < 0) return { ok: false, reason: 'bad_scene' };

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
      if (!resp.ok) return { ok: false, reason: 'unavailable' };
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

  global.MedicalAssist = {
    VERSION: '1.0.0',
    configure: configure,
    scenes: scenes,
    isConfigured: isConfigured,
    ping: ping,
    isEnabled: isEnabled,
    ask: ask
  };
})(typeof window !== 'undefined' ? window : globalThis);

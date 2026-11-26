/**
 * 全站 AI 辅助代理 · 平台无关核心（Cloudflare Worker / Netlify Function 共用）
 *
 * 单接口：
 *   POST /assist    通用辅助解释 / 鉴别 / 纠错
 *   GET  /healthz   连通性与配置探测（不泄露 Key）
 *
 * 环境变量（仅服务端持有，不进 Git 仓库、不进前端包）：
 *   ASSIST_LLM_BASE      OpenAI 兼容端点，如 https://open.bigmodel.cn/api/paas/v4
 *   ASSIST_LLM_MODEL     模型 ID，如 glm-4-flash
 *   ASSIST_LLM_KEY       模型 API Key
 *   ASSIST_ALLOW_ORIGIN  允许的前端来源，多个用逗号分隔
 *   ASSIST_TIMEOUT_MS    可选，默认 15000
 *   ASSIST_ENABLED       可选，"false" 时代理直接返回降级
 *
 * 红线：模型只做解释 / 鉴别 / 纠错；不出处方决策、不开新药新方新穴、不定剂量；
 *       返回实体必须落在请求 candidates 白名单内。
 */

export const MAX_BODY_BYTES = 16 * 1024;
export const DEFAULT_TIMEOUT_MS = 20000;

// 场景注册表：新增模块场景只需在此追加一条 system 模板（前端 medical-assist.js 需同步）。
export const SCENES = {
  rx_diagnosis: {
    module: 'western',
    system:
      '你是医学教学助教，帮助医学生梳理现代医学诊断思路。基于给定病例与候选诊断，解释支持与不支持的依据、需要鉴别的方向。' +
      '只做思路讲解，不下最终诊断、不开药、不定剂量。'
  },
  rx_review: {
    module: 'western',
    system:
      '你是处方点评教学助教。基于给定病例、处方药品、规则命中与得分，点评用药依据、指出错因与改进方向。' +
      '只解释规则已给出的结论，不新增药品、不调整剂量疗程。'
  },
  tcm_zheng: {
    module: 'tcm',
    system:
      '你是中医教学助教。基于病例、归纳证型与治法，解释辨证依据与立法思路，结合舌脉说明病机。' +
      '只讲解辨证逻辑，不直接开方、不定剂量。'
  },
  tcm_formula_diff: {
    module: 'tcm',
    system:
      '你是方剂学教学助教。基于主诉、证型与候选名方，做类方鉴别：比较功用、主治、证型侧重与选用倾向。' +
      '只在给定候选方范围内比较，不引入候选之外的方名。'
  },
  acup_point: {
    module: 'acup',
    system:
      '你是针灸教学助教。基于病例、辨证与已选穴位，解释选穴与配穴思路、特定穴意义与注意事项。' +
      '只解释已选穴位的配伍逻辑，不新增穴位、不定刺法剂量。'
  },
  anat_explain: {
    module: 'anat',
    system:
      '你是解剖学教学助教。基于给定结构、所属系统、功能与毗邻，讲解结构功能与考点，帮助记忆。'
  },
  mistake_review: {
    module: 'common',
    system:
      '你是错题复盘助教。基于错题规则、误选项、正确结论与教学提示，讲清错因并给出复习建议。'
  },
  quickref_explain: {
    module: 'common',
    system:
      '你是知识库检索助教。基于检索到的条目要点做补充解释，不编造条目之外的信息。'
  }
};

export const GROUND_RULE =
  '【硬性要求】\n' +
  '1. 你是教学辅助，结论以本地规则引擎与知识库为准；你不做处方决策。\n' +
  '2. 不得推荐候选清单之外的药品、方剂、穴位、术式；不得给出具体剂量、疗程、给药途径。\n' +
  '3. 输出简体中文，要点清晰；若信息不足，明确说明还需补充哪些四诊/检查信息。\n' +
  '4. 必须按 JSON 输出：{"summary": string, "points": string[], "related": string[]}；' +
  'related 只能填候选清单内出现过的名称；points 为 2-5 条要点。';

function corsHeaders(origin, allowOrigin) {
  const allowed = (allowOrigin || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = !allowOrigin || allowed.includes('*') || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin || '' : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(headers || {}) }
  });
}

function fail(reason, status, origin, allowOrigin) {
  return json({ ok: false, reason }, status || 200, corsHeaders(origin, allowOrigin));
}

// 白名单过滤：related 只保留候选清单内可匹配的名称。
export function filterRelated(related, candidates) {
  const names = (candidates || []).map(c => String(c.name || '')).filter(Boolean);
  const ids = (candidates || []).map(c => String(c.id || '')).filter(Boolean);
  if (!Array.isArray(related)) return [];
  return related
    .map(r => String(r || '').trim())
    .filter(r => r && (names.includes(r) || ids.includes(r) || names.some(n => n && r.includes(n))));
}

export function parseModelText(raw) {
  if (!raw) return { summary: '', points: [], related: [] };
  const text = String(raw).trim();
  // 兼容模型包裹 ```json ... ``` 的情况
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : text;
  try {
    const obj = JSON.parse(candidate);
    return {
      summary: String(obj.summary || ''),
      points: Array.isArray(obj.points) ? obj.points.map(String) : [],
      related: Array.isArray(obj.related) ? obj.related : []
    };
  } catch (_) {
    return { summary: text, points: [], related: [] };
  }
}

async function callLlm(env, scene, payload) {
  const base = (env.ASSIST_LLM_BASE || '').replace(/\/+$/, '');
  const model = env.ASSIST_LLM_MODEL || '';
  const key = env.ASSIST_LLM_KEY || '';
  if (!base || !model || !key) return { reason: 'unavailable' };

  const sceneDef = SCENES[scene];
  const system = `${sceneDef.system}\n\n${GROUND_RULE}`;
  const userPayload = {
    scene,
    module: sceneDef.module,
    context: payload.context || {},
    candidates: payload.candidates || [],
    question: payload.question || ''
  };

  const controller = new AbortController();
  const timeoutMs = Number(env.ASSIST_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const bodyPayload = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(userPayload, null, 2) }
    ],
    temperature: 0.3,
    max_tokens: 1024,
    stream: false
  };
  // 仅 GLM-4.5 及以上支持 thinking；默认强制思考会先产出推理链、首响变慢。
  // 设 ASSIST_LLM_THINKING=disabled 时关闭深度思考，直接作答；旧模型不传该参数。
  if (env.ASSIST_LLM_THINKING === 'disabled') {
    bodyPayload.thinking = { type: 'disabled' };
  }

  try {
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal
    });

    if (!resp.ok) {
      console.error('[assist] upstream status', resp.status);
      // 429 为限流/围栏，前端不自动重试；其余上游错误归为不可用。
      return { reason: resp.status === 429 ? 'rejected' : 'unavailable' };
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return { reason: 'rejected' };
    return { content };
  } catch (e) {
    return { reason: e && e.name === 'AbortError' ? 'timeout' : 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

// 平台无关入口：request 为标准 Web Request，env 为环境变量集合。
export async function handleRequest(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = env.ASSIST_ALLOW_ORIGIN || '';
  const cors = corsHeaders(origin, allowOrigin);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(request.url);

  if (url.pathname === '/healthz') {
    const configured = Boolean(env.ASSIST_LLM_BASE && env.ASSIST_LLM_MODEL && env.ASSIST_LLM_KEY);
    return json(
      { ok: true, enabled: env.ASSIST_ENABLED !== 'false', configured, scenes: Object.keys(SCENES) },
      200,
      cors
    );
  }

  if (url.pathname !== '/assist' || request.method !== 'POST') {
    return fail('bad_scene', 404, origin, allowOrigin);
  }

  if (env.ASSIST_ENABLED === 'false') {
    return fail('unavailable', 200, origin, allowOrigin);
  }

  let body;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return fail('oversize', 413, origin, allowOrigin);
    body = JSON.parse(raw);
  } catch (_) {
    return fail('bad_scene', 400, origin, allowOrigin);
  }

  const scene = String(body.scene || '');
  if (!SCENES[scene]) return fail('bad_scene', 400, origin, allowOrigin);
  if (!body.context || typeof body.context !== 'object') body.context = {};
  if (!Array.isArray(body.candidates)) body.candidates = [];

  const llm = await callLlm(env, scene, body);
  if (llm.reason) return fail(llm.reason, 200, origin, allowOrigin);

  const parsed = parseModelText(llm.content);
  const related = filterRelated(parsed.related, body.candidates);

  return json(
    {
      ok: true,
      scene,
      summary: parsed.summary,
      points: parsed.points,
      related,
      caveat: '教学辅助，不构成处方决策；具体诊疗须执业医师辨证。',
      model: env.ASSIST_LLM_MODEL || ''
    },
    200,
    cors
  );
}

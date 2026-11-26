# 全站 AI 辅助（解释 / 鉴别 / 纠错）二期方案 · 零费率版

> 版本：2026-11-26 · 定位：可选外挂辅助通道，不改变现有纯规则推演主链路。
> 适用范围：**整个推演医学网站**（现代医学处方、汉方学、针灸学、解剖学、错题复盘等），不绑定单一模块。

## 1. 定位与红线

### 1.1 模型做什么
- 对规则引擎 / 评分器已给出的结论做**解释、类方鉴别、错因复盘、考点讲解**。
- 回答学生追问：为什么这样辨证、两穴/两方/两药如何鉴别、这条规则错在哪里。

### 1.2 模型不做什么（硬红线）
- **不出处方决策**：不直接报新药、新方、新穴、新术式，不定剂量、疗程、给药途径。
- **不替代规则层**：诊断、选方、选穴、评分以本地规则引擎与知识库为准；模型只在规则结论之上做讲解。
- **不生成白名单外实体**：返回的药名 / 方名 / 穴名 / 病名必须落在请求 `candidates` 白名单内，越界内容由代理与前端双重过滤。
- **不采集真实患者隐私**：站点仅用于虚构教学病例；请求上下文不得包含真实姓名、身份证、手机号等。

### 1.3 与现有架构的关系
- 现有 MVP 纯静态、本地规则引擎、JSON 知识库全部保留，离线 / 无模型时照常可用。
- AI 辅助是**可选通道**：代理或模型不可用时，前端静默降级回纯规则视图，不报错、不阻断推演。

## 2. 全站场景（scene）清单

| scene | 模块 | 触发位置 | 上下文要点 | 模型任务 |
| --- | --- | --- | --- | --- |
| `rx_diagnosis` | 现代医学 | 诊断校验后 | 主诉、病史、体征、舌脉、候选诊断、鉴别诊断 | 解释诊断思路与鉴别要点 |
| `rx_review` | 现代医学 | 处方点评 / 报告页 | 病例、诊断、处方药品、规则命中、各维得分、错题 | 点评用药依据、错因与改进方向 |
| `tcm_zheng` | 汉方学 | 辨证确认后 | 病例、归纳证型、治法、舌脉 | 解释辨证依据与立法思路 |
| `tcm_formula_diff` | 汉方学 | 按症寻方结果 | 主诉、证型、Top 候选方（功用/主治/标签命中） | 类方鉴别、异同与选用倾向 |
| `acup_point` | 针灸学 | 选穴 / 配穴后 | 病例、辨证、已选穴位、配穴原则、禁忌 | 解释选穴与配穴思路、特定穴意义 |
| `anat_explain` | 解剖学 | 结构详情 / 错题 | 结构名、所属系统、功能、毗邻、考点 | 讲解结构功能与毗邻考点 |
| `mistake_review` | 公共 | 错题本 | 错题规则、误选项、正确结论、教学提示 | 复盘错因、给复习建议 |
| `quickref_explain` | 公共 | 知识库检索结果 | 检索条目类型与关键字段 | 补充条目要点解释（可选） |

> 新增模块场景时，只需在代理 `SCENES` 注册表加一条 system 模板，前端用同一 `MedicalAssist.ask()` 调用。

## 3. 通用请求 / 响应契约

### 3.1 请求 `POST {ASSIST_ENDPOINT}/assist`

```json
{
  "scene": "tcm_formula_diff",
  "module": "tcm",
  "context": {
    "chief_complaint": "反复自汗怕风，乏力易感冒",
    "syndromes": ["风寒表虚证", "气虚证"],
    "notes": "舌淡苔薄白，脉浮虚"
  },
  "candidates": [
    { "id": "CN-070", "name": "玉屏风散", "summary": "益气固表止汗" },
    { "id": "JP-010", "name": "桂枝加葛根汤", "summary": "解肌舒筋，调和营卫" }
  ],
  "question": "",
  "locale": "zh"
}
```

- `scene`：必须命中代理注册表，否则 400。
- `context`：模块结构化上下文，字段随 scene 不同；代理不解释字段语义，只拼进提示词。
- `candidates`：规则层给出的候选实体白名单（药/方/穴/结构/诊断）。
- `question`：学生追问，可空；为空时按 scene 默认任务讲解。
- 请求体上限 16KB；超出拒绝。

### 3.2 响应（成功）

```json
{
  "ok": true,
  "scene": "tcm_formula_diff",
  "summary": "两方均属表虚/营卫不和范畴，侧重不同。",
  "points": [
    "玉屏风散重在益气固表止汗，主治卫表不固、自汗易感。",
    "桂枝加葛根汤兼解肌舒筋，主治表虚兼项背拘急。"
  ],
  "related": ["玉屏风散", "桂枝加葛根汤"],
  "caveat": "教学辅助，不构成处方决策；具体用药须执业医师辨证。",
  "model": "qwen2.5-7b-free"
}
```

### 3.3 响应（降级 / 失败）

```json
{ "ok": false, "reason": "unavailable | timeout | rejected | bad_scene | oversize" }
```

前端收到 `ok:false` 即隐藏辅助区，纯规则视图不受影响。

## 4. 零费率部署形态

```
浏览器（GitHub Pages 静态站，免费托管）
   │  POST /assist（只带上下文 + 白名单，不含 Key）
   ▼
Cloudflare Workers Free 代理（$0/月，10 万请求/天，无冷启动）
   │  环境变量存 LLM_BASE / LLM_MODEL / LLM_KEY；按 scene 拼提示词；白名单过滤；超时兜底
   ▼
永久免费模型 API（硅基流动 7B-9B / 智谱 GLM-Flash / ModelScope Qwen，OpenAI 兼容）
```

- **代理**：`assist/worker/`，单接口 `/assist` + `GET /healthz`；纯转发与提示词组装，不做重计算，符合 Workers Free 10ms CPU/次约束。
- **模型**：provider 可切换；环境变量改 `ASSIST_LLM_BASE / ASSIST_LLM_MODEL` 即可换平台，前端无需改动。
- **Key**：只存代理平台环境变量（Worker secrets / vars），**不进 Git 仓库、不进前端包**。
- **备选托管**：Vercel Functions Hobby（限非商用）、Render Free（有冷启动）；代理代码保持平台无关的 Web 请求写法，便于迁移。

## 5. 安全与合规

- **CORS**：代理只放行 `ASSIST_ALLOW_ORIGIN`（本站 Pages 域名 + 本地调试来源）；其余来源拒绝。
- **白名单过滤**：代理侧校验 `related` 实体名是否在 `candidates` 内；不在则剔除。
- **超时**：代理上游默认 20s，前端单次解读超时 25s（含冷启动余量）；超时返回 `ok:false`，不挂起前端。
- **隐私**：不写访问日志中的上下文正文；教学演示禁止录入真实患者信息。
- **免责**：所有响应固定带 `caveat` 教学辅助声明。

## 6. 前端通用服务层（`js/medical-assist.js`）

- 全局 `MedicalAssist`，与具体模块引擎解耦。
- 接口：
  - `MedicalAssist.configure(opts)`：endpoint、enabled、scene 开关。
  - `MedicalAssist.ping()`：探测代理可用性（`/healthz`），结果缓存：成功缓存 60s、失败缓存 10s（一次失败不长时间锁死）。
  - `MedicalAssist.ask({scene, module, context, candidates, question})`：返回结构化结果或 `{ok:false, reason}`；仅对瞬时抖动类 `unavailable` 自动重试 1 次（间隔 900ms），超时 `timeout`、限流 `rejected`、报文类错误（`bad_scene`/`oversize`）不重试。
  - `MedicalAssist.isEnabled()`：总开关 + 代理可达性。
- 各模块只负责组装自己的 `context / candidates`，调用同一服务；UI 折叠区、懒加载、降级展示由服务层统一提供。

### 6.1 场景化面板式样（r38）

- 面板由通用构造器 `MedicalAssist.mountPanel(anchor, payload, opts)` 统一渲染，场景身份、主题色、副标题由 `SCENE_META` 按 `scene` 驱动；锚点位置沿用各模块既有 slot，不改动推演主链路 DOM。
- **主题映射**：西医诊断/点评 `wx`（医疗蓝）、汉方辨证/类方 `tcm`（棕金）、针灸 `acup`（绿）、解剖 `anat`（青）、错题复盘 `warn`（琥珀）、速查讲解 `info`（灰蓝）；错题卡片内嵌使用紧凑变体 `assist-panel--compact`。
- **结构**：头部（场景徽章 + 角色标题 + 职责副标题 + 触发胶囊按钮）→ 正文（摘要强调块 → 要点圆点列表 → 关联候选标签胶囊 → 模型来源/重新分析 → 固定免责脚注）。
- **三态**：未展开仅显示头部；加载中为脉动骨架 + “正在结合病例推演…”；成功填充并缓存结果，再次展开不重复请求；降级显示中性灰条“辅助暂不可用，以下为规则结论”，可重试。
- **红线不变**：`related` 仅渲染代理白名单过滤后的候选实体；`caveat` 固定展示；未配置代理时面板不渲染；不可达静默降级，纯规则结论不受影响。
- 旧 `.seek-assist-*` 样式已移除；汉方类方辨析原先手写的两套按钮/正文已改为复用通用构造器，全站面板结构一致。

## 7. 落地顺序

1. 代理 Worker 骨架 + 场景注册表 + 白名单/超时/CORS（本仓库 `assist/worker/`）。
2. 前端 `MedicalAssist` 服务层 + 探测降级 + 配置开关。
3. 首个接入点：汉方「按症寻方」类方鉴别（`tcm_formula_diff`）。
4. 8 个 scene 前端已全部挂接：`rx_diagnosis`（西医诊断）、`rx_review`（西医点评）、`tcm_zheng`（汉方辨证）、`tcm_formula_diff`（类方鉴别）、`acup_point`（选穴）、`anat_explain`（解剖讲解）、`mistake_review`（错题复盘）、`quickref_explain`（速查补充）；代理未部署前入口静默隐藏，纯规则照常。
5. 注册免费模型平台、填 Worker 环境变量、`/healthz` 连通后再开放前端入口。

## 8. 已知边界

- 免费模型为小尺寸档，解释深度有限；复杂病历 NLU 不在本期规则/辅助范围内。
- 免费额度有 RPM/TPM/日限额；教学演示用量小，超出即降级。
- 代理与模型的区域可达性需上线前实测；不通则切换备选托管或就近 provider。
- 二期若接本地模型（离线备选），同一服务层把 endpoint 指向本地 Ollama 即可，契约不变。

## 9. 部署操作手册（零费率）

### 9.1 准备免费模型 Key
- 任选一个 OpenAI 兼容的永久免费平台（硅基流动 / 智谱 GLM-Flash / ModelScope Qwen），注册后创建 API Key。
- 在平台 Playground 先测中文医学问答，确认模型 ID 与端点 `BASE_URL`。

### 9.2 部署 Worker 代理
```bash
# 仓库根目录
npm i -g wrangler        # 或用 npx wrangler
wrangler login           # 浏览器授权 Cloudflare 免费账号

cp assist/worker/wrangler.toml.example assist/worker/wrangler.toml
# 编辑 wrangler.toml：填 ASSIST_LLM_BASE / ASSIST_LLM_MODEL / ASSIST_ALLOW_ORIGIN
# wrangler.toml 已被 .gitignore 忽略，不入库

wrangler secret put ASSIST_LLM_KEY     # 粘贴模型 Key，仅存 Worker 环境
wrangler deploy                        # 拿到 https://<name>.<sub>.workers.dev 域名
```

### 9.3 回填前端配置
- 把 Worker 域名填入 `index.html` 内联配置：
  `window.__ASSIST_CONFIG__ = { endpoint: 'https://<name>.<sub>.workers.dev', enabled: true };`
- 访问 `https://<name>.<sub>.workers.dev/healthz`，应返回 `{"ok":true,"enabled":true,"configured":true,...}`。
- 前端打开「按症寻方」，结果区出现「🤖 AI 类方辨析」按钮即接入成功；代理不可达时按钮区不渲染，纯规则照常。

### 9.4 本地调试
- 前端本地静态服务打开站点；Worker 本地用 `wrangler dev` 起调试端口，把 `__ASSIST_CONFIG__.endpoint` 指向本地调试地址。
- 无 Key / 未配置时，`MedicalAssist.isConfigured()` 为 false，所有辅助 UI 自动隐藏，不影响推演主链路。

### 9.5 国内可达性实测与托管路线（2026-11-26）

**已落地的 Cloudflare 侧状态**
- Worker `rx-trainer-assist` 已部署到账号 `8fe45d5d…`；模型走智谱 `glm-4-flash`，端点 `https://open.bigmodel.cn/api/paas/v4`。
- `ASSIST_LLM_KEY` 已写入 Worker secret（不入库）；`ASSIST_LLM_BASE/MODEL/ALLOW_ORIGIN/TIMEOUT` 在 `wrangler.toml` vars。
- 服务端在线：经 `api.cloudflare.com` 可查到脚本与版本；问题仅在访问链路。

**阻断现象（本机国内网络）**
- `*.workers.dev` 被 DNS 污染：解析到 `104.244.x` / `199.59.x` / `157.240.x`（Meta/Twitter 段假 IP），443 无响应；`1.1.1.1`、`8.8.8.8` DoH 亦不通。
- 这是默认子域在国内的常见问题，**不等于部署失败**；生产建议绑自有自定义域，而非用 `workers.dev`。

**本机实测各免费后端可达性（TCP443 / 应用层 HTTP）**

| 平台默认域 | TCP | HTTP | 结论 |
| --- | --- | --- | --- |
| `netlify.app` | 通 | 200 | 备选最优：免费 12.5 万次函数/月，免绑卡 |
| `railway.app` | 通 | 200 | 仅试用额度，不宜长期零费率 |
| `glitch.com` | 通 | 200 | 免费项目易休眠，稳定性差 |
| `pythonanywhere.com` | 通 | 200 | 免费档无常驻 API 后端 |
| `vercel.app` / `deno.dev` / `glitch.me` | 不通 | — | 阻断 |
| `render.com` / `onrender.com` | 不通/超时 | — | 阻断 |
| `workers.dev` | 不通 | — | 污染阻断 |

**三条路线**
- A. 自有域名绑 Cloudflare 自定义域：代理代码零改动，绕开 `workers.dev` 污染，最稳；前提是已有可托管到 Cloudflare 的域名。
- B. 代理适配为 Netlify Function：核心逻辑已抽到 `assist/core/assist-core.mjs`，Netlify 入口在 `netlify/functions/assist.mjs`（Web `Request/Response` 形态，环境变量读 `process.env`）。
  - 环境变量在 Netlify 站点配置：`ASSIST_LLM_BASE=https://open.bigmodel.cn/api/paas/v4`、`ASSIST_LLM_MODEL=glm-4-flash`、`ASSIST_ALLOW_ORIGIN=https://bing-ing-ic.github.io`、`ASSIST_TIMEOUT_MS=20000`；`ASSIST_LLM_KEY` 设为加密 secret（production 上下文，不可读回）。可选 `ASSIST_LLM_THINKING=disabled`：仅 GLM-4.5 及以上生效，关闭强制深度思考、直接作答；旧模型不传该参数。
  - 部署：`npx netlify-cli login`（浏览器授权）→ `npx netlify-cli deploy --prod --functions=netlify/functions --dir <空静态目录> --no-build`；函数线上路径 `/assist`、`/healthz`，把站点域名回填前端 `endpoint`。
  - 需注册并授权 Netlify 账号；免费档 12.5 万次函数调用/月。
  - **落地结果（2026-11-26）**：站点 `rx-trainer-assist`（team `bing-ing-ic`），生产 URL `https://rx-trainer-assist.netlify.app`；`/healthz` 返回 `{"ok":true,"enabled":true,"configured":true,...}`，`POST /assist` 真实场景报文经智谱 `glm-4-flash` 解析通过，`related` 白名单过滤与教学免责声明正常。
  - **踩坑·站点私有门禁**：新建站点默认 Production / Deploy Preview visibility 均为 **Private**，匿名访问全站 401 并跳转 `app.netlify.com/edge-access` 要求登录（函数与部署专属域同样被拦）。该可见性设置**无公开 API / CLI**，只能在面板改：Project configuration → General → Visitor access → Edit visibility，选 **Public**（Applies to: Production and previews）后保存。`has_password=false`，与密码保护无关。
- C. 暂不开放线上入口：前端 `endpoint` 留空，辅助 UI 隐藏，纯规则推演照常；待定平台或拿到域名再回填。

**当前线上状态**：代理走 Netlify Function `https://rx-trainer-assist.netlify.app`，`index.html` 的 `__ASSIST_CONFIG__.endpoint` 已回填，辅助通道开放；Cloudflare Worker 保留为海外/未来绑自有自定义域的备选（`workers.dev` 默认域国内不可达）。服务层在加载时自举读取 `__ASSIST_CONFIG__`，各模块无需重复 `configure`。

**模型选型实测（2026-11-26）**
- 智谱官方在列的**免费文本模型仅 GLM-4.7-Flash**（`glm-4.7-flash`，200K 上下文，30B-A3B，输入/输出/缓存全免费）；其余免费项均为视觉模型（4.6V-Flash / 4V-Flash / 4.1V-Thinking-Flash），纯文本教学场景用不上。
- 实测切换到 `glm-4.7-flash` 后，上游频繁返回 **429（限流）**，间歇超时/不可用；关闭强制思考（`thinking.disabled`）后仍受配额/并发限制。该模型能力更强，但在当前账户免费档下稳定性不足。
- **当前线上沿用 `glm-4-flash`**：连续多次请求全部 `ok:true`，解析、白名单过滤、免责声明正常，链路稳定。核心已预留 `ASSIST_LLM_THINKING` 开关与 `max_tokens` 上限；待 4.7-Flash 配额放开或账户升级后，可仅改 `ASSIST_LLM_MODEL` 切换，代理代码无需改动。
- 付费低价档（GLM-4.5-Air / GLM-4.7-FlashX 等）非免费，不纳入零费率方案。

### 9.6 可达性加固（2026-11-26，r39）

**诊断**：线上分层实测，`/healthz` 全 200（首响冷启动 ~1.6s，稳态 0.3–0.9s），代理链路本身可达；`POST /assist` 连续 4 次全部 `ok:true`，但单次生成 9.9–14.5s，已逼近旧前端 15s 超时，模型再慢一点或网络一抖即被 Abort 掐断；旧逻辑失败后无自动重试，一次抖动即显示"辅助暂不可用"。本轮未观测到上游 429。

**前端服务层（`js/medical-assist.js`）**
- 单次解读超时 15000 → **25000ms**，覆盖实测峰值 + 冷启动余量；探测超时 8000ms。
- 新增自动重试 1 次：仅瞬时抖动类 `unavailable`，间隔 900ms；`timeout`/`rejected`/`bad_scene`/`oversize` 不重试，避免放大慢响应等待。
- `ping` 缓存区分成败 TTL：成功 60s、失败 10s。
- 错误分类细化：代理非 2xx 时 429 → `rejected`，其余 → `unavailable`；网络异常与 `AbortError` 区分；面板文案按 reason 区分超时/限流/不可达，加载骨架提示改为"模型生成较慢，请稍候…"。

**代理核心（`assist/core/assist-core.mjs`）**
- 上游默认超时 15000 → **20000ms**；上游非 2xx 时 429 返回 `reason: rejected`、其余 `unavailable`，保留 `console.error('[assist] upstream status', ...)` 日志。

**复测（加固后，生产）**
- `GET /healthz` 3 次全 200：1607ms（冷启动）/ 362ms / 322ms。
- `POST /assist`（`anat_explain` 报文）4/4 成功：12795 / 9312 / 8445 / 9326ms，summary 43–54 字、points 5 条；峰值 12.8s 在新 25s 超时内，无 429、无降级。
- 部署说明：Netlify 站点未连 Git，函数改动需 `npx netlify-cli deploy --prod --site <siteId> --dir artifacts/netlify-empty --functions netlify/functions --no-build` 手动上线；前端产物由 GitHub Pages 发布，`index.html` 版本戳 r39。

### 9.7 后续模块接入
- 新增场景：在 `assist/core/assist-core.mjs` 的 `SCENES` 与 `js/medical-assist.js` 的 `SCENES` 各加一条（两端保持同步）；前端模块组装 `context / candidates` 后调 `MedicalAssist.ask({scene, module, context, candidates})`。
- 本期 8 个场景前端接入位置：西医诊断反馈区（`rx_diagnosis`）、西医报告页（`rx_review`）、汉方辨证反馈区（`tcm_zheng`）、按症寻方结果区（`tcm_formula_diff`）、针灸报告页（`acup_point`）、解剖结构详情页（`anat_explain`）、错题卡片（`mistake_review`）、速查结果区（`quickref_explain`）。

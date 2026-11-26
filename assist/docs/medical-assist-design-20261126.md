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
- **超时**：默认 15s，超时返回 `ok:false`，不挂起前端。
- **隐私**：不写访问日志中的上下文正文；教学演示禁止录入真实患者信息。
- **免责**：所有响应固定带 `caveat` 教学辅助声明。

## 6. 前端通用服务层（`js/medical-assist.js`）

- 全局 `MedicalAssist`，与具体模块引擎解耦。
- 接口：
  - `MedicalAssist.configure(opts)`：endpoint、enabled、scene 开关。
  - `MedicalAssist.ping()`：探测代理可用性（`/healthz`），结果缓存。
  - `MedicalAssist.ask({scene, module, context, candidates, question})`：返回结构化结果或 `{ok:false, reason}`。
  - `MedicalAssist.isEnabled()`：总开关 + 代理可达性。
- 各模块只负责组装自己的 `context / candidates`，调用同一服务；UI 折叠区、懒加载、降级展示由服务层统一提供。

## 7. 落地顺序

1. 代理 Worker 骨架 + 场景注册表 + 白名单/超时/CORS（本仓库 `assist/worker/`）。
2. 前端 `MedicalAssist` 服务层 + 探测降级 + 配置开关。
3. 首个接入点：汉方「按症寻方」类方鉴别（`tcm_formula_diff`）。
4. 其余 scene 按模块逐步挂接：错题复盘 → 现代医学点评 → 针灸选穴 → 解剖讲解。
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

### 9.5 后续模块接入
- 新增场景：在 `assist/worker/assist-worker.js` 的 `SCENES` 与 `js/medical-assist.js` 的 `SCENES` 各加一条；前端模块组装 `context / candidates` 后调 `MedicalAssist.ask({scene, module, context, candidates})`。
- 建议接入顺序：错题复盘 `mistake_review` → 现代医学点评 `rx_review` → 针灸选穴 `acup_point` → 解剖讲解 `anat_explain`。

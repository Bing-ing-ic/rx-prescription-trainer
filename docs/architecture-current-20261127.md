# 医学生处方推演训练平台 · 当前架构梳理（代码库理解报告）

> 快照基线：仓库 `https://github.com/Bing-ing-ic/rx-prescription-trainer.git`，本地 `main` @ `4afb1a6`（2026-11-27 08:38 +0800），工作区干净，与 `origin/main` 同步。
> 取证方式：只读阅读当前源码 / 配置 / 部署流水线 + 运行 `node scripts/validate-all.js`（44 项通过、0 失败）。**未启动浏览器做运行观测**，凡涉及"线上正在运行 / 代理站点已激活"的结论，状态最高为 `selected`（静态可达），运行态记 `unknown`。
> 注意：仓库内 `README.md`、`docs/architecture.md` 描述的是早期 MVP（15 病 / 35 药 / 24 规则 / 11 维权重），与当前源码（79 病 / 798 药 / 98 规则 / 12 维权重）已不一致；**本报告以当前源码为准**，旧文档仅作历史候选。

---

## 1. 证据矩阵

| 命名阶段 | 定位（literal locator） | 实际分支 / 被调实现 | 主张范围 | 状态 |
|---|---|---|---|---|
| 仓库身份 | `git remote -v`；`git log -1` = `4afb1a6` | 远程 `Bing-ing-ic/rx-prescription-trainer`，分支 `main` | 本地与远程同步、工作树无未提交改动 | confirmed |
| 静态前端入口 | `index.html:1579-1618` 脚本装配段 | 14 个 JS 依次加载（见 §3.1），CSS `css/rx.min.css` | 单页原生 JS，无前端框架 / 无构建链在浏览器侧 | confirmed |
| 西医主交互 | `js/app.js:8` 状态对象 `S`；`:2725-2754` 提交链路 | `RxRuleEngine.run(ctx)` → `Reviewer.score(hits, ctx)` → `renderReport` → `saveHistory/saveMistakes` | 西医病例→诊断→双通道处方→点评→画像主链闭合到 localStorage | confirmed |
| 西医规则引擎 | `js/rule-engine.js` 尾 `global.RxRuleEngine = { run }` | 输入 `visit_ctx`，输出 `hits[{rule_id,group,severity,title,message,basis,suggestion}]` | 引擎为纯函数式 IIFE，规则元数据来自 `data/rules.json` | confirmed |
| 西医评分器 | `js/review.js:53-65` `DIMS`；尾 `global.Reviewer` | 12 维权重合计 100（见 §3.2） | 权重写死在前端；error/warn/pass 分级扣分 | confirmed |
| 中医模块 | `js/tcm-app.js:403-412`；`js/tcm-engine.js` 尾 `global.TCMEngine` | `TCMEngine.check` → `TCMEngine.score`；名方推荐 `window.FamousRecommendEngine.recommend`（`tcm-app.js:833-835`） | 辨证→选方→饮片处方→点评链路闭合 | confirmed |
| 针灸模块 | `js/acup-app.js:288-303`；`js/acup-engine.js` 尾 `global.ACUPENGINE`；`js/tuina-engine.js` 尾 `global.TuinaEngine` | 选穴检查 + 推拿禁忌检查，hits 合并后 `ACUPENGINE.score` | 针灸处方与推拿手法禁忌双引擎合并评分 | confirmed |
| 解剖模块 | `js/anat-app.js:10-19` 状态；`:46-59` 数据加载 | 系统浏览 / 热点图 / 测验问答 / 临床案例；**无处方规则引擎** | 测验与浏览型模块，独立评分写历史 | confirmed |
| AI 辅助前端层 | `js/medical-assist.js:182-195` `ask`；`:243-313` `mountPanel` | `POST {endpoint}/assist`；`GET /healthz` 探测带 TTL 缓存；`unavailable` 重试 1 次，`timeout/429` 不重试 | 代理不可用时静默降级，规则主链路不受影响 | confirmed（源码行为）；代理站点运行态 unknown |
| AI 辅助服务端 | `assist/core/assist-core.mjs:194-255` `handleRequest`；`netlify/functions/assist.mjs`；`assist/worker/assist-worker.js` | 平台无关核心 + 两个薄封装；8 个场景注册表；候选白名单过滤 | 服务端持有 LLM Key；仓内不含密钥 | confirmed（代码存在）；线上部署形态见 §5 闭合卡 |
| 持久化边界 | `js/app.js` / `tcm-app.js:462-493` / `acup-app.js:367-390` | localStorage 键：`rx-profile-history`、`rx-mistakes`、`rx-pitfall-mistakes`、`rx-local-visits`、`rx-daily-visits`、`rx-admin-pwd-hash`；sessionStorage：`rx-admin-auth`、`rx-admin-time` | 全部为浏览器端存储，无服务端数据库 | confirmed |
| 静态发布流水线 | `.github/workflows/deploy.yml:24-84` | push `main` / 手动触发 → 组装 `_site` → `deploy-pages`，失败重试两次 | 静态站点由 GitHub Pages 托管；`_site` 不含后端函数 / 文档 / 测试 | confirmed（流水线定义）；线上实际版本未观测 |
| 代理托管配置 | `netlify.toml:2-4`；`.netlify/state.json`；`wrangler.toml`（已被 `.gitignore:25` 忽略） | Netlify Functions 目录 `netlify/functions`；Cloudflare Worker 为备选，本地配置不入库 | 代理函数与静态站点分属不同托管单元 | confirmed（配置存在）；代理线上运行态 unknown |
| 测试 / 校验 | `test/rule-engine-test.js:7-18`（Node + window 垫片）；`scripts/validate-all.js:19-40` | Node 直接加载 IIFE 源码跑规则用例；校验 JSON 合法性、权重合计 100、数据一致性 | 无浏览器自动化测试套件；校验脚本本轮实跑 44/44 通过 | confirmed |

---

## 2. 直接答案

### 2.1 总体形态（confirmed）

平台是一个**纯静态原生 Web 应用**：浏览器侧无框架、无 npm 构建、无 CDN 运行时依赖；医学知识以本地 JSON 知识库形式随站点分发；规则判定与评分全部在前端完成。唯一的网络后端是一个**可选的 AI 教学辅助代理**（解释 / 鉴别 / 纠错），代理或模型不可用时全站退回纯规则推演，不阻断主流程。

### 2.2 模块组成（confirmed）

| 模块 | 业务 JS | 规则 / 评分引擎 | 知识库（`data/`，条目数为本轮实测） |
|---|---|---|---|
| 现代医学（西医处方） | `js/app.js` | `js/rule-engine.js`（`RxRuleEngine`）+ `js/review.js`（`Reviewer`）+ `js/standard-plan.js`（`StandardPlan` 对照方案） | `diseases.json` 79、`drugs.json` 798、`rules.json` 98、`compat.json` 41 条配伍、`standard-plans.json` 79、`surgeries.json` 20、`lab-exams.json` 117、`disease-lab-map.json`、`diagnosis-aliases.json`、`pinyin-map.json`、`diagnosis-pitfalls.json`、`review-cases.json` 12 |
| 汉方学（中医） | `js/tcm-app.js` | `js/tcm-engine.js`（`TCMEngine`）+ `js/famous-recommend.js`（`FamousRecommendEngine` 按症寻方） | `tcm-cases.json` 26、`tcm-herbs.json` 509、`tcm-formulas.json` 51、`tcm-patent-drugs.json` 73、`tcm-famous-prescriptions.json` 122、`tcm-famous-tags.json`、`tcm-rules.json` 34 |
| 针灸推拿 | `js/acup-app.js`、`js/acup-time.js` | `js/acup-engine.js`（`ACUPENGINE`）+ `js/tuina-engine.js`（`TuinaEngine`） | `acup-cases.json` 18、`acup-points.json` 164、`acup-rules.json` 31、`tuina.json` 30 手法、`acup-time-medicine.json`（子午流注 / 纳甲 / 灵龟八法 / 测验） |
| 解剖学 | `js/anat-app.js` | 无处方引擎；内置测验评分 | `anatomy-systems.json` 16、`anatomy-quiz.json` 192、`anatomy-cases.json` 26、`anatomy-hotspots.json`、`anatomy-tcm.json` |
| 公共视图 / 增强 | `js/module-views.js`（跨模块画像 / 错题 / 统计面板追加）、`js/platform-enhance.js`（速查检索、错题筛选、经络图回退、导航补丁）、`js/medical-assist.js`（AI 辅助通用服务层） | — | 速查跨库检索西药 / 中药 / 方剂 / 穴位 / 解剖 / 疾病 |

### 2.3 页面与入口（confirmed）

- `index.html`：主单页，含四模块 Tab（`index.html:32-45`）与公共导航（首页 / 药品库 / 速查 / 能力画像 / 错题本 / 学习统计）。
- `login.html`：管理员登录门，客户端轻量校验；`sessionStorage` 记录会话，密码哈希存 `localStorage`（默认口令 `admin123`，可在后台改密）。
- `admin.html`：管理控制台，只读聚合本机练习历史 / 错题 / 分模块统计，支持改密、导出本机 localStorage JSON、清空练习数据；**无服务端数据维护能力**。
- 本地启动：`启动平台.bat` 起 `python -m http.server 8899`；README 另载 `file://` 直开方式。

### 2.4 技术栈（confirmed）

- 前端：原生 HTML / CSS / 原生 JavaScript（IIFE 模块挂载 `window` 全局符号）；CSS 产物 `rx.min.css`。
- 构建 / 压缩：仅一个 devDependency `terser`（`package.json`）；`scripts/minify-all.js` 把源码 `.js` 压缩为同名 `.min.js`，页面引用 `.min.js`。
- 服务端：平台无关 ES Module 代理核心，可挂 Cloudflare Worker 或 Netlify Function；上游为 OpenAI 兼容 Chat Completions 接口。
- 测试：Node 直跑的规则引擎 / 模块校验脚本（`test/`、`scripts/`），无 E2E 浏览器框架。

---

## 3. 主链路与模块装配

### 3.1 前端脚本装配顺序（`index.html:1579-1618`，confirmed）

```
rule-engine.min.js → review.min.js → standard-plan.min.js → app.min.js
→ tcm-engine.min.js → medical-assist.min.js → famous-recommend.min.js
→ acup-engine.min.js → tcm-app.min.js → tuina-engine.min.js → acup-app.min.js
→ acup-time.min.js → module-views.min.js → anat-app.min.js → platform-enhance.js
```

引擎先于业务 App 装配；`medical-assist.js` 自举读取页面内联注入的 `window.__ASSIST_CONFIG__`（`index.html:1607`）。各模块通过 `window.__showView` / `window.__setModule` / `window.__newCase` 等全局钩子互通；`anat-app.js:34-39` 的 `showView` 覆盖此前注册的同名钩子，集中管理全部视图显隐。

### 3.2 西医处方提交主链（`js/app.js:2725-2754`，confirmed）

1. **构造上下文 `ctx`**：`disease`、`patient`（读患者信息表单）、`normal_rx`（非输液组）、`iv_rx`（多组输液，含溶媒与药物）、`lab_rx`（检验检查单）、`surgery_rx`（手术指征决策，未决策为 `null`）、`disease_lab_map`、`rulesMeta`、`compatData`、`drugDb`、`restricted_confirmed`、`surgeryCase`。
2. **规则执行**：`RxRuleEngine.run(ctx)` 遍历规则元数据，按规则分发判定，产出结构化 `hits`。
3. **评分聚合**：`Reviewer.score(hits, ctx)` 按 12 维聚合扣分，输出百分制总分、维度分项、严重度分组与雷达映射。
4. **报告渲染**：`renderReport(review, hits, ctx)` 渲染圆环 / 评级 / 维度面板 / 命中清单；`StandardPlan.render` 对照参考方案；`MedicalAssist.mountPanel` 挂 AI 点评面板（已配置时）。
5. **持久化**：`saveHistory` 写 `rx-profile-history`（上限 20 条），`saveMistakes` 写 `rx-mistakes`（上限 100 条），进入 `view-report`。

**评分维度与权重**（`js/review.js:54-65`，合计 100，confirmed）：

| 维度 key | 名称 | 权重 |
|---|---|---:|
| format | 处方格式规范 | 4 |
| indication | 诊断-用药匹配（循证适应症） | 22 |
| dosage | 剂量用法（单次/每日量） | 13 |
| duration | 疗程适宜 | 1 |
| iv_reason | 给药途径决策与输液合理性 | 17 |
| compat_sv | 溶媒与配伍（IV-06/IV-07） | 2 |
| compat_int | 药物相互作用 / 重复用药 | 7 |
| special_pop | 特殊人群（儿童/老人/孕哺/肝肾） | 10 |
| abx | 抗菌药物分级管理 | 5 |
| insurance | 医保 / 基药 / 集采经济性 | 1 |
| lab | 检验检查适宜性（防过度医疗） | 6 |
| surgery | 手术指征判断 | 12 |

### 3.3 中医提交链路（`js/tcm-app.js:403-413`，confirmed）

`TCMEngine.check({case, zhengInput, faZhengInput, formulaName, formulaCode, herbs, patient})` → `TCMEngine.score(hits)` → 报告页（参考证型 / 治法 / 用方 / 药味对照）→ `saveHistory`（`module='汉方学'`）。名方库浏览与"按症寻方"由 `FamousRecommendEngine.recommend(prescriptions, tagDef, input, opts)` 做规则 + 检索双轨推荐；未完成辨证时证型权重折半、症状权重上调，结果显式标注。

### 3.4 针灸提交链路（`js/acup-app.js:284-305`，confirmed）

前置：辨证已确认且已选 ≥1 穴。`ACUPENGINE.check({case, zhengInput, points, patient})` 产出穴位 hits；`TuinaEngine.check({case, selectedTechniques, patient})` 产出推拿禁忌 hits，经 `normalizeTuinaHits` 规整为同一形状后合并，`ACUPENGINE.score` 统一评分。

### 3.5 解剖模块（`js/anat-app.js`，confirmed）

四条支线：8 大（16 系统条目）系统浏览 → 结构详情（含热点图与特写图）；测验引擎（识别 / 配对 / 问答，`window.__anatQuiz`）；临床案例；解剖-中医映射。测验完成后同样写入 `rx-profile-history` / `rx-mistakes`，`module='解剖学'`。

### 3.6 关键旁路与降级分支（confirmed）

- **数据加载容错**：西医四个主数据集 `Promise.allSettled`，任一失败只记失败清单并提示，不阻断导航绑定（`app.js:339-366`）；中医 / 针灸 / 解剖各数据集 `catch(() => null)` 后空态兜底。
- **AI 辅助降级**：未配置 endpoint → `mountPanel` 直接返回 `null`，锚点原样；请求失败按 `timeout / rejected(429) / unavailable / bad_scene` 分类，面板显示对应降级文案与重试按钮。
- **规则引擎异常隔离**：新增规则段 `catch` 后仅 `console.warn`，不影响主流程（`rule-engine.js` 尾部 NEW-XX 段）。
- **管理端鉴权为客户端校验**：可被绕过，仅用于隔离后台视图；报告页脚与登录页均有明示。

---

## 4. 数据层与状态所有者

### 4.1 知识库归属（confirmed，按加载点回溯）

- 西医：`app.js:341-415,423-448`；标准方案 `standard-plan.js`；速查跨库 `platform-enhance.js`。
- 中医：`tcm-app.js:53-67`；引擎内补载 `tcm-herbs.json` / `tcm-rules.json`（`tcm-engine.js`）。
- 针灸：`acup-app.js:35-38`；时辰医学 `acup-time.js`；引擎内补载 `acup-rules.json`。
- 解剖：`anat-app.js:48-53`。

### 4.2 浏览器状态（confirmed）

| 键 | 所有者 | 内容 / 上限 |
|---|---|---|
| `rx-profile-history` | 四模块 App 共同写入 | 每次就诊总分、模块、诊断、八维雷达；上限 20 条 |
| `rx-mistakes` | 四模块 App 共同写入 | 错题条目（errors / warns 结构化）；上限 100 条 |
| `rx-pitfall-mistakes` | 西医诊断陷阱训练 | 陷阱题作答记录 |
| `rx-local-visits` | `index.html:1586-1591` / `admin.html` | 本机累计访问计数 |
| `rx-daily-visits` | 同上 | 近 30 天按日访问计数 |
| `rx-admin-pwd-hash` | `login.html` / `admin.html` | 管理员密码 SHA-256（`rx-admin::` 前缀）散列；无散列时降级默认口令 |
| `rx-admin-auth` / `rx-admin-time` | sessionStorage | 管理会话标记与登录时间 |

**状态边界（confirmed）**：无服务端数据库、无账号体系、无跨设备同步；清浏览器缓存或换设备后上述数据清零。`docs/db-schema.sql`、`docs/schema-rx.json` 为早期 SQLite / JSON Schema 设计候选，当前静态阶段未落地为运行时存储。

---

## 5. 责任闭合卡（跨组件效果主张）

### 5.1 "AI 辅助通道线上可用"

| 格 | 内容 / 定位 |
|---|---|
| 对象 / 范围 | 全站 8 个教学场景（`rx_diagnosis / rx_review / tcm_zheng / tcm_formula_diff / acup_point / anat_explain / mistake_review / quickref_explain`） |
| 触发者 | 各模块 `MedicalAssist.mountPanel(anchor, {scene,...})` → 用户展开面板 → `ask(payload)` |
| 当前装配 / 选择 / 开关 | 前端 `index.html:1607` 注入 `__ASSIST_CONFIG__ = { endpoint: 'https://rx-trainer-assist.netlify.app', enabled: true }`；`medical-assist.js:129-133` `isEnabled` 先查开关与 endpoint，再 `ping` 探测 |
| 实际执行者 | `assist/core/assist-core.mjs` 代理 → 上游 OpenAI 兼容 `/chat/completions`；两个封装入口：Netlify `netlify/functions/assist.mjs`、Cloudflare `assist/worker/assist-worker.js` |
| 成功副作用与观察点 | 代理返回 `{ok:true, summary, points, related, caveat, model}`；前端渲染摘要 / 要点 / 白名单关联标签 / 模型名；`related` 经 `filterRelated` 限定在请求 `candidates` 内 |
| 失败是否返回且被检查 | 是。代理侧：缺配置 / `ASSIST_ENABLED=false` / 场景非法 / 超 16KB / 上游 429 / 超时 / 空内容分别返回 `{ok:false, reason}`；前端按 reason 分类展示降级，不抛未捕获异常 |
| 重试 / 重放来源 | 前端仅对 `unavailable` 瞬时抖动自动重试 1 次（间隔 900ms）；`timeout`、`rejected(429)`、报文类错误不重试；代理侧无重放 / 补偿 |
| 不能覆盖的对象 | 规则结论、评分、候选清单之外的药 / 方 / 穴 / 术式；代理不做处方决策、不定剂量疗程；离线或代理下线时规则主链路照常 |
| **status** | 前端装配与降级行为 **confirmed**；代理站点 `rx-trainer-assist.netlify.app` 的线上运行态、上游实际模型与密钥配置 **unknown**（仓内无运行观测；`wrangler.toml` 被 gitignore，上游 base/model 以代理环境变量为准，仓内不可见） |

### 5.2 "练习数据被持久保存"

| 格 | 内容 / 定位 |
|---|---|
| 对象 / 范围 | 学习历史、错题、访问计数、管理员口令散列 |
| 触发者 | 各模块提交点评后 `saveHistory` / `saveMistakes`；页面加载时计数 |
| 当前装配 / 选择 / 开关 | 直接 `localStorage.setItem`，无开关、无服务端写入 |
| 实际执行者 | 浏览器 localStorage；管理后台只读聚合本机数据 |
| 成功副作用与观察点 | 下次进入页面可从 `rx-profile-history` / `rx-mistakes` 读出并渲染统计 / 错题本 |
| 失败是否返回且被检查 | 各写入点均包 `try/catch`，存储不可用时静默跳过；不回传服务端 |
| 重试 / 重放来源 | 无；不提供同步、导出仅在后台手动下载 JSON |
| 不能覆盖的对象 | 其他浏览器 / 设备 / 隐身窗口；清缓存后不可恢复；无服务端备份 |
| **status** | 浏览器端持久化 **confirmed**；跨端 / 跨会话保留 **不成立（confirmed 为边界）** |

### 5.3 "提交 main 后静态站点发布到 GitHub Pages"

| 格 | 内容 / 定位 |
|---|---|
| 对象 / 范围 | 静态前端（HTML / CSS / JS / 图片 / 数据） |
| 触发者 | `push` 到 `main` 或 `workflow_dispatch` 手动触发（`deploy.yml:3-5`） |
| 当前装配 / 选择 / 开关 | Actions 权限 `pages: write / id-token: write`；`_site` 组装时排除 `*.bak*`、`_backup*/`、`docs/`、`test/`、`*.py`、`*.md`、启动脚本；检出 `.nojekyll` |
| 实际执行者 | `actions/deploy-pages@v5.0.1`；首次失败同 artifact 自动重试两次（`deploy.yml:77-84`） |
| 成功副作用与观察点 | Pages 环境输出站点 URL；仓内未留存部署记录，本轮未访问 Pages 后台核验 |
| 失败是否返回且被检查 | 三步部署均 `continue-on-error`，末步失败才令作业失败；重试仅缓解 Pages 后端瞬时竞态，不保证发布成功 |
| 重试 / 重放来源 | 流水线内两次固定重试；无手动重放入口在仓内配置 |
| 不能覆盖的对象 | `netlify/functions/`、`assist/` 代理代码不进入 `_site`；代理站点的发布不在本流水线内 |
| **status** | 流水线定义与组装规则 **confirmed**；线上 Pages 当前版本与可用性 **unknown**（需 Pages 部署记录或线上访问核验） |

---

## 6. 外部边界清单

| 边界 | 方向 | 定位 | 说明 / 证据等级 |
|---|---|---|---|
| 上游 LLM 接口 | 代理 → 外部 | `assist-core.mjs:167` `fetch(${base}/chat/completions)` | OpenAI 兼容；base/model/key 来自代理环境变量；仓内示例 `wrangler.toml.example` 为 SiliconFlow/Qwen，被忽略的本地 `wrangler.toml` 指向 bigmodel/`glm-4-flash`，**线上实际取值 unknown** |
| 百度统计 | 前端 → 外部 | `index.html:1621-1628` 加载 `hm.baidu.com/hm.js?2732210c...` | 页面级访问统计；与学习数据存储无关 |
| 代理托管站点 | 前端 → 外部 | `medical-assist.js:116,144`；`index.html:1607` | `https://rx-trainer-assist.netlify.app`；仓内 `.netlify/state.json` 记录 siteId；部署方式仓内未见对应流水线 |
| 本地 HTTP 服务 | 开发环境 | `启动平台.bat:12` `python -m http.server 8899` | 仅本地调试；`file://` 直开受浏览器 fetch 限制 |
| 本地 Python 脚本 | 开发 / 数据治理 | 根目录 `add_diseases.py / add_drugs.py / fix_data.py / verify.py`、`scripts/*.py`、`test/*.py` | 一次性数据导入 / 校验工具，不进入运行时与 `_site` |

---

## 7. 未知项与最小验证动作

| # | 未知 / 未覆盖 | 影响 | 最小验证动作 |
|---|---|---|---|
| U1 | 未做浏览器端运行观测；页面实际渲染、交互与控制台告警未核验 | 静态源码结论不能替代运行时行为；可能存在装配顺序 / 全局钩子覆盖问题未暴露 | 本地 `python -m http.server 8899` 打开首页，四模块各走通一次病例 / 处方 / 提交；记录控制台报错与面板状态 |
| U2 | 代理站点线上运行态、上游模型与密钥配置未核验 | 无法确认 AI 辅助当前是否可用、实际由哪个模型作答 | 访问 `https://rx-trainer-assist.netlify.app/healthz` 查看 `enabled/configured/scenes`；在页面展开任一 AI 面板实测一次请求 |
| U3 | 代理函数的上线部署流程仓内无流水线定义 | 代理代码改动后如何发布到 Netlify / Cloudflare 不可考 | 核对 Netlify 后台站点关联的仓库 / 部署方式，或补充代理专属部署脚本 / Workflow |
| U4 | `data/*.json` 内部字段语义未逐表核对；`docs/db-schema.sql`、`docs/schema-rx.json` 为设计候选 | 报告中的字段级契约以源码加载点为准，未做字段级完整性审计 | 按 `docs/schema-rx.json` 对处方 / 药品 / 病例条目跑字段校验（可扩展 `scripts/validate-all.js`） |
| U5 | `admin.html` HTML 静态结构未逐行核（脚本段已读完）；管理端为客户端鉴权，存在被绕过的固有风险 | 后台统计口径与改密 / 导出 / 清空按钮的实际挂载以页面实测为准 | 浏览器登录后台逐项核对卡片、表格、改密与导出；如对外暴露，需补服务端鉴权 |
| U6 | 旧版 `README.md` / `docs/architecture.md` 的数据量、权重、模块描述已过时 | 后续读者可能按旧文档误判规模与维度 | 以本报告为准；后续可回写更新旧文档（本次未改动历史文档） |

---

## 8. 仓库工程速览

- **目录分区**：`index.html / login.html / admin.html` 页面；`css/` 样式；`js/` 源码与 `.min.js` 产物；`data/` 知识库 JSON（含 `_backup_*/` 本地备份，不入库不发布）；`img/` 图片（含 `atlas/`、`meridians/`、`_archive/`）；`assist/` 代理核心 / Worker / 设计文档；`netlify/functions/` Netlify 入口；`scripts/` 数据治理与压缩脚本；`test/` Node 校验与 E2E 脚本；`docs/` 审计 / 点评 / 测试报告与截图。
- **压缩产物纪律**：源码 `.js` 改动后需跑 `node scripts/minify-all.js` 重新生成 `.min.js`；页面引用带版本号查询串（如 `?v=20261126r41`）。
- **本轮基线验证**：`node scripts/validate-all.js` → 通过 44 项、失败 0 项（JSON 合法性、权重合计 100、检验编码对齐、穴位编码、中药剂量 / 君臣佐使、名方库 schema 与标签、西药库一致性、病例身份一致性等）。

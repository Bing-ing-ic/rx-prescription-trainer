# UI/UX 迭代落地报告 — 第二批（Wave2）2026-11-16

项目根：`D:\医学生处方推演训练平台\`（纯静态、无构建链、localStorage 学习记录）
规范依据：冻结版《第二批 UI 优化规范》`ui-optimization-spec-wave2.md`（W2-1 选项图标 / W2-2 离板色 / W2-3 onerror / W2-4 空态 / W2-5 sticky 测量 / W2-6 令牌收口 / W2-7 全局视图弱化 Tab）。

边界遵守：未改动 `data/*.json`（含 `anatomy-systems.json` 膀胱三角条目，保持已确认的正确数据）；未改规则引擎、评分口径与诊疗逻辑；JS 仅做规范允许的挂载微调；未引入外部 CDN/运行时依赖；未上线暗色模式；未执行规范第三节推迟项。

## 一、本轮落地条目（文件 / 选择器 / 审计编号）

### W2-1 选项对错补图标（审计 A-18，纯 CSS）
- 文件：`css/rx.css`
- 选择器：`.quiz-opt.correct` / `.quiz-opt.wrong`
  - 两态补 `position:relative; padding-right:34px;`；
  - `.quiz-opt.correct::after { content:"✅"; position:absolute; right:12px; top:50%; transform:translateY(-50%); font-size:13px; }`；
  - `.quiz-opt.wrong::after { content:"❌"; }`，同定位。
- 仅补图标，未改底色/文字色；`.anat-quiz-option` 既有图标保持不动。

### W2-2 剩余 JS 离板色收敛（映射到现有色板，UI 挂载类）
- `js/platform-enhance.js`（速查图例）：
  - 药品 `#1e6091→#1a6fb5`；中药 `#5b8c5a→#2f7a4f`；方剂 `#8b6f3f→#8b5a2b`；穴位 `#7c5cbf→#3730a3`；解剖结构 `#c1432e→#b91c1c`；拉丁小字 `#94a3b8→#64748b`；疾病 `#0f766e` 按规范保留。
- `js/acup-app.js`（推拿选中态）：
  - `#0ea5e9→#1a6fb5`（边框两处）；`#e0f2fe→#dbeafe`（底色两处）；`#0369a1→#1e40af`（文本两处）；弱灰 `#94a3b8→#64748b` 三处（无匹配穴位 / 手法未加载 / 分组标题）。
  - 未列入规范的 `#cbd5e1`、`#475569` 保持原样。
- `js/anat-app.js`（考点标签）：`#1f7a4d→#166534`；`rgba(34,139,87,.12/.3)` 同步改为 `rgba(22,101,52,.12/.3)`。
- 各模块 hero 渐变、处方笺/检验表打印配色未动。

### W2-3 动态图片 onerror 回退补齐（审计 C3）
- `index.html` 三处装饰性人物 hero 图：
  - `img/nurse-hero.png`（西医首页）、`img/tcm-doctor-hero.png`（中医）、`img/acup-doctor-hero.png`（针灸）；
  - 均补 `onerror="this.closest('.hero-nurse').style.display='none'"`；装饰性人物背景 `alt` 置 `alt=""`，避免读屏重复。
- `js/anat-app.js` 解剖详图（`.atlas-detail-figure` 内 `<img>`）：补 onerror——失败时隐藏该 `<img>`，保留容器并把 `.atlas-detail-figure-caption` 文案替换为「⚠️ 图片暂缺」；未破坏既有 `onclick` 放大（`window.open(...)`）。
  - 说明：规范表述「隐藏容器并保留 caption」按可落地语义处理为「隐藏图片、保留图注容器」；整容器隐藏会连带图注不可见，与「保留 caption」冲突。
- 未替换图片资源本身，未新增图片请求。

### W2-4 加载失败/空态反馈统一（审计 C7）
- 保留不改（业务阻断校验 alert）：病例未就绪、请先辨证、处方为空、已在处方中、超限提醒、事中拦截、溶媒/皮试/指征/提交校验、提交出错等，均维持原 `alert`。
- 改为页内提示：
  - `js/app.js` 全局 init catch（原 :206）：去掉 `alert`；在 `#view-home` 顶部插入/复用 `.load-error-tip` 提示条，文案「⚠️ 部分教学数据加载失败，请通过本地 http 服务刷新页面重试。」；不阻断后续渲染，原错误走 `console.warn`。
  - `css/rx.css` 新增 `.load-error-tip`：浅红底（`--danger-50`）+ `--danger-700` 文本 + `--danger-100` 边框 + 圆角 8px + 内边距 8px 12px + `margin:12px 20px`。
  - `js/tcm-app.js` newCase 守卫（原 :134）：不再 `alert`，显示既有 `#tcm-data-tip` 后 `return`；tip 文案保持「加载中」语义。
  - `js/acup-app.js` newCase 守卫（原 :65）：不再 `alert`，显示既有 `#acup-data-tip` 后 `return`。
- 保留 alert：`js/app.js` 陷阱库 catch（原 :2892，罕见网络路径，无对应页内 tip 容器），按规范保留并在此注明。
- 其余 fetch 静默降级（规则/标准方案/别名/拼音）维持现状。

### W2-5 sticky 顶栏高度测量（审计 C8，最小 JS + CSS 变量）
- `css/rx.css`：`:root` 新增 `--topbar-h:57px;`；`.module-tabs { top: var(--topbar-h); }`（原硬编码 57px）；`@media (max-width:768px)` 内 `.module-tabs { position:static; }`（移动端取消 sticky，避免换行错位）。
- `js/platform-enhance.js` 启动段：新增 `measureTopbar()`，读取 `.topbar` 实际 `offsetHeight` 写入 `document.documentElement.style.setProperty('--topbar-h', h+'px')`；`resize` 监听重算（≤768px 时 CSS 已置 static，变量仅保留）。
- 未改顶栏布局/换行规则。

### W2-6 CSS 令牌收口（审计 A-3/A-15/A-16/A-21/A-22，保守 1:1 替换）
- 文件：`css/rx.css` 源文件；`:root` 既有令牌做 1:1 映射，不改视觉。
- 中性灰阶：`#1e293b→var(--gray-900)`、`#334155→var(--gray-700)`、`#475569→var(--gray-600)`、`#64748b→var(--gray-500)`、`#cbd5e1→var(--gray-300)`、`#e2e8f0→var(--gray-200)`、`#f1f5f9→var(--gray-100)`、`#f8fafc→var(--gray-50)`。
- 主蓝：`#0f4c81→var(--blue-700)`、`#1a6fb5→var(--blue-600)`、`#2c7be5→var(--blue-500)`、`#dbeafe→var(--blue-100)`、`#eff6ff→var(--blue-50)`、`#0c3d68→var(--blue-900)`。
- 语义 1:1：成功 `#166534/#16a34a/#dcfce7/#f0fdf4` → `--ok-700/600/100/50`；危险 `#b91c1c/#dc2626/#fee2e2/#fef2f2` → `--danger-700/600/100/50`；警告 `#92400e/#fef3c7/#fffbeb` → `--warn-700/100/50`；信息 `#1e40af/#3b82f6` → `--info-700/600`。
- 边界执行：
  - 模块特色渐变（中医棕、针灸绿、解剖蓝青 hero、维度条渐变）保留原 hex；
  - `@media print` 内颜色全部不动；
  - 复杂彩色投影/内发光保留；常见卡片阴影沿用既有 `--shadow-*`（本轮未做阴影批量重映射）；
  - 解剖/图表既有 10/12px 圆角未强改；字号/间距未做全量重排。
- 人工抽查：主蓝按钮、中医笺、针灸笺、解剖卡、报告 hero、弹窗底色观感保持不变。

### W2-7 全局视图弱化模块 Tab（审计 C6，低风险 UI 挂载）— 已上线，未降级
- 全局视图集合：`view-radar / view-mistakes / view-stats / view-drugs / view-quickref / view-pitfalls`；模块视图：`view-home` 及 tcm/acup/anat 各页。
- 挂载点：
  - `js/app.js` `show()`：进入全局视图给 `#module-tabs` 加 `hidden`，模块视图恢复（`classList.toggle('hidden', 全局视图)`）；
  - `js/platform-enhance.js` `showViewOnly()`：同一全局集合判定并切换 `hidden`；
  - `js/platform-enhance.js` 既有 `.module-tab` 点击监听：点模块 Tab 回到模块视图时移除 `hidden`，避免全局视图隐藏后残留。
- 未改动各模块 `setModule` 的病例状态重置逻辑。
- 残留排查：模块视图内部返回按钮只调用本模块 `showView`，仅在模块页内可达；错题本「重练」经 `retryByModule` 点击模块 Tab，由上述监听恢复显示。未发现多份清单覆盖导致的易残留路径，故按规范正常上线（未降级为报告记录）。

## 二、本轮继续推迟（写入报告，未执行）
- B2 流程步骤条/面包屑、返回上一步：跨四模块骨架特性，需多页流程走查后单独排期。
- B4 断点七档收敛与表格窄屏策略统一：需多宽度视觉回归，随下一轮专项。
- B6 报告 hero 骨架跨模块统一：结构分叉，需先定统一节点协议。
- B8 切模块清西医业务状态：属业务状态边界，需业务方确认清零口径。
- A-13 字号 21 档全量收敛；A-21 按钮灰渐变扁平化 / KPI 光斑精简；A-19 暗色模式（仅留方案，见第五节）。
- 圆角/阴影/间距/字号的全量令牌化：本轮仅做色值 1:1 保守映射，几何体系重排留后续专项。
- `login.html` / `admin.html` 不在范围。

## 三、构建与回归结果

### 1. CSS 压缩
- 已执行 `node scripts/_minify-css.js`，重建 `css/rx.min.css`（87.3 KB）。
- 自检：`css/rx.css` 花括号配对 1023 开 / 1023 闭，配对 OK。

### 2. JS 压缩（terser 5.51.2，本地 `node_modules`，已 gitignore）
- 已执行 `node scripts/minify-all.js`，全部源 JS 对应 `.min.js` 重建成功。
- 本轮改动源文件压缩产物：
  - `app.min.js` 96.6 KB、`tcm-app.min.js` 17.8 KB、`acup-app.min.js` 17.8 KB、`anat-app.min.js` 21.2 KB、`platform-enhance.min.js` 24.1 KB。
- 五个改动源文件均通过 `node --check` 语法校验：app.js / tcm-app.js / acup-app.js / anat-app.js / platform-enhance.js 全部 OK。
- 未改动源文件的 min 由脚本统一重跑，内容与源保持一致。

### 3. 版本号 `?v=` bump（`index.html`，目标值 `20261116ui2`）
- `css/rx.min.css`：`20261116ui1 → 20261116ui2`
- `js/app.min.js`：`20261116ui1 → 20261116ui2`
- `js/tcm-app.min.js`：`20261116ui1 → 20261116ui2`
- `js/acup-app.min.js`：`20261116ui1 → 20261116ui2`
- `js/anat-app.min.js`：`20261116ui1 → 20261116ui2`
- `js/platform-enhance.js`：`20261116ui1 → 20261116ui2`（HTML 仍以非 min 方式引用，其 `.min.js` 一并重建备用）。
- 未改动资源（rule-engine / review / standard-plan / tcm-engine / acup-engine / acup-time / module-views）查询串保持原值未动。

### 4. 回归 `node scripts/validate-all.js`
- 结果：**通过 35 项，失败 0 项**（与 N-1 修复后基线一致，未回退）。
- N-1 膀胱三角条目按 id/name 定位校验其 `nerve` 字段；未改动 `data/anatomy-systems.json`。
- HTML 标签自检：解析器栈空、无未闭合/错配标签，配对 OK。

### 5. 其他说明
- `scripts/validate-all.js` 工作区保留上一轮 Organizer 已完成的 N-1 定位校验修复（本次未再改动其校验口径），随本次提交一并入库。
- `tcm-app.js` 内未列入 W2-2 清单的 `#94a3b8` 文本占位按边界保持原样，未扩大替换范围。

## 四、改动文件清单
| 文件 | 改动摘要 |
|---|---|
| `css/rx.css` | W2-1 选项图标 ::after；W2-4 `.load-error-tip`；W2-5 `--topbar-h`/sticky 变量与移动端 static；W2-6 灰/蓝/语义色 1:1 令牌映射 |
| `css/rx.min.css` | `_minify-css.js` 重建 |
| `index.html` | 三处 hero 图 onerror + alt 置空；6 处 `?v=` bump 至 `20261116ui2` |
| `js/app.js` | W2-4 init catch 改页内提示条；W2-7 `show()` Tab 显隐；陷阱库 catch alert 保留 |
| `js/app.min.js` | terser 重建 |
| `js/tcm-app.js` | W2-4 newCase 守卫改显示 `#tcm-data-tip` |
| `js/tcm-app.min.js` | terser 重建 |
| `js/acup-app.js` | W2-2 选中态/弱灰色板映射；W2-4 守卫改显示 `#acup-data-tip` |
| `js/acup-app.min.js` | terser 重建 |
| `js/anat-app.js` | W2-2 考点标签色与同步 rgba；W2-3 详图 onerror 回退图注 |
| `js/anat-app.min.js` | terser 重建 |
| `js/platform-enhance.js` | W2-2 图例五色 + 拉丁弱灰；W2-5 顶栏测量与 resize；W2-7 `showViewOnly()` Tab 显隐 + 模块 Tab 点击恢复 |
| `js/platform-enhance.min.js` | terser 重建 |

## 五、暗色模式方案（仅记录，本轮未上线）
令牌体系已就位（灰阶/蓝阶/语义色均为 CSS 变量）。后续可新增一组 `@media (prefers-color-scheme: dark)` 深色变量映射（深底替换 `--gray-50/100`、文本反相替换 `--gray-900/700`、语义色在深色背景下调浅），并在模块 hero 渐变处单独校核白字对比度；本轮不引入暗色变量与切换逻辑。

## 六、Git 记录
- 提交信息：`style(ui): 第二批 UI 优化：选项图标/离板色收敛/空态回退/sticky 测量/令牌收口 20261116`
- 提交哈希：`a9a1778`（main，15 files changed, 587 insertions(+), 393 deletions(-)）。
- 推送状态：**已推送成功** `de6e6f1..a9a1778  main -> main`（remote：`https://github.com/Bing-ing-ic/rx-prescription-trainer.git`），无 443 拦截。
- `node_modules/` 已被 `.gitignore` 忽略，未入库。

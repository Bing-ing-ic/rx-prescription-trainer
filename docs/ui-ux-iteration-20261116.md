# UI/UX 迭代落地报告 — 2026-11-16

项目根：`D:\医学生处方推演训练平台\`（纯静态、无构建链、localStorage 学习记录）
规范依据：冻结版《UI 优化落地规范》`ui-optimization-spec.md`（A 令牌追加 / B 视图清单补全 / C 注入类名样式 / D 交互一致性 / E 对比度与离板色 / F P2 小项）。
边界遵守：未改动 `data/*.json`；未改规则引擎、评分口径与医学诊疗逻辑；JS 仅做规范允许的挂载微调（类名、导航置态、弹窗关闭委托、反馈类替换、视图清单补全）；未引入运行时外部依赖；未新增暗色模式；未执行规范第二节推迟项。

## 一、本次落地条目（文件 / 选择器 / 审计编号）

### A. 设计令牌（纯增量，`css/rx.css` `:root`，审计 A）
- 蓝阶 `--blue-900/700/600/500/100/50/--blue-glow`；灰阶 `--gray-900…--gray-50/--white`；语义色 `--ok-*`、`--danger-*`、`--warn-*`、`--info-*`；模块色 `--tcm-*`、`--acup-*`、`--anat-*`；圆角 `--radius-pill:999px`；阴影 `--shadow-xs/sm/md/lg`；间距 `--space-1…6`；字号 `--text-caption…2xl`。
- 仅追加令牌，未做全量 hex→var 替换（按规范留后续专项）。

### B. P0-1 视图隐藏清单补全（防跨模块叠加残留，审计 B）
26 个视图枚举逐个对齐；缺失 id 补齐，元素不存在时沿用既有 `if(el)` 保护。

| 文件 | 函数 | 本次补齐的视图 id |
|---|---|---|
| `js/app.js` | `show()` | `view-quickref` |
| `js/tcm-app.js` | `ALL_VIEWS` | `view-lab`、`view-surgery`、`view-pitfalls`、`view-quickref`、`view-anat-atlas` |
| `js/acup-app.js` | `showView()` | `view-lab`、`view-surgery`、`view-pitfalls`、`view-quickref`、`view-anat-home/system/cases/detail/quiz/atlas` |
| `js/anat-app.js` | `ALL_VIEWS` | `view-lab`、`view-surgery`、`view-pitfalls`、`view-quickref`、`view-acup-time` |
| `js/platform-enhance.js` | `showViewOnly()` | `view-lab`、`view-surgery` |

未重构为单一注册表（架构级改动留后续）。

### C. P0-2 platform-enhance 注入类名样式（`css/rx.css` 新增一节，审计 C）
- 统计 Tab：`.stats-module-tabs`（flex gap 8px 可换行）、`.stats-tab`（复用 `.nav-btn` 白底灰边圆角 8px 13px）、`.stats-tab.active`（医疗蓝底白字，对齐 `.module-tab.active`）。
- 指标卡网格：`.km-grid`（auto-fill minmax 220px，gap 12px）、`.km-card`（白底 1px 灰边 圆角 16px 内边距 16px 18px、shadow-sm）、`.km-name`、`.km-bar-wrap`（灰槽 `--gray-100` pill 高 8px 满宽）、`.km-bar`、`.km-num`、`.km-bad`/`.km-warn`（左 3px 危险/警告边框），`.km-bad .km-bar` 危险色、`.km-warn .km-bar` 警告色。
- 错题筛选栏：`.mistakes-filter-bar`（flex gap 10px wrap、margin-bottom 12px；select 复用现有输入框观感）；错题操作 `.mistake-actions`（flex gap 8px 对齐 flex-end）。
- 速查：`.qr-section`、`.qr-section-title`（15px 600、左 4px 边框、内边距 6px 10px、margin-bottom 10px）、`.qr-card-grid`（auto-fill minmax 180px gap 10px）、`.qr-card`（白底灰边圆角 8px 内边距 12px 14px，hover 蓝边 + shadow-sm、cursor pointer）、`.qr-card-name/sub/meta`、`.qr-detail-table`（12.5px、边框 `--gray-200`、表头 `--gray-100`）、`.qr-k`（灰 600 文本、浅底、宽 120px、顶对齐）、`.qr-exam-list`（12px、padding-left 18px、li margin 4px 0）。

### D. P1 交互与一致性（审计 B1/B3/B5/B7）
1. **B1 顶部导航激活态**
   - CSS：`.nav-btn.active { background: var(--blue-700); color:#fff; border-color: var(--blue-900); }`（置于 hover 之后，hover 不覆盖 active）。
   - `js/app.js` `bindNav()`：点击后置当前按钮 `.active` 与 `aria-current="true"`，其余 `[data-goto]` 清除；模块 Tab 切换不影响顶栏态。
2. **B3 弹窗统一关闭委托**（`js/platform-enhance.js` 启动段新增）
   - 全局 `click` 委托：`event.target.closest('.modal-mask')` 且 `event.target === mask` 时给该 mask 加 `hidden`；全局 `keydown` Esc 关闭当前可见（非 hidden）的第一个 `.modal-mask`。
   - 与 acup/tcm/quickref 既有自身遮罩、ESC 处理幂等，不重复绑定冲突；未做焦点锁定/归还（留后续专项）。
   - CSS `.modal` 补：`max-height:88vh; overflow-y:auto; width:calc(100vw - 32px);`（C5 合并到此）。
3. **B5 解剖详情卡覆盖解耦**
   - `js/anat-app.js` `openCase()` 详情卡根节点 `case-card` 追加修饰类 `anat-detail-case`。
   - `css/rx.css` 原解剖覆盖块（卡片/head/title/meta/body/body p）选择器改为 `.case-card.anat-detail-case` 及其派生；移动端 `.case-card` 覆盖同步改为 `.case-card.anat-detail-case`。西医通用 `.case-card` 基线不再被反向覆盖。
4. **B7 针灸反馈复用语义类**
   - `js/acup-app.js` 辨证反馈：两处内联 `color:#b91c1c` → `<span class="diag-err">`；一处 `color:#15803d` → `<span class="diag-ok">`。基线 `.diag-ok/.diag-err` 样式未改。
5. B2/B4/B6/B8 本轮不落地（见推迟清单）。

### E. P1 对比度与离板色修正（审计 E1–E5）
1. **#94a3b8 承载文字 → #64748b**（边框/装饰分隔线保留 94a3b8）：
   - CSS：`.foot-note`、`.acup-map-point-card .mc-top .mc-code`、`.acup-map-point-card .mc-code`、`.lab-exam-item .lab-exam-sig`、`.herb-lib-empty`、`.atlas-struct-chip .latin`、`.sp-no-drug`。
   - JS：`js/acup-app.js` 空态单元格内联 `#94a3b8` → `#64748b`。
   - 说明：规范写作 `.anat-map-point-card .mc-code`，按类名/语义定位到实际使用 `.acup-map-point-card .mc-code`（解剖模块无同名 mc-code 卡片）；`.asi-latin` 等未列入规范的 94a3b8 文本未改。
2. **警告文本 #ca8a04 on 浅黄底 → #92400e**：`.hit-warn` 文本、`.hit-item.warn` 文本（补 `color:#92400e`，边框色保留）、`.mistake-item.warn` 文本（补 `color:#92400e`，边框色保留）。
3. **`js/app.js` 徽章底色压深（白字达标）**：甲 `#27ae60→#166534`；乙 `#2980b9→#1e40af`；丙/自费 `#95a5a6→#64748b`；基 `#8e44ad→#3730a3`；集 `#e67e22→#b45309`；溶媒 `#7f8c8d→#64748b`。
4. **`js/app.js` 其余离板色**：两处文本 `#c0392b→#b91c1c`；四处空值占位 `#999→#64748b`（溶媒/皮试列 `—`、药物行 `↧`）。
5. **HTML 笔误**：`index.html` 合并症标签 11 处 `#475555→#475569`，仅改色值，其余内联未动。

### F. P2 高价值小项（审计 F1–F5）
1. 全局焦点兜底：`:focus-visible { outline:2px solid var(--blue-700); outline-offset:2px; border-radius: var(--radius-sm); }`；模块既有 focus-visible 规则保持优先。
2. 通用禁用态：`.btn:disabled { opacity:.5; cursor:not-allowed; box-shadow:none; transform:none; }`；既有 `.btn-primary:disabled` 保留并入。
3. 图标区分：`index.html` 针灸推拿 Tab `☯→💉`；中医汉方保留 `☯`；顶栏 📖 保留。
4. `index.html` `#pitfall-nav` 去掉重复的 `display:none;`，保留 `display:flex;…`；初始隐藏改由 `hidden` 类控制；`js/app.js` 两处切换点（隐藏/显示）同步镜像 `hidden` 类（既有 `style.display` 切换逻辑保留不变）。
5. `.hero-modern` 渐变浅端调整为 `#0f4c81→#1a6fb5→#1a6fb5`（不再用 2c7be5 压白字）；其余模块 hero 渐变未动。

## 二、本轮推迟项（未执行，按规范第二节）
- B2 流程步骤条/面包屑、返回上一步逻辑（跨四模块 JS+HTML 骨架特性）。
- B4 断点七档收敛与表格窄屏策略统一（需多宽度视觉回归）。
- B6 报告 hero 骨架跨模块统一（结构分叉）。
- B8 切模块清西医业务状态（业务状态边界）。
- A-3/A-13/A-15/A-16/A-21/A-22：字号/间距/阴影/边框/渐变全量令牌化与扁平化（令牌已预置，全量替换留专项）。
- A-6 其余 JS 离板色（tcm/acup/anat/platform-enhance 图例色）、A-18 选项补图标、A-19 暗色模式、C3 图片 onerror 全量补齐、C6 全局视图隐藏模块 Tab、C7 加载失败空态统一、C8 sticky 顶栏高度测量。
- 登录页/管理页（login.html/admin.html）不在本次范围。

## 三、构建与回归结果

### 1. CSS 压缩
- 已执行 `node scripts/_minify-css.js`，重建 `css/rx.min.css`（83.4 KB）。
- 自检：`css/rx.css` 花括号配对 1019 开 / 1019 闭，配对 OK。

### 2. JS 压缩（terser）
- 离线/在线探测：`npm i -D terser` 成功（11 packages，5s），`node_modules/` 已被 `.gitignore` 忽略。
- 已执行 `node scripts/minify-all.js`，全部源 JS 对应 `.min.js` 重建成功：
  - `app.min.js` 96.3 KB、`tcm-app.min.js` 17.8 KB、`acup-app.min.js` 17.8 KB、`anat-app.min.js` 21.0 KB、`platform-enhance.min.js` 23.6 KB；
  - 未改动源文件的 min（rule-engine/review/standard-plan/tcm-engine/acup-engine/acup-time/module-views/tuina-engine）也由脚本统一重跑，内容与源保持一致。
- 五个改动源文件均通过 `node --check` 语法校验。
- 注：`index.html` 中 `platform-enhance` 仍以非 min 方式引用；其 `.min.js` 由脚本一并重建备用。

### 3. 版本号 `?v=` bump（`index.html`，目标值 `20261116ui1`）
- `css/rx.min.css`：`20261106acupmap1 → 20261116ui1`
- `js/app.min.js`：`20261109sp1 → 20261116ui1`
- `js/tcm-app.min.js`：`20261105ui1 → 20261116ui1`
- `js/acup-app.min.js`：`20261105ui1 → 20261116ui1`
- `js/anat-app.min.js`：`20261105ui1 → 20261116ui1`
- `js/platform-enhance.js`：`20261106acupmap1 → 20261116ui1`
- 未改动资源（review/standard-plan/tcm-engine/acup-engine/acup-time/module-views）查询串保持原值未动。

### 4. 回归 `node scripts/validate-all.js`
- 结果：通过 34 项，失败 1 项。
- 唯一失败（基线已知，本次未触碰 `data/`）：**膀胱三角仍含「三叉神经」错误字样**（数据类问题，不属本次 UI 范围）。
- 与基线比对：未新增失败项。
- HTML 标签自检：`<div>` 365 开 / 365 闭；`<button>` 101 开 / 101 闭，配对 OK。

## 四、改动文件清单
| 文件 | 改动摘要 |
|---|---|
| `css/rx.css` | A 令牌追加；C 注入类名新节；B1 active 态；B3 `.modal` 尺寸滚动；B5 解剖卡选择器解耦；E1/E2 文本色；F1 focus-visible；F2 禁用态；F5 hero 渐变 |
| `css/rx.min.css` | 由 `_minify-css.js` 重建 |
| `index.html` | E5 11 处色值笔误；F3 针灸图标；F4 pitfall-nav 去重复 display:none + hidden 类；6 处 `?v=` bump |
| `js/app.js` | B 视图清单补 quickref；B1 导航 active/aria-current；E3/E4 徽章与离板色；F4 pitfall-nav 类镜像 |
| `js/app.min.js` | terser 重建 |
| `js/tcm-app.js` | B 视图清单补齐 5 个 id |
| `js/tcm-app.min.js` | terser 重建 |
| `js/acup-app.js` | B 视图清单补齐；B7 反馈语义类；E1 空态文本色 |
| `js/acup-app.min.js` | terser 重建 |
| `js/anat-app.js` | B 视图清单补齐；B5 详情卡 `anat-detail-case` 类 |
| `js/anat-app.min.js` | terser 重建 |
| `js/platform-enhance.js` | B 视图清单补齐；B3 全局遮罩/Esc 关闭委托 |
| `js/platform-enhance.min.js` | terser 重建 |
| `package.json` / `package-lock.json` | 新增 devDependency `terser ^5.51.2`（本地压缩工具链；`node_modules/` 已 gitignore） |

## 五、Git 记录
- 提交信息：`style(ui): 设计令牌/对比度/一致性/弹窗与导航态优化 20261116`
- 本地 commit 哈希：**791cb7b**（main，领先 `origin/main` 1 个提交）。
- push 状态：已执行 `git push origin main`，HTTPS 连接挂起无响应（443 疑似被拦截/鉴权未就绪），未能推送；本地提交完整保留在 `main` 分支，未丢失。remote：`https://github.com/Bing-ing-ic/rx-prescription-trainer.git`。`node_modules/` 已被 `.gitignore` 忽略，未入库。

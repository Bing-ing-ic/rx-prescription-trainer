# 第三轮体检续作五（Round3 Follow-up 5）落地报告

- 日期：2026-11-23
- 承接：`docs/comprehensive-audit-round3-followup4-20261123.md` 第 7 节"转再下批清单"4 项（E1–E4），E5 为回归压缩与提交
- 基线：HEAD `0d24610`，工作区干净，`node scripts/validate-all.js` 基线 36 通过 / 0 失败，20 套件全绿
- 本轮版本串：静态资源 `?v=20261123r8`（r7 → r8）

## 1. 本轮范围与结论概览

| 编号 | 范围 | 结论 |
|---|---|---|
| E1 | 间距低频值令牌化收口 | 已落地：`:root` 补 15 个低频间距档；CSS 338 处、5 个非 min JS 内联 132 处间距声明入令牌；未定义令牌引用 0；CSS/JS 裸间距残留 0；视觉不变。`admin.html` 内嵌 `<style>` 自带独立 `:root`、不加载 `rx.css`，本轮不纳入，转下批 |
| E2 | 柴胡注射液等肌注品种药品库补录 | 部分落地：柴胡注射液按药典/说明书口径补入（720 → **721**），肌注、无溶媒、儿童禁用、过敏/休克监护等警示从严；其余 14 个常用中药肌注/注射剂核对均不在册，未逐品种核说明书前不臆造，转下批 |
| E3 | 注射剂 compat 品种间互斥行独立维护 | 已落地：`compat.json` 新增第四层 `tcm_exclusion` **137 行**（1 条 class 类规则 + 17 个 TCM 品种两两成对 136 行）；引擎 IV-07 增 TCM-TCM 同瓶判定与 TCM_EX 成对互斥扫描；详情弹窗接入类规则提示（含同通路冲管间隔）；`tcm_injection_rules` 38 → **39**（柴胡行） |
| E4 | 解剖测验自评打分/连答/结算页多宽度走查 | 已落地并修复 3 处缺陷：CDP headless Edge 480/640/768/1024 走查单选答题/反馈、配对、QA 自评打分、连答切换、结算/成绩页；修复 QA 分支缺"下一题"按钮导致自评后无法连答、进度与得分不刷新；结算页进度条未隐藏；"再测一次"事件对象误传 `startQuiz`。修复后流程复测通过，可见元素横向溢出/超宽 0 |
| E5 | 回归压缩、bump 版本、校验与提交 | 已落地：重建全部 JS min 与 `rx.min.css`；版本串 r7 → r8；`validate-all` 36/0；20 套件全绿；rule-engine-test 80/80；报告与备忘随提交入库 |

医学剂量/禁忌以现行药典、市售说明书、现行指南为准；无可靠依据的不臆造；毒性/妊娠禁忌从严。纯静态无构建链、不引外部 CDN；改 JS/CSS/JSON 后已重建 min 并 bump 版本串；未改评分权重与业务计算口径。

## 2. E1：间距低频值令牌化收口

### 2.1 令牌补充（`css/rx.css :root`）

既有 `--space-1…6`（4/8/12/16/24/32px）与 `--space-6px/10px/14px/18px/20px/28px` 基础上，新增 15 个低频档：

`--space-1px / 2px / 3px / 5px / 7px / 9px / 11px / 13px / 22px / 30px / 34px / 35px / 36px / 40px / 60px`。

4/8/12/16/24/32px 复用既有 `--space-1…6`，不另立近义令牌。

### 2.2 收口范围与校验

- CSS 侧：`padding/margin/gap/row-gap/column-gap` 命中刻度值替换为 `var(--space-*)`，共 338 处声明；`border-width/width/height/letter-spacing` 等非间距属性不动。
- JS 内联：`js/acup-app.js` 12 处、`js/anat-app.js` 9 处、`js/app.js` 90 处、`js/platform-enhance.js` 17 处、`js/tcm-app.js` 4 处，共 132 处入令牌。
- 校验：CSS 花括号 1025/1025 平衡；未定义 `var()` 令牌引用 **0**；5 个改动 JS 文件 `node --check` 通过；复扫 CSS 裸间距声明残留 **0**、JS 内联裸间距残留 **0**。
- 布局维度值（卡片宽、断点宽等）非间距语义，维持原值。

### 2.3 保留项（转下批）

- `admin.html` 内嵌独立 `<style>` 块：自带 `:root`、不加载 `rx.css`，其裸 px 值与主令牌体系不共享作用域；本轮未纳入，下一批随 admin 页样式统一评估后再收口。

## 3. E2：柴胡注射液等肌注品种药品库补录

### 3.1 柴胡注射液条目（`data/drugs.json`，720 → 721）

口径来源：现行市售说明书与国家药品监管部门 2018 年第 26 号修订公告（说明书修订要求）。

| 字段 | 口径 |
|---|---|
| 通用名 / 规格 | 柴胡注射液，2ml/支，单位 支 |
| 剂型 / 给药途径 | `dosage_form: im`（肌内注射）；`is_iv_capable: false`；非静脉滴注品种 |
| 剂量 | 一次 2–4ml，一日 1–2 次（单日上限 8ml）；默认频次 qd、疗程 3 天 |
| 溶媒 | `allowed_solvents_json: []`（肌注、不经输液溶媒稀释；不臆造溶媒行） |
| 药理分类 / 抗菌等级 | 中药注射剂；`abx_level: none`；处方药；医保甲类 |
| 适应证 | 清热解表，用于感冒、流感、疟疾等发热证候（功能主治按说明书口径） |
| 禁忌 | **儿童禁用**；对本品或柴胡制剂及所列辅料（聚山梨酯 80、氯化钠）过敏、或有严重不良反应史者禁用 |
| 警示（6 条 special_warnings） | ① 儿童禁用；② 过敏/严重不良反应史者禁用；③ 不良反应包括过敏性休克，须在有抢救条件的医疗机构使用，用药后密切观察 30 分钟；④ 严禁与其他药品混合配伍，须单独注射；⑤ 过敏体质、家族过敏史者慎用；老人、孕妇、肝肾功能异常者及初次使用中药注射剂者慎重使用并加强监护；⑥ 无发热者不宜，不可超剂量、不可长期连续用药 |
| 其他 | 成分北柴胡，辅料氯化钠、聚山梨酯 80、注射用水；**不含乙醇**，未添加乙醇相关警示；拼音 `chailuzsy`/`CELZSY`；`reference_status: backup` |

### 3.2 其他常用中药注射剂核对结果

逐品种在药品库检索：参附注射液、黄芪注射液、当归注射液、板蓝根注射液、刺五加注射液、双黄连注射液、热毒宁注射液、炎琥宁注射液、穿琥宁注射液、丹参酮ⅡA 磺酸钠注射液、银杏达莫注射液、野木瓜注射液、莪术油注射液、莲必治注射液 **14 个品种均不在册**。

按"无可靠依据不臆造"约束，本轮未补录；各品种剂量、溶媒、禁忌与妊娠/儿童口径须逐份核说明书或药典后再入库，转下批。

## 4. E3：注射剂品种间互斥行独立建模与引擎接入

### 4.1 数据建模（`data/compat.json`，四层结构）

| 层 | 口径 | 行数 |
|---|---|---|
| `solvent_drug` | 溶媒-化药配伍（既有） | 15 |
| `drug_drug` | 同一输液瓶内两化药配伍（既有） | 6 |
| `tcm_injection_rules` | 中药注射剂单独输注规则与指定溶媒；本轮补柴胡注射液 `incompatible_with_any_other` 行（肌注、无溶媒行） | 38 → **39** |
| `tcm_exclusion`（本轮新增） | 品种间互斥独立成行，与化药配伍表结构统一 | **137** |

`tcm_exclusion` 行结构：`drug_a / drug_b / scope / compatibility / note`。

- **1 条 class 类规则行**：`drug_a=<中药注射剂>`、`drug_b=<其他注射剂>`，`scope: class`，`compatibility: incompatible`；备注"严禁同瓶混合；须单独成组/单独注射；同一输液通路先后使用须冲管间隔并加强监护"。
- **136 条 `same_bottle` 成对行**：17 个在册 `is_tcm_injection` 品种（含柴胡注射液）两两组合，口径"两种中药注射剂严禁同瓶混合配伍；须分别单独成组/单独注射，同一通路先后使用须冲管间隔"。
- `compat.note` 改写为四层口径说明，并标注 `scope` 取值（class 类规则 / same_bottle 不可同瓶 / same_line 通路先后须冲管）与 `compatibility` 取值。

### 4.2 引擎与前端接入

- 引擎 `js/rule-engine.js` IV-07 扩展两组判定：
  - 同组内 ≥2 个中药注射剂 → 报 TCM-TCM 同瓶 error；中药注射剂与化药同瓶 → error（既有口径保留）；
  - 新增 TCM_EX 成对行扫描（排除 class 占位行）：同组命中 `incompatible` 走 IV-07 error，命中 `caution` 走 warn。
- 前端 `js/app.js` 药品详情弹窗：新增 `tcmExclNote` 预计算（取 `tcm_exclusion` 中 `scope==='class'` 行 note，兜底静态文案含同通路冲管间隔），配伍提示行改用该 note。
- 校验：`node --check` 通过；`validate-all` 36/0；`rule-engine-test` **80/80**。

### 4.3 保留与缺口

- TCM×化药互斥目前由 class 类规则行承载，未逐对建模；后续如需品种级"某 TCM 与某化药"专属互斥/谨慎行，可在 `tcm_exclusion` 内按对补 `same_bottle` / `same_line` 行。
- 14 个未在册中药注射剂（见 3.2）入库后，其成对互斥行再按同一派生规则补入。

## 5. E4：解剖测验答题 / 自评 / 连答 / 结算页多宽度走查

### 5.1 走查环境与方式

- 本地静态服务：项目根 `http://127.0.0.1:8899`；CDP（Chrome DevTools Protocol）驱动 Edge headless，导航后真实等待异步 fetch 完成，再按宽度 `Emulation.setDeviceMetricsOverride` 截图并扫描溢出。
- 宽度：**480 / 640 / 768 / 1024**。
- 场景：① 单选题题卡（选项列、题干）；② 单选答题后反馈态（正误高亮、解析、下一题）；③ 配对题（左右两列 / 窄宽单列堆叠、选中与命中态）；④ QA 题显示参考答案 → 三档自评（+10/+5/+0）；⑤ 连答切换（作答后下一题，进度与得分刷新）；⑥ 结算/成绩页（得分环、等级、题数与时间、再测一次）。
- 调试钩子：`window.__anatQuiz = { start, finish, state }`，`start(forceType)` 可按题型抽题，便于 CDP 直达各题型与结算页；沿用既有 `__showView`/`__openRx` 暴露惯例。

### 5.2 本轮发现并修复的缺陷

| # | 缺陷 | 现象 | 修复 |
|---|---|---|---|
| 1 | QA 分支缺"下一题"按钮 | QA 题自评打分后，`#anat-btn-quiz-next` 元素不存在；`classList.remove('hidden')` 空引用中断处理函数，导致**得分与进度不刷新、无法进入下一题** | QA 题卡模板补入与单选/配对一致的"下一题 →"按钮（默认 hidden），自评后显示并绑定 `nextQuizQuestion` |
| 2 | 结算页进度条未隐藏 | 进入结算页后，"第 x/10 题 当前得分"进度条仍残留在成绩卡上方 | `finishQuiz()` 隐藏 `#anat-quiz-progress`；`startQuiz()` 开局恢复显示 |
| 3 | "再测一次"事件对象误传 | `onclick = startQuiz` 把鼠标事件对象当作 `forceType` 参数传入；改为 `() => startQuiz()` 包裹 | 修复后结算页点"再测一次"正常重置题卡、进度与得分 |

### 5.3 走查结论

| 视图 | 480 | 640 | 768 | 1024 |
|---|---|---|---|---|
| 单选题题卡 | 选项通栏单列，题干换行正常 | 正常 | 正常 | 选项通栏，进度行正常 |
| 单选反馈态 | 正误高亮行/解析块/下一题按钮纵向堆叠 | 正常 | 正常 | 长解析换行正常，按钮左对齐 |
| 配对题 | 左右列单列纵向堆叠，选中蓝底、命中绿底 | 单列堆叠 | 单列堆叠 | 左右两列，项高一致 |
| QA 自评 | 参考答案要点列表 + 三档自评按钮纵向堆叠 | 正常 | 正常 | 自评按钮换行排布正常 |
| 连答切换 | 作答后下一题刷新题干，进度"第 2/10 题"与得分同步 | 正常 | 正常 | 正常 |
| 结算/成绩页 | 得分环、等级、题数时间、再测一次居中堆叠；进度条已隐藏 | 正常 | 正常 | 得分环与摘要左右排布 |

- 脚本扫描：各宽度可见元素 `scrollWidth > clientWidth+2` 或 `right > viewport+1` 的记录均为 **0**；body 无横向滚动。
- 唯一内部 scrollWidth 差值来自 `.report-hero` 装饰性 `::before` 径向光斑（`right:-10%`、400×400，绝对定位，`overflow:hidden` 裁剪）：不产生可见裁切或页面横向滚动，截图确认布局正常；该装饰为各模块报告头共用既有模式，本轮保留，未改动视觉。
- 流程复测（CDP 直调状态钩子）：identify 作答 → 下一题 idx 0→1；QA 自评 +10 → 得分 10、下一题 idx 0→1；结算页可见 → 再测一次重置为题卡态、进度"第 1/10 题 得分 0"。

## 6. 回归与测试套件通过率

- `node scripts/validate-all.js`：**36 通过 / 0 失败**。
- 测试套件 **20/20** 全部通过，既有 e2e/回归未新增失败：

| 套件 | 结果 |
|---|---|
| rule-engine-test（含本轮 TCM-TCM / TCM_EX 互斥判定） | ✓ 80/80 |
| verify-p3-chronic / verify-p3-longterm / verify-p1-xiyi | ✓ |
| tcm-verify-p0 / p1 / p2 / p3；tcm-smoke-p1-6 | ✓ |
| tuina-engine-test；verify-p4-tuina-integration | ✓ |
| verify-p3-pinyin / verify-p4-pinyin | ✓ |
| verify-p3-pitfalls / verify-p5-pitfall-match | ✓ |
| verify-lab-data | ✓ |
| e2e-acup / e2e-anat / e2e-cases / e2e-tcm | ✓ |

## 7. 转再下批清单

1. **`admin.html` 内嵌样式令牌化**：独立 `<style>` 块自带 `:root`、不加载 `rx.css`；其裸 px/字号/圆角值待随 admin 页样式体系统一评估后收口。
2. **14 个常用中药注射剂入库**：参附、黄芪、当归、板蓝根、刺五加、双黄连、热毒宁、炎琥宁、穿琥宁、丹参酮ⅡA 磺酸钠、银杏达莫、野木瓜、莪术油、莲必治；须逐份核说明书/药典后补剂量、溶媒、禁忌与 compat 行，入库后再派生 TCM_EX 成对互斥行。
3. **TCM×化药品种级互斥建模**：现由 class 类规则行承载；如需品种级专属互斥/谨慎行，按对补 `same_bottle` / `same_line` 行并接入引擎扫描。
4. **解剖测验更多态截图归档**：本轮已覆盖单选/配对/QA 自评/连答/结算；错题本入库页、多题连答全程截图可在下一批补归档。

## 8. 构建、版本与 git 状态

- 重建压缩：`scripts/minify-all.js` 重建全部 JS `.min.js`；`scripts/_minify-css.js` 重建 `rx.min.css`（101.7KB）。
- 版本串：index.html 11 处静态资源统一 bump 为 `?v=20261123r8`。
- 本轮改动：`data/drugs.json`、`data/compat.json`；`css/rx.css`；`js/anat-app.js`、`js/app.js`、`js/rule-engine.js`、`js/acup-app.js`、`js/tcm-app.js`、`js/platform-enhance.js`；`index.html`；对应 min 产物。
- 提交：本地提交后 `git push origin main`；若 443 Connection reset，更新 `docs/push-retry-memo.md` 备忘，网络恢复后重试。CI 为 GitHub Pages Actions，push main 自动发布；docs/ 目录不纳入部署。

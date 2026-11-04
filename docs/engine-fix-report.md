# 规则引擎与核心功能 P0 修复报告

- 修复日期：2026-11-04
- 修复范围：`js/app.js`、`js/rule-engine.js`、`js/review.js`、`data/rules.json`、`data/compat.json`（未改动）、`index.html`、`admin.html`
- 备份目录：`data/_backup_before_engine_fix/`（含全部被改文件原件）
- 验证：`node --check` 全部通过；冒烟测试 `test/smoke-engine-fix.js` 10/10 通过

---

## 修复总览

| # | Bug | 严重度 | 状态 |
|---|-----|--------|------|
| 1 | 空处方刷分（0药提交得100分优秀） | P0 | ✅ 已修 |
| 2 | 无皮试录入列，IV-08 对需皮试药一律误报 error | P0 | ✅ 已修 |
| 3 | `iv_reason` 写死 `student_selected_iv` 绕开 IV-01 | P0 | ✅ 已修 |
| 4 | compat.json `drug_drug` 规则引擎全程未读取 | P0 | ✅ 已修 |
| 5 | 溶媒名整串匹配导致 compat.json 全部失配 | P0 | ✅ 已修 |
| 6 | FMT-01 与 FMT-01-EXT 规则自相矛盾 | P0 | ✅ 已修 |
| 7 | IV-07 跨组误报中药注射剂同瓶混合 | P0 | ✅ 已修 |
| 8 | CountAPI 死亡致 admin 后台卡加载 | P0 | ✅ 已修 |

---

## 1. 空处方刷分 Bug（最严重）

**问题**：不加任何药品直接提交，评分器因没有任何 error/warn 命中，按满分（约100分）输出"优秀"，报告仅灰字提示缺首选用药、不扣分。

**修复方案**：
- 在 `js/review.js` 新增 `hasAnyTherapeuticDrug(ctx)`，跨 `normal_rx`/`iv_rx` 统计是否存在任何治疗性药品（排除 `dosage_form==='solvent'` 的溶媒）。
- `Reviewer.score(hits, ctx)` 增加第二参数 `ctx`；若两处方均无药品，直接注入合成 error `FMT-EMPTY`，所有维度扣分至 0，返回 `total=0`、`emptyPrescription=true`，评级强制"不合格"。
- `js/app.js` 提交处调用改为 `Reviewer.score(hits, ctx)`。

**修改文件与行号**：
- `js/review.js`：`hasAnyTherapeuticDrug` 第 34 行；空处方拦截第 44–66 行。
- `js/app.js`：评分调用 `window.Reviewer.score(hits, ctx)`（submitRx 内）。

**验证方法**：进入任意病例→选普通处方→不加任何药→直接提交。预期：总分 0，评级"不合格·重新学习"，报告列出"空处方（未开具任何药品）"error。

---

## 2. 皮试录入缺失导致 IV-08 误报

**问题**：输液处方笺 UI 没有皮试结果列；提交时每个输液药硬编码 `skin_test_result:'not_required'`，11 种 `skin_test_required=true` 的药（如注射用头孢呋辛钠）在真实 UI 一律无法录入皮试，学生无法补救。

**修复方案**：
- 输液表格新增"皮试"列（`index.html` 表格在 `js/app.js renderIvGroups()` 中渲染）：溶媒行显示"—"；药品行仅当 `drug.skin_test_required===true` 时渲染下拉框（未做 pending / 阴性 negative / 阳性 positive），否则显示"—"。
- `pushIvDrug()`：需皮试药默认 `skin_test_result:'pending'`（未做），非需皮试药为 `'not_required'`。
- 提交时每个拍平 item 携带真实 `skin_test_result`；并在 submitRx 硬阻断：存在需皮试药仍为 pending 时弹出 alert，列出药品名，禁止提交。
- 引擎 IV-08 已按 item 级 `skin_test_result` 判定：空/pending→error；positive→error；阴性→pass（引擎逻辑原本正确，此前是数据没传进来）。

**修改文件与行号**：
- `js/app.js`：皮试列表头（renderIvGroups thead）；溶媒行皮试单元格；药品行 `skinCell` 与 `.g-skin` onchange；`pushIvDrug` 默认值；submitRx 中 pending 拦截与 flatItems 注入 `skin_test_result`。
- `js/rule-engine.js`：IV-08 逻辑（原已正确，第 499 行附近）保持不变。

**验证方法**：输液组加入注射用头孢呋辛钠，皮试列默认"未做"→提交被拦截；改选"阴性"→提交后 IV-08 显示 pass；改选"阳性"→IV-08 报 error。

---

## 3. IV-01 指征判定被绕开

**问题**：提交时 `iv_reason` 写死为 `'student_selected_iv'`，该值不在 `isWeakIvReason` 弱指征名单内，导致普通感冒选输液只报 warn 不报 error。

**修复方案**：
- `index.html` 输液区顶部新增"输液指征"下拉条（id=`iv-reason-select`）：发热为主 fever / 脱水·电解质紊乱 severe_dehydration / 不能口服 no_oral_alternative / 序贯治疗 sequential_therapy / 其他 other；附备注输入。
- `openRx('iv')` 时重置下拉与 `S.ivFields`。
- `submitRx` 硬阻断：未选指征直接 alert 禁止提交；读取真实值写入 `ivCtx.iv_reason`（删除写死的 `'student_selected_iv'`）。
- 引擎 IV-01（`js/rule-engine.js` 第 383 行附近）按真实指征判定：`usually_no_iv` 疾病 + 指征 fever/other → error；severe_dehydration/no_oral_alternative/sequential_therapy → warn。

**修改文件与行号**：
- `index.html`：输液指征下拉条（`#iv-reason-select`，rx-body-iv 内）。
- `js/app.js`：openRx 重置；submitRx 读取并阻断；`iv_reason: S.ivFields.iv_reason`。

**验证方法**：普通感冒病例选输液、指征选"发热"→IV-01 error；同病例指征改选"脱水"→IV-01 降为 warn。

---

## 4. compat.json drug_drug 规则未被读取

**问题**：compat.json 有 6 条同瓶禁忌（头孢呋辛钠+VC、头孢呋辛钠+左氧、泮托拉唑+VC 等），但 rule-engine.js 全程未读取 `compat.drug_drug`。

**修复方案**：
- 新增规则 `DD-01`（`data/rules.json`，group=COMPAT）。
- `js/rule-engine.js`：把拍平 items 按 `it.group` 分桶后，对同一输液组内两两药物组合，顺序无关地匹配 `compat.drug_drug`：incompatible→error，caution→warn；不同组（不同瓶）不判同瓶。

**修改文件与行号**：
- `js/rule-engine.js`：`ivGroupsMap` 分桶第 471 行；DD-01 同瓶两两检查第 525 行起。
- `data/rules.json`：新增 `DD-01` 规则条目。

**验证方法**：同一组内加头孢呋辛钠+维生素C注射液→DD-01 报 error（同瓶禁忌）；两药分两组→不报。

---

## 5. compat.json 溶媒配伍全部失配

**问题**：compat.json 溶媒写为 `"0.9%氯化钠注射液 100ml"`，药品库 `generic_name="0.9%氯化钠注射液"`、规格在 `spec="100ml/袋"`；提交拼接成 `"0.9%氯化钠注射液 100ml/袋"`，靠 `indexOf` 方向偶尔命中、整体不可靠，体积维度也无法区分 100ml/250ml。

**修复方案**：
- 新增 `splitSolvent(name)`：把溶媒名拆成 `{ base(通用名), volMl(体积) }`，剥离体积数字与"/袋/瓶/支"后缀。
- 新增 `solventMatch(a,b)`：通用名必须完全一致；记录侧有明确体积时，体积必须一致（保留 NS 100ml vs 250ml、泮托拉唑浓度差异的区分度）。
- IV-06 改为按输液组判定：从该组的溶媒 item 取 `generic_name+spec` 作为所选溶媒；`allowed_solvents_json` 与 compat.solvent_drug 均走 `solventMatch`。

**修改文件与行号**：
- `js/rule-engine.js`：`splitSolvent` 第 93 行、`solventMatch` 第 102 行；IV-06 重写第 479 行起。

**验证方法**：头孢呋辛钠+5%葡萄糖 250ml→IV-06 error（禁用含糖溶媒）；头孢呋辛钠+0.9%氯化钠 100ml→不误报 error。

---

## 6. FMT-01 与 FMT-01-EXT 自相矛盾

**问题**：FMT-01 规定 >5 种判 error，FMT-01-EXT 规定 6 种 warn / ≥7 种 error，同一张处方同时触发两种相反结论。

**修复方案**：
- 合并为单条规则 FMT-01：>5 种药品（含溶媒）一律 error。
- 删除引擎中 FMT-01-EXT 分级扣分代码块；删除 `data/rules.json` 中的 `FMT-01-EXT` 条目。

**修改文件与行号**：
- `js/rule-engine.js`：FMT-01 改为 error（第 131–140 行）；删除原 FMT-01-EXT 块，保留注释说明已合并。
- `data/rules.json`：移除 `FMT-01-EXT` 对象。

**验证方法**：一张处方 7 个药项→仅一条 FMT-01 error，无 FMT-01-EXT 残留。

---

## 7. IV-07 跨组误报

**问题**：引擎在拍平的全局 items 上判"同瓶"，清开灵单独成组、头孢另开一组也会被误判为同瓶混合。

**修复方案**：IV-07 改为按 `it.group` 分组判断，仅同一组（同一输液瓶）内同时出现 `is_tcm_injection=true` 与其他 iv_drip 治疗药才报 error。

**修改文件与行号**：
- `js/rule-engine.js`：IV-07 第 513 行起，按 `ivGroupsMap` 逐组判定。

**验证方法**：清开灵单独一组、头孢另一组→无 IV-07 error；清开灵与头孢放同一组→IV-07 error。

---

## 8. CountAPI 死亡致后台加载失败

**问题**：admin.html 使用 `https://api.countapi.xyz/get/rx-trainer-2026/visits`，该服务已 DNS 死亡，fetch 永久挂起/未捕获 Promise。

**修复方案**：
- 移除外部 fetch，改为本机 `localStorage` 累计访问计数（`rx-local-visits`）。
- 卡片文案改为"本机累计访问次数 / 本机浏览器本地统计（原 CountAPI 服务已停用）"。

**修改文件与行号**：
- `admin.html`：删除 `fetch('https://api.countapi.xyz/...')` 块，替换为本机统计；卡片 label/sub 同步更新。

**验证方法**：打开 admin.html，"本机累计访问次数"立即显示数字，控制台无 countapi 网络错误/Promise 未捕获。

---

## 附：语法与自动化验证

- `node --check js/app.js / js/rule-engine.js / js/review.js`：全部 OK。
- `JSON.parse data/rules.json / data/compat.json`：全部 OK。
- 冒烟测试 `test/smoke-engine-fix.js`（可直接 `node test/smoke-engine-fix.js` 复跑）覆盖：
  1. 空处方 total=0 且标记 emptyPrescription
  2. IV-01 发热→error、脱水→warn
  3. IV-08 需皮试药 pending→error
  4. DD-01 头孢+VC 同瓶→error
  5. IV-06 头孢+5%GS→error（通用名匹配生效）
  6. IV-07 跨组→不误报
  7. FMT-01 7 种→error 且无 FMT-01-EXT 残留

  结果：**10 通过 / 0 失败**。

## 未改动说明
- 按数据清洗组并行约定，未改动 `data/diseases.json`、`data/drugs.json` 的任何数据内容。
- `data/compat.json` 规则内容本身正确，本次仅在引擎侧补读取与匹配逻辑，未改其数据。

# 第三轮体检续作十四（Round3 Follow-up 14）：三静脉途径功能专项 QA 回归与修复报告

- 日期：2026-11-24
- 上一交付：followup13（commit `edfab2c`，版本 r16），三静脉途径（滴注/推注/泵入）功能落地
- 本轮性质：独立、严格的专项 QA 回归（不只复跑既有套件），发现 BUG 按根因修复并补回归用例锁住
- 本轮版本串：`?v=20261124r17`（r16 → r17）
- 方法：两条只读 QA 线并行（规则引擎+数据一致性探针；前端 CDP 走查 480/1024），编排层独立复核源码、数据与 min 产物；修复后重跑全部既有套件 + 新增边界用例 + CDP 冒烟。

## 1. 结论概览

| 类别 | 数量 | 处置 |
|---|---|---|
| 确认 BUG（误报/缺陷） | 2 | 已修复并补回归用例 |
| 隐患（边界校验缺口） | 4 | 已修复并补回归用例 |
| 前端交互/兼容缺陷 | 1（P2） | 已修复 |
| 基线级响应式瑕疵 | 1（P3） | 已修复 |
| 数据卫生问题 | 1 组（9 条） | 已归一 |
| 转下批（需跨条目上下文/口径确认） | 2 | 记录在 §6，不在本轮扩大改动 |

回归基线（修复后实跑）：

| 校验项 | 结果 |
|---|---|
| `node scripts/validate-all.js` | **36 通过 / 0 失败** |
| `node test/rule-engine-test.js` | **102/102 通过**（基线 93，本轮 +9 边界用例） |
| `node test/e2e-cases.js` | **12/12 病例无 error**（既有 10 + 三途径 2，未新增 error） |
| 批量套件 `scratch-runall.js` | **20/20 全绿** |
| CDP 冒烟（1024/480） | 控制台异常 0、页面异常 0；跨模块草稿已清空；480 无横向溢出 |

## 2. BUG 与隐患清单（现象 / 根因 / 级别 / 修复 / 证据）

### FIX-1〔minor，误报〕IV-12 阿托品无时长口径，被误判"缺推注时长" warn/minor

- **现象**：阿托品注射液 `drip,push`、无说明书时长口径；`route=iv_push` 未填时长时，引擎抛 IV-12 `warn/minor`，且风险句把一般注意事项拼接成"推注过快可致……"，文案不通顺。
- **根因**：
  - 数据侧（`data/drugs.json`）：阿托品 `push_min="按心率/反应滴定"` 是滴定说明，不是可解析的时长下限；followup13 新增字段，基线 `10b4c83` 本无此字段。
  - 引擎侧（`js/rule-engine.js` IV-12 段）：跳过条件仅做 truthiness 判断，未用解析结果兜底；`pushMinLowerBound()` 对该串返回 `null` 但未参与跳过判定。
- **修复**：
  - 数据：阿托品 `push_min` 置空，"按心率/反应滴定"并入 `route_note` 前缀；与地塞米松/肌苷等无口径药一致。
  - 引擎：跳过条件改为"既解析不出数字时长下限、又无速度上限则整段跳过"；风险句仅在有 `route_note` 时引用，否则用通用风险表述。
- **证据**：新增引擎用例「阿托品无时长口径，静推不触发 IV-12」（expect `none`）通过；修复前探针复现为 `warn/minor`。

### FIX-2〔major 隐患〕IV-11 泵速非数字不校验，垃圾值判"参数完整"

- **现象**：`pump_rate='abc'` 仍判 IV-11 pass，无任何数值合法性检查；空串/null/纯空白已能识别。
- **根因**：IV-11 仅判空，未做数值解析；`pump_rate=0` 已验证不误判为空（合法下限值）。
- **修复**：新增数值校验辅助 `isNumericRate()`：泵速为空按缺参 major；非空但既非单值数字、也非数值区间（如 `0.05–0.1`）→ `error/major`，提示填写数值泵速并选择单位；合法 0、数值区间均放行。
- **证据**：新增用例「泵速填非数字 → major」「泵速 0 为合法下限值 → pass」「泵速为数值区间 0.05–0.1 → pass」通过。

### FIX-3〔minor〕IV-11 泵速单位字段引擎未读取校验

- **现象**：泵速、浓度完整但 `pump_rate_unit` 为空，仍判 pass；单位口径（ml/h、μg/kg/min、μg/min、U/kg/h）是泵入参数完整性的一部分。
- **根因**：IV-11 缺参清单只含泵速、配制浓度，遗漏单位。
- **修复**：缺参清单补入"泵速单位"；单位为空按 major 处理。
- **证据**：新增用例「多巴胺泵入缺泵速单位 → major」通过；既有完整参数正例不受影响。

### FIX-4〔major 隐患〕IV-12 mg/min 速度上限未解析，呋塞米类永不判超

- **现象**：呋塞米 `push_speed_limit="大剂量≤4mg/min"`，速度解析正则只认 `ml/min`；填 `5mg/min` 仍 pass，mg/min 口径永不判超。
- **根因**：`pushSpeedMax()` 正则单位写死 `ml/min`。
- **修复**：速度上限与入参速度解析同时兼容 `ml/min`、`mg/min`；按数值与上限比较。
- **证据**：新增用例「呋塞米 5mg/min 超 4mg/min 上限 → major」「呋塞米 1mg/min 合规 → pass」通过。

### FIX-5〔minor〕IV-12 纯数字无单位、仅填速度时绕过时长下限判定

- **现象**：氨茶碱 `push_min='9'`（无"分钟"单位）、`push_min='5ml/min'`（仅速度）均绕过 10 分钟下限判定直接 pass。
- **根因**：时长解析要求命中"分钟"字样；裸数字与速度写法未兜底。
- **修复**：时长解析顺序——先匹配"分钟"；无分钟单位且无速度单位时，裸数字按分钟口径参与下限比较；速度按 ml/mg-per-min 单独比较。
- **证据**：新增用例「氨茶碱纯数字 9 按分钟判定低于下限 → major」「葡萄糖酸钙 5ml/min 等于上限 → pass」通过。

### FIX-6〔P2，前端兼容〕跨模块往返后西医输液/口服草稿残留

- **现象**：西医处方开好输液组（溶媒+多巴胺泵入，含泵速/浓度）后，依次切到中医汉方/针灸推拿/解剖学再回西医，原有 ivGroups、选中途径、泵入/推注参数原样保留；不同训练模块草稿串留，可能与新处方合并点评造成混淆。
- **根因**：`tcm-app.js` `setModule()` 调 `resetState()` 只清 TCM 闭包状态；西医草稿在 `app.js` 独立闭包（`S.ivGroups/ivFields/normalItems`），模块切换无重置钩子；`openRx('iv')` 设计上保留同次就诊双通道草稿。
- **修复**：
  - `app.js` 新增 `resetWesternDraft()`：清空口服项、输液组、输液指征与相关确认标记并刷新列表；通过 `window.__resetWesternDraft` 暴露。
  - `tcm-app.js` `setModule()`：切离 western（`m!=='western'`）时调用该钩子；西医模块内口服↔输液双通道草稿保留逻辑不变。
- **证据**：CDP 冒烟——往返前 `rows=3, drugs=3`，往返回西医后 `rows=1, drugs=0, 指征已清空`；0 控制台/页面异常。截图 `docs/qa-shots/q13-reset-western-1024.png`。

### FIX-7〔P3，基线级响应式瑕疵〕480px 指征栏备注框横向溢出

- **现象**：480 视口下 `#iv-reason-note` right=523，超视口约 43px；IV 表格本身未溢出。该指征栏为 IV-01 既有样式，非三途径组件引入，本轮未扩大。
- **根因**：`.iv-reason-bar` 内联 flex 无 `flex-wrap`；备注输入框 `min-width:auto` 无法收缩。
- **修复**：CSS 补 `.iv-reason-bar{flex-wrap:wrap}`、`#iv-reason-note{min-width:0;flex:1 1 200px}`；480 档备注框独占一行。
- **证据**：CDP 复测 480 `docSw=480, overflow=[]`；截图 `docs/qa-shots/q13-reason-480.png`。

### FIX-8〔minor，数据卫生〕频次槽位遗留途径类取值

- **现象**：`dose_range_json.default_freq` 槽位混入途径类值：`ivgtt`×1、`iv`×6、`泵入`×1、`持续静滴`×1；该槽位被当默认频次展示，途径信息应归 `allowed_routes`，一槽两义。
- **根因**：历史数据录入时途径词误入频次枚举槽位；途径规则未读取该字段，故不影响 IV-10/11/12 判定。
- **修复**：9 条归一为标准频次枚举——持续泵入/静滴类（多巴胺、普通胰岛素、硝酸甘油、乌拉地尔、左西孟旦、门冬氨酸鸟氨酸）→ `qd`；单次 IV 给药类（去乙酰毛花苷、纳洛酮、纳美芬）→ `st`。
- **证据**：归一后复扫全库 `default_freq` 无 `ivgtt/iv/泵入/静滴/持续` 途径类残留；`validate-all` 36/0。

## 3. 已验证通过项（QA 探针 + 编排复核）

### 3.1 规则引擎
- **IV-10**：禁推药开 push → critical（氯化钾/多巴胺/辅酶A/胰岛素/奥美拉唑/硝酸甘油）；仅推药开 drip/pump、仅滴药开 pump → major；宜泵药 drip 无泵速 → minor；多途径含 push 不误报 minor；溶剂项、旧载荷无 route、无 allowed_routes 剂型兜底、同药双途径各自独立判定均正确。
- **IV-11**：缺泵速/单位/浓度 → major；完整 → pass；0 值合法；drip/push/溶剂项不触发。
- **IV-12**：缺口径跳过；缺时长 minor；低于下限 major；等于下限 pass；速度超限 major；无口径药整段跳过；pump/drip 项不触发。
- **既有 IV-01~07 不回归**：IV-03 全 push 组豁免溶媒/滴速；IV-04 push/pump 不参与滴速上限；IV-06 push 跳过配伍；IV-01/02/05/07 正确识别三途径静脉项。

### 3.2 数据一致性
- 15 个核定药途径字段与口径矩阵一致；其余 730 条老药相对基线 `10b4c83` 非本轮字段零漂移。
- rules 69 条无重复 id，IV-10/11/12 教学四件套齐全；plans 64 方案、疾病库、规则点名药品/编码无悬空引用。
- 途径枚举仅 `iv_drip/iv_push/iv_pump`，无 `iv_bolus` 等旧别名。

### 3.3 前端交互（480/1024 两档）
- 16 个静脉药逐药核对按钮禁用态，0 不符；默认选中 `allowed_routes[0]`；旧药兜底 drip。
- drip→push→pump 全轮回切换：参数行展开/收起正确；推注时长、泵速/单位/浓度往返回填保留；跨字段无残留。
- push-only（甲氧氯普胺）可无溶媒自成静推组；drip-only（奥美拉唑钠）无溶媒被池禁用；多途径药无溶媒默认滴注入组被提交校验拦截。
- 点评链路：IV-10 minor、IV-11 major、IV-12 minor 两档宽度全部命中；教学要点/正确做法/参考指南/关联主题卡完整；报告全文无 `undefined/NaN/[object Object]`、无空白途径徽章。
- localStorage（history/mistakes/pitfall）写入无抛错，错题 JSON 无坏词。

## 4. 本轮改动文件清单

| 文件 | 改动 |
|---|---|
| `js/rule-engine.js` | `isNumericRate` 数值/区间校验；IV-11 单位缺参与非数字 major；IV-12 解析兜底（mg/min 上限、裸数字按分钟、无口径跳过）；风险文案拆分 |
| `js/app.js` | 新增并暴露 `__resetWesternDraft` 西医草稿重置钩子 |
| `js/tcm-app.js` | `setModule` 切离 western 时调用西医草稿重置 |
| `css/rx.css` | 指征栏换行 + 备注框 `min-width:0`；480 档备注独占一行 |
| `data/drugs.json` | 阿托品 `push_min` 置空、说明并入 route_note；9 条频次槽位途径类值归一 |
| `test/rule-engine-test.js` | 新增 9 条边界用例（IV-11 ×4、IV-12 ×5），共 93 → 102 |
| min 产物 | `app.min.js`、`rule-engine.min.js`、`tcm-app.min.js`、`rx.min.css` 重建 |
| `index.html` | 版本串 r16 → r17（11 处） |
| 截图 | `docs/qa-shots/q13-reset-western-1024.png`、`q13-reason-480.png`、`q13-routes-1024.png` |

## 5. 回归证据复现

```powershell
cd D:\医学生处方推演训练平台
node scripts/validate-all.js      # 36 通过 / 0 失败
node test/rule-engine-test.js     # 102/102
node test/e2e-cases.js            # 12/12 无 error
```

## 6. 转下批事项（本轮未扩大改动）

| 编号 | 事项 | 说明 |
|---|---|---|
| 下批-1 | 胺碘酮"首推后 15 分钟内不可重复静推" | 属跨条目重复给药时间窗判定，单药条目规则无处方级上下文；需在处方级汇总同药推注次数与时间后建模。 |
| 下批-2 | IV-10 情形 C 抑制口径确认 | 当前实现：宜泵药 route=drip 且已填 pump_rate 时不重复提示 minor，与书面口径"重力滴注且未填泵速"一致；若教学口径要求"只要 route 仍是滴注即提示宜泵"，再调整判定条件。 |
| 下批-3 | 硝酸甘油/阿托品禁忌完整条款、维生素C 厂家分叉说明书原件 | 延续 followup13 存疑项，待 NMPA 备案说明书原件补核，不升级口径。 |
| 下批-4 | 480 档 IV 表格窄屏堆叠复核 | 指征栏溢出已修复；IV 表格在 480 下的标签/值堆叠可在下批响应式专项中统一收口。 |

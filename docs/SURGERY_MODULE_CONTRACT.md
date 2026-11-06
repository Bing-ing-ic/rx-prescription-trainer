# 手术指征判断模块 · 并行开发契约 v1

> 本文件是「外科医学数据专家」与「前端工程专家」并行开发的唯一契约。
> 双方严格按本文件的数据结构、字段名、事件名、文件路径执行，不得自行改名。

---

## 1. 新增/修改文件清单

| 文件 | 负责人 | 说明 |
|---|---|---|
| `data/surgeries.json` | 数据专家 | **新建**，手术指征教学数据 |
| `data/diseases.json` | 数据专家 | **追加**外科疾病条目（不改动已有46条） |
| `data/disease-lab-map.json` | 数据专家 | **追加**新疾病的检查结果映射 |
| `data/rules.json` | 数据专家 | **追加** SURGERY 规则组 |
| `index.html` | 前端专家 | 加第4个按钮 + 新增 `view-surgery` 视图 |
| `js/app.js` | 前端专家 | 加 openSurgery、状态、渲染、点评接入 |
| `js/rule-engine.js` | 前端专家 | 扩展 ctx 支持 surgery_rx |
| `js/review.js` | 前端专家 | 新增 surgery 评分维度 |

---

## 2. surgeries.json 结构（数据专家产出，前端专家读取）

```json
{
  "version": "2026.11.06",
  "note": "手术指征判断教学库。key 为 disease.code，与 diseases.json 一一对应。",
  "cases": {
    "APP-K35": {
      "disease_code": "APP-K35",
      "department": "普外科",
      "difficulty": "中级",

      "standard": {
        "decision": "surgery",
        "timing": "emergency",
        "procedure_id": "lap_appendectomy",
        "conservative_ok": false
      },

      "timing_options": [
        {"id": "emergency", "label": "急诊手术（立即/6小时内）"},
        {"id": "urgent",    "label": "限期手术（24-48小时内）"},
        {"id": "elective",  "label": "择期手术（炎症控制后）"},
        {"id": "none",      "label": "暂不手术，保守治疗"}
      ],

      "procedure_options": [
        {"id": "lap_appendectomy",  "name": "腹腔镜阑尾切除术",   "note": "首选，创伤小恢复快"},
        {"id": "open_appendectomy", "name": "开腹阑尾切除术",     "note": "穿孔或粘连重时考虑"},
        {"id": "conservative_abx",  "name": "保守治疗（抗生素+禁食）", "note": "仅用于不能耐受手术者"}
      ],

      "indications": ["右下腹痛伴发热", "麦氏点压痛反跳痛", "WBC/CRP升高"],
      "contraindications": ["严重心肺功能不全不能耐受麻醉", "形成阑尾周围脓肿且病情稳定"],
      "teaching_points": [
        "急性阑尾炎一经确诊应早期手术",
        "腹腔镜为首选术式",
        "阑尾周围脓肿可先保守治疗后择期手术"
      ]
    }
  }
}
```

### 字段说明
- `standard.decision`: 正确决策。`surgery`=应手术 / `conservative`=应保守
- `standard.timing`: 正确手术时机。`emergency`/`urgent`/`elective`/`none`
- `standard.procedure_id`: 正确术式 id（对应 procedure_options 里的 id）
- `standard.conservative_ok`: 该病种是否允许保守治疗作为正确答案（boolean）
- `timing_options`: 医生在界面上能选的时机选项
- `procedure_options`: 医生在界面上能选的术式选项（含"保守治疗"项）
- `indications`: 手术适应症清单（界面展示用）
- `contraindications`: 手术禁忌症清单
- `teaching_points`: 教学要点（点评后展示）

---

## 3. 必须覆盖的 10 个外科病例

数据专家需在 surgeries.json 的 cases 中覆盖以下 disease.code：

| disease.code | 疾病名 | standard.decision |
|---|---|---|
| APP-K35 | 急性阑尾炎 | surgery / emergency / lap |
| CHOLE-K81 | 急性胆囊炎 | surgery / urgent / lap chole |
| STONE-K80 | 胆囊结石伴慢性胆囊炎 | surgery / elective / lap chole |
| HERNIA-K40 | 腹股沟疝（可复性） | surgery / elective / mesh repair |
| FRACTURE-S52 | 桡骨远端骨折 | conservative / none / closed reduction |
| THYROID-E04 | 甲状腺结节（TI-RADS 4a） | surgery / elective / FNA后决定 |
| BREAST-C50 | 乳腺癌 | surgery / urgent / breast conserving or mastectomy |
| PERF-K25 | 胃溃疡穿孔 | surgery / emergency / omental patch |
| ILEUS-K56 | 肠梗阻（机械性） | surgery / urgent / exploratory |
| VARICOSE-I83 | 下肢静脉曲张（CEAP C2） | conservative / none / compression + EVLA |

其中 APP-K35 在 diseases.json 已有；其余 9 个 code 需要数据专家在 diseases.json 的 diseases 数组末尾**追加**完整条目（symptom_pool/differential/first_line_oral/second_line_iv/contraindications/special_population_note 字段格式与现有条目完全一致），并在 disease-lab-map.json 的 mappings 里追加对应检查结果。

---

## 4. rules.json 新增 SURGERY 规则组

数据专家在 `rules.json` 的 `rules` 数组末尾追加以下规则（rule_id 不与现有冲突）：

```json
{
  "rule_id": "SUR-01",
  "group": "SURGERY",
  "title": "有手术指征却选择保守治疗（延误治疗）",
  "trigger": "standard.decision='surgery' 但医生选了 conservative / timing='none'",
  "logic": "对照 surgeries.json[disease.code].standard；若应手术而医生选保守，判 error",
  "severity": "error",
  "basis": "外科学诊疗规范：具有明确手术适应症的疾病应及时手术，延误可致穿孔/坏死/感染扩散",
  "weight_hint": "surgery"
}
```

需追加 5 条：
- SUR-01 该手术却选保守 → error
- SUR-02 不该手术却选手术（过度医疗） → error
- SUR-03 手术时机选择错误（应急诊选了择期等） → warn
- SUR-04 术式选择不当（首选术式没选） → warn
- SUR-05 存在手术禁忌症仍安排手术 → error

---

## 5. 前端专家改造点（与数据专家无文件冲突）

### 5.1 index.html
在 `#rx-type-row` 的 `.rx-type-btns` 里追加第4个按钮（第188行后）：
```html
<button class="btn btn-type" data-type="surgery" id="btn-rx-surgery" onclick="if(window.__openSurgery)window.__openSurgery()">🔪 手术指征判断<br><small>该不该手术·时机·术式</small></button>
```

在 `#view-lab` 之后新增 `<section class="view hidden" id="view-surgery">`，结构参照 view-lab：
- 工具栏：返回首页 / 标题"手术指征评估表" / 去开处方 / 打印 / 提交点评
- 文书区：医院名 + 标题 + 编号(SUR-YYYYMMDD-XXXXXX) + 患者信息（姓名/性别/年龄/门诊号/诊断/日期）
- 决策区：
  - 第一步：保守治疗 vs 手术治疗（两个 radio/card 按钮）
  - 第二步：若选手术，显示手术时机选择（4个 timing_options）
  - 第三步：术式选择（procedure_options 列表，radio）
  - 显示本病种适应症/禁忌症（只读展示，来自 surgeries.json）
- 提交点评按钮

### 5.2 js/app.js
- S 对象追加：`surgeryCases: {}, surgeryOrder: {decision:null, timing:null, procedure_id:null}`
- 数据加载：在加载 diseases/labExams 之后，fetch `data/surgeries.json`，赋值 `S.surgeryCases = data.cases`
- show() 函数的视图数组追加 `'view-surgery'`
- 新增 `openSurgery()` 函数：检查 S.disease/S.patient，填充患者信息，渲染决策区，show('view-surgery')
- 渲染逻辑：根据 `S.surgeryCases[S.disease.code]` 渲染 timing_options 和 procedure_options
- 若当前疾病不在 surgeriesCases 里，按钮点击时 alert "本病例暂不支持手术指征判断"
- 提交点评：把 S.surgeryOrder 作为 ctx.surgery_rx 传给 rule-engine
- 入口导出：`window.__openSurgery = openSurgery;`
- 学习记录/错题本：复用现有 lastReview / mistakes 机制，surgery 维度的扣分照常记录

### 5.3 js/rule-engine.js
- run(ctx) 中追加 SURGERY 规则组检查：
  - 读 `ctx.surgery_rx` = `{decision, timing, procedure_id}`
  - 读 `ctx.surgeryCase` = `S.surgeryCases[ctx.disease.code]`
  - 若 surgeryCase 不存在，跳过（不扣分）
  - 按 SUR-01~05 逻辑判定
- ctx 由 app.js 在调用时传入，前端专家负责组装

### 5.4 js/review.js
- DIMS 数组追加：
```js
{ key: 'surgery', name: '手术指征判断', weight: 15, groups: ['SURGERY'] },
```
- RADAR_DIMS 追加：`{ key: 'surgery', name: '手术决策' }`
- mapReviewToRadar 追加 surgery 维度映射
- hasAnyOrder 函数扩展：若 ctx.surgery_rx 有 decision，也算有处置（避免纯手术决策被判空就诊）

---

## 6. 硬约束
- 纯静态，无构建链，直接改 .html/.js/.json
- 不改动已有 46 个疾病的数据和已有处方/检验检查功能
- 共用现有学习记录、错题本、统计、雷达图
- 医疗专业感：界面文案用临床术语，不出现"游戏化"措辞
- 现有 app.min.js / rx.min.css 是压缩产物，本次**只改未压缩源文件**，不要动 .min.js（用户会自行重新压缩或直接用源文件）

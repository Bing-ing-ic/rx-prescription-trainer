# 医学生处方推演训练平台 · 系统架构说明

> 版本：2026.11 · MVP 纯静态版（无后端、无构建链、无 CDN）

## 1. 总体形态

```
┌──────────────────────────────────────────────────────────────────┐
│                      Browser (file:// or http://)               │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ index.html                                                 │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │  │
│  │  │ case-maker   │→ │  rx-editor   │→ │  rule-engine.js  │  │  │
│  │  │ (病例抽取)    │  │  (双通道笺)   │  │  (规则执行)       │  │  │
│  │  └──────────────┘  └──────────────┘  └────────┬─────────┘  │  │
│  │        ↑                ↑                     ↓            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │  │
│  │  │diagnosis-check│ │ iv-form      │→│  review.js       │  │  │
│  │  │ (诊断反馈)    │  │ (输液专项)   │  │  (百分制/11维)    │  │  │
│  │  └──────────────┘  └──────────────┘  └────────┬─────────┘  │  │
│  │  ┌─────────────────────────────────────────────┘            │  │
│  │  │  radar.js (Canvas 八维能力画像, localStorage 累积)        │  │
│  │  └─────────────────────────────────────────────────────────┘  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
            ▲                ▲                ▲
            │ fetch JSON     │ fetch JSON     │ fetch JSON
            ▼                ▼                ▼
   data/diseases.json  data/drugs.json   data/rules.json
   data/compat.json
```

## 2. 模块职责

| 模块 | 文件 | 职责 |
|---|---|---|
| 病例生成 | `js/app.js` CaseMaker | 随机抽 disease，按 difficulty 从 symptom_pool 抽样拼装患者卡片，**不显示病名**；含容量状态字段 |
| 诊断校验 | `js/app.js` DiagnosisChecker | 学生输入候选诊断，与 disease.code 比对：命中→✅；命中 differential→"需进一步检查排除"；否则→"与症状体征不符" |
| 处方编辑器 | `js/app.js` RxEditor | 双 Tab：非输液/输液；药品检索列表按通道过滤；≤5 种硬阻断；溶媒先行强制 |
| 输液专项表单 | `js/app.js` IvForm | iv_reason 下拉（无"患者要求"）、浓度/滴速/总容量/输注小时/皮试 |
| 规则引擎 | `js/rule-engine.js` | 加载 rules.json，按 rule_id 分发到具体判定函数；产出结构化命中列表 |
| 评分器 | `js/review.js` | 把命中按 11 维度聚合，权重写死，输出百分制 + 知识点卡片 |
| 能力画像 | `js/app.js` RadarPainter | Canvas 手写八维雷达；历史写 localStorage `rx-profile-history` |

## 3. 六类药品目录 → 药品主表的多标签映射

药品主表 `drugs` 是唯一事实表；六类目录（医保2025 / 集采1-8批 / 基药2026 / OTC / 中药饮片 / 抗菌药物分级）**不各自建表存药**，而是通过 `drug_category_links` 多对多关联表映射：

```
drugs.drug_id  ──< drug_category_links >──  catalogs.catalog_id
                                                  │
                                                  ├─ catalog_code=MI2025   (医保甲乙)
                                                  ├─ catalog_code=JTC_1..8  (集采批次)
                                                  ├─ catalog_code=EML2026  (国家基药)
                                                  ├─ catalog_code=OTC_A/B  (非处方药)
                                                  ├─ catalog_code=TCM_DECO (中药饮片,本MVP空)
                                                  └─ catalog_code=ABX_STRAT (抗菌药物分级)
```

在 MVP JSON 里这层映射被**平铺**到 `drugs.json` 的字段上（避免引入 Join 查询）：
- `medical_insurance_class` ← MI2025
- `jtc_batch` ← JTC
- `essential_medicine` ← EML2026
- `otc_class` ← OTC
- `abx_level` ← ABX_STRAT
- `is_tcm_injection` 作为中药注射剂特殊标签

→ 同一个"注射用头孢呋辛钠"会同时出现在：医保乙类、集采第3批、基药目录、限制使用级抗菌药四个清单里；查询某类目录时只需 `where` 对应字段，不需要 UNION 多表。

## 4. 非输液 / 输液双通道与 visit_id 合并点评

```
学生点"开始新病例"
        │
        ├── visit_id = "V-YYYYMMDD-XXXXXX"  (一次就诊一个 ID)
        │
        ├──► Tab A: 非输液处方 rx_type=outpatient_normal
        │        items 只能选 oral/topical/im/sc
        │
        └──► Tab B: 输液处方   rx_type=outpatient_iv
                 items 只能选 iv_drip + solvent
                 必须先选 solvent 作为"第一行"
                 再往该 solvent 瓶里加 iv_drip 药
```

两张处方**物理上是两条 `prescriptions` 记录**，但共享同一个 `visit_id`。点评时：

- **通道内规则**：每张处方单独跑格式/剂量/疗程/溶媒配伍/皮试；
- **跨通道规则**：`DUP-02 同次就诊口服+静脉同类交叉审查` 必须把两张处方的 items 合并后，按 `pharmacology_class` 分组判重——例如口服头孢呋辛酯片 + 静滴注射用头孢呋辛钠（同属二代头孢），若 iv_reason 不含 `sequential_therapy`，触发 warn。

MVP 实现上，`rule-engine.js` 接收 `{visit_id, normal_rx, iv_rx}` 两个完整处方对象，分别跑单处方规则，再跑一次跨处方规则。

## 5. 静脉输液专项规则组在引擎中的位置

`rules.json` 中所有 `group=IV_REASON` 或标题以 `IV-` 开头的规则，在引擎里被归入 **`IV_RULE_GROUP`**：

```js
// review.js 中写死的权重
const WEIGHT = {
  format:          0.15,
  indication:      0.20,
  dosage:          0.15,
  iv_reason:       0.20,   // ← 静脉输液合理性专项，独立 rule group
  compat:          0.15,
  special_pop:     0.10,
  insurance:       0.05
};
```

IV_RULE_GROUP 共 9 条（IV-01 ~ IV-09），其中 IV-06/IV-07 虽挂在 COMPAT 组，但**触发场景是输液**，在报告里被高亮到"静脉输液合理性"折叠面板。报告渲染时，`review.js` 会把命中规则按 `group` 聚合到 11 个维度面板，其中"给药途径决策与静脉输液合理性"面板包含 IV-01~IV-09 全部命中，权重 20%。

## 6. 数据流（提交一次处方的完整链路）

```
学生点"提交处方"
  │
  ├─ 1. 前端硬阻断：
  │     · items.length > 5 → 拒绝提交
  │     · outpatient_iv 且 solvent 未选 → 按钮 disabled
  │     · abx_level=special → alert 法规依据，拒绝入队
  │     · abx_level=restricted → 弹"中级职称确认"对话框，取消则撤回该药
  │
  ├─ 2. rule-engine.js.run(visit_ctx)
  │     ├─ 遍历 rules.json 24 条规则
  │     ├─ 每条规则按 rule_id 分发到 handler(visit_ctx)
  │     └─ 产出 [{rule_id, severity, message, basis, suggestion}]
  │
  ├─ 3. review.js.score(hits)
  │     ├─ 按 group 加权
  │     ├─ error 扣重，warn 扣轻，pass 不扣
  │     └─ 输出 total /100 + 11 维度分项
  │
  ├─ 4. 渲染报告：折叠面板 + 依据原文 + 知识点卡片
  │
  └─ 5. localStorage.rx-profile-history.push({visit_id, total, dims})
        RadarPainter.redraw()
```

# 医学生处方推演训练平台 · MVP

> 纯静态、完全离线、双击 `index.html` 即可在浏览器打开的处方训练系统。所有 JS/CSS/数据均本地化，无 CDN、无 npm、无构建链。

---

## 1. 运行方式

**方式一（推荐）：直接双击**
```
双击 index.html
```
浏览器以 `file://` 打开即可。

**方式二：本地 HTTP 服务（避免某些浏览器对 file:// 的 fetch 限制）**
```powershell
cd C:\Users\Administrator\DoubaoWork\chats\2026-11-02\new-chat-2
python -m http.server 8765
# 浏览器访问 http://127.0.0.1:8765/
```

打印/PDF：处方笺页面右上角 `🖨 打印 / 存PDF`，已配 `@media print` 样式自动隐藏工具栏。

---

## 2. 目录结构

```
new-chat-2/
├── index.html                  # 单页入口
├── README.md                   # 本文件
├── css/
│   └── rx.css                  # 处方笺样式（普通/急诊/儿科/麻精四种底色 + 打印）
├── js/
│   ├── app.js                  # 主交互：病例抽取/诊断校验/双通道处方笺/报告渲染/Canvas雷达
│   ├── rule-engine.js          # 规则引擎：按 rule_id 分发，产出结构化 hits
│   └── review.js               # 评分器：11 维度权重写死，输出百分制
├── data/
│   ├── diseases.json           # 15 个疾病种子
│   ├── drugs.json               # 35 个药品种子（含 5 个溶媒）
│   ├── rules.json               # 24 条规则
│   └── compat.json              # 配伍规则（solvent_drug + drug_drug + 中药注射剂）
└── docs/
    ├── architecture.md         # 系统架构（模块图 + 数据流 + 六类目录映射 + visit_id 合并点评）
    ├── db-schema.sql           # SQLite DDL（diseases/drugs/.../user_profile 9 张表）
    ├── schema-rx.json          # 处方 JSON Schema（非输液/输液两套正文）
    └── ui-prototypes.md        # 5 个 ASCII 线框原型
```

---

## 3. 架构摘要

详见 [`docs/architecture.md`](docs/architecture.md)。核心三点：

1. **六类目录多标签映射**：药品主表 `drugs` 是唯一事实表；医保2025/集采1-8批/基药2026/OTC/中药饮片/抗菌药物分级通过 `drug_category_links` 多对多关联；MVP JSON 阶段平铺为 `medical_insurance_class / jtc_batch / essential_medicine / otc_class / abx_level / is_tcm_injection` 字段。
2. **双通道处方 + visit_id 合并点评**：`outpatient_normal` 与 `outpatient_iv` 是两条 `prescriptions` 记录，共享同一 `visit_id`。单处方规则各跑各的；`DUP-02 同次就诊口服+静脉同类交叉审查` 跨通道合并后按 `pharmacology_class` 判重。
3. **静脉输液专项规则组**：`IV-01 ~ IV-09` 在 `review.js` 中独立成 `iv_reason` 维度，权重 **20%**，与"格式15/适应症20/剂量15/配伍15/特殊人群+抗菌10/医保5"合计 100%。

---

## 4. 评分权重（写死在 `js/review.js`）

| 维度 | 权重 |
|---|---:|
| 处方格式规范 | 15% |
| 诊断-用药匹配 | 20% |
| 剂量用法 | 12% |
| 疗程适宜 | 3% |
| **给药途径决策与静脉输液合理性** | **20%** |
| 溶媒配伍 | 5% |
| 相互作用/重复用药 | 10% |
| 特殊人群+皮试+过敏 | 6% |
| 抗菌药物分级 | 4% |
| 医保/基药/集采 | 5% |
| 中药饮片（占位） | 0% |
| **合计** | **100%** |

扣分规则：该维度内每条 `error` 扣权重的 60%，每条 `warn` 扣 25%，`pass` 不扣。

---

## 5. 规则统计

- **规则总数：24 条**
- **静脉输液专项：9 条**（`IV-01` ~ `IV-09`）
  - IV-01 输液指征与疾病标签一致性（usually_no_iv + iv_reason 仅"发热"→error；脱水/不能进食→降 warn）
  - IV-02 口服替代可行性
  - IV-03 输液专项字段完整性
  - IV-04 输液量与速度个体化（老年/儿童/心肺肾功能不全）
  - IV-05 门诊输液负面清单命中
  - IV-06 溶媒-药物配伍
  - IV-07 中药注射剂单独输注
  - IV-08 皮试核查
  - IV-09 门诊输液处方量 >1 日
- 其余 15 条覆盖：FMT-01~06（格式）、IND-01~03（适应症/医保）、DOSE-01~02（剂量/肝肾）、DUR-01（疗程）、DUP-01~02（重复/跨通道）、INT-01~02（喹诺酮+二价阳离子、ACEI+保钾利尿）、POP-01~02（儿童喹诺酮/老年滴速）、ABX-01~02（special拦截/restricted确认）、TCM-01（十八反占位）。

---

## 6. 种子数据统计

| 数据 | 数量 |
|---|---:|
| 疾病（diseases.json） | **15** |
| 药品（drugs.json） | **35**（口服18 + 外用2 + 肌注2 + 静脉8 + 溶媒5，含中药注射剂清开灵 + special级万古霉素演示） |
| 配伍规则（compat.json） | **solvent_drug 15 条 + drug_drug 6 条 + 中药注射剂特殊 2 条 = 23 条** |
| 点评规则（rules.json） | **24 条**（其中静脉专项 9 条） |

---

## 7. 三个端到端测试用例的预期与实际结果

已用 Node 加载 `rule-engine.js` + `review.js` 真实跑过：

### 用例A：普通感冒（usually_no_iv）→ 选输液 → iv_reason=other（模拟"发热"）
- **预期**：触发 `IV-01` error + `IV-05` error
- **实际**：error = `IND-01, IV-01, IV-05`；warn = `IV-02`；总分 68/100 ✅
- （IND-01 error 合理：普通感冒一线推荐是布洛芬，开头孢本身就适应症错。）

### 用例B：CAP（iv_preferred）→ 选 0.9%NS 250ml → 加注射用头孢呋辛钠 → 皮试阴性 → 滴速 40ml/h
- **预期**：pass 为主
- **实际**：0 error / 0 warn，6 条 pass，总分 **100/100** ✅

### 用例C：CAP → 门诊开 special 级抗菌药（注射用盐酸万古霉素）
- **预期**：被 `ABX-01` 拦截 error
- **实际**：error = `IND-01, ABX-01`；warn = `IV-09`（疗程7天超门诊输液1日常规）；总分 84.9/100 ✅
- 前端弹窗逻辑：选 special 级药时直接弹"🚫 门诊处方拦截"并展示法规依据，不允许加入处方。

---

## 8. 关键前端硬阻断（真实生效）

- 每张处方（含溶媒）>5 种：达到 5 种时"添加药品"按钮置灰，计数变红。
- 输液处方未选溶媒："添加静脉药"按钮 disabled，hover tooltip "请先选择溶媒"。
- `abx_level=special`：alert 拦截 + 展示《抗菌药物分级管理》原文，药品不进处方。
- `abx_level=restricted`：弹"模拟中级以上职称确认"对话框，取消则撤回该药。
- 皮试要求药未填皮试结果 → `IV-08` error。
- 儿童输液未填体重 → `IV-04` error。
- 中药注射剂同瓶混加其他药 → `IV-07` error。
- 同次就诊口服+静脉同类（按 `pharmacology_class`）且 `iv_reason≠sequential_therapy` → `DUP-02` warn。
- `usually_no_iv` 病 + iv_reason=other/fever → `IV-01` error；iv_reason=脱水/不能口服 → 降 warn。

---

## 9. 已知限制 / 未完成项（诚实清单）

1. **诊断输入为模糊匹配**：学生必须输入与 `disease.name` 有子串重合的关键词才算正确；未做 NLP 模糊纠错。
2. **剂量校验为演示级**：只校验 `single_dose` 是否超说明书上限 1.5 倍，未做体重/kg 精确计算。
3. **金额未实算**：处方笺底部金额恒为 0，未接药品价格表。
4. **中药饮片未做**：`TCM-01` 十八反十九畏为占位规则（种子数据无饮片），已在 rules.json 写明。
5. **药品价格/医保实际报销比例未建模**：`IND-03 医保限定支付范围` 仅为 warn 提示，未真正维护医保限定支付目录。
6. **localStorage 持久化仅在浏览器端**：换浏览器/清缓存后能力画像清零。
7. **多处方合并点评**：当前 MVP 一次就诊只能选一种处方通道（非输液 OR 输液）；`DUP-02` 跨通道逻辑已在引擎中实现，但 UI 未提供"同次就诊先开口服再开静脉"的两步流程。
8. **处方笺颜色**：急诊淡黄已绑定输液通道；儿科淡绿、麻精一淡红样式已在 CSS 就绪，UI 尚未提供切换入口。
9. **患者为固定模板**：每次随机抽病 + 合成姓名/年龄，未做完整既往史/过敏史表单；`patient.renal_insufficiency` 默认 false。

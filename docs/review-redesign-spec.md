# 处方点评模块智能化改造 · 接口规范（v1，2026-11-07）

> 本文件是引擎组与 UI 组的唯一对接规范。所有新增字段必须向后兼容（旧字段不删不改语义）。

## 1. hit 对象（规则引擎输出）

旧字段保留：`rule_id, group, title, severity('pass'|'warn'|'error'), message, basis, suggestion`

新增字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `severity_level` | string | `critical` / `major` / `minor` / `pass`。三级严重度，与旧 `severity` 对应：critical≈原error中最严重的；major≈普通error；minor≈warn |
| `lesson_point` | string | 一句话教学要点（≤40字），说清"为什么错" |
| `correct_practice` | string | 正确做法（可执行，如"改用口服左氧氟沙星0.5g qd"） |
| `reference_guide` | string | 指南/规范出处（如《抗菌药物临床应用指导原则2015版》《处方管理办法》第十九条） |
| `related_topic` | string | 关联知识点主题（与 app.js KNOWLEDGE_TIPS 的 key 对齐，如 `QUINOLONE_PEDIATRIC`） |
| `affected_items` | string[] | 命中的具体药品/项目名（如 `["左氧氟沙星注射液","0.9%氯化钠100ml"]`） |
| `aggregated_count` | number | 同类聚合计数（同一 rule_id 命中 N 个药品时 N>1） |

## 2. severity_level 分级映射（必须严格遵守）

- **critical（严重错误，红）**：
  - 禁忌证命中（孕妇用致畸药、18岁以下用喹诺酮、青霉素过敏用β内酰胺、饮酒后用头孢）
  - 单次超极量 / 超剂量上限
  - 特殊使用级抗菌药门诊使用（万古霉素、碳青霉烯）
  - 中药注射剂与其他药同瓶
  - 无客观指征输液（门诊病毒性上感/轻症胃肠炎输液）
- **major（一般错误，橙）**：
  - 诊断-用药不符（IND-01）
  - 剂量超常规范围但未超极量
  - 配伍禁忌、重复用药（DUP-01）
  - 每张处方>5种药（FMT-01）
  - 处方前记缺失（FMT-05）
  - 手术指征误判
- **minor（提示，黄）**：
  - 格式瑕疵（FMT-04 单位、FMT-06 编号）
  - 疗程偏长（DUR-01）
  - 给药途径可优化（能口服却输液但有弱指征）
  - 经济性提示（医保/基药）

## 3. review.score 返回对象

旧字段保留：`total, dims, totalHits, errorCount, warnCount`

新增字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `criticalCount` | number | critical 条数 |
| `minorCount` | number | minor 条数 |
| `groups` | object | `{ critical: [hit...], major: [hit...], minor: [hit...] }`，已聚合、按严重度降序 |
| `summary` | object | 见下 |

`summary` 结构：
```js
{
  verdict: 'excellent' | 'good' | 'pass' | 'fail',  // >=90 / >=75 / >=60 / <60
  headline: '一句话总结，如"存在2处严重错误：儿童使用喹诺酮+无指征输液"',
  top_issues: ['最严重问题1', '最严重问题2', '最严重问题3'],  // 最多3条
  next_steps: ['下一步学习建议1', '建议2'],  // 2-3条
  category_stats: { INDICATION: 2, DOSAGE: 1, ... }  // 按 group 统计命中数
}
```

## 4. 扣分新逻辑（review.js 内）

- critical: `weight * 0.8`
- major: `weight * 0.5`
- minor: `weight * 0.2`
- **同维度同 rule_id 聚合只扣一次**（affected_items 记录所有命中药品）
- 同维度总分封顶 `weight`
- 空就诊拦截逻辑保持不变

## 5. review.js 硬约束（validate-all.js 校验）

- 用正则 `/weight:\s*(\d+)/g` 提取所有 weight 字段，合计必须 = 100
- **不要在 review.js 中新增任何 `weight: <数字>` 字面量**（会被误计入）
- DIMS 数组保持现有 12 个维度和权重不变：
  format=6, indication=20, dosage=13, duration=3, iv_reason=17, compat_sv=3, compat_int=7, special_pop=9, abx=4, insurance=2, lab=4, surgery=12

## 6. UI 组消费契约（app.js renderReport）

- 顶部：总分圆环 + 评级 + **新增 headline 横幅**（红色 critical 时醒目）
- 维度卡片：**加进度条**（score/weight%），颜色按 verdict
- 统计徽章：改为 **严重 / 一般 / 提示** 三级（critical/major/minor），保留旧 cnt-err/cnt-warn/cnt-pass id 以兼容
- 命中列表：**按 critical→major→minor 分组渲染**，critical 红色高亮置顶；每条显示 affected_items、correct_practice、reference_guide
- 新增 **改进建议卡片**（summary.next_steps）
- 知识点卡片：改为从 hit.related_topic 驱动，保留 KNOWLEDGE_TIPS 作为兜底映射
- 保留所有现有 id 和功能，不破坏中医/针灸视图（tcm-*/acup-*）

## 7. 文件清单

引擎组负责：
- `js/review.js`（重写 score 函数，保留 DIMS/RADAR_DIMS/mapReviewToRadar 导出）
- `js/rule-engine.js`（在 hit() 工厂补充新字段；为现有 44 条规则补 lesson_point/correct_practice/reference_guide）
- `data/rules.json`（为每条规则补 lesson_point、correct_practice、reference_guide、severity_level_hint 字段）

UI 组负责：
- `js/app.js` 的 renderReport 函数（约 2262-2482 行）
- `index.html` 的 view-report 区域（约 484-545 行）
- `css/rx.css`（新增样式，不删旧样式）

## 8. 完成后

- 不要自己 minify（最后统一跑 `node scripts/minify-all.js`）
- 不要 git commit（最后统一提交）
- 保持纯静态、无构建链、无外部依赖

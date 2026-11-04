# 医学生处方推演训练平台 · 移动端 UI 优化报告

> 版本：v20261104mobile ｜ 日期：2026-11-04
> 改动范围：`index.html`、`css/rx.css`（未触碰 `js/*.js` 业务脚本，规则引擎修复组并行工作不受影响）
> 备份：`index.html.bak-20261104-182147`、`css/rx.css.bak-20261104-182147`

---

## 一、改动总览

| # | 优化项 | 优先级 | 落地方式 |
|---|--------|--------|----------|
| 1 | 处方笺表格小屏横向溢出 | 高 | `<768px` 表格转卡片式布局（纯 CSS，按容器作用域区分 9 列普通笺 / 10 列输液笺） |
| 2 | 顶部导航无汉堡菜单 | 高 | 新增 `.hamburger`，小屏隐藏 5 个导航按钮、改为下拉面板 |
| 3 | 触控目标尺寸不达标 | 高 | 移动端按钮/链接最小高度 44px |
| 4 | 视图切换无过渡 | 中 | `.view` 淡入上移动画 250ms（CSS keyframes） |
| 5 | 缺少 Loading 反馈 | 中 | 全局医疗风圆环 spinner，主要操作触发 280–350ms |
| 6 | 圆角体系混乱 | 中 | 统一为 4 / 8 / 16 三级 CSS 变量 |
| 7 | 打印样式缺 A4 页 | 中 | 新增 `@page { size: A4; margin: 1cm; }` |
| 8 | 缺 viewport meta（阻断性） | 高 | 补 `<meta name="viewport">` + `theme-color` |

---

## 二、逐项修改说明

### 1. 处方笺表格 → 卡片式布局（解决横向溢出）

**问题**：普通处方笺 9 列、输液处方笺 10 列，375px 宽度下必然横向溢出。

**方案**（纯 CSS，零 JS 改动）：
- `@media (max-width: 768px)` 下隐藏 `thead`；将 `table/tbody/tr/td` 全部 `display:block`。
- 每个 `<tr>` 渲染为一张白色小卡片（1px 边框、8px 圆角、轻投影、卡片间距 12px）。
- 每个 `<td>` 渲染为「左标签 / 右值」一行，标签通过 `td::before` 注入。
- 因普通笺与输液笺**列顺序不同**（普通笺第4列=数量、第5列=单次剂量；输液笺第5列=单次剂量、第8列=数量、第9列=滴速），分别按容器作用域打标签：
  - `#rx-body-normal .rx-table td:nth-child(n)::before`
  - `#iv-groups .rx-table td:nth-child(n)::before`
- 单元格内 `<input>` 在卡片中 `flex:1; max-width:150px; text-align:right; min-height:38px`，输入不溢出。
- 输液溶墨行的内联浅蓝底（`tr0.style.background='#eff6ff'`）在卡片中保留，仍可区分溶墨/药物行。

> 桌面端（≥769px）表格保持原样，打印样式不受影响（打印在 `@media print` 中另有一套规则）。

### 2. 汉堡菜单

**HTML**：在 `.topbar` 内新增 `<button class="hamburger" id="nav-toggle">`（三条 span 动画线），`<nav id="main-nav">` 保留原 5 个 `data-goto` 按钮（业务 JS 选择器不变）。

**CSS**：
- 桌面：`.hamburger { display:none }`，导航横向排列，与原来一致。
- `≤768px`：`.hamburger { display:flex }`（44×44px）；`.nav` 默认 `display:none`，定位为顶栏下方下拉面板（白底、投影、纵向 6px 间距）；`.nav.open` 展开。
- 汉堡激活态：三条线动画为「×」（中线淡出、上下线旋转 45°）。

**交互**（index.html 内联脚本，不污染外部 JS）：
- 点击汉堡切换 `.open`；
- 点击任一导航项后自动收起；
- 点击菜单外区域自动收起；
- 完整 `aria-expanded` / `aria-label` / `aria-controls` 无障碍属性。

### 3. 触控目标尺寸（≥44px）

移动端 `≤768px` 下统一：
```css
.btn, .nav-btn, .drug-item, .rx-toolbar .btn, .diag-row .btn,
.modal .btn, .sug-item, #btn-new-case, .report-actions .btn { min-height: 44px; }
```
- 导航按钮在移动端撑满整行、`min-height:44px`。
- 药品选择项 `.drug-item` 行距加大到 12px。
- 输入框 `.picker-head input / .diag-row input` 同步 44px。
- 处方笺卡片内删除按钮 38px（卡片内次级操作，避免误触过大）。

### 4. 视图过渡动画

```css
.view { animation: viewFadeIn .25s var(--ease); }
@keyframes viewFadeIn {
  from { opacity:0; transform: translateY(10px); }
  to   { opacity:1;  transform: translateY(0); }
}
```
- 视图由 `hidden` → 可见时自动播放，250ms、CSS 贝塞尔缓动。
- 不依赖任何 JS 动画库，不改变 `.hidden{display:none!important}` 既有逻辑。

### 5. Loading 状态反馈

- 新增 DOM：`#loading-overlay > .loading-box > .spinner-medical + .loading-text("加载中…")`。
- 样式：半透明灰底 + 3px 毛玻璃；白色卡片 16px 圆角；医疗蓝圆环 spinner（`border-top-color:#0f4c81`，0.7s 线性旋转）。
- 触发：内联脚本事件代理，点击「新病例 / 提交点评 / 确认诊断 / 再来一次 / 任意 data-goto 导航」时显示 280ms 后自动消失。
- 暴露 `window.__showLoading(ms)` / `window.__hideLoading()` 供后续业务 JS 调用。
- 低调不花哨，符合医疗 SaaS 质感。

### 6. 圆角体系统一

新增设计令牌：
```css
:root {
  --radius-sm: 4px;   /* 小：标签、rule-id、图例色条、rx-corner */
  --radius-md: 8px;   /* 中：按钮、输入框、提醒条、卡片内小元素 */
  --radius-lg: 16px;  /* 大：卡片、modal、hero、处方笺 */
}
```
历史散点值收口：
- 6px → 8px（case-body、case-volume、nav-btn、pre-reminder-item、iv-warn、diff-*）
- 10px → 8px（btn-lg、btn-type，按钮类）或 16px（iv-group、radar-wrap、history-box、diff-box、knowledge-card，容器类）
- 12px → 16px（case-card、panel、dim-card、mistake-card、stat-card、stats-section、modal）
- 20px → 16px（report-hero）
- 3px → 4px（radar 图例色条）
- **保留胶囊形**：`.tag`、`.chip`、`.hit-badge`、`.sug-item`、`.score-badge`、`.difficulty-row label`、`.hero-btn` 维持全圆角（状态标签/主按钮的刻意造型，不属于"混乱圆角"）。

### 7. 打印 A4

在 `@media print` 之外新增顶层规则：
```css
@page { size: A4; margin: 1cm; }
```
- 配合已有 `@media print`（隐藏工具栏/导航/弹窗、处方笺边框转黑色、保留普通/急诊/儿科/麻精底色），打印比例即贴合 A4。

### 8. 补 viewport（阻断性修复）

原 `index.html` 缺失 `<meta name="viewport">`，这是移动端适配的前提（否则手机会按 980px 桌面宽渲染再整体缩小）。已补：
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#0f4c81">
```

---

## 三、移动端适配验证要点（验收 Checklist）

在 375×667（iPhone SE）/ 390×844（iPhone 14）/ 360×800（Android）三档下逐项确认：

- [ ] **无横向滚动条**：`document.documentElement.scrollWidth === window.innerWidth`。
- [ ] **顶栏**：左侧品牌文字省略号截断，右侧显示汉堡按钮；5 个导航按钮不可见。
- [ ] **汉堡展开**：点击后下拉面板覆盖 5 个大按钮，高度均 ≥44px；点外部收起；图标在 ☰/✕ 间切换。
- [ ] **首页 Hero**：标题 ≤22px，主按钮 44px 高，难度胶囊换行不溢出；护士形象图降透明度作背景。
- [ ] **病例卡**：内边距 16px，诊断输入框与「确认诊断」按钮在 ≤480px 下纵向堆叠、按钮整行宽。
- [ ] **处方笺（普通）**：每味药是一张卡片，标签依次为 序号/通用名/规格/数量/单次剂量/途径/频次/疗程/操作；输入框右对齐不溢出。
- [ ] **处方笺（输液）**：标签依次为 序号/类型/通用名/规格/单次剂量/途径/频次/数量/滴速/操作；溶墨行浅蓝底保留。
- [ ] **处方笺工具栏**：≤480px 下按钮纵向整行排列，不挤成一行。
- [ ] **报告页**：分数环、护士形象、生命体征在小屏纵向居中堆叠；生命体征改横向 wrap。
- [ ] **雷达图**：canvas 自适应宽度（max 320px），图例在下方。
- [ ] **统计/错题/药品库**：统计卡 2 列网格；药品库搜索框与分类 select 换行。
- [ ] **视图切换**：每次切页有 250ms 淡入上移，不闪烁。
- [ ] **Loading**：点「随机开始新病例」瞬间出现圆环，~280ms 后消失。
- [ ] **打印**：浏览器打印预览选 A4，处方笺比例正常、底色保留、无工具栏。
- [ ] **桌面端回归**：≥769px 下汉堡隐藏、导航横向排列、表格 9/10 列原样、圆角与阴影与改版前一致。

---

## 四、设计规范总结（后续开发遵守）

| 维度 | 规范值 |
|------|--------|
| 主色 | `--blue-deep:#0f4c81` / `--blue-mid:#1a6fb5` / `--blue-light:#2c7be5` |
| 圆角 | 小 4px（标签）/ 中 8px（按钮输入框）/ 大 16px（卡片弹窗）；状态标签用胶囊 |
| 触控 | 移动端最小点击高度 44px（WCAG / Apple HIG） |
| 过渡 | 250ms、`cubic-bezier(.4,0,.2,1)` |
| 字号 | 桌面基准 14px；移动端标题不超过 22px；辅助文字 12–13px |
| 阴影 | 卡片 `0 2px 12px rgba(15,76,129,.06)`；悬浮 `0 6px 20px rgba(15,76,129,.12)` |
| 分割 | 实线 `#e2e8f0`；虚线 `#cbd5e1` 用于次要分组 |
| 反馈色 | 成功 `#16a34a` / 警告 `#ca8a04` / 危险 `#dc2626`（与规则引擎三态一致） |
| 断点 | `≤768px` 移动适配；`≤480px` 极窄屏纵向堆叠 |
| 打印 | `@page A4 1cm`；屏幕色编码（普通白/急诊黄/儿科绿/麻精红）保留到打印 |

**风格基线**：医疗专业 SaaS、克制不花哨；毛玻璃/内发光仅用于 Hero 与报告头部等品牌区块，表单与处方笺保持纸面严谨感。

---

## 五、未改动与风险说明

- **未触碰** `js/rule-engine.js`、`js/app.js`、`js/review.js` 及 `.min.js`；新增的 DOM id（`nav-toggle`、`main-nav`、`loading-overlay`）与内联脚本均为增量，不与既有选择器冲突。
- **admin.html / login.html** 自带内联样式、不引用 `rx.css`，本次未改动（如需移动端同步可后续单独处理）。
- **浏览器自动化验证受限**：本环境访问外部统计脚本（countapi.xyz / hm.baidu.com）超时，导致浏览器桥反复无响应；代码层已通过大括号/圆括号配平校验（376/376、191/191）与结构走查，建议在本地 Chrome DevTools 按上方 Checklist 实测一遍 375px 视图。
- **回滚方式**：用 `index.html.bak-20261104-182147` 与 `css/rx.css.bak-20261104-182147` 覆盖即可。

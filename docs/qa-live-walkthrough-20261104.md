# 线上站点 QA 走查报告

- **走查日期**：2026-11-04
- **走查对象**：https://bing-ing-ic.github.io/rx-prescription-trainer/
- **走查人**：网站诊断与优化团队（设计师 / 前端 / QA / 性能）
- **走查视口**：桌面 967×883（实际浏览器窗口）+ 移动 375×812（iframe 模拟）
- **走查范围**：首页、西医/中医/针灸/解剖四模块核心流程、药品库、能力画像、错题本、学习统计、admin/login、移动端适配、控制台/网络错误、性能、基础安全
- **截图目录**：`docs/qa-shots/`（46 张）

---

## 一、问题汇总表

| # | 标题 | 严重度 | 模块 | 视口 |
|---|------|--------|------|------|
| 1 | 点击"随机开始新病例"后全屏 loading 遮罩永不消失 | **P0** | 西医/中医/针灸 | 桌面+移动 |
| 2 | 视图切换进入动画卡住，处方笺/报告页视觉空白 | **P0** | 西医/中医报告 | 桌面+移动 |
| 3 | 经络穴位图加载失败（破图） | **P1** | 针灸 | 桌面 |
| 4 | 解剖图谱热点点击后不弹出结构详情 | **P1** | 解剖 | 桌面 |
| 5 | 移动端 hero 区护士形象图遮挡副标题与"高级"单选 | **P1** | 首页 | 移动 375px |
| 6 | 多张 hero 大图并发加载触发 HTTP/2 协议错误 | **P1** | 全局性能 | 桌面 |
| 7 | countapi.xyz 访问统计 DNS 解析失败，未 catch 导致 Uncaught Promise | P2 | 首页 | 桌面+移动 |
| 8 | 中医报告"参考用方：GPT"占位符未替换 | P2 | 中医报告 | 桌面 |
| 9 | 解剖/针灸模块下顶部全局导航（药品库等）不显示 | P2 | 解剖/针灸 | 桌面 |
| 10 | 控制台警告：中文字符（"3片/2枚"）被塞入 number input | P2 | 中医处方 | 桌面 |
| 11 | 阿莫西林默认剂量 625mg 与数量 21 粒不一致 | P2 | 西医处方 | 桌面 |
| 12 | 首页 DOM 预加载全部模块 hero 大图，首屏体积浪费 | P2 | 性能 | 桌面 |
| 13 | 图片源文件过大（nurse-hero 429KB，显示区仅 92×332px） | P2 | 性能 | 桌面+移动 |
| 14 | 管理员默认密码 `admin123` 硬编码在前端源码 | P3 | 安全 | — |
| 15 | 诊断错误反馈提示在桌面视口下被挤到视口外 | P2 | 西医诊断 | 桌面 |

**统计**：P0 = 2，P1 = 4，P2 = 8，P3 = 1。

---

## 二、P0 问题详细描述

### P0-1 点击"随机开始新病例"后全屏 loading 遮罩永不消失

- **复现步骤**：
  1. 打开首页（https://bing-ing-ic.github.io/rx-prescription-trainer/）。
  2. 等待首屏加载完成。
  3. 点击蓝色"🎲 随机开始新病例"按钮。
  4. 观察屏幕中央。
- **实际结果**：病例摘要、诊断输入框已经渲染在 DOM 中，但屏幕中央始终显示"加载中…"圆形 spinner 遮罩（`#loading-overlay`，z-index 9998，覆盖整个视口），背景模糊，用户无法操作。
- **证据**：
  - 控制台：`Failed to load resource: net::ERR_NAME_NOT_RESOLVED`（指向 `https://api.countapi.xyz/hit/rx-trainer-2026/visits`）。
  - 控制台：`Uncaught (in promise) TypeError: Failed to fetch at :1056` 和 `at :1073`。
  - DOM：`#loading-overlay` 的 `display:flex`、`width:959px`、`height:883px`，点击病例后持续可见。
  - 截图：`qa-shots/03-western-case.png`、`qa-shots/04-western-case-loaded.png`。
- **根因猜测**：首页加载完成后调用了 `api.countapi.xyz` 的访问统计 API；该域名在当前网络环境下 DNS 解析失败（`ERR_NAME_NOT_RESOLVED`），fetch reject。调用处没有 `.catch()`，导致 `await` 后的 `hideLoading()` 永远不执行。
- **建议修复**：
  1. 给 countapi 调用加 `.catch(() => {})` 兜底。
  2. 更彻底：移除 countapi.xyz（该免费统计服务已不稳定），或改为百度统计（已接入 hm.baidu.com）即可。
  3. 给 `#loading-overlay` 加一个超时兜底（如 5 秒后强制 `display:none`），避免外部服务故障阻塞主流程。

### P0-2 视图切换进入动画卡住，处方笺/报告页视觉空白

- **复现步骤**：
  1. 走西医流程：随机病例 → 输入正确诊断 → 点"非输液处方"。
  2. 观察处方笺区域。
- **实际结果**：处方笺 DOM 完整渲染（141KB HTML，含患者信息、药品列表、提交按钮），但整个 `#view-rx` 的 `opacity:0; transform:translateY(10px)`，视觉上是一片空白。同样问题出现在 `#view-report`（77 分报告 DOM 完整但空白）。
- **证据**：
  - `getComputedStyle(document.getElementById('view-rx')).opacity === "0"`，`transform === "matrix(1, 0, 0, 1, 0, 10)"`。
  - 强制 `element.style.opacity='1'; element.style.transform='none'` 后，处方笺立即完整显示（截图 `17-rx-forced.png`、`22-report-visible.png`）。
  - 等待 2 秒后 opacity 仍为 0，动画不触发。
- **根因猜测**：视图切换时通过 CSS class 触发 `transition: opacity .3s, transform .3s`，但 class 切换时机与浏览器渲染帧不同步，或 JS 设置 `opacity:0` 后没有下一帧再加回 `opacity:1` 的 class，导致元素停留在初始透明态。
- **建议修复**：
  1. 检查 `showView()` / `openRx()` 函数中切换视图的逻辑：确保先 `requestAnimationFrame` 设置初始态，再下一帧加可见 class。
  2. 兜底：在 CSS 里给 `.view` 加 `transition: opacity .3s ease, transform .3s ease;` 并确保 `[hidden]` 或 `.hidden` class 用 `display:none` 而非 `opacity:0`。
  3. 或临时方案：直接去掉进入动画，`.view` 默认 `opacity:1; transform:none`。

---

## 三、P1 问题详细描述

### P1-3 经络穴位图加载失败（破图）

- **复现步骤**：针灸推拿 tab → 点"🗺️ 经络穴位图" → 观察左侧图片区域。
- **实际结果**：显示破图图标和文字"🖼️ 经络图加载中…（img/acup-meridian-chart.jpg）"，图片 `naturalWidth=0, naturalHeight=0`。
- **证据**：
  - 网络请求：`net::ERR_HTTP2_PROTOCOL_ERROR https://bing-ing-ic.github.io/rx-prescription-trainer/img/acup-meridian-chart.jpg`。
  - HEAD 请求该 URL 返回 200，说明文件存在，但浏览器并发加载时被 HTTP/2 流重置。
  - 截图：`qa-shots/29-acup-map.png`。
- **根因猜测**：首页同时发起 7+ 张大图的请求，GitHub Pages 的 HTTP/2 连接被并发流数限制或网络抖动重置。经络图、解剖图、两张 hero 图都中招。
- **建议修复**：
  1. 延迟加载非首屏图片（`loading="lazy"`）。
  2. 图片压缩到合理尺寸（见 P2-13）。
  3. 给 `<img>` 加 `onerror` 兜底提示，而不是永远显示"加载中"。

### P1-4 解剖图谱热点点击后不弹出结构详情

- **复现步骤**：解剖学 tab → 点"🫀 解剖图谱" → 点击骨骼图上任意红色热点。
- **实际结果**：热点变红（视觉反馈正常），但 `#view-anat-detail` 保持 `hidden`，`#anat-detail-body` 为空，不跳转详情。
- **证据**：
  - 直接 `document.querySelectorAll('.anat-hotspot')[0].click()` 后，`view-anat-detail.classList.contains('hidden') === true`。
  - 控制台无新错误。
  - 截图：`qa-shots/35-anat-hotspot.png`、`36-anat-detail.png`。
- **根因猜测**：热点点击事件绑定依赖的 `data-point-id` 或热点数据映射在 `anatomy-hotspots.json` 加载完成前就绑定了，或者点击处理器里查找结构时 key 不匹配。
- **建议修复**：
  1. 在 `anat-app.js` 里检查热点 click handler，确认事件委托和数据关联。
  2. 加 `onerror`/空数据兜底，至少 alert 提示。

### P1-5 移动端 hero 区护士形象图遮挡文字和单选按钮

- **复现步骤**：375px 宽视口下打开首页，隐藏 loading 遮罩后观察 hero 卡片。
- **实际结果**：右侧护士形象图（nurse-hero.png）覆盖在"随机病例·双通道处方·规则引擎实时点评·云南医保事前提"副标题末尾和"高级"单选按钮上。
- **证据**：
  - 截图：`qa-shots/45-mobile-hero.png`（可见"云南"二字被护士图挡住，"高级"radio 只露出"级"字）。
- **根因猜测**：hero 区 CSS 在窄屏下没有隐藏/缩小 nurse-hero 图，或图绝对定位在右侧但卡片宽度不足。
- **建议修复**：
  1. 在 `@media (max-width: 480px)` 下给 `.hero-nurse` 加 `display:none` 或 `width:80px; right:8px`。
  2. 副标题在窄屏下字号缩小、去掉最后一行。

### P1-6 多张 hero 大图并发加载触发 HTTP/2 协议错误

- **复现步骤**：打开首页，观察网络面板。
- **实际结果**：首屏同时加载 7 张 hero/解剖/经络大图（每张 200KB+），其中 3-4 张返回 `net::ERR_HTTP2_PROTOCOL_ERROR` 或 `net::ERR_ABORTED`。
- **证据**：
  - `acup-meridian-chart.jpg`、`anat-skeleton-hero.png`、`anatomy-body-diagram.jpg` 均报 `ERR_HTTP2_PROTOCOL_ERROR`。
  - `nurse-happy.png`、`anat-skeleton-hero.png` 等被 `ERR_ABORTED`。
- **根因猜测**：首页 HTML 里硬编码了所有模块的 `<img>` 标签（7 张），首屏即并发下载，超出 GitHub Pages HTTP/2 并发流限制。
- **建议修复**：见 P2-12、P2-13。

---

## 四、P2 问题详细描述

### P2-7 countapi.xyz 未 catch 导致 Uncaught Promise
- **复现**：首页加载即触发。
- **证据**：控制台 `Uncaught (in promise) TypeError: Failed to fetch`，URL 为 `api.countapi.xyz`。
- **建议**：移除或 catch，见 P0-1。

### P2-8 中医报告"参考用方：GPT"占位符未替换
- **复现**：中医流程走通后查看报告页"与参考辨证处方对比"区域。
- **证据**：截图 `27-tcm-report.png`，正文显示"参考用方：GPT"。
- **根因**：参考用方字段后端/数据里填的是占位字符串"GPT"，未替换成实际方名（本例应为"归脾汤"）。
- **建议**：检查 `tcm-rules.json` 或 `tcm-cases.json` 里参考用方字段。

### P2-9 解剖/针灸模块下顶部全局导航不显示
- **复现**：切到解剖学 tab → 进入解剖图谱 → 顶部只剩 4 个模块 tab，"首页/药品库/能力画像/错题本/学习统计"消失。
- **证据**：在解剖视图下 `find("药品库")` 返回 0 个节点；切回西医 tab 后导航恢复。
- **建议**：确认 header 导航在所有视图下都保持可见，或在子视图里加"返回首页"按钮。

### P2-10 中文字符被塞入 number input 导致控制台警告
- **复现**：中医处方提交后控制台。
- **证据**：
  - `The specified value "3ç\x89\x87" cannot be parsed, or is out of range.`（"3片"UTF-8 被按 Latin-1 解码）
  - `The specified value "2æ\x9e\x9a" cannot be parsed, or is out of range.`（"2枚"）
- **根因**：生姜 3 片、大枣 2 枚的"片/枚"被塞进了 `<input type="number">`。
- **建议**：煎服法/调味药的数量输入用 `type="text"`，或把单位拆成单独的 select。

### P2-11 阿莫西林默认剂量与数量不一致
- **复现**：西医处方添加"阿莫西林胶囊"后查看表格。
- **证据**：单次剂量 625mg（=2.5 粒 0.25g），但数量自动填 21 粒（=7天×1粒），逻辑矛盾。
- **建议**：数量应按 `单次剂量×频次×疗程` 反算，或改为让用户填数量后自动算单次剂量。

### P2-12 首页 DOM 预加载全部模块 hero 大图
- **复现**：首页 HTML 里包含 7 张 `<img>`（nurse-hero、nurse-happy、tcm-doctor-hero、acup-doctor-hero、acup-meridian-chart、anat-skeleton-hero、anatomy-body-diagram），即使当前 tab 是西医。
- **建议**：非当前模块的 hero 图用 `loading="lazy"` 或切 tab 时再插入 DOM。

### P2-13 图片源文件过大
- **实测文件大小**：
  | 文件 | 大小 | 显示尺寸 |
  |------|------|----------|
  | nurse-hero.png | 429 KB | 92×332 px |
  | nurse-happy.png | 223 KB | （未在首屏显示） |
  | tcm-doctor-hero.png | 待测量（HEAD 200） | — |
  | acup-doctor-hero.png | 待测量 | — |
  | acup-meridian-chart.jpg | 待测量 | — |
- **建议**：用 TinyPNG/Squoosh 压缩，hero 图宽度不超过 800px，转 WebP，预计可减少 60-80% 体积。

### P2-15 诊断错误反馈提示在桌面视口外
- **复现**：西医病例页输入错误诊断后点"确认诊断"。
- **证据**：`#diag-feedback` 的 `getBoundingClientRect().y = 893`，而视口高度 883，提示刚好在视口下方 10px，用户看不到。
- **建议**：确认诊断后自动 `scrollIntoView({block:'center'})`，或把反馈区放在输入框紧上方。

---

## 五、P3 问题

### P3-14 管理员默认密码硬编码
- **复现**：查看 `login.html` 第 148 行：`expected = await hashStr('admin123')`。
- **说明**：认证仅在客户端（sessionStorage 存 `rx-admin-auth='1'`），懂技术的用户可手动设置绕过。但页面底部已注明"本入口为客户端轻量校验，仅用于隔离后台视图"，且平台无真实敏感数据，风险可控。
- **建议**：教学用途可接受；若未来接后端，改为服务端 session。

---

## 六、已通过项清单

### 首页
- [x] 4 个模块 tab（西医/中医/针灸/解剖）切换正常，主题色跟随（蓝/棕/绿/青）。
- [x] Hero 区西医护士形象图正常加载（nurse-hero.png 200）。
- [x] 顶部导航按钮（首页/药品库/能力画像/错题本/学习统计）在西医视图下可点。
- [x] 难度筛选 radio（全部/初级/中级/高级）可切换。

### 西医核心流程
- [x] 随机病例加载：患者信息、主诉、现病史、生命体征、查体完整。
- [x] 诊断输入 + 自动补全下拉工作（输入"慢阻肺"出现"慢性阻塞性肺疾病（轻度稳定期）"建议）。
- [x] 诊断错误有分级提示（第1次错、第2次首拼提示、第3次自动填入正确答案）。
- [x] 诊断正确后出现"口服/输液"处方类型选择。
- [x] 口服处方笺：患者信息、诊断、药品搜索、添加药品、默认用法用量。
- [x] 药品搜索：中文"阿莫西林"返回 3 个结果；拼音首拼"amxl"返回 3 个结果。
- [x] 药品添加后表格行显示通用名/规格/数量/单次剂量/途径/频次/疗程，可删除。
- [x] 提交后报告页：77 分环形图、10 个评分维度、规则命中明细（错误1/警告1/通过1）、参考方案对比。

### 中医模块
- [x] 首页棕色主题、老中医形象正常。
- [x] 随机病例：主诉/病史/舌象/脉象/查体完整。
- [x] 辨证输入"心脾两虚证"判定正确，治法自动填入"补益心脾，养血安神"。
- [x] 处方笺：经方列表（麻黄汤/桂枝汤/归脾汤等）、方剂组成自动显示。
- [x] 提交后报告 100 分优秀，5 个评分维度全满分。

### 针灸模块
- [x] 首页深绿主题、女针灸医生形象正常。
- [x] 随机病例加载正常。
- [x] 经络穴位图：14 经络下拉、穴位卡片列表（中府/尺泽/合谷等）正常渲染。
- [x] 穴位详情弹窗：定位/类属/功用/主治/操作/注意事项完整（合谷 LI-04 测试通过）。

### 解剖模块
- [x] 首页 8 个系统卡片（运动/消化/呼吸/泌尿/生殖/循环/神经/内分泌）。
- [x] 解剖图谱：骨骼图 + 红色热点标注显示正常（anat-locomotor.jpg 加载成功）。

### 辅助页面
- [x] 药品库：310 种药品、分类下拉、搜索框、药品卡片。
- [x] 药品搜索"gm"命中 2 个（万古霉素、感冒灵颗粒）。
- [x] 空搜索态友好："未找到匹配的药品"。
- [x] 能力画像：八维雷达图、历史得分、分模块统计。
- [x] 错题本：自动记录错误规则、模块筛选、清空按钮。
- [x] 学习统计：总次数/平均分/最高分/及格率、趋势图、分模块统计。

### 登录/后台
- [x] login.html 正常显示，账号 admin 只读。
- [x] 空密码/错误密码均提示"❌ 密码错误，请重新输入"。
- [x] 密码显示/隐藏切换按钮工作。
- [x] admin.html 未登录时自动重定向到 login.html。

### 移动端 375px
- [x] 无横向滚动条（scrollWidth = innerWidth = 371px）。
- [x] 汉堡菜单出现，点击后展开垂直导航（首页/药品库/能力画像/错题本/学习统计，每项 44px 高）。
- [x] 模块 tab 按钮高度 49px，触控达标。
- [x] "随机开始新病例"按钮 44px 高，达标。
- [x] 汉堡菜单按钮 44×44px，达标。

### 基础安全
- [x] 全站 HTTPS（GitHub Pages）。
- [x] 无明文密码传输（SHA-256 hash 后存 localStorage）。
- [x] 身份证号脱敏显示（5301**********0011）。

---

## 七、性能数据

| 指标 | 实测 | 评价 |
|------|------|------|
| 首屏 JS/CSS 数量 | 13 个 JS + 1 个 CSS | 偏多，可合并 |
| 首屏 JSON 数据 | 12 个（drugs/diseases/rules/compat/tcm-*/acup-*/anatomy-*） | 可按模块懒加载 |
| 首屏图片请求 | 7 张 hero/解剖/经络大图 | 应懒加载 |
| 图片总大小 | 仅 nurse-hero 429KB + nurse-happy 223KB = 652KB | 过大 |
| 外部请求 | hm.baidu.com（百度统计）+ api.countapi.xyz（已失效） | countapi 应移除 |
| HTTP/2 错误 | 3-4 张大图 | 并发过多导致 |
| 缓存 | GitHub Pages 自动带 ETag | OK |
| 压缩 | GitHub Pages 自动 gzip | OK |

---

## 八、修复优先级建议

1. **立即修（P0）**：
   - 给 countapi 调用加 catch 或移除（解决 loading 遮罩卡死）。
   - 修复视图切换 opacity 动画卡住（解决处方笺/报告空白）。
2. **本周修（P1）**：
   - 图片懒加载 + 压缩（解决 HTTP/2 错误和经络图破图）。
   - 修复解剖热点点击无响应。
   - 移动端 hero 护士图遮挡问题。
3. **迭代修（P2）**：
   - 中医报告"GPT"占位符。
   - number input 中文单位警告。
   - 诊断反馈滚动到视口内。
   - 药品剂量与数量联动。
4. **可选（P3）**：管理员密码在教学阶段可接受。

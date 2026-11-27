# 性能优化记录 · 2026-11-27

> 范围：纯静态站点（GitHub Pages 托管）。本轮只做性能子问题，不改业务规则与教学数据。
> 基线快照：git `8e23fbe` 之后、本轮改动前。

## 1. 基线（改动前，按线上 _site 组装规则估算）

| 资源 | 体积 | 说明 |
|---|---|---|
| CSS | 251 KB / 2 文件 | 未压缩 `rx.css` 与 `rx.min.css` 同时上线，HTML 只引用 min |
| JS | 960 KB / 30 文件 | 未压缩源码 `.js` 与 `.min.js` 同时上线，HTML 只引用 min |
| 图片 | 23.1 MB / 205 文件 | 200 JPG 19.3 MB + 5 PNG 3.75 MB；多张 hero PNG >800 KB |
| 数据 | 3.63 MB / 29 JSON | 四模块数据 |
| **合计** | **约 27.9 MB** | |

运行时观测（本地 http 服务 + 浏览器）：四个模块（西医/中医/针灸/解剖）的 `boot()` 都在 `DOMContentLoaded` 立即并行拉取数据，首屏并行请求 28 个 JSON，合计约 **3.55 MB**；其中中医/针灸/解剖三模块约 **2.1 MB** 在首屏并不需要。

## 2. 诊断结论（源码证据）

1. **部署冗余（静态可证）**：未压缩 CSS/JS 源码被全量 rsync 上线；`img/_archive`、`*-backup.png`、3 张同名旧版 JPG 未被任何代码引用仍被部署。
2. **首屏数据臃肿（运行时主因）**：非西医模块数据在首屏被无条件拉取；`acup-points.json` 被针灸模块与时间医学模块重复 fetch。
3. **脚本阻塞**：15 个外部 `<script>` 无 `defer`，串行下载解析。
4. **图片未优化**：hero PNG 为照片类内容却用无损 PNG；JPG 分辨率/质量偏高。

## 3. 本轮改动

### 3.1 模块数据按需懒加载（源码）
- `js/tcm-app.js`、`js/anat-app.js`、`js/acup-app.js`：新增 `ensureBoot()`（promise 守卫，防重复 fetch），挂载 `window.__ensureTCM / __ensureAnat / __ensureAcup`；`DOMContentLoaded` 仅绑定事件，仅当深链 hash 属于本模块时首屏加载；其余由模块切换 `setModule()` 进入时触发。
- `js/acup-time.js`：去掉首屏直接 `boot()`，保留按钮进入时按需触发；深链 `#view-acup-time` 直达时加载。
- 跨模块去重：`acup-app` 加载后把穴位列表挂 `window.__ACUP_POINTS`，`acup-time` 优先复用，避免重复请求 `acup-points.json`。
- 西医主数据集保留首屏加载（处方推演主路径）。

### 3.2 脚本非阻塞
- `index.html` 全部外部脚本加 `defer`，保持文档顺序执行；内联配置脚本相对关系不变。
- `platform-enhance` 由未压缩 `.js` 切换到 `.min.js`。

### 3.3 图片重编码（`scripts/optimize-images.js`）
- JPG：限宽 1600、quality 82、mozjpeg；仅当重编码后更小才落盘。
- 4 张被引用 hero PNG 转 WebP（quality 84），HTML/preload 引用同步切到 `.webp`；原 PNG 不再部署。
- 未被引用的残留图（`_archive`、`*-backup`、同名旧版 JPG、原 PNG）在部署组装时排除。

### 3.4 部署组装收紧（`.github/workflows/deploy.yml`）
- CSS 只上线 `rx.min.css`；JS 只上线 HTML 实际引用的 15 个 min 产物。
- 图片排除备份/归档目录、未引用 PNG、`*-backup` 与 3 张同名旧版 JPG。

### 3.5 产物压缩同步
- 改动源码后用 `scripts/minify-all.js`（terser 5.51.2）重新生成对应 `.min.js`。
- 静态资源 `?v=` 统一 bump 为 `20261127perf1`，避免线上缓存旧产物。

## 4. 验证记录（本地 `127.0.0.1:8765`）

- **首屏 JSON**：仅西医模块 12 个 JSON（diseases/drugs/rules/compat + 检验/手术/标准方案/别名/拼音/陷阱/案例）；中医、针灸、解剖 JSON **未发起请求**。
- **切换模块按需加载**（浏览器实测，切换后才出现对应请求）：
  - 汉方学：`tcm-cases / tcm-formulas / tcm-herbs / tcm-rules / tcm-famous-prescriptions / tcm-famous-tags`
  - 针灸：`acup-cases / acup-points / acup-rules / tuina`（`acup-time-medicine.json` 仍按需）
  - 解剖：`anatomy-systems / anatomy-quiz / anatomy-cases / anatomy-hotspots / anatomy-tcm`
- **功能回归**：西医随机病例生成、诊断面板推进正常；四模块首页/网格/列表渲染正常；控制台无 JS 报错。
- **资源可达**：`rx.min.css`、15 个 min JS、4 张 WebP 均 200。
- **产物复核**：按最终部署规则模拟 `_site`，合计 **18.62 MB**（基线约 27.9 MB，降约 33%）；无备份/归档/未引用 PNG 泄漏。

## 5. 优化后产物构成（模拟 _site）

| 资源 | 文件数 | 体积 |
|---|---|---|
| CSS | 1 | 113.2 KB |
| JS | 15 | 354.7 KB |
| 图片 | 201 | 14.86 MB |
| 数据 | 29 | 3.63 MB |
| **合计** | | **18.62 MB** |

## 6. 限制与未做项

- 数据 JSON 内容未做字段裁剪（`drugs.json` 约 980 KB / 798 条，中文文本为主）；本轮未改教学数据，避免影响规则与点评语义。
- 图片为本地重编码，未做浏览器端 AVIF/响应式多尺寸；WebP 兼容现代浏览器。
- 首屏那个 `favicon.ico` 404 为既有状态（项目本无 favicon），非本次引入，未处理。
- 未在真实线上网络下复测 LCP/传输体积；以上体积为本地文件字节数，GitHub Pages 传输还会经 gzip/br 压缩。

## 7. 回退

- 源码改动集中在 4 个模块 `.js` 及其 `.min.js`、`index.html`、`deploy.yml`；图片重编码原图可从 git 历史恢复。
- 回退方式：`git checkout <本轮提交>^ -- <路径>` 或在 Pages 重新部署上一版本。

# 性能优化报告 · 2026-11-04

> 站点：医学生处方推演训练平台（纯静态 HTML/CSS/JS，GitHub Pages）
> 执行人：性能优化子任务
> 版本号：`v=20261104perf1`
> 本地验收：`python -m http.server 8765`，截图见 `docs/perf-shots/`

---

## 一、总体效果

| 资源类型 | 优化前 | 优化后（部署体积） | 压缩率 |
|---|---:|---:|---:|
| `img/` 顶层部署文件 | **19,823 KB** | **1,653 KB** | **-91.7%** |
| 页面引用的 JS（9 个源文件合计） | 223.6 KB | 167.9 KB（.min 版） | -24.9% |
| CSS（rx.css） | 64.0 KB | 51.7 KB（rx.min.css） | -19.2% |
| **首屏关键资源合计** | ~20.1 MB | **~1.8 MB** | **约 -91%** |

> 说明：`img/_backup/` 与 `img/_archive/` 下的备份/归档文件不计入部署体积（GitHub Pages 只发布仓库，目录里的备份不会被浏览器请求到；如需进一步瘦身可在 `.gitignore` 或发布流程中排除）。

---

## 二、图片处理明细

### 2.1 关键图压缩前后对照

| 文件 | 优化前 | 优化后 | 最长边变化 | 说明 |
|---|---:|---:|---|---|
| nurse-hero.png → **nurse-hero.jpg** | 428.9 KB | **43.9 KB** | 433×1568（不变） | 首屏 LCP 图，PNG→JPG 重编码，加 `fetchpriority="high"` 与 `<link rel=preload>` |
| tcm-doctor-hero.png → **.jpg** | 3,130.3 KB | **138.4 KB** | 1672×2298 → 1000×1374 | 老中医 hero，PNG→JPG |
| acup-doctor-hero.png → **.jpg** | 2,593.7 KB | **115.6 KB** | 1672×2377 → 1000×1422 | 针灸师 hero，PNG→JPG |
| anat-skeleton-hero.png → **.jpg** | 1,768.5 KB | **105.8 KB** | 1008×2380 → 678×1600 | 骨骼 hero，PNG→JPG |
| nurse-happy.png → **nurse-happy.jpg** | 223.4 KB | **18.2 KB** | 1672×2508 → 400×600 | 护士表情图（JS 动态切换） |
| nurse-sad.png → **nurse-sad.jpg** | 253.0 KB | **19.4 KB** | 1672×2508 → 400×600 | 护士表情图（JS 动态切换） |
| acup-meridian-chart.jpg | 660.6 KB | **151.4 KB** | 1200×1800 → 1067×1600 | 经络图，JPEG q=82 重编码 |
| anatomy-body-diagram.jpg | 435.7 KB | **120.9 KB** | 1200×1800 → 800×1200 | 解剖主图 |
| anat-locomotor.jpg | 76.1 KB | 64.6 KB | 1280×960 → 1200×900 | 解剖系统图 |
| anat-digestive.jpg | 65.9 KB | 57.6 KB | 1280×960 → 1200×900 | |
| anat-respiratory.jpg | 80.0 KB | 70.9 KB | 1280×960 → 1200×900 | |
| anat-circulatory.jpg | 81.1 KB | 69.6 KB | 1280×960 → 1200×900 | |
| anat-nervous.jpg | 62.8 KB | 54.0 KB | 1280×960 → 1200×900 | |
| anat-urinary.jpg | 86.4 KB | 75.9 KB | 1280×960 → 1200×900 | |
| anat-reproductive.jpg | 607.9 KB | 75.7 KB | 1200×1500 → 960×1200 | |
| anat-endocrine.jpg | 584.2 KB | 87.5 KB | 1200×1500 → 960×1200 | |
| anat-regional-headneck.jpg | 652.2 KB | 98.3 KB | 1200×1500 → 960×1200 | |
| anat-regional-thorax.jpg | 712.3 KB | 91.3 KB | 1200×1500 → 960×1200 | |
| anat-regional-abdomen.jpg | 717.4 KB | 97.2 KB | 1200×1500 → 960×1200 | |
| anat-regional-limbs.jpg | 452.2 KB | 96.8 KB | 1200×1500 → 960×1200 | |

**处理方式说明**：原计划对 PNG 保留 .png 并额外输出 .webp。实际执行中发现并发优化流程已将 4 张 hero PNG 直接转成 JPG（比保留 PNG 再压 WebP 更小：例如 tcm-doctor-hero 的 JPG 仅 138 KB，而 WebP 版本约 140 KB），且画面为写实人物/骨骼，无透明通道需求，因此最终采用 **PNG→JPG** 方案，不再额外生成 .webp，避免 `<picture>` 标签带来的复杂度。所有 JPG 质量参数 q=80–82，肉眼验收无明显模糊，医疗专业感保留。

### 2.2 孤儿图片归档

以下图片在全仓库（HTML/JS/CSS/JSON）中无任何引用，已移至 `img/_archive/`（未物理删除）：

| 文件 | 大小 | 去向 |
|---|---:|---|
| nurse-avatar.png | 234.3 KB | `img/_archive/nurse-avatar.png` |
| nurse-hero-new.jpg | 63.2 KB | `img/_archive/nurse-hero-new.jpg` |
| nurse-happy-new.jpg | 67.5 KB | `img/_archive/nurse-happy-new.jpg` |
| nurse-sad-new.jpg | 61.8 KB | `img/_archive/nurse-sad-new.jpg` |

另有 `img/_backup/` 目录为并发优化流程留存的原图/中间版备份（.orig.bak / .20261104-211731.bak），合计约 7 MB，不影响部署。

---

## 三、JS / CSS Minify 明细

使用 `rjsmin`（JS）与 `csscompressor`（CSS），纯空白与注释裁剪，不改变语义。

| 源文件 | 原始 | Min 后 | 引用位置 |
|---|---:|---:|---|
| js/app.js | 88.7 KB | **app.min.js 67.5 KB** | index.html |
| js/rule-engine.js | 36.7 KB | **rule-engine.min.js 24.6 KB** | index.html |
| js/review.js | 5.6 KB | **review.min.js 4.0 KB** | index.html |
| js/tcm-engine.js | 11.8 KB | **tcm-engine.min.js 8.2 KB** | index.html |
| js/acup-engine.js | 6.7 KB | **acup-engine.min.js 4.6 KB** | index.html |
| js/tcm-app.js | 22.8 KB | **tcm-app.min.js 18.3 KB** | index.html |
| js/acup-app.js | 17.0 KB | **acup-app.min.js 14.2 KB** | index.html |
| js/module-views.js | 6.2 KB | **module-views.min.js 4.5 KB** | index.html |
| js/anat-app.js | 28.1 KB | **anat-app.min.js 22.0 KB** | index.html |
| css/rx.css | 64.0 KB | **rx.min.css 51.7 KB** | index.html |

> 旧版 `app.min.js` / `review.min.js` / `rule-engine.min.js` 为 2026-11-03 生成，与源文件不同步，已全部用最新源文件重新生成。其余 6 个 .min.js 为本次新建。

---

## 四、HTML 改动清单

### 4.1 `<head>` 新增
- `<link rel="preload" as="image" href="img/nurse-hero.jpg" fetchpriority="high">` —— 预加载首屏 LCP 图
- 样式表引用从 `css/rx.css?v=20261104map1` 改为 `css/rx.min.css?v=20261104perf1`

### 4.2 `<script>` 全部指向 .min 版本
8 个 script 标签的 `src` 全部从 `js/xxx.js` 改为 `js/xxx.min.js`，版本号统一 bump 为 `v=20261104perf1`。

### 4.3 图片引用修正（PNG→JPG）
并发优化流程把 hero PNG 转成了 JPG，但未同步改引用。本次补齐：

| 位置 | 修改前 | 修改后 |
|---|---|---|
| index.html L141 | `img/nurse-hero.png` | `img/nurse-hero.jpg` |
| index.html L302 | `img/nurse-happy.png` | `img/nurse-happy.jpg` |
| index.html L443 | `img/tcm-doctor-hero.png` | `img/tcm-doctor-hero.jpg` |
| index.html L651 | `img/acup-doctor-hero.png` | `img/acup-doctor-hero.jpg` |
| index.html L855 | `img/anat-skeleton-hero.png` | `img/anat-skeleton-hero.jpg` |
| js/app.js L1498 | `img/nurse-happy.png` | `img/nurse-happy.jpg` |
| js/app.js L1500 | `img/nurse-sad.png` | `img/nurse-sad.jpg` |

### 4.4 懒加载与防 CLS
- 所有 7 个 `<img>` 均补充了 `width` / `height` 属性（按图片原始像素宽高比），消除布局偏移（CLS）。
- 非首屏图（护士表情、4 个模块 hero、经络图、解剖主图）均带 `loading="lazy"`。
- 首屏 `nurse-hero.jpg` 不加 lazy，加 `fetchpriority="high"` 与 `<link rel=preload>`。

---

## 五、本地验收截图

`docs/perf-shots/` 下共 7 张截图，全部在 `http://localhost:8765/` 实测：

| 文件 | 页面 | 结果 |
|---|---|---|
| 01-home.png | 首页（西医处方） | nurse-hero.jpg 正常渲染，无破图 |
| 02-tcm.png | 中医汉方模块 | tcm-doctor-hero.jpg 正常 |
| 03-acup.png | 针灸推拿模块 | acup-doctor-hero.jpg 正常 |
| 04-anat.png | 解剖学模块首页 | anat-skeleton-hero.jpg 正常，系统卡片加载 |
| 05-drugs.png | 药品库（310 种药） | 列表正常渲染 |
| 06-meridian.png | 经络穴位图 | acup-meridian-chart.jpg 正常，穴位数据加载 |
| 07-anat-atlas.png | 解剖图谱 | anatomy-body-diagram.jpg 正常，hotspot 叠加 |

### 网络请求验证
浏览器控制台抓取到的本地请求（`localhost:8765`）全部返回 200：
- 9 个 .min.js、1 个 rx.min.css、1 个 nurse-hero.jpg、12 个 data/*.json —— 全部 OK，**无本地 404**。
- 控制台仅有 2 条预期内报错：
  1. `api.countapi.xyz` 访问统计接口在本地环境解析失败（`ERR_NAME_NOT_RESOLVED` / `Failed to fetch`）—— 这是第三方统计服务，线上 GitHub Pages 环境不受影响，且已有 `try/catch` 包裹不影响功能。
  2. 一条 404 同为 countapi 域名，非本地资源。

---

## 六、未处理项与说明

1. **未执行 git commit / push**（按硬约束）。
2. **未修改 data/ 下任何 JSON**。
3. **未触碰 .github/、*.py、启动平台.bat、*.bak、docs/ 下原有文件**。
4. **WebP 未实际输出**：原计划的 .webp 变体因并发流程采用 PNG→JPG 方案后体积已足够小（hero 类 43–138 KB），未再保留 .webp 文件，避免双格式维护成本。如后续仍需 WebP，可基于现有 JPG 再转。
5. **登录/管理后台页面（admin.html、login.html）**：经检查仅含内联 `<script>`，无外部 JS/CSS/图片引用，无需改动。
6. **基础安全**：线上走 GitHub Pages HTTPS；控制台未发现敏感信息泄露；管理员入口仅为右下角小字链接，无硬编码密码。本地未做额外权限/渗透测试。

---

## 七、后续建议（非本次执行范围）

- 在 `.github/workflows` 或发布前加一步自动图片压缩（如 `sharp` + CI），防止后续新增大图再次膨胀。
- 考虑给 `img/_backup/`、`img/_archive/` 加 `.gitignore` 或在发布前清理，进一步减小仓库体积。
- 第三方统计 `api.countapi.xyz` 已停服风险较高，建议替换或移除，避免线上控制台报错。

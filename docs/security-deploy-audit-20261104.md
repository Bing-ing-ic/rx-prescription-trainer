# 安全与部署审查报告 · 2026-11-04

> 审查范围：医学生处方推演训练平台（纯静态 GitHub Pages 站）
> 线上地址：https://bing-ing-ic.github.io/rx-prescription-trainer/
> 审查人：网站诊断与优化团队（安全/部署线）
> 审查方式：源码走查 + 线上 URL 探测 + 浏览器实地走查

---

## 一、执行摘要

| 等级 | 数量 | 说明 |
|------|------|------|
| P0（必须立即修） | 2 | ① login.html 错误提示直接把默认密码 `adm***3` 写在 UI 上；② 部署管线把整个仓库根目录上传，备份文件、Python 脚本、内部文档、测试脚本全部公开可访问 |
| P1（本轮已修） | 3 | admin.html 重复泄露默认密码；admin 页缺"前端演示不写服务端"声明；控制台因调用已失效的 countapi.xyz 持续报 Uncaught Promise |
| P2（记录待修） | 5 | 药品搜索无结果态缺失、空处方提交后视图异常、admin 统计卡片图标渲染异常、右下角隐蔽"管理"入口、首页 hero 下方大片留白 |

**核心结论**：本站当前最大的风险不是"鉴权被破"（纯静态站本就没有真正鉴权），而是**部署管线把仓库当成文件夹整个发布**，导致开发者本机的 `.bak` 备份、`add_drugs.py` / `fix_data.py` 等数据脚本、`docs/*.md` 内部测试报告、`test/*.js` 测试代码全部可被匿名访问。本次已通过重写 `deploy.yml` + 新增 `.gitignore` 在**不删除任何本地文件**的前提下切断这条泄露路径。

---

## 二、安全发现清单

### P0-1　login.html 错误提示直接暴露默认密码

- **位置**：`login.html` 第 92 行（修改前）
- **现象**：错误提示文案为 `❌ 密码错误，请重新输入（默认密码 adm***3）`——任何访客在登录框输错一次密码，页面就会把初始密码印出来。
- **根因**：开发期为了方便自己登录，把初始密码写进了错误提示，上线前未移除。
- **线上复现**：访问 `/login.html`，密码框随便输一个错密码提交，红色提示条即出现。
- **修复**：已删除括号内的默认密码片段，错误提示改为 `❌ 密码错误，请重新输入`。
- **验收**：本地 `login.html` 第 92 行已无密码字样；线上需等下次 push 后生效。

### P0-2　部署管线把整个仓库根目录发布，备份/脚本/内部文档全部暴露

- **位置**：`.github/workflows/deploy.yml`（修改前）
- **现象**：原 workflow 直接 `upload-pages-artifact path: ./`，把仓库根目录所有文件上传到 GitHub Pages。
- **线上实测（2026-11-04，HTTP HEAD 探测）**：

| URL | 状态码 | 说明 |
|-----|--------|------|
| `/index.html.bak-20261104-182147` | **200** | 首页备份，含旧版业务逻辑 |
| `/css/rx.css.bak-20261104-211731` | **200** | CSS 备份 |
| `/add_drugs.py` | **200** | 数据导入脚本，可被下载阅读内部数据结构 |
| `/data/_backup_before_engine_fix/app.js` | **200** | 旧版前端逻辑备份 |
| `/docs/architecture.md` | **200** | 内部架构文档 |
| `/test/smoke-check.js` | **200** | 测试脚本 |
| `/login.html` | 200 | 正常业务页 |
| `/admin.html` | 200 | 正常业务页 |

- **风险**：
  - 备份文件会让攻击者看到历史版本里的逻辑漏洞（包括旧版可能存在的更弱密码校验）。
  - Python 脚本暴露数据字段、内部路径、处理逻辑，给后续攻击提供情报。
  - `docs/*.md` 是内部测试记录，公开后显得不专业。
- **修复**：重写 `deploy.yml`，在 ubuntu runner 上先把需要发布的文件拷到 `_site/` 再上传；新增 `.gitignore`。详见第三节。
- **验收**：下次 GitHub Actions 跑完后，上述 URL 应全部返回 404。本地已在 workflow 里加了一道自检：如果 `_site/` 里还出现 `*.bak*` 或 `_backup*`，直接 `exit 1` 让 CI 失败。

### P1-1　admin.html 描述文字重复泄露默认密码

- **位置**：`admin.html` 第 194 行（修改前）
- **现象**：系统设置区"修改管理员密码"下方写着 `默认 adm***3，建议登录后修改`。
- **修复**：改为 `首次登录请使用初始密码，登录后请立即修改`，不再出现具体密码。
- **说明**：默认密码本身仍硬编码在 `login.html` 第 148 行 `hashStr('adm***3')` 里做兜底——纯静态站无法真正安全地保存密码 hash，这是架构性限制，不是本轮能修的。建议长期方案是把 admin 入口改成"登录后通过 URL 带一次性 token 才能进"或直接在 GitHub Pages 后面加一层 Cloudflare Access。

### P1-2　admin 页缺"前端演示、不写服务端"声明

- **位置**：`admin.html`
- **现象**：管理员看到一堆统计卡片和"导出/清空数据"按钮，容易误以为数据真的存在服务端、跨设备可同步。
- **修复**：已在 `admin.html` 顶部加了一条黄色提示横幅：
  > ℹ️ 演示说明：本控制台为纯前端演示，所有学习记录、错题本与登录态仅保存在当前浏览器 localStorage / sessionStorage 中，**不写入任何服务端**；更换设备、清理浏览器数据后数据不可恢复。

### P1-3　index.html 调用已失效的 countapi.xyz，控制台持续报 Uncaught Promise

- **位置**：`index.html` 第 1056 行
- **现象**：`fetch('https://api.countapi.xyz/hit/rx-trainer-2026/visits')` 没有 `.catch()`；admin.html 自己的注释都写了"原 CountAPI（api.countapi.xyz）已 DNS 失效"，但首页这处调用还在裸奔。
- **线上实测控制台报错**：
  ```
  Failed to load resource: net::ERR_NAME_NOT_RESOLVED
  Uncaught (in promise) TypeError: Failed to fetch
      at https://bing-ing-ic.github.io/rx-prescription-trainer/:1056:3
  ```
- **处理**：按任务分工，`index.html` 的 `<script src=>` / `<link>` 标签由另一位同事动，本次**未改 index.html**。建议同事把第 1056 行整段 fetch 删掉（反正 admin 页已经改成 localStorage 计数，这个远程计数没人看），或至少加 `.catch(()=>{})`。

### P2　其他观察（记录，不阻断发布）

| # | 问题 | 位置 | 建议 |
|---|------|------|------|
| P2-1 | 右下角有一个 `position:fixed; bottom:4px; right:4px; font-size:10px; color:#ccc` 的"管理"文字链接，几乎看不见但可点 | `index.html` 第 1068-1072 行 | 这是开发者给自己留的后门入口。功能上不泄露数据（点了还是要跳 login），但建议要么放到页脚正常位置，要么改成键盘快捷键触发 |
| P2-2 | 百度统计 ID `2732210c89a76ecc9d22f9f7f50757f2` 明文写在前端 | `index.html` 第 1089 行 | 百度统计 ID 本就公开，不是泄露；但如果不想让访客看到访问量，可考虑去掉 |
| P2-3 | 患者身份证号硬编码为 `5301**********0011`（已脱敏），门诊号随机生成 | `js/app.js` 病例生成器 | 这是教学用假数据，符合"所有患者均为合成假名"的页脚声明，无问题 |
| P2-4 | localStorage 字段清单：`rx-profile-history`（练习历史）、`rx-mistakes`（错题本）、`rx-local-visits` / `rx-daily-visits`（访问计数）、`rx-admin-pwd-hash`（密码 hash）、`rx-admin-auth` / `rx-admin-time`（sessionStorage 登录态） | `js/*.js`、`admin.html`、`login.html` | 无真实患者 PII；密码 hash 只存浏览器本机，不跨设备同步。admin 导出数据时已主动排除 `rx-admin-pwd*` 字段（`admin.html` 第 393 行），做得对 |
| P2-5 | 全站外部资源均为 `https://`，未发现 `http://` 混合内容 | 全仓 grep | 唯一的 `http://` 出现在 `js/app.js` 第 104 行 alert 文案里，是给本地开发用户的提示文字，不是资源加载 |

---

## 三、部署管线改造对比

### 改造前（`.github/workflows/deploy.yml`，关键 3 行）

```yaml
- uses: actions/upload-pages-artifact@v3
  with:
    path: ./        # ← 整个仓库根目录上传
```

### 改造后

新增 `Assemble _site artifact` 步骤，在 ubuntu runner 上：

1. `rm -rf _site && mkdir -p _site`
2. `find . -maxdepth 1 -name '*.html' ! -name '*.bak*' -exec cp {} _site/ \;` —— 根目录 3 个业务页（index/admin/login）
3. `rsync -a --exclude='*.bak*' ./css/ _site/css/` —— CSS，排除 `.bak-*`
4. `rsync -a --exclude='*.bak*' ./js/ _site/js/` —— JS，排除 `.bak-*`
5. `rsync -a --exclude='_backup/' ./img/ _site/img/` —— 图片，排除 `img/_backup/`
6. `rsync -a --exclude='_backup_*/' ./data/ _site/data/` —— 数据，排除 `data/_backup_before_*/`
7. 可选拷贝 `CNAME` / `favicon.ico`（如存在）
8. `touch _site/.nojekyll` —— 禁用 Jekyll 处理
9. **CI 自检**：`find _site -name '*.bak*' -o -name '_backup*'` 一旦命中直接 `exit 1`，让流水线失败
10. `upload-pages-artifact path: _site`

### 发布白名单 vs 黑名单

| 类别 | 是否发布 | 说明 |
|------|----------|------|
| `*.html`（根目录） | ✅ 发布 | 排除 `*.bak*` |
| `css/`、`js/` | ✅ 发布 | 排除 `*.bak*` |
| `img/` | ✅ 发布 | 排除 `_backup/` |
| `data/*.json` | ✅ 发布 | 排除 `_backup_before_*/` |
| `.nojekyll` | ✅ 发布 | 新增 |
| `*.bak-*` | ❌ 排除 | 本地保留 |
| `data/_backup_before_*/` | ❌ 排除 | 本地保留 |
| `img/_backup/` | ❌ 排除 | 本地保留 |
| `docs/`（含本次截图） | ❌ 排除 | 内部文档不发布 |
| `test/` | ❌ 排除 | 测试脚本不发布 |
| `*.py`（add_drugs 等） | ❌ 排除 | 数据脚本不发布 |
| `启动平台.bat` | ❌ 排除 | 本地启动脚本不发布 |
| `README.md` / `医学数据测试报告.md` | ❌ 排除 | 仓库文档不发布 |
| `.github/` / `.git/` | ❌ 排除 | 本就不该上传 |

### `.gitignore`（新增）

仓库根目录新增 `.gitignore`，覆盖：
`*.bak`、`*.bak-*`、`_backup/`、`_backup_*/`、`_archive/`、`node_modules/`、`_site/`、`__pycache__/`、`*.pyc`、`.DS_Store`、`Thumbs.db`。

> 注：按任务分工，本次**未执行** `git rm --cached`，已经被 Git 跟踪的 `.bak` 文件仍在历史里。要让它们从仓库历史中彻底消失，需要协调员决定是否做 `git filter-repo` 或新建分支重写历史；本轮只做"下次发布不再带它们"。

---

## 四、视觉 / 空错误态走查记录

截图全部存于 `docs/security-shots/`（按本次部署改造后这些截图**不会**被发布到线上）。

| 截图 | 观察 |
|------|------|
| `01-home.png` | 首页 hero 卡片下方有大片空白（约半屏），医疗专业感尚可，但视觉重心偏上 |
| `02-login.png` | 登录卡片居中，毛玻璃效果干净；错误提示条默认隐藏，输错后会 shake 动画 |
| `03-admin-empty.png` | **问题**：学习记录统计 4 张卡片里，"累计练习次数 / 平均分 / 最高分 / 及格率"的数字位渲染成了小方块（应显示 `-` 或 `0`），像是图标字体未加载或 CSS 选择器问题 |
| `04-case-home.png` | 病例摘要卡片信息层级清晰，主诉/现病史/生命体征/查体分区明确，医疗专业感达标 |
| `05-diag-empty-error.png` | 空诊断点"确认诊断"后出现红色"请输入诊断。"，但提示位置在输入框上方不明显，用户容易看不到 |
| `06-diag-wrong.png` | 正确诊断后绿色提示"✅ 正确诊断：心律失常（阵发性心房颤动）（ICD-10: I48.000）"，反馈清晰 |
| `07-rx-paper.png` | 处方笺版式专业，患者信息、诊断、医保类别、金额合计齐全，符合三甲处方笺模拟预期 |
| `08-drug-search-empty.png` | **问题**：药品搜索"不存在的药xyz123"后，药品列表区域完全空白，没有"未找到匹配药品"之类的空状态提示，用户会以为页面坏了 |
| `09-empty-rx-submit.png` | **问题**：一张药都没选就点"提交点评"，alert 弹出后视图跳到 home 但 home 区是空白，没有友好引导 |

### 视觉问题清单（交给视觉同事处理）

1. **P2-A　药品搜索无结果态缺失**（`08-drug-search-empty.png`）：搜索框输入无匹配词时，药品列表应显示"未找到匹配药品，请尝试通用名或首拼"空状态。
2. **P2-B　空处方提交后视图异常**（`09-empty-rx-submit.png`）：alert 关闭后应留在处方页，而不是跳到空白 home。
3. **P2-C　admin 统计卡片数字渲染异常**（`03-admin-empty.png`）：4 个统计卡片的数字位变成小方块，需排查 CSS（可能是 `font-family` 或 `::before` 图标冲突）。
4. **P2-D　首页 hero 下方留白过多**（`01-home.png`）：可在 hero 下方加一行"平台简介"或"模块入口卡片"填充。
5. **P2-E　空诊断错误提示位置不明显**（`05-diag-empty-error.png`）：红色"请输入诊断。"出现在输入框上方，但视口滚动后容易看不到。

---

## 五、本轮改动文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `login.html` | 修改 | 第 92 行错误提示删除默认密码片段 |
| `admin.html` | 修改 | ① 第 194 行"默认 adm***3"改为"首次登录请使用初始密码"；② 顶部 wrap 内新增黄色"前端演示、不写服务端"横幅 |
| `.github/workflows/deploy.yml` | 重写 | 新增 Assemble 步骤，`path: ./` → `path: _site`，加 `.nojekyll` 和备份文件泄漏自检 |
| `.gitignore` | 新增 | 忽略 `.bak`、`_backup/`、`_archive/`、`node_modules/`、`__pycache__/`、`_site/`、`.DS_Store` 等 |
| `docs/security-shots/*.png` | 新增 | 9 张走查截图（按新部署管线，这些**不会**被发布） |
| `docs/security-deploy-audit-20261104.md` | 新增 | 本报告 |

### 未改动的文件（按硬约束）

- `img/` 下任何图片（未压缩、未删除）
- `*.min.js` / `*.min.css`（未 minify）
- `index.html` 的 `<script src=>` / `<link>` 标签（由另一位同事负责；其中第 1056 行 countapi 报错已在 P1-3 记录）
- 任何 `.bak` 文件、`data/_backup_*/`、`img/_backup/`（本地保留，仅部署时排除）
- 未执行 `git commit` / `git push` / `git rm --cached`

---

## 六、后续建议（非本轮范围）

1. **长期鉴权方案**：纯静态站的"前端假登录"本质上挡不住任何人。如果 admin 页真的有敏感数据要保护，建议：
   - 把 admin 页挪到需要 Cloudflare Access / GitHub OIDC 鉴权的子路径；
   - 或在 Vercel/Netlify 上给 admin.html 单独开 Basic Auth。
2. **countapi 死调用**：让 index.html 的同事把第 1054-1073 行整段统计 IIFE 里的远程 fetch 删掉，只保留 localStorage 计数（admin 页已经在用 localStorage 计数了）。
3. **Git 历史清理**：已经被 commit 进仓库的 `.bak` 文件和 Python 脚本仍在 Git 历史里。如果要彻底清除，需要协调员决定是否用 `git filter-repo` 重写历史并 force push。
4. **CSP / 安全头**：GitHub Pages 不支持自定义响应头，如需 HSTS / CSP 要套一层 CDN（Cloudflare 免费版即可）。

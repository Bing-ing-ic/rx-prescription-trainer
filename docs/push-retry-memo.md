# 推送重试备忘

- 最近更新：2026-11-24（本地时区 UTC+8）
- 分支：`main`
- 远端：https://github.com/Bing-ing-ic/rx-prescription-trainer.git
- 当前状态：**已全部推送成功**。主交付提交 `a3b43f7`（round3-followup16，名方品鉴只读栏目，中方典籍 40 首 + 日本汉方 28 首）已推送 `origin/main`（push 输出 `57a7aaf..a3b43f7 main -> main`）；`ls-remote origin main` 核对远端 = `a3b43f7`，工作区干净。本轮 push 一次成功，未遇 reset；后续 `git fetch`/`ls-remote` 偶发 reset，重试即可，不影响远端已接收。历史主交付提交：`57a7aaf`（followup15，药品库分类口径与药典信息补全）、`045bf84`（followup14，三静脉途径专项 QA 回归修复）、`edfab2c`（followup13）、`6f38ce1`（followup10）、`2a3b4d1`（followup11）、`0b7c01d`（followup12）。

## 历史受阻记录（2026-11-23 早些时候）

- 失败现象：`git push origin main` 返回 `fatal: unable to access ... Recv failure: Connection was reset`（网络/443 受阻，非提交问题）。
- 本轮（followup2）push 一次成功，未再出现 reset；如后续再次受阻，重试命令：
  ```
  "C:\Program Files\Git\bin\git.exe" push origin main
  ```
- 校验：推送前可先 `git log --oneline origin/main..main` 确认待推提交；推送成功后该列表应为空。
- 备注：CI 为 GitHub Pages Actions，push main 后自动发布；docs/ 目录不纳入部署。

# 推送重试备忘

- 最近更新：2026-11-24（本地时区 UTC+8）
- 分支：`main`
- 远端：https://github.com/Bing-ing-ic/rx-prescription-trainer.git
- 当前状态：**已全部推送成功**。主交付提交 `6f38ce1`（round3-followup10）与备忘提交 `984597c` 均已推送 `origin/main`（push 输出 `6f38ce1..984597c main -> main`）；`ls-remote origin main` 核对远端 = `984597c`，工作区干净。期间备忘推送一度遇 443 Connection reset，重试后成功；后续 `git fetch`/`ls-remote` 偶发 reset，重试即可，不影响远端已接收。

## 历史受阻记录（2026-11-23 早些时候）

- 失败现象：`git push origin main` 返回 `fatal: unable to access ... Recv failure: Connection was reset`（网络/443 受阻，非提交问题）。
- 本轮（followup2）push 一次成功，未再出现 reset；如后续再次受阻，重试命令：
  ```
  "C:\Program Files\Git\bin\git.exe" push origin main
  ```
- 校验：推送前可先 `git log --oneline origin/main..main` 确认待推提交；推送成功后该列表应为空。
- 备注：CI 为 GitHub Pages Actions，push main 后自动发布；docs/ 目录不纳入部署。

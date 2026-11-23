# 推送重试备忘

- 最近更新：2026-11-24（本地时区 UTC+8）
- 分支：`main`
- 远端：https://github.com/Bing-ing-ic/rx-prescription-trainer.git
- 当前状态：**已推送成功**。`ae338d6`（round3-followup6）已推送 `origin/main`（push 输出 `d2326fc..ae338d6 main -> main`）；`git log origin/main..main` 为空，工作区干净。首次 push 遇 443 Connection was reset，等待约 15 秒后重试一次成功。后续 `git fetch` 受网络影响可能超时，不影响远端已接收。

## 历史受阻记录（2026-11-23 早些时候）

- 失败现象：`git push origin main` 返回 `fatal: unable to access ... Recv failure: Connection was reset`（网络/443 受阻，非提交问题）。
- 本轮（followup2）push 一次成功，未再出现 reset；如后续再次受阻，重试命令：
  ```
  "C:\Program Files\Git\bin\git.exe" push origin main
  ```
- 校验：推送前可先 `git log --oneline origin/main..main` 确认待推提交；推送成功后该列表应为空。
- 备注：CI 为 GitHub Pages Actions，push main 后自动发布；docs/ 目录不纳入部署。

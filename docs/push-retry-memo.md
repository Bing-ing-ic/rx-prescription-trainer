# 推送重试备忘

- 记录时间：2026-11-23（本地时区 UTC+8）
- 分支：`main`
- 待推送提交：HEAD（`main` 相对 `origin/main` ahead 1；提交哈希以 `git log --oneline origin/main..main` 为准；amend 过程中曾用哈希 58603fb / 6c1f511）
- 相对 `origin/main`：ahead 1
- 远端：https://github.com/Bing-ing-ic/rx-prescription-trainer.git
- 失败现象：`git push origin main` 返回 `fatal: unable to access ... Recv failure: Connection was reset`（网络/443 受阻，非提交问题）
- 重试命令（网络恢复后在项目根目录执行）：
  ```
  "C:\Program Files\Git\bin\git.exe" push origin main
  ```
- 校验：推送前可先 `git log --oneline origin/main..main` 确认待推提交；推送成功后该列表应为空。
- 备注：CI 为 GitHub Pages Actions，push main 后自动发布；docs/ 目录不纳入部署。

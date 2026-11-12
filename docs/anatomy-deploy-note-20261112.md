# 解剖模块补齐 · 部署备忘（2026-11-12）

## 已完成并本地提交
- 提交：`dd02905`（main，领先 origin/main 1 个提交，本地已保留）
- 结构 165→168；测验 155→192；病例 21→26；详图 103→168 全覆盖。
- 校验：`python scripts/audit_anatomy.py`、`python scripts/validate_anat_final.py` 全部通过（0 悬空、0 缺文件、0 字段缺失、0 无效/超标图）。

## 推送阻塞情况
- `git push origin main` 两次失败：一次 Connection was reset，一次 300s Connection timed out。
- 排查：TCP 443/22 端口可达，但 HTTPS 应用层被中间网络拦截；本地无标准代理端口/代理进程；`.ssh` 无私钥，SSH 通道不可用；凭据由 Windows 凭据管理器保存（HTTPS token 有效，问题纯在网络层）。
- GitHub OAuth MCP 通道（api.github.com）云端可达，但为文本接口，不适配 42 张二进制 JPG；强行经其推送会损坏图片并与本地提交分叉，故未采用。

## 网络恢复后一条命令完成部署
```
git push origin main
```
推送成功后，GitHub Actions（`.github/workflows/deploy.yml`）自动把 `data/`、`img/` 发布到 Pages。

## 若直连仍不通的备选
1. 开启本机代理（Clash/V2Ray 等）后，给 git 临时设代理（端口按实际替换）：
   `git config --global http.proxy http://127.0.0.1:7890`
2. 或配置 SSH over 443（`ssh.github.com:443`），前提是先生成并上传 SSH 公钥。
3. 校验脚本可复跑：`python scripts/audit_anatomy.py`、`python scripts/validate_anat_final.py`。

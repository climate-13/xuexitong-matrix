# 发布到 GitHub

仓库建议名称：climate-13/xuexitong-matrix。
GitHub 简介：

> xuexitong矩阵刷课：一个窗口管理多个独立账号，实时视频拼盘、共享 API 与后台任务控制。Windows / Tauri / Vue / Rust。

Topics：tauri、vue、rust、windows、dashboard、multi-account、course-assistant。

## 首次上传

在 GitHub 创建仓库后，将本项目源码推送到该仓库。保留 LICENSE、
NOTICE 和上游来源说明。源码包中不需要上传 node_modules、target、
dist、release 或任何实际账号数据。

## 首次发行

1. 确认 config/build.json 的 version 为 0.1.0，并通过本地检查。
2. 推送源码后，创建并推送 v0.1.0 标签。
3. Release 工作流会构建 Windows 便携版并创建 **草稿 Release**。
4. 检查构建日志、程序、校验文件和 Release 文案，再手动发布草稿。

GitHub Actions 尚未在这个新仓库上实际运行；本地检查通过不等于
远程构建已成功。工作流不会同步到上游或 Gitee，也不需要沿用上游
的更新签名私钥。

GitHub 仓库的 Social preview 可上传 docs/brand/social-preview.png。
README 使用 docs/brand/social-preview.png 和 docs/assets/studio.jpg。
截图中的视频为明确标注的本地测试素材。

## 发布说明可直接使用

见 .github/release-notes/v0.1.0.md。

## GitHub 发布入口

Windows 检查工作流在 main 提交后运行。发布预览版有三种入口：推送 vX.Y.Z 标签；手动运行 Windows preview release 并填写现有标签；或者以 `release: publish vX.Y.Z` 为提交标题推送到 main。

发布工作流运行前端和 Rust 检查，生成 Windows x64 程序、对应源码和 SHA256SUMS，并以当前源码提交创建 GitHub 预览 Release。版本取自 config/build.json；已有标签必须与该版本一致。当前 0.1.x 作为早期预览版发布。

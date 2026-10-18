# GitHub 发布说明

仓库：<https://github.com/climate-13/xuexitong-matrix>

项目标题：**xuexitong矩阵刷课**。桌面客户端名为「学习通矩阵账号 SK / SK Matrix」。

简介：多账号管理、实时视频拼盘、后台运行。Windows / Tauri / Vue / Rust。

可选 Topics：xuexitong、chaoxing、tauri、vue、rust、windows、multi-account。

## 源码维护

源码保留 LICENSE、NOTICE 和上游来源说明。不要提交 node_modules、target、dist、release、实际账号数据或 API 密钥。

Windows checks 会检查 main 上的提交和 Pull Request。远程构建是否成功，以对应 GitHub Actions 运行结果为准。

## 发布 Windows 预览版

当前版本为 **0.1.1**；版本统一由 config/build.json 管理。更新版本后应同步生成配置和 Cargo.lock，并写好 .github/release-notes/vX.Y.Z.md。

Windows preview release 支持以下入口：

1. 将标题为 `release: publish vX.Y.Z` 的提交推送到 main。工作流按 config/build.json 的版本发布，并在该源码提交上创建对应标签。
2. 推送已有的 vX.Y.Z 标签；该标签的版本须与 config/build.json 一致。
3. 在 Actions 中手动运行 Windows preview release，填写要发布的现有标签。

工作流运行前端与 Rust 检查，构建 Windows x64 程序，并上传程序、对应源码、LICENSE、NOTICE、使用说明和 SHA256SUMS。当前 0.1.x 以 **Pre-release（预览版）** 公开发布；不是等待手动发布的草稿。

下载入口：<https://github.com/climate-13/xuexitong-matrix/releases>

## 品牌与来源

GitHub Social preview 可使用 docs/brand/social-preview.png。README 的演示画面使用本地动态视频测试素材，不展示真实账号资料或课程完成记录。

项目继承自 unraous/uXueScript v2.2.2，沿用 GPL-3.0。工作流不会同步到上游或 Gitee；自动更新当前关闭，不沿用上游签名私钥。

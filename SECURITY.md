# 安全与隐私

请在 GitHub Security Advisories 中私密报告问题；公开 Issue 请移除
API Key、登录 Cookie、课程授权链接、账号数据和日志中的私人信息。

模型题目请求会发往用户选择的服务商。API Key 存于本地配置，
不是操作系统凭据库。软件不会把用户配置添加到发布源码包。

正常版本不开放本地调试端口。UXS_MANAGER_TEST_MODE 是开发诊断模式，
启用时需要使用专门的测试资料目录。

当前发行目标为 Windows x64。只从你信任的项目仓库获取构建，
并按 Release 中的 SHA256SUMS.txt 核对文件。

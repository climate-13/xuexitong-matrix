# SK Matrix 与基础版本的差异

比较基线是 uXueScript v2.2.2 标签源码。以下描述实现差异，
不是对两位维护者或两个项目的能力评价。

| 部分 | 基础版本 | SK Matrix |
|---|---|---|
| 桌面组织 | 一个课程 WebView 与配套本地界面 | 一个主窗口，按账号动态创建多个 WebView |
| 登录资料 | 应用级浏览器环境 | 每个账号使用独立 data_directory |
| 账号操作 | 无统一多账号列表 | 新增、移除、备注、链接编辑与稳定编号 |
| 查看方式 | 单课程界面 | 实时视频拼盘、画面优先、概览和账号展开 |
| 进度状态 | 单课程状态送主界面 | 以调用者 WebView 标签定位账号，独立更新 |
| 模型配置 | 各进程使用各自配置 | 所有账号共享一份配置 |
| 模型并发 | 单次求解内部限制 | 增加全进程实际请求并发上限 3 |
| 后台布局 | 基础引擎开关与焦点处理 | 继承上述机制，增加非零尺寸与屏外有效渲染表面 |
| 停止行为 | 原页面脚本生命周期 | 账号停止时结束旧链并暂停嵌套视频 |
| 重启 | 原有配置恢复 | 恢复账号列表和登录资料，任务保持停止 |
| 分发 | 上游品牌和更新配置 | SK 品牌、独立应用标识、版本和草稿发布流程 |

## 新增实现的入口

- src-tauri/src/app/accounts.rs：账号状态和持久化。
- src-tauri/src/app/accounts/runtime.rs：独立 WebView 生命周期。
- src-tauri/src/commands/accounts.rs：账号与批量控制接口。
- src-tauri/src/scripts/account-monitor.js：真实视频采样及紧凑显示。
- src/components/AccountStudio.vue：拼盘与工作区。
- src/components/SharedSettings.vue：统一 API 设置。
- src-tauri/src/app/single.rs：重复打开时恢复现有 Windows 窗口。
- docs/brand/：新的 SK 视觉资产。

## 继续继承的部分

课程 DOM 适配、主要 core.js 调度、部分焦点处理、字体字形匹配、
题目解析、模型协议适配、命令生成与既有组件来自上游。
后台焦点处理并非 SK Matrix 首次创造的能力。

来源说明见 NOTICE；具体版本改动见 CHANGELOG.md。

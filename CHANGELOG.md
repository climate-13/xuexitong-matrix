# Changelog

## 0.1.1

- 新增原生页面恢复菜单，在账号页面黑屏时返回拼盘或重载。
- 账号卡片与展开页增加重载；展开页增加返回选课。
- 恢复操作复用独立账号资料，不清理登录 Cookie。

## 0.1.0

First SK Matrix branded release, maintained independently from uXueScript.

- One native window containing independently stored account WebViews.
- Live video mosaic with 2/3/4 columns and a compact picture-first mode.
- Expand any account to log in or interact with its full course page.
- Add/remove accounts, edit labels and course addresses, and batch start/stop.
- Share one provider/model/API configuration across accounts.
- Limit actual model requests to 3 concurrent requests across the process.
- Preserve nonzero background WebView surfaces and request Windows wakefulness
  while tasks are enabled.
- Pause media after explicit stop and restore saved accounts as stopped.
- New SK identity, SVG/PNG/ICO artwork, application ID and version series.
- Disable automatic updates to the upstream project's release channel.
- Windows build/check workflow and draft release workflow.

Based on uXueScript v2.2.2. See NOTICE for component provenance.

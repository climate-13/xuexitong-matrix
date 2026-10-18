# 构建指南

本项目使用 pnpm、Vue、Tauri 2 和 Rust 构建。以下 Node.js 与 pnpm 版本与发布 CI 一致，Rust 为开发环境参考版本（CI 使用 stable），Tauri 版本来自项目依赖；更新依赖前应先确认其兼容性。

| 组件 | 当前版本 | 用途 |
| --- | --- | --- |
| Node.js | `v24.21.0` | 运行 Vite、Vue 类型检查与 Tauri CLI |
| pnpm | `12.3.4` | 安装与锁定前端依赖 |
| Rust / Cargo | `1.97.1` | 编译桌面端与执行 Rust 测试 |
| `@tauri-apps/cli` | `2.12.1` | 启动开发环境与生成发行包 |
| `tauri` | `2.11.5` | 桌面端运行时 |

## Windows 前置条件

安装 Node.js `v24.21.0`、pnpm `12.3.4` 和 Rust `1.97.1`。Windows 还需安装：

- **Microsoft C++ Build Tools**，并勾选 Desktop development with C++ 工作负载；
- **WebView2 Evergreen Runtime**。

安装完成后，在项目根目录验证工具链：

```powershell
node --version
pnpm --version
rustc --version
cargo --version
pnpm exec tauri --version
```

按上述版本安装时，输出应分别包含 Node.js `v24.21.0`、pnpm `12.3.4`、Rust/Cargo `1.97.1` 与 Tauri CLI `2.12.1`。

仓库的 `.cargo/config.toml` 对 `x86_64-pc-windows-msvc` 指定了 `lld-link.exe` 和 `target-cpu=x86-64-v3`。还需确保该链接器可用；生成的 Windows 程序要求支持 x86-64-v3 的处理器。

## 安装依赖

首次克隆或依赖发生变更后，在项目根目录执行：

```powershell
pnpm install --frozen-lockfile
```

该命令严格使用已提交的 `pnpm-lock.yaml`，不会在安装时更新依赖版本或锁文件。只有明确要升级依赖时，才使用不带 `--frozen-lockfile` 的 `pnpm install`，并一并提交锁文件变更。

## 本地开发

启动完整桌面端开发环境：

```powershell
pnpm tauri dev
```

只调试 Vue 页面时，可启动 Vite：

```powershell
pnpm run dev
```

后者不会创建 Tauri 窗口，也无法验证 IPC、课程 WebView 或本地配置读写。

## 发布前检查

依次执行前端测试、类型检查与生产构建、Rust 测试及命令收集宏测试：

```powershell
pnpm test
pnpm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked -p uxs_commands
```

默认 Rust 测试跳过标记为 `#[ignore]` 的外部服务测试与长时间基准；不要在没有对应服务或凭据时追加 `--ignored`。

`uxs_commands` 在编译期扫描 `src-tauri/src/commands/` 下的 Rust 文件；每个命令统一使用 `#[uxs_commands::command]`。`uxs_commands::register!()` 展开为 Tauri handler，`uxs_commands::sync_bindings!()` 展开为通过 `tauri_specta` 导出 `src/services/cmds.ts` 的代码。两个宏都会同步 `commands-main.json`、`commands-chaoxing.json` 和 `commands-mask.json`；不应手动在这些 allowlist 中增删命令。开发模式启动应用时会自动导出 TypeScript 绑定；修改 IPC 命令或其 DTO 后，也可以在仓库根目录运行 `cargo sync-bindings`，由独立的 `sync-bindings` 二进制主动导出。

确认通过后生成桌面端发行包：

```powershell
# 通用 Tauri 打包构建
pnpm tauri build

# 构建前自动渲染共享配置，再生成 Windows MSI
pnpm tauri build --bundles msi
```

构建产物默认位于 Cargo workspace 根目录的 `target/release/bundle/`，可执行文件位于 `target/release/`。设置 `CARGO_TARGET_DIR` 时以该目录为准。`pnpm run build:windows` 在构建后从默认的 `target/release/` 归档便携 EXE。

Build data lives in `config/build.json`. Edit package.json, Cargo.toml, Tauri configuration, and WXS directly; `pnpm sync:config` updates shared fields using JSON and XML parsers while preserving Cargo dependencies and comments. `pnpm tauri` synchronizes before the CLI reads configuration; run `pnpm sync:config` before invoking Cargo directly. `core.js` remains a standalone JavaScript file, and command bindings and permissions continue to use the existing `uxs_commands` pipeline.

Node 版本统一由根目录 `.node-version` 指定（24.21.0），CI 保留 pnpm 12.3.4。`main` 推送和 PR 会运行共享 CI：前端测试、类型检查与生产构建，以及 `cargo test --workspace --locked`，包含 `uxs_commands` 宏 crate。

发布 CI 由 `v*` 标签触发：先调用相同的共享 CI，再构建 Windows MSI/便携 EXE 与 macOS ARM64 DMG，验证标签与 `config/build.json` 同步后的 Cargo 版本一致，最后发布到 GitHub Release 并同步 Gitee。CI 的便携 EXE 归档直接使用 `target/release/`，不调用上述 Windows 归档脚本。

### 发布与 Gitee 镜像

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 配置：

- `TAURI_SIGNING_PRIVATE_KEY`：与 `config/build.json` 中更新公钥配套的私钥内容。
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：私钥密码；无密码时可留空。
- `GITEE_TOKEN`：具有 `unraous/uxuescript` 仓库、标签和发行版写权限的 Gitee 个人令牌（projects 权限）。令牌所属用户为 unraous，同时用于 Git HTTPS 标签推送及 Release API。

发布新版本时修改 `config/build.json` 的版本，运行 `pnpm sync:config`，将同步后的配置提交并推送到 GitHub，再创建并推送同版本的 `v*` 标签。工作流构建一次，GitHub 和 Gitee 使用同一份安装包、更新包和签名；无需在 Gitee 重新构建。

`scripts/sync-gitee-release.mjs` 从已发布的 GitHub Release 读取标题、说明和全部附件，核对 Gitee 标签对应的提交后创建或更新发行版。已有同名附件会被替换，其他附件保留；上传后核对文件名与大小。标签指向不同提交时失败，不强推。同步失败不会撤销 GitHub Release，但同步任务会显示失败。

手动重试：进入 GitHub **Actions → Release → Run workflow**，选择含有最新同步脚本的 `main`，在 `release_tag` 填入已发布标签（例如 `v2.1.4`）。此入口仅同步指定发行版，不重新构建或发布 GitHub。缺少 `GITEE_TOKEN` 时同步任务明确报错；配置后可从此入口重试。

GitHub Actions 构建产物及 `latest.json` 是分发基准。Gitee 接收同一份安装包、更新包和签名；附件上传并验证成功后，CI 将清单中的各平台下载 URL 替换为 Gitee 返回的实际附件地址，再上传 Gitee 版本的 `latest.json`，版本、说明、时间和签名保持一致。

当前最新正式版本的镜像清单同时写入 Gitee 的 `updates` 分支根目录 `latest.json`，公开地址为 `https://gitee.com/unraous/uxuescript/raw/updates/latest.json`。手动重试旧版本或同步预览版不会覆盖该正式版本清单。旧发行版没有 `latest.json` 时只同步原附件。

应用沿用 Tauri updater，`config/build.json` 的 `updater.endpoints` 按 GitHub、Gitee 顺序配置；Gitee 清单的下载地址指向 Gitee 更新包，无需自定义下载切源机制。更新检查与下载阶段分别处理：已选中 GitHub 清单后，下载失败不会自动改用 Gitee。首次真实同步还需确认 Gitee 的附件大小限制和实际上传行为。

发布前至少安装并验证一次生成的安装包，确认开屏动画、课程 WebView 登录、模型配置保存和正常退出均可用。

## 本地数据

默认数据目录为系统数据目录下的应用标识符 `top.unraous.uxs` 子目录（Windows 通常为 `%APPDATA%\top.unraous.uxs`），配置为 `config.toml`，日志在 `logs/` 下。只有无法取得系统数据目录时，才回退到工作目录的 `uxs-data`。已保存的配置也可包含自定义路径。

设置命令先修改内存配置；点击保存调用 `save_config`，正常窗口关闭也会尝试保存。配置读取或解析失败时回退默认配置。应用名称读取 Tauri 的 `productName`，版本和作者读取 Tauri 的 `package_info()`；课程首页与 MSI 参数作为 `plugins.uxuescript` 保存在 `tauri.conf.json` 中。应用元数据不从用户 TOML 读取，也不会写入 TOML；日志级别仍可在 TOML 的顶层 `log_level` 中设置，旧 `[metadata].logLevel` 在加载时迁移，其余用户配置保留。API Key 的日志格式化输出会脱敏，但配置序列化保留明文；提交配置、日志或打包问题报告前，请检查并移除 API Key、课程信息或其他敏感内容。

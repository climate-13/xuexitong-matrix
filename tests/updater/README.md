# 本地更新测试

项目根目录下分别运行：

```sh
pnpm updater:mock
$env:UXS_MSI_PROFILE="mock"; pnpm tauri dev
```

Shared build data lives in `config/build.json`: version, app metadata, release and mock updater settings, and MSI registry values. `pnpm sync:config` parses and updates package.json, Cargo.toml, Tauri JSON, and MSI WXS. Cargo dependencies and comments stay in Cargo.toml. Setting `UXS_MSI_PROFILE=mock` switches the same Tauri configuration to the local updater endpoint and mock installer identity. Mock and production builds use the same update, download, and install logic.

`pnpm tauri`, frontend build, dev, and test commands synchronize configuration before running. Run `pnpm sync:config` before invoking Cargo directly. package.json, Cargo.toml, Tauri configuration, and WXS are ordinary editable files; shared values come from `config/build.json`. `core.js` remains a standalone JavaScript file.

## 两个版本的 MSI 升级测试

从同一份源码分别构建并签名 `2.2.0`、`2.2.10`：

```sh
pnpm build:updater.mock
```

The two-version MSI script is `tests/updater/build.mjs`. It saves the synchronized inputs and Cargo.lock, builds and signs each mock version, then restores the original bytes even if a build fails. `UXS_BUILD_VERSION` sets the version used across frontend, package, and Tauri configuration. The mock server pads the preview fixture to 4 MiB and sends packages in 256 KiB chunks with a 1 second delay between chunks, making the download progress visible for about 15 seconds. Real packages are sent unchanged; the fixture remains intentionally unsuitable for installation.

Mock builds use the app name, identifier, upgrade code, and registry path stored in `config/build.json`. Rust reads these values from the Tauri plugin configuration; display metadata also comes from Tauri configuration.

产物按版本分别保存到 `.local-updater/packages/2.2.0/` 和 `.local-updater/packages/2.2.10/`，每个目录包含 `update.msi`、`update.msi.sig` 和 `update-version.txt`。安装 `2.2.0/update.msi`，然后让 mock 提供 `2.2.10`：

```sh
pnpm updater:mock available real .local-updater/packages/2.2.10
```

`2.2.0` 在开屏后提示升级到 `2.2.10`；升级成功后再次启动不会提示同版本更新。没有强制版本比较、重装参数或额外重装启动动作。Windows 更新插件在启动安装器后退出应用，使用默认安装模式。

只构建本地源可执行文件可使用 `$env:UXS_MSI_PROFILE="mock"; pnpm tauri build --no-bundle`；MSI 测试使用上述打包脚本。便携程序仍走手动下载分流。

## 模拟响应与真实包

默认 `available fixture` 使用固定 `99.0.0` 和配套签名空 ZIP，验证开屏后的更新弹窗及下载流程；空 ZIP 不含安装程序，安装预期失败。`none` 返回无更新，`bad-signature` 返回无效签名：

```sh
pnpm updater:mock none
pnpm updater:mock bad-signature
```

真实安装测试显式使用 `real`，目录中必须同时存在 `update.msi`、`update.msi.sig` 和 `update-version.txt`；版本填写包的实际版本，签名对应应用配置的公钥。没有 `update.msi` 时仍支持配套的 `update.msi.zip` 和 `update.msi.zip.sig`：

```sh
pnpm updater:mock available real .local-updater/packages/2.2.10
```

文件在服务器启动时读取；更换包后重启服务器。缺失文件不会回退模拟数据。Windows 应用安装分流取决于 MSI 注册表标记，便携程序会打开下载页。

`UXS_UPDATER_PORT` 可覆盖服务器端口；使用 mock 配置的应用默认请求 `35821`，其他端口用于独立服务器测试，`0` 用于自动化测试的随机端口。

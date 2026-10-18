# Windows 开发与构建

准备 Windows 10/11 x64、WebView2 Runtime、Node.js 24、pnpm 12、
Rust stable，以及 Visual Studio C++ Build Tools 和 Windows SDK。
本地开发使用 PowerShell。

```powershell
pnpm install --frozen-lockfile
pnpm build
cargo run --features tauri/custom-protocol --bin sk-matrix
```

生成便携版并运行检查：

```powershell
./scripts/build-windows.ps1
```

只检查而不生成发行包：

```powershell
./scripts/build-windows.ps1 -CheckOnly
```

发行文件位于 release/，不提交到源码 Git 历史。
构建采用默认 x86-64 CPU 目标，不要求 x86-64-v3。
项目 Windows 链接器使用 MSVC link.exe。

## 元数据

config/build.json 统一管理版本号、标题、应用标识和发行文件前缀。
修改后运行 pnpm sync:config，随后更新并提交 Cargo.lock。
前后端 IPC 类型通过原有编译宏管线生成：

```powershell
cargo run --release --features sync-bindings,tauri/custom-protocol --bin sync-bindings
pnpm build
```

## 更新渠道

自动更新当前关闭：没有沿用上游公钥或发布地址。
将来若启用，需要为本项目单独生成签名密钥，并配置自己的
公钥及更新清单端点；私钥只存入仓库 Secrets，不写入源码。

## 诊断

本地 UI 验证可设置 UXS_MANAGER_TEST_MODE=1 和一个独立的
UXS_MANAGER_DATA_DIR。此模式使用本地动态视频素材，并打开
127.0.0.1:9337 调试接口；仅用于开发，不是课程演示数据。
正常启动不启用该调试端口。

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const env = { ...process.env };
const {
  updater: {
    mock: { versions },
  },
} = JSON.parse(readFileSync(resolve(root, "config/build.json"), "utf8"));

if (!env.TAURI_SIGNING_PRIVATE_KEY) {
  const key = resolve(root, ".secrets/updater.key");
  if (!existsSync(key)) {
    throw new Error(
      "缺少 .secrets/updater.key，请提供已有私钥或设置 TAURI_SIGNING_PRIVATE_KEY。",
    );
  }
  env.TAURI_SIGNING_PRIVATE_KEY = key;
}
env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= "";

const require = createRequire(import.meta.url);
const cli = require.resolve("@tauri-apps/cli/tauri.js");
const outputPaths = [
  "package.json",
  "src-tauri/Cargo.toml",
  "src-tauri/tauri.conf.json",
  "src-tauri/windows/fragments/updater-marker.wxs",
].map((path) => resolve(root, path));
// 渲染和 Cargo 构建会改写输入文件；保留原始字节以恢复已有工作区修改。
const originals = new Map(
  [...outputPaths, resolve(root, "Cargo.lock")].map((file) => [
    file,
    readFileSync(file),
  ]),
);

try {
  for (const version of versions) {
    console.log(`[Updater Mock] Syncing config, building, and signing ${version}`);
    env.UXS_BUILD_VERSION = version;
    env.UXS_MSI_PROFILE = "mock";
    for (const args of [
      [resolve(root, "scripts/sync-config.mjs")],
      [cli, "build"],
    ]) {
      const result = spawnSync(process.execPath, args, {
        cwd: root,
        env,
        stdio: "inherit",
      });
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(
          `构建命令失败，退出码 ${result.status ?? result.signal}`,
        );
    }
    const config = JSON.parse(
      readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"),
    );
    const source = resolve(
      root,
      `target/release/bundle/msi/${config.productName}_${version}_x64_zh-CN.msi`,
    );
    const output = resolve(root, ".local-updater/packages", version);
    mkdirSync(output, { recursive: true });
    copyFileSync(source, resolve(output, "update.msi"));
    copyFileSync(`${source}.sig`, resolve(output, "update.msi.sig"));
    writeFileSync(resolve(output, "update-version.txt"), `${version}\n`);
    console.log(`[Updater Mock] Saved to ${output}`);
  }
} catch (error) {
  console.error(`[Updater Mock] ${error.message}`);
  process.exitCode = 1;
} finally {
  for (const [file, contents] of originals) writeFileSync(file, contents);
  console.log("[Updater Mock] Restored original files and Cargo.lock");
}

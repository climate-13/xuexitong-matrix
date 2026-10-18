import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createUpdaterServer, type ServerOptions } from "./server.ts";
import { readFileSync } from "node:fs";

const config = JSON.parse(
  readFileSync(new URL("../../config/build.json", import.meta.url), "utf8"),
).updater.mock;

export function parseOptions(
  args: string[],
  portValue?: string,
): ServerOptions {
  const [mode = "available", source = "fixture", dir] = args;
  if (args.length > 3)
    throw new Error(
      "用法: updater:mock [available|none|bad-signature] [fixture|real] [目录]",
    );
  if (mode !== "available" && mode !== "none" && mode !== "bad-signature") {
    throw new Error("未知更新响应模式: " + mode);
  }
  if (source !== "fixture" && source !== "real") {
    throw new Error("未知更新数据来源: " + source);
  }
  if (source === "fixture" && dir !== undefined) {
    throw new Error("fixture 不读取包目录；真实包请使用 real");
  }
  const port = portValue === undefined ? config.port : Number(portValue);
  if (
    !Number.isInteger(port) ||
    port < 0 ||
    port > 65535 ||
    portValue?.trim() === ""
  ) {
    throw new Error("UXS_UPDATER_PORT 必须是 0–65535 的整数");
  }
  return { mode, source, dir, port };
}

async function main() {
  try {
    const options = parseOptions(
      process.argv.slice(2),
      process.env.UXS_UPDATER_PORT,
    );
    const instance = createUpdaterServer(options);
    const { url } = await instance.start();
    console.log(
      "[Updater Source] " +
        options.mode +
        " / " +
        options.source +
        " at " +
        url +
        "/latest.json",
    );
    if (options.source === "fixture")
      console.log("模拟包只用于弹窗和下载验证，安装预期失败。");
    const shutdown = async () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      try {
        await instance.close();
      } catch (error) {
        console.error("[Updater Source] 关闭失败:", error);
        process.exitCode = 1;
      }
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error(
      "[Updater Source] 启动失败:",
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}

import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const config = JSON.parse(
  readFileSync(new URL("../../config/build.json", import.meta.url), "utf8"),
).updater.mock;
const fixtureDownloadSize = 4 * 1024 * 1024;
const downloadChunkSize = 256 * 1024;
const downloadChunkDelay = 1000;

export type UpdaterMode = "available" | "none" | "bad-signature";
export type UpdaterSource = "fixture" | "real";

export interface ServerOptions {
  port?: number;
  mode?: UpdaterMode;
  source?: UpdaterSource;
  dir?: string;
}

interface UpdateData {
  version: string;
  signature: string;
  bundle: Buffer;
  notes: string;
  fileName: string;
}

function loadUpdate(source: UpdaterSource, dir?: string): UpdateData {
  if (source === "fixture") {
    const fixture = JSON.parse(
      readFileSync(new URL("./fixture.json", import.meta.url), "utf8"),
    );
    return {
      ...fixture,
      bundle: Buffer.concat([
        Buffer.from(fixture.bundle),
        Buffer.alloc(fixtureDownloadSize - fixture.bundle.length),
      ]),
      fileName: "update.msi.zip",
    };
  }

  const directory = resolve(dir ?? ".local-updater");
  // 真实包、签名和版本作为同一份数据读取，缺失时不混入模拟数据。
  // 当前 Tauri 直接生成已签名 MSI；仍可读取原来的 ZIP 更新包。
  const fileName = existsSync(resolve(directory, "update.msi"))
    ? "update.msi"
    : "update.msi.zip";
  const bundle = readFileSync(resolve(directory, fileName));
  const signature = readFileSync(
    resolve(directory, `${fileName}.sig`),
    "utf8",
  ).trim();
  const version = readFileSync(
    resolve(directory, "update-version.txt"),
    "utf8",
  ).trim();
  if (!signature || !version) throw new Error("真实更新包的签名和版本不能为空");
  return {
    bundle,
    signature,
    version,
    notes: "uXueScript 本地真实更新包测试",
    fileName,
  };
}

async function* downloadChunks(bundle: Buffer) {
  for (let offset = 0; offset < bundle.length; offset += downloadChunkSize) {
    if (offset > 0)
      await new Promise((resolvePromise) =>
        setTimeout(resolvePromise, downloadChunkDelay),
      );
    yield bundle.subarray(offset, offset + downloadChunkSize);
  }
}

export function createUpdaterServer(options: ServerOptions = {}) {
  const port = options.port ?? config.port;
  const update = loadUpdate(options.source ?? "fixture", options.dir);
  let mode: UpdaterMode = options.mode ?? "available";
  let url: string;
  const pubDate = new Date().toISOString();

  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", url).pathname;
    if (pathname === "/latest.json") {
      if (mode === "none") {
        res.writeHead(204).end();
        return;
      }
      const manifest = {
        version: update.version,
        notes: update.notes,
        pub_date: pubDate,
        platforms: {
          "windows-x86_64": {
            url: `${url}/${update.fileName}`,
            signature:
              mode === "bad-signature"
                ? "invalid-test-signature"
                : update.signature,
          },
        },
      };
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify(manifest, null, 2));
      return;
    }

    if (pathname === `/${update.fileName}` && mode !== "none") {
      res.writeHead(200, {
        "content-type": update.fileName.endsWith(".zip")
          ? "application/zip"
          : "application/octet-stream",
        "content-length": update.bundle.length,
        "cache-control": "no-store",
      });
      void pipeline(Readable.from(downloadChunks(update.bundle)), res).catch(
        (error) => {
          if (!res.destroyed) res.destroy(error);
        },
      );
      return;
    }
    res.writeHead(404).end();
  });

  return {
    start: () =>
      new Promise<{ port: number; url: string }>(
        (resolvePromise, rejectPromise) => {
          server.once("error", rejectPromise);
          server.listen(port, "127.0.0.1", () => {
            server.off("error", rejectPromise);
            const address = server.address() as AddressInfo;
            url = "http://127.0.0.1:" + address.port;
            resolvePromise({ port: address.port, url });
          });
        },
      ),
    close: () =>
      new Promise<void>((resolvePromise, rejectPromise) => {
        server.close((error) =>
          error ? rejectPromise(error) : resolvePromise(),
        );
      }),
    setMode: (next: UpdaterMode) => {
      mode = next;
    },
  };
}

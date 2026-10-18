// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createUpdaterServer } from "./updater/server.ts";
import { parseOptions } from "./updater/cli.ts";
import fixture from "./updater/fixture.json";

describe("Updater Mock Server", () => {
  let testDir: string;
  let server: Awaited<ReturnType<typeof createUpdaterServer>>;
  let baseUrl: string;

  beforeAll(async () => {
    testDir = mkdtempSync(join(tmpdir(), "uxs-updater.mock-"));
    writeFileSync(join(testDir, "update.msi.zip"), "fake-zip-binary-content");
    writeFileSync(
      join(testDir, "update.msi.zip.sig"),
      "test-minisign-signature-xyz",
    );
    writeFileSync(join(testDir, "update-version.txt"), "2.2.0\n");

    server = createUpdaterServer({
      port: 0,
      dir: testDir,
      source: "real",
      mode: "available",
    });
    const info = await server.start();
    baseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    if (server) await server.close();
    if (testDir) rmSync(testDir, { recursive: true, force: true });
  });

  it("returns 200 and valid update manifest when mode is available", async () => {
    server.setMode("available");
    const res = await fetch(`${baseUrl}/latest.json`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.version).toBe("2.2.0");
    expect(body.platforms["windows-x86_64"].signature).toBe(
      "test-minisign-signature-xyz",
    );
    expect(body.platforms["windows-x86_64"].url).toBe(
      `${baseUrl}/update.msi.zip`,
    );
  });

  it("returns 204 No Content when mode is none", async () => {
    server.setMode("none");
    const res = await fetch(`${baseUrl}/latest.json`);
    expect(res.status).toBe(204);
    expect((await fetch(`${baseUrl}/update.msi.zip`)).status).toBe(404);
  });

  it("returns invalid signature when mode is bad-signature", async () => {
    server.setMode("bad-signature");
    const res = await fetch(`${baseUrl}/latest.json`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.platforms["windows-x86_64"].signature).toBe(
      "invalid-test-signature",
    );
  });

  it("streams binary bundle correctly", async () => {
    server.setMode("available");
    const res = await fetch(`${baseUrl}/update.msi.zip`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("fake-zip-binary-content");
  });

  it("returns 404 for unknown endpoints", async () => {
    const res = await fetch(`${baseUrl}/unknown-endpoint`);
    expect(res.status).toBe(404);
  });

  it("rejects a port already used by another server", async () => {
    const port = Number(new URL(baseUrl).port);
    await expect(createUpdaterServer({ port }).start()).rejects.toMatchObject({
      code: "EADDRINUSE",
    });
    const cli = spawnSync(process.execPath, ["tests/updater/cli.ts"], {
      env: { ...process.env, UXS_UPDATER_PORT: String(port) },
      encoding: "utf8",
      timeout: 5000,
    });
    expect(cli.status).toBe(1);
    expect(cli.stderr).toContain("启动失败");
    expect(cli.stderr).toContain("EADDRINUSE");
  });
});

describe("Updater data sources", () => {
  it("throttles real package downloads without changing signed bytes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uxs-updater-slow-"));
    const bundle = Buffer.alloc(1024 * 1024, 0x2a);
    writeFileSync(join(dir, "update.msi"), bundle);
    writeFileSync(join(dir, "update.msi.sig"), "test-signature");
    writeFileSync(join(dir, "update-version.txt"), "2.2.10");
    const server = createUpdaterServer({ port: 0, source: "real", dir });
    const { url } = await server.start();
    try {
      const manifest = await (await fetch(`${url}/latest.json`)).json();
      const started = performance.now();
      const response = await fetch(manifest.platforms["windows-x86_64"].url);
      const downloaded = Buffer.from(await response.arrayBuffer());

      expect(response.headers.get("content-length")).toBe(
        String(bundle.length),
      );
      expect(downloaded).toEqual(bundle);
      expect(performance.now() - started).toBeGreaterThanOrEqual(2500);
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15000); // 下载刻意限速约 3 秒，给 CI 调度和连接收尾留出时间。

  it("serves the current signed MSI directly instead of a legacy ZIP", async () => {
    const dir = mkdtempSync(join(tmpdir(), "uxs-updater-msi-"));
    writeFileSync(join(dir, "update.msi"), "current-msi");
    writeFileSync(join(dir, "update.msi.sig"), "current-signature");
    writeFileSync(join(dir, "update-version.txt"), "2.1.4");
    writeFileSync(join(dir, "update.msi.zip"), "legacy-zip");
    const server = createUpdaterServer({ port: 0, source: "real", dir });
    const { url } = await server.start();
    try {
      const manifest = await (await fetch(`${url}/latest.json`)).json();
      expect(manifest.version).toBe("2.1.4");
      expect(manifest.platforms["windows-x86_64"]).toEqual({
        url: `${url}/update.msi`,
        signature: "current-signature",
      });
      const download = await fetch(manifest.platforms["windows-x86_64"].url);
      expect(download.headers.get("content-type")).toBe(
        "application/octet-stream",
      );
      expect(await download.text()).toBe("current-msi");
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses the complete fixture and ignores real files unless explicitly selected", async () => {
    const server = createUpdaterServer({ port: 0, dir: "missing-directory" });
    const { url } = await server.start();
    try {
      const manifest = await (await fetch(`${url}/latest.json`)).json();
      expect(manifest.version).toBe(fixture.version);
      expect(manifest.platforms["windows-x86_64"].signature).toBe(
        fixture.signature,
      );
      expect(manifest.notes).toContain("安装预期失败");
      const bundle = await (await fetch(`${url}/update.msi.zip`)).arrayBuffer();
      expect(Buffer.from(bundle)).toEqual(
        Buffer.concat([
          Buffer.from(fixture.bundle),
          Buffer.alloc(4 * 1024 * 1024 - fixture.bundle.length),
        ]),
      );
    } finally {
      await server.close();
    }
  }, 30000);

  it.each(["update.msi.zip", "update.msi.zip.sig", "update-version.txt"])(
    "rejects a real source missing %s instead of using fixture data",
    (missing) => {
      const dir = mkdtempSync(join(tmpdir(), "uxs-updater-missing-"));
      try {
        const files = {
          "update.msi.zip": "bundle",
          "update.msi.zip.sig": "signature",
          "update-version.txt": "2.2.0",
        };
        for (const [name, value] of Object.entries(files)) {
          if (name !== missing) writeFileSync(join(dir, name), value);
        }
        expect(() => createUpdaterServer({ source: "real", dir })).toThrow(
          missing,
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it.each(["update.msi.zip.sig", "update-version.txt"])(
    "rejects empty %s",
    (empty) => {
      const dir = mkdtempSync(join(tmpdir(), "uxs-updater-empty-"));
      try {
        writeFileSync(join(dir, "update.msi.zip"), "bundle");
        writeFileSync(
          join(dir, "update.msi.zip.sig"),
          empty === "update.msi.zip.sig" ? "\n" : "signature",
        );
        writeFileSync(
          join(dir, "update-version.txt"),
          empty === "update-version.txt" ? "\n" : "2.2.0",
        );
        expect(() => createUpdaterServer({ source: "real", dir })).toThrow(
          "签名和版本不能为空",
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});

describe("Updater CLI", () => {
  it("defaults to fixture on the development endpoint port", () => {
    expect(parseOptions([])).toMatchObject({
      source: "fixture",
      mode: "available",
      port: 35821,
    });
  });

  it("accepts explicit real source, mode, directory and port", () => {
    expect(parseOptions(["bad-signature", "real", "packages"], "0")).toEqual({
      mode: "bad-signature",
      source: "real",
      dir: "packages",
      port: 0,
    });
  });

  it.each([
    ["invalid"],
    ["available", "invalid"],
    ["available", "fixture", "packages"],
    ["available", "real", "packages", "extra"],
  ])("rejects invalid arguments %j", (...args) => {
    expect(() => parseOptions(args)).toThrow();
  });

  it.each(["", "invalid", "-1", "65536", "1.5"])("rejects port %j", (port) => {
    expect(() => parseOptions([], port)).toThrow("UXS_UPDATER_PORT");
  });
});

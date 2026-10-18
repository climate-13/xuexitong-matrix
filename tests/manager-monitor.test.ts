import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// jsdom ships no declarations in this project's dependency set.
// @ts-expect-error runtime-only test fixture
import { JSDOM } from "jsdom";

const script = readFileSync(resolve("src-tauri/src/scripts/account-monitor.js"), "utf8");
describe("account live view monitor", () => {
  it("uses the real nested video and removes compact styles in expanded mode", () => {
    const dom = new JSDOM("<iframe></iframe>", { runScripts: "outside-only", url: "https://mooc1.chaoxing.com/" });
    const root = dom.window as unknown as Window & typeof globalThis & { __UXS_TILE_MODE__: boolean; __UXS_ACCOUNT_SUSPENDED__: boolean; __TAURI_INTERNALS__: unknown };
    const invoke = vi.fn().mockResolvedValue(undefined);
    root.__TAURI_INTERNALS__ = { invoke };
    const frame = root.document.querySelector("iframe")!;
    const video = frame.contentDocument!.createElement("video");
    frame.contentDocument!.body.append(video);
    Object.defineProperties(video, { paused: { value: false }, currentTime: { value: 7.25 }, duration: { value: 80 } });
    video.pause = vi.fn();
    const intervals: Array<() => void> = [];
    root.setInterval = ((callback: () => void) => { intervals.push(callback); return 1; }) as typeof root.setInterval;
    dom.window.eval(script);
    expect(invoke).toHaveBeenCalledWith("account_heartbeat", expect.objectContaining({ mediaTime: 7.25, mediaSeen: true }));
    intervals[1]!();
    expect(video.classList.contains("uxs-live-surface")).toBe(true);
    expect(frame.classList.contains("uxs-live-surface")).toBe(true);
    root.__UXS_TILE_MODE__ = false;
    intervals[1]!();
    expect(video.classList.contains("uxs-live-surface")).toBe(false);
    expect(frame.classList.contains("uxs-live-surface")).toBe(false);
    root.__UXS_ACCOUNT_SUSPENDED__ = true;
    intervals[1]!();
    expect(video.pause).toHaveBeenCalled();
    dom.window.close();
  });
});

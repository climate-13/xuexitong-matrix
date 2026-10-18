import { emitTo, listen } from "@tauri-apps/api/event";
import { getAllWebviews } from "@tauri-apps/api/webview";

const progressInterval = 2500 / 100;
let previewInProgress = false;

export async function previewUpdateDownload() {
  if (previewInProgress) return;

  previewInProgress = true;
  let cancelled = false;
  let unlisten: (() => void) | undefined;

  try {
    unlisten = await listen("update-download-preview-cancelled", () => {
      cancelled = true;
    });
    const mask = (await getAllWebviews()).find(
      (webview) => webview.label === "mask",
    );
    if (!mask) throw new Error("找不到 mask WebView");
    await mask.show();
    await emitTo("mask", "update-download-preview-start");
    let progress = 0;
    while (!cancelled) {
      progress = (progress % 100) + 1;
      await emitTo("mask", "update-download-preview-progress", progress);
      await new Promise((resolve) => setTimeout(resolve, progressInterval));
    }
  } finally {
    unlisten?.();
    previewInProgress = false;
  }
}

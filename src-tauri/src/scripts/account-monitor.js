(() => {
  const invoke = window.__TAURI_INTERNALS__?.invoke;
  if (!invoke) return;
  window.__UXS_TILE_MODE__ = true;
  let lastError = "";
  window.addEventListener("error", (e) => { lastError = String(e.message).slice(0, 250); });
  const scan = (root) => {
    const videos = [...root.querySelectorAll("video")];
    for (const frame of root.querySelectorAll("iframe,frame")) {
      try { if (frame.contentDocument) videos.push(...scan(frame.contentDocument)); } catch {}
    }
    return videos;
  };
  // A card shows the actual video element, not a screenshot or an inferred play icon.
  // Expanded mode removes these classes so the course page is fully interactive.
  let promoted = [];
  const compact = () => {
    if (window.__UXS_ACCOUNT_SUSPENDED__) {
      for (const video of scan(document)) video.pause();
    }
    for (const element of promoted) element.classList.remove("uxs-live-surface");
    promoted = [];
    if (!window.__UXS_TILE_MODE__) return;
    const videos = scan(document);
    const video = videos.find((v) => !v.paused && !v.ended) || videos.find((v) => v.currentTime > 0);
    if (!video) return;
    let element = video;
    while (element) {
      const doc = element.ownerDocument;
      if (!doc.getElementById("uxs-live-style")) {
        const style = doc.createElement("style");
        style.id = "uxs-live-style";
        style.textContent = ".uxs-live-surface{position:fixed!important;inset:0!important;margin:0!important;padding:0!important;border:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;z-index:2147483000!important;background:#111!important;object-fit:contain!important;}";
        (doc.head || doc.documentElement).appendChild(style);
      }
      element.classList.add("uxs-live-surface");
      promoted.push(element);
      try { element = doc.defaultView.frameElement; } catch { element = null; }
    }
  };
  const sample = () => {
    const videos = scan(document);
    const video = videos.find((v) => !v.paused && !v.ended) || videos[0];
    invoke("account_heartbeat", {
      mediaTime: video?.currentTime || 0, mediaDuration: Number.isFinite(video?.duration) ? video.duration : 0,
      mediaPaused: video?.paused ?? true, mediaSeen: Boolean(video),
      online: navigator.onLine, error: lastError,
    }).catch(() => {});
    lastError = "";
  };
  setInterval(sample, 5000);
  setInterval(compact, 1000);
  sample();
})();

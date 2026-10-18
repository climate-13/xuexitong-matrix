// Optional local diagnostics, enabled by the host's UXS_MEDIA_DIAGNOSTICS environment variable.
(() => {
  const marker = "uxs-media-diagnostic-v1";
  const send = (sample) => {
    if (window === window.top) console.info("[media-diagnostic]", JSON.stringify(sample));
    else window.parent.postMessage({ marker, sample }, "*");
  };
  window.addEventListener("message", (event) => {
    if (event.data?.marker !== marker) return;
    if (![...document.querySelectorAll("iframe,frame")].some((f) => f.contentWindow === event.source)) return;
    const sample = event.data.sample;
    if (sample && typeof sample.time === "number" && typeof sample.paused === "boolean") send(sample);
  });
  const report = (video, event) => send({
    event,
    wall: Date.now(),
    time: Number(video.currentTime.toFixed(2)),
    duration: Number.isFinite(video.duration) ? video.duration : null,
    paused: video.paused,
    ended: video.ended,
    ready: video.readyState,
    viewport: [innerWidth, innerHeight],
  });
  const attached = new WeakSet();
  setInterval(() => {
    for (const video of document.querySelectorAll("video")) {
      if (!attached.has(video)) {
        attached.add(video);
        for (const event of ["play", "pause", "waiting", "stalled", "ended"]) {
          video.addEventListener(event, () => report(video, event));
        }
      }
      report(video, "sample");
    }
  }, 10000);
})();

(() => {
  const channel = "uxue-course-list-metadata";
  const isChaoxing = (origin) =>
    /^https:\/\/(?:[^./]+\.)*chaoxing\.com$/.test(origin);
  const isMainSpace = (origin) =>
    isChaoxing(origin) && new URL(origin).hostname.split(".")[0] === "i";

  if (window === window.top) {
    if (!isMainSpace(window.location.origin)) return;

    window.addEventListener("message", (event) => {
      const data = event.data;
      if (data?.channel !== channel || !event.source || event.source === window ||
          !isChaoxing(event.origin)) return;

      if (data.kind === "ready") {
        event.source.postMessage({ channel, kind: "collect" }, event.origin);
      } else if (data.kind === "courses" && Array.isArray(data.courses)) {
        for (const { courseId, metadata } of data.courses) {
          if (typeof courseId !== "string" || !/^\d+$/.test(courseId) ||
              typeof metadata?.title !== "string" || !metadata.title ||
              typeof metadata?.cover !== "string" || !metadata.cover) continue;

          window.__TAURI_INTERNALS__.invoke("insert_course_meta_map", {
            courseId,
            metadata: { title: metadata.title, cover: metadata.cover },
          }).catch((error) => console.error("保存课程元数据失败:", error));
        }
      }
    });
    return;
  }

  if (!isChaoxing(window.location.origin)) return;

  const collect = () => {
    const sent = new Map();
    const scan = () => {
      const courses = [];
      for (const node of document.querySelectorAll("#courseList .course")) {
        const courseId = node.querySelector("input.courseId")?.value;
        const title = node.querySelector(".course-name")?.textContent.trim();
        const cover = node.querySelector(".course-cover img")?.src
          .replace(/\/star3\/.*?\//, "/star3/origin/");
        if (!courseId || !title || !cover) continue;

        const previous = sent.get(courseId);
        if (previous?.title === title && previous.cover === cover) continue;
        const metadata = { title, cover };
        sent.set(courseId, metadata);
        courses.push({ courseId, metadata });
      }
      if (courses.length) {
        window.top.postMessage({ channel, kind: "courses", courses }, topOrigin);
      }
    };

    scan();
    // 课程列表由 AJAX 填充，也可能因搜索/切换文件夹替换；持续观察其所在区域。
    const observer = new MutationObserver(scan);
    observer.observe(document.querySelector(".course-list-con") || document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["src", "value"],
    });
  };

  let topOrigin;
  const authorize = (event) => {
    if (event.source !== window.top || !isMainSpace(event.origin) ||
        event.data?.channel !== channel || event.data.kind !== "collect") return;

    window.removeEventListener("message", authorize);
    topOrigin = event.origin;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", collect, { once: true });
    } else {
      collect();
    }
  };
  window.addEventListener("message", authorize);
  // 跨域 iframe 无法读取 top.location，由顶层 MainSpace 授权后才采集。
  window.top.postMessage({ channel, kind: "ready" }, "*");
})();

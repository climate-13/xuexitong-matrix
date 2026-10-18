(() => {
  const preserveFocusState = () => {
    const blockedEvents = [
      "blur",
      "focusout",
      "mouseleave",
      "mouseout",
      "pagehide",
      "visibilitychange",
    ];

    // 1. 清理已有内联监听属性 (DOM Level 0)
    for (const evt of blockedEvents) {
      try {
        window[`on${evt}`] = null;
        document[`on${evt}`] = null;
      } catch (e) {
        console.error(`清理 ${evt} 事件监听失败:`, e);
      }
    }

    // 2. 捕获阶段强行掐断事件
    const stopPropagation = (e) => {
      e.stopImmediatePropagation();
      e.stopPropagation();
    };

    for (const evt of blockedEvents) {
      window.addEventListener(evt, stopPropagation, true);
      document.addEventListener(evt, stopPropagation, true);
    }

    // 3. 拦截后续动态 addEventListener
    const originalAdd = window.EventTarget.prototype.addEventListener;
    window.EventTarget.prototype.addEventListener = function (
      type,
      listener,
      options,
    ) {
      if (blockedEvents.includes(type)) return;
      return originalAdd.call(this, type, listener, options);
    };

    // 4. 伪造 Page Visibility 与 Focus API
    try {
      Object.defineProperty(document, "hidden", {
        get: () => false,
        configurable: true,
      });
      Object.defineProperty(document, "visibilityState", {
        get: () => "visible",
        configurable: true,
      });
      document.hasFocus = () => true;
    } catch (e) {
      console.error("伪造 Page Visibility 与 Focus API 失败:", e);
    }
  };

  preserveFocusState();

  if (window === window.top) {
    window.addEventListener("message", (e) => {
      if (e.data?.__uxue_navigate) {
        window.location.href = e.data.__uxue_navigate;
      }
    });
  }

  const safeNavigate = (url) => {
    if (!url || url.startsWith("javascript:")) return;
    try {
      window.top.location.href = url;
    } catch {
      window.top.postMessage({ __uxue_navigate: url }, "*");
    }
  };

  window.open = function (url) {
    if (url && typeof url === "string") {
      safeNavigate(url);
    }
    return window;
  };

  document.addEventListener(
    "click",
    (e) => {
      const eventTarget = e.target;
      if (!(eventTarget instanceof Element)) return;

      const link = eventTarget.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;

      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:"))
        return;

      const target = link.getAttribute("target") || link.target;
      if (target === "_blank" || target === "_top" || target === "_parent") {
        e.preventDefault();
        e.stopPropagation();
        safeNavigate(link.href);
      }
    },
    true,
  );
})();

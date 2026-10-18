import { runInNewContext } from "node:vm";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import script from "../src-tauri/src/scripts/course-list-metadata.js?raw";

const channel = "uxue-course-list-metadata";
const mainOrigin = "https://i.chaoxing.com";
const frameOrigin = "https://mooc2-ans.chaoxing.com";
const card = `<div class="course"><input class="courseId" value="265998423">
  <span class="course-name">军事理论课</span><div class="course-cover">
  <img src="https://p.cldisk.com/star3/d858860c4cef76155b5e62596693ead0/cover.jpg">
  </div></div>`;

function page(origin: string, top?: object) {
  const listeners = new Set<(event: unknown) => void>();
  const invoke = vi.fn().mockResolvedValue(null);
  const pageWindow = {
    location: { origin },
    top: undefined as unknown,
    postMessage: vi.fn(),
    addEventListener: (_: string, callback: (event: unknown) => void) => listeners.add(callback),
    removeEventListener: (_: string, callback: (event: unknown) => void) => listeners.delete(callback),
    __TAURI_INTERNALS__: { invoke },
  };
  pageWindow.top = top ?? pageWindow;
  const doc = document.implementation.createHTMLDocument();
  Object.defineProperty(doc, "readyState", { value: "complete", configurable: true });
  const observers: MutationObserver[] = [];
  class Observer extends MutationObserver {
    constructor(callback: MutationCallback) { super(callback); observers.push(this); }
  }
  return {
    pageWindow, doc, invoke,
    run: () => runInNewContext(script, {
      window: pageWindow, document: doc, URL, MutationObserver: Observer, console,
    }),
    receive: (source: object, sourceOrigin: string, data: object) => {
      for (const listener of listeners) listener({ source, origin: sourceOrigin, data });
    },
    dispose: () => observers.forEach((observer) => observer.disconnect()),
  };
}

describe("MainSpace iframe course metadata", () => {
  it("collects AJAX cards in a cross-origin iframe and saves through the top frame", async () => {
    const root = page(mainOrigin);
    const child = page(frameOrigin, root.pageWindow);
    root.run();
    child.run();
    expect(root.pageWindow.postMessage).toHaveBeenCalledWith({ channel, kind: "ready" }, "*");
    root.receive(child.pageWindow, frameOrigin, { channel, kind: "ready" });
    expect(child.pageWindow.postMessage).toHaveBeenCalledWith({ channel, kind: "collect" }, frameOrigin);
    child.receive(root.pageWindow, mainOrigin, { channel, kind: "collect" });

    child.doc.body.innerHTML = `<div id="courseList">${card}</div>`;
    await flushPromises();
    const calls = root.pageWindow.postMessage.mock.calls;
    const message = calls[calls.length - 1];
    expect(message[1]).toBe(mainOrigin);
    root.receive(child.pageWindow, frameOrigin, message[0]);
    expect(root.invoke).toHaveBeenCalledWith("insert_course_meta_map", {
      courseId: "265998423",
      metadata: {
        title: "军事理论课",
        cover: "https://p.cldisk.com/star3/origin/cover.jpg",
      },
    });
    expect(child.invoke).not.toHaveBeenCalled();

    root.pageWindow.postMessage.mockClear();
    child.doc.querySelector(".course")!.append(child.doc.createElement("i"));
    await flushPromises();
    expect(root.pageWindow.postMessage).not.toHaveBeenCalled();
    child.doc.querySelector(".course-name")!.textContent = "更新课程名称";
    await flushPromises();
    expect(root.pageWindow.postMessage.mock.calls[0][0].courses[0].metadata.title).toBe("更新课程名称");
    child.dispose();
  });

  it("does not authorize collection outside MainSpace or from foreign origins", () => {
    const root = page("https://mooc1.chaoxing.com");
    root.run();
    const source = { postMessage: vi.fn() };
    root.receive(source, frameOrigin, { channel, kind: "ready" });
    expect(source.postMessage).not.toHaveBeenCalled();

    const main = page(mainOrigin);
    main.run();
    main.receive(source, "https://chaoxing.com.example.com", { channel, kind: "ready" });
    expect(source.postMessage).not.toHaveBeenCalled();
    main.receive(source, "https://example.com", { channel, kind: "courses", courses: [] });
    expect(main.invoke).not.toHaveBeenCalled();
  });

  it("waits for authorization from the actual top frame and for DOM readiness", async () => {
    const root = page(mainOrigin);
    const child = page(frameOrigin, root.pageWindow);
    Object.defineProperty(child.doc, "readyState", { value: "loading" });
    child.doc.body.innerHTML = `<div id="courseList">${card}</div>`;
    child.run();
    root.pageWindow.postMessage.mockClear();
    child.receive({}, mainOrigin, { channel, kind: "collect" });
    child.receive(root.pageWindow, frameOrigin, { channel, kind: "collect" });
    await flushPromises();
    expect(root.pageWindow.postMessage).not.toHaveBeenCalled();
    child.receive(root.pageWindow, mainOrigin, { channel, kind: "collect" });
    expect(root.pageWindow.postMessage).not.toHaveBeenCalled();
    child.doc.dispatchEvent(new Event("DOMContentLoaded"));
    expect(root.pageWindow.postMessage).toHaveBeenCalledOnce();
    child.dispose();
  });
});

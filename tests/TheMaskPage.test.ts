import { flushPromises, mount } from "@vue/test-utils";
import { gsap } from "gsap";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import TheMaskPage from "@/TheMaskPage.vue";
import TheChaoxingMaskPage from "@/TheChaoxingMaskPage.vue";
import TheCourseProgressBar from "@/components/TheCourseProgressBar.vue";
import { commands } from "@/services/cmds";
import { emit, emitTo } from "@tauri-apps/api/event";

const events = vi.hoisted(
  () => new Map<string, (event?: { payload: unknown }) => void>(),
);
const timelineCompletions = vi.hoisted(() => [] as Array<() => void>);
const animationCompletions = vi.hoisted(() => [] as Array<() => void>);
const currentWebview = vi.hoisted(() => ({ label: "mask" }));

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async () => {}),
  emitTo: vi.fn(async () => {}),
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    label: currentWebview.label,
    listen: vi.fn(async (name: string, callback: () => void) => {
      events.set(name, callback);
      return () => events.delete(name);
    }),
  }),
}));

vi.mock("@/services/cmds", () => ({
  commands: {
    showContent: vi.fn(async () => {}),
    hideMask: vi.fn(async () => {}),
    cancelUpdateDownload: vi.fn(async () => true),
  },
}));

vi.mock("gsap", () => ({
  gsap: {
    timeline: vi.fn((options?: { onComplete?: () => void }) => {
      if (options?.onComplete) animationCompletions.push(options.onComplete);
      const timeline = {
        fromTo: vi.fn(),
        to: vi.fn(),
        then: vi.fn(
          (callback?: () => unknown) =>
            new Promise<unknown>((resolve, reject) => {
              timelineCompletions.push(() => {
                try {
                  resolve(callback?.());
                } catch (error) {
                  reject(error);
                }
              });
            }),
        ),
        kill: vi.fn(),
      };
      timeline.fromTo.mockImplementation(() => timeline);
      timeline.to.mockImplementation(() => timeline);
      return timeline;
    }),
    to: vi.fn(() => ({ kill: vi.fn() })),
    killTweensOf: vi.fn(),
  },
}));

afterEach(() => {
  events.clear();
  timelineCompletions.length = 0;
  animationCompletions.length = 0;
  currentWebview.label = "mask";
  vi.clearAllMocks();
});

describe("TheMaskPage", () => {
  it("shows a cancel-only updater dialog with the course progress bar", async () => {
    const wrapper = mount(TheMaskPage);
    await flushPromises();

    expect(emit).toHaveBeenCalledWith("mask-ready", {});
    expect(wrapper.find(".intro-mask").exists()).toBe(false);

    events.get("update-download-start")?.();
    await nextTick();
    const dialog = wrapper.find('[role="dialog"][aria-label="Downloading..."]');
    const buttons = wrapper.findAll("button");
    const progress = wrapper.findComponent(TheCourseProgressBar);
    expect(dialog.exists()).toBe(true);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].text()).toBe("取消");
    expect(progress.props("progress")).toBe(0);

    events.get("update-download-progress")?.({
      payload: { downloaded: 75, total: 100 },
    });
    await nextTick();
    expect(progress.props("progress")).toBe(75);
    expect(dialog.text()).toContain("75%");

    await buttons[0].trigger("click");
    expect(commands.cancelUpdateDownload).toHaveBeenCalledOnce();
    animationCompletions.shift()?.();
    await nextTick();
    expect(wrapper.find('[aria-label="Downloading..."]').exists()).toBe(false);
    expect(commands.hideMask).toHaveBeenCalledWith(false);
    wrapper.unmount();
  });

  it("keeps the task dialog open when the update download cannot be cancelled", async () => {
    vi.mocked(commands.cancelUpdateDownload).mockResolvedValueOnce(false);
    const wrapper = mount(TheMaskPage);
    await flushPromises();

    events.get("update-download-start")?.();
    await nextTick();
    await wrapper.find("button").trigger("click");

    expect(wrapper.find('[aria-label="Downloading..."]').exists()).toBe(true);
    expect(commands.hideMask).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("uses the same managed task dialog for the preview and hides it after cancellation", async () => {
    const wrapper = mount(TheMaskPage);
    await flushPromises();

    events.get("update-download-preview-start")?.();
    events.get("update-download-preview-progress")?.({ payload: 42 });
    await nextTick();
    expect(wrapper.find('[aria-label="Downloading..."]').text()).toContain(
      "42%",
    );

    await wrapper.find("button").trigger("click");
    animationCompletions.shift()?.();
    await nextTick();
    expect(emitTo).toHaveBeenCalledWith(
      "main",
      "update-download-preview-cancelled",
    );
    expect(wrapper.find('[aria-label="Downloading..."]').exists()).toBe(false);
    expect(commands.hideMask).toHaveBeenCalledWith(false);
    wrapper.unmount();
  });

  it("closes the download dialog when the exit animation starts and clears failed installs", async () => {
    const wrapper = mount(TheMaskPage);
    await flushPromises();

    events.get("update-download-start")?.();
    events.get("close-event")?.();
    await nextTick();

    expect(wrapper.find('[aria-label="Downloading..."]').exists()).toBe(false);
    expect(wrapper.find(".closing-mask").exists()).toBe(true);

    events.get("close-cancelled")?.();
    events.get("update-download-failed")?.();
    await nextTick();
    expect(wrapper.find(".closing-mask").exists()).toBe(false);
    expect(wrapper.find('[aria-label="Downloading..."]').exists()).toBe(false);
    expect(commands.hideMask).toHaveBeenCalledWith(false);
    wrapper.unmount();
  });

  it("mounts the intro for the start event and removes it after completion", async () => {
    let resolveShowContent: (value: null) => void = () => {};
    vi.mocked(commands.showContent).mockImplementationOnce(
      () =>
        new Promise<null>((resolve) => {
          resolveShowContent = resolve;
        }),
    );
    const wrapper = mount(TheMaskPage);
    await flushPromises();

    expect(commands.showContent).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith("mask-ready", {});
    expect(wrapper.findAll(".mask-layer")).toHaveLength(0);

    events.get("start-event")?.();
    await nextTick();

    expect(wrapper.find(".intro-mask").exists()).toBe(true);
    expect(gsap.timeline).toHaveBeenCalledOnce();
    expect(commands.hideMask).not.toHaveBeenCalled();

    const timeline = vi.mocked(gsap.timeline).mock.results[0]?.value;
    expect(vi.mocked(timeline.to)).not.toHaveBeenCalled();
    timelineCompletions.shift()?.();
    await flushPromises();
    expect(commands.showContent).toHaveBeenCalledOnce();
    expect(vi.mocked(timeline.to)).not.toHaveBeenCalled();

    resolveShowContent(null);
    await flushPromises();
    expect(vi.mocked(timeline.to)).toHaveBeenCalledTimes(4);

    timelineCompletions.shift()?.();
    await flushPromises();

    expect(wrapper.find(".intro-mask").exists()).toBe(false);
    expect(commands.hideMask).toHaveBeenCalledWith(true);

    wrapper.unmount();
    expect(events.size).toBe(0);
  });

  it("stacks later animations above earlier ones and keeps the close layer", async () => {
    const wrapper = mount(TheMaskPage);
    await flushPromises();

    events.get("start-event")?.();
    events.get("close-event")?.();
    await nextTick();

    const layers = wrapper.findAll(".mask-layer");
    expect(layers).toHaveLength(2);
    expect(layers[0].find(".intro-mask").exists()).toBe(true);
    expect(layers[1].find(".closing-mask").exists()).toBe(true);
    expect(gsap.to).toHaveBeenCalledOnce();

    timelineCompletions.shift()?.();
    await flushPromises();
    timelineCompletions.shift()?.();
    await flushPromises();

    expect(wrapper.findAll(".mask-layer")).toHaveLength(1);
    expect(wrapper.find(".closing-mask").exists()).toBe(true);

    wrapper.unmount();
  });

  it.each([
    ["main Yes", TheMaskPage, true],
    ["main No", TheMaskPage, false],
    ["chaoxing Yes", TheChaoxingMaskPage, true],
    ["chaoxing No", TheChaoxingMaskPage, false],
  ])(
    "shows a confirmation on %s and reports the choice after its exit animation",
    async (_name, Page, choice) => {
      currentWebview.label = _name.startsWith("chaoxing")
        ? "chaoxing-mask"
        : "mask";
      const wrapper = mount(Page);
      await flushPromises();
      expect(wrapper.findAll(".mask-layer")).toHaveLength(0);

      events.get("confirmation-pop-up")?.({
        payload: "Continue?",
      });
      await nextTick();
      expect(wrapper.find('[role="dialog"]').text()).toContain("Continue?");
      expect(emitTo).not.toHaveBeenCalled();

      await wrapper.findAll("button")[choice ? 0 : 1].trigger("click");
      expect(emitTo).not.toHaveBeenCalled();
      animationCompletions.shift()?.();
      await nextTick();

      expect(emitTo).toHaveBeenCalledWith(
        currentWebview.label,
        "confirmation-result",
        choice,
      );
      expect(wrapper.findAll(".mask-layer")).toHaveLength(0);
      wrapper.unmount();
    },
  );

  it("dismisses the old Chaoxing confirmation on navigation and allows a new confirmation", async () => {
    currentWebview.label = "chaoxing-mask";
    const wrapper = mount(TheChaoxingMaskPage);
    await flushPromises();
    events.get("confirmation-pop-up")?.({ payload: "Old page" });
    await nextTick();
    expect(wrapper.find('[role="dialog"]').text()).toContain("Old page");

    events.get("confirmation-dismissed")?.();
    await nextTick();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(emitTo).toHaveBeenCalledExactlyOnceWith(
      "chaoxing-mask",
      "confirmation-result",
      false,
    );

    events.get("confirmation-pop-up")?.({ payload: "New page" });
    await nextTick();
    expect(wrapper.find('[role="dialog"]').text()).toContain("New page");
    await wrapper.findAll("button")[0].trigger("click");
    animationCompletions.shift()?.();
    await nextTick();
    expect(emitTo).toHaveBeenLastCalledWith(
      "chaoxing-mask",
      "confirmation-result",
      true,
    );
    wrapper.unmount();
    expect(events.size).toBe(0);
  });

  it("kills an unfinished confirmation exit animation when navigation dismisses it", async () => {
    currentWebview.label = "chaoxing-mask";
    const wrapper = mount(TheChaoxingMaskPage);
    await flushPromises();
    events.get("confirmation-pop-up")?.({ payload: "Old page" });
    await nextTick();
    await wrapper.findAll("button")[0].trigger("click");
    const results = vi.mocked(gsap.timeline).mock.results;
    const closing = results[results.length - 1]?.value;
    expect(emitTo).not.toHaveBeenCalled();

    events.get("confirmation-dismissed")?.();
    await nextTick();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(closing.kill).toHaveBeenCalledOnce();
    expect(emitTo).toHaveBeenCalledExactlyOnceWith(
      "chaoxing-mask",
      "confirmation-result",
      false,
    );
    wrapper.unmount();
  });

  it("does not send a cancellation result when navigation has no pending confirmation", async () => {
    currentWebview.label = "chaoxing-mask";
    const wrapper = mount(TheChaoxingMaskPage);
    await flushPromises();
    events.get("confirmation-dismissed")?.();
    await nextTick();
    expect(emitTo).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("keeps main-window confirmations independent of Chaoxing navigation", async () => {
    const wrapper = mount(TheMaskPage);
    await flushPromises();
    events.get("confirmation-pop-up")?.({ payload: "Main window" });
    await nextTick();
    expect(events.has("confirmation-dismissed")).toBe(false);
    expect(wrapper.find('[role="dialog"]').text()).toContain("Main window");
    expect(emitTo).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

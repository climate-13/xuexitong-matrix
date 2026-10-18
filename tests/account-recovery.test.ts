import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import AccountStudio from "../src/components/AccountStudio.vue";

const mocks = vi.hoisted(() => ({
  reload: vi.fn(), navigate: vi.fn(), layout: vi.fn().mockResolvedValue(null),
  listeners: new Map<string, (event: { payload: string }) => void>(),
}));
vi.mock("@/services/cmds", () => ({ commands: {
  accountReload: mocks.reload, accountNavigate: mocks.navigate, accountLayout: mocks.layout,
} }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async (name, callback) => {
  mocks.listeners.set(name, callback);
  return () => mocks.listeners.delete(name);
}) }));
vi.mock("../src/components/SharedSettings.vue", () => ({ default: { template: "<div>设置</div>" } }));
vi.mock("@/composables/useAccounts", () => ({
  mediaTime: () => "00:00",
  useAccounts: () => {
    const error = ref("");
    return {
      accounts: ref([1, 2].map((id) => ({ id, name: "账号 " + id, url: "https://i.mooc.chaoxing.com/", phase: "就绪" }))),
      running: ref(0), pending: ref(0), busy: ref(false), clock: ref(Date.now()), error,
      perform: async (action: () => Promise<unknown>) => {
        error.value = "";
        try { await action(); } catch (cause) { error.value = String(cause); }
      },
      refresh: vi.fn(), add: vi.fn(), run: vi.fn(), batch: vi.fn(), remove: vi.fn(),
    };
  },
}));

describe("account page recovery", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    mocks.reload.mockReset().mockResolvedValue(null);
    mocks.listeners.clear();
  });

  it("reloads only the selected account and keeps its expanded controls", async () => {
    const wrapper = mount(AccountStudio);
    await wrapper.findAll(".live-caption button")[3]!.trigger("click");
    await flushPromises();
    await wrapper.findAll(".expanded-tools button")[0]!.trigger("click");
    await flushPromises();
    expect(mocks.reload).toHaveBeenCalledExactlyOnceWith(2);
    expect(wrapper.find(".expanded-layer h2").text()).toBe("账号 2");
    expect(wrapper.find(".expanded-tools").text()).toContain("返回拼盘");
    await wrapper.findAll(".expanded-tools button")[1]!.trigger("click");
    await flushPromises();
    expect(mocks.navigate).toHaveBeenCalledWith(2, "https://i.mooc.chaoxing.com/");
    wrapper.unmount();
  });

  it("returns to the overview on the native recovery event and cleans up listeners", async () => {
    const wrapper = mount(AccountStudio);
    await wrapper.findAll(".live-caption button")[1]!.trigger("click");
    await flushPromises();
    mocks.listeners.get("manager-overview")!({ payload: "" });
    await flushPromises();
    expect(wrapper.find(".expanded-layer").exists()).toBe(false);
    expect(mocks.reload).not.toHaveBeenCalled();
    wrapper.unmount();
    expect(mocks.listeners.size).toBe(0);
  });

  it("shows a reload failure inside the expanded page without removing recovery buttons", async () => {
    mocks.reload.mockRejectedValue(new Error("重载失败"));
    const wrapper = mount(AccountStudio);
    await wrapper.findAll(".live-caption button")[1]!.trigger("click");
    await wrapper.findAll(".expanded-tools button")[0]!.trigger("click");
    await flushPromises();
    expect(wrapper.find(".recovery-error").text()).toContain("重载失败");
    expect(wrapper.find(".expanded-tools").text()).toContain("返回拼盘");
    wrapper.unmount();
  });
});

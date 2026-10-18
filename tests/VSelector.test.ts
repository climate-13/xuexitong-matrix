import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import VSelector from "@/components/base/VSelector.vue";

function createSelector() {
  return mount(VSelector, {
    props: {
      data: {
        label: "Provider",
        selectedIndex: 0,
        mutable: true,
        items: [
          { label: "Default", mutable: false },
          { label: "Custom", mutable: true },
        ],
      },
      methods: {
        select: vi.fn(),
        create: vi.fn(),
        edit: vi.fn(),
        remove: vi.fn(),
      },
    },
  });
}

describe("VSelector", () => {
  it("selects an option from the opened dropdown", async () => {
    const wrapper = createSelector();
    const methods = wrapper.props("methods");

    await wrapper.get(".select-trigger").trigger("click");
    await wrapper.get("button.option-label:nth-child(1)").trigger("click");

    expect(methods.select).toHaveBeenCalledWith(0);
  });

  it("passes a new item's draft to the create method", async () => {
    const wrapper = createSelector();
    const methods = wrapper.props("methods");

    await wrapper.get(".select-trigger").trigger("click");
    await wrapper.get('button[aria-label="New"]').trigger("click");
    await wrapper.get("input").setValue("  Added provider  ");
    await wrapper.get('button[aria-label="Save"]').trigger("click");

    expect(methods.create).toHaveBeenCalledWith("  Added provider  ");
  });

  it("does not submit an empty draft", async () => {
    const wrapper = createSelector();
    const methods = wrapper.props("methods");

    await wrapper.get(".select-trigger").trigger("click");
    await wrapper.get('button[aria-label="New"]').trigger("click");
    await wrapper.get("input").setValue("   ");
    await wrapper.get('button[aria-label="Save"]').trigger("click");

    expect(methods.create).not.toHaveBeenCalled();
  });
});

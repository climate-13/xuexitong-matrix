import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLLMProviders } from "@/composables/useLLMProviders";
import type { LLMProvider } from "@/services/cmds";

const commandMocks = vi.hoisted(() => ({
  providers: vi.fn(),
  currentProvider: vi.fn(),
  upsertProvider: vi.fn(),
  switchProvider: vi.fn(),
  removeProvider: vi.fn(),
  switchModel: vi.fn(),
}));

vi.mock("@/services/cmds", () => ({ commands: commandMocks }));

function makeProvider(overrides: Partial<LLMProvider> = {}): LLMProvider {
  return {
    name: "Default",
    isCustom: false,
    protocol: "OpenAIChatCompletions",
    baseUrl: "https://api.example.com/v1",
    apiKey: null,
    models: ["default-model"],
    chosenModel: 0,
    ...overrides,
  };
}

async function mountComposable() {
  let state!: ReturnType<typeof useLLMProviders>;
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useLLMProviders();
        return {};
      },
      template: "<div />",
    }),
  );

  await flushPromises();
  return { state, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
  commandMocks.providers.mockResolvedValue([]);
  commandMocks.currentProvider.mockResolvedValue("");
  commandMocks.upsertProvider.mockResolvedValue(null);
  commandMocks.switchProvider.mockResolvedValue(null);
  commandMocks.removeProvider.mockResolvedValue(null);
  commandMocks.switchModel.mockResolvedValue(null);
});

describe("useLLMProviders", () => {
  it("loads providers and derives the active provider and model data", async () => {
    const defaultProvider = makeProvider();
    const customProvider = makeProvider({
      name: "Custom",
      isCustom: true,
      models: ["custom-model"],
    });
    commandMocks.providers.mockResolvedValue([defaultProvider, customProvider]);
    commandMocks.currentProvider.mockResolvedValue("Custom");

    const { state } = await mountComposable();

    expect(state.selectedProvider.value).toEqual(customProvider);
    expect(state.providerData.value.items).toEqual([
      { label: "Default", mutable: false },
      { label: "Custom", mutable: true },
    ]);
    expect(state.modelData.value).toMatchObject({
      selectedIndex: 0,
      mutable: true,
      items: [{ label: "custom-model", mutable: true }],
    });
  });

  it("restores a built-in provider when the stored ID differs only by case", async () => {
    const defaultProvider = makeProvider({ name: "BigModel" });
    const deepSeekProvider = makeProvider({ name: "DeepSeek" });
    commandMocks.providers.mockResolvedValue([
      defaultProvider,
      deepSeekProvider,
    ]);
    commandMocks.currentProvider.mockResolvedValue("deepseek");

    const { state } = await mountComposable();

    expect(state.selectedProvider.value).toEqual(deepSeekProvider);
  });

  it("trims and persists a new provider before selecting it", async () => {
    const defaultProvider = makeProvider();
    commandMocks.providers.mockResolvedValue([defaultProvider]);
    commandMocks.currentProvider.mockResolvedValue("Default");

    const { state } = await mountComposable();

    await state.addProvider("  Custom  ");

    expect(commandMocks.upsertProvider).toHaveBeenCalledWith({
      name: "Custom",
      isCustom: true,
      protocol: "OpenAIChatCompletions",
      baseUrl: "https://api.example.com/v1",
      apiKey: null,
      models: [],
      chosenModel: null,
    });
    expect(commandMocks.switchProvider).toHaveBeenCalledWith("Custom");
    expect(state.selectedProvider.value?.name).toBe("Custom");
  });

  it("keeps the chosen model index consistent when deleting a model", async () => {
    const provider = makeProvider({
      name: "Custom",
      isCustom: true,
      models: ["first", "second", "third"],
      chosenModel: 2,
    });
    commandMocks.providers.mockResolvedValue([provider]);
    commandMocks.currentProvider.mockResolvedValue("Custom");

    const { state } = await mountComposable();

    await state.deleteModel(1);

    expect(state.selectedProvider.value?.models).toEqual(["first", "third"]);
    expect(state.selectedProvider.value?.chosenModel).toBe(1);
    expect(commandMocks.upsertProvider).toHaveBeenCalledWith(provider);
  });
});

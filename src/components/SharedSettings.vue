<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { commands, type LLMProvider, type OptionsConfig } from "@/services/cmds";
const emit = defineEmits<{ close: []; saved: [] }>();
const providers = ref<LLMProvider[]>([]);
const chosen = ref("");
const model = ref(0);
const key = ref("");
const customUrl = ref("");
const customModel = ref("");
const error = ref("");
const saving = ref(false);
const options = ref<OptionsConfig>({ muteWebview: true, speedLock: false, speedValue: 2 });
const selected = computed(() => providers.value.find((p) => p.name === chosen.value));
onMounted(async () => {
  try {
    providers.value = await commands.providers();
    const current = await commands.currentProvider();
    chosen.value = providers.value.find((p) => p.name.toLowerCase() === current.toLowerCase())?.name || providers.value[0]?.name || "";
    model.value = selected.value?.chosenModel ?? 0;
    options.value = await commands.options();
  } catch (cause) { error.value = String(cause); }
});
async function save() {
  saving.value = true; error.value = "";
  try {
    if (chosen.value === "__custom") {
      if (!customModel.value.trim()) throw new Error("请填写模型名称");
      const url = new URL(customUrl.value);
      if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("公网 API 地址请使用 HTTPS");
      await commands.upsertProvider({
        name: "共享自定义接口", isCustom: true, protocol: "OpenAIChatCompletions",
        baseUrl: customUrl.value.trim().replace(/\/$/, ""), apiKey: key.value.trim() || null,
        models: [customModel.value.trim()], chosenModel: 0,
      });
      await commands.switchProvider("共享自定义接口");
    } else {
      await commands.switchProvider(chosen.value);
      await commands.switchModel(model.value);
      if (key.value.trim()) await commands.setKey(key.value);
    }
    await commands.setOptions(options.value);
    await commands.saveConfig();
    key.value = ""; emit("saved");
  } catch (cause) { error.value = String(cause); }
  finally { saving.value = false; }
}
</script>

<template>
  <section class="settings">
    <div class="eyebrow">ONE CONFIGURATION. EVERY ACCOUNT.</div>
    <h2>只配置一次。</h2>
    <p class="intro">所有账号共用同一个 API 和模型，请求统一排队。视频播放不需要 API。</p>
    <div class="form-grid">
      <label>API 提供商<select v-model="chosen" aria-label="API 提供商" @change="model = selected?.chosenModel ?? 0">
        <option v-for="p in providers" :key="p.name" :value="p.name">{{ p.name }}</option>
        <option value="__custom">自定义 OpenAI 兼容接口</option>
      </select></label>
      <label v-if="chosen !== '__custom'">模型<select v-model="model" aria-label="模型"><option v-for="(m, index) in selected?.models" :key="m" :value="index">{{ m }}</option></select></label>
      <template v-else>
        <label>API 基础地址<input v-model="customUrl" placeholder="https://example.com/v1" /></label>
        <label>模型名称<input v-model="customModel" placeholder="填写接口支持的模型" /></label>
      </template>
      <label class="wide">API Key<input v-model="key" type="password" autocomplete="new-password" :placeholder="chosen === '__custom' ? '填写密钥，本地免密接口可留空' : '留空保留当前提供商已保存的密钥'" /></label>
      <label>视频速度<input v-model.number="options.speedValue" type="number" min="0.5" max="16" step="0.5" /></label>
      <div class="switches"><label><input v-model="options.muteWebview" type="checkbox" /> 自动静音</label><label><input v-model="options.speedLock" type="checkbox" /> 锁定设置的倍速</label></div>
    </div>
    <p class="small">设置对之后启动的任务生效。共享接口最多同时发起 3 个请求；费用与额度由所选提供商决定。</p>
    <p v-if="error" class="error">{{ error }}</p>
    <div class="dialog-actions"><button class="secondary" @click="emit('close')">取消</button><button class="primary" :disabled="saving" @click="save">{{ saving ? "保存中…" : "保存到所有账号" }}</button></div>
  </section>
</template>

<style scoped>
.settings { padding: 38px; }
.eyebrow { font-size: 10px; letter-spacing: .17em; color: #8a8e84; }
h2 { margin: 12px 0; font-size: 34px; letter-spacing: -.04em; }
.intro,.small { color: #80827b; font-size: 13px; line-height: 1.8; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 30px 0 18px; }
label { display: flex; flex-direction: column; gap: 9px; font-size: 12px; color: #666b61; }
input:not([type=checkbox]),select { width: 100%; height: 45px; padding: 0 13px; border-radius: 12px; border: 1px solid #e2e5dc; background: #f8f9f5; color: #262b22; outline-color: #7b8f65; }
.wide { grid-column: 1/-1; }
.switches { display: flex; flex-direction: column; gap: 12px; justify-content: center; }
.switches label { flex-direction: row; align-items: center; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
.error { color: #ac4c3e; font-size: 13px; }
</style>

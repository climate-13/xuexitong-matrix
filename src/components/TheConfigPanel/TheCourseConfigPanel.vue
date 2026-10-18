<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import VInput from "@/components/base/VInput.vue";
import VToggle from "@/components/base/VToggle.vue";
import { commands, type OptionsConfig } from "@/services/cmds";
import { showError } from "@/services/errors";

const options = ref<OptionsConfig>();
const speedValue = computed<number>({
  get: () => options.value?.speedValue ?? 1,
  set: (value) => {
    options.value!.speedValue = value;
  },
});
const saveOptions = () =>
  commands
    .setOptions(options.value!)
    .catch((cause) => showError("保存课程配置失败:", cause));

onMounted(async () => {
  options.value = await commands.options();
});
</script>

<template>
  <div class="course-config-panel">
    <div
      v-if="options"
      class="settings-container"
    >
      <VToggle
        :model-value="options.muteWebview ?? false"
        label="Mute Course"
        annotation="开启后自动静音课程视频；关闭后按课程页面的音量播放。"
        class="option"
        @update:model-value="
          options.muteWebview = $event;
          saveOptions();
        "
      />
      <VToggle
        :model-value="options.speedLock ?? false"
        label="Lock Playspeed"
        annotation="开启后，视频开始播放时会强制使用下方设置的倍速，并阻止课程页面修改；关闭后由课程页面控制倍速。"
        class="option"
        @update:model-value="
          options.speedLock = $event;
          saveOptions();
        "
      />
      <VInput
        id="playing-speed-input"
        v-model.number="speedValue"
        placeholder="例如 1.5 或 2"
        label="Playing Speed"
        annotation="填写视频倍速，例如 1.5 或 2。只有开启“Lock Playspeed”后，这个数值才会强制应用。"
        aria-label=""
        class="option speed-input"
        @change="saveOptions"
      />
    </div>
  </div>
</template>

<style scoped>
.course-config-panel {
  height: 100%;
  flex: 1;
  flex-direction: column;
  display: flex;
}
.settings-container {
  flex: 1;
  display: flex;
  gap: 5%;
  flex-direction: column;
}
.option {
  height: 15%;
}
.speed-input :deep(.input-field) {
  text-align: center;
}
</style>

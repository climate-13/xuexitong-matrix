<script setup lang="ts">
import { emitTo } from "@tauri-apps/api/event";
import { gsap } from "gsap";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import TheCourseProgressBar from "@/components/TheCourseProgressBar.vue";
import { useScaleFeedback } from "@/composables/useScaleFeedback";
import { commands } from "@/services/cmds";
import { showError } from "@/services/errors";

const props = defineProps<{
  preview?: boolean;
  downloadProgress?: { downloaded: number; total: number | null };
  previewProgress?: number;
  failed?: boolean;
}>();

const emit = defineEmits<{ finished: [] }>();
const title = "Downloading...";
const backdrop = ref<HTMLElement | null>(null);
const dialog = ref<HTMLElement | null>(null);
let animation: gsap.core.Timeline | null = null;
let closing = false;
const progress = computed(() => {
  if (props.preview) return props.previewProgress ?? 0;
  if (!props.downloadProgress) return 0;
  const { downloaded, total } = props.downloadProgress;
  return total
    ? Math.min(100, Math.floor((downloaded / total) * 100))
    : undefined;
});
const percent = computed(() =>
  progress.value === undefined
    ? "—"
    : `${Math.round(Math.min(Math.max(progress.value, 0), 100))}%`,
);
const scaleFeedback = useScaleFeedback({ hoverScale: 1.25 });
const cancelling = ref(false);

onMounted(() => {
  animation = gsap
    .timeline()
    .fromTo(backdrop.value, { opacity: 0 }, { opacity: 1, duration: 0.25 }, 0)
    .fromTo(
      dialog.value,
      { opacity: 0, y: "4vh", scale: 0.96 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.42,
        ease: "power3.out",
      },
      0.08,
    );
});

const finish = () => {
  if (closing) return;
  closing = true;
  animation?.kill();
  animation = gsap
    .timeline({ onComplete: () => emit("finished") })
    .to(
      dialog.value,
      { opacity: 0, y: "-3vh", scale: 0.97, duration: 0.28, ease: "power2.in" },
      0,
    )
    .to(backdrop.value, { opacity: 0, duration: 0.3 }, 0.05);
};

watch(
  () => props.failed,
  (failed) => {
    if (failed) finish();
  },
);

const cancel = async () => {
  if (cancelling.value) return;
  cancelling.value = true;
  try {
    let cancelled: boolean;
    if (props.preview) {
      await emitTo("main", "update-download-preview-cancelled");
      cancelled = true;
    } else {
      cancelled = await commands.cancelUpdateDownload();
    }
    if (cancelled) finish();
  } catch (error) {
    void showError("取消更新下载失败：", error);
  } finally {
    cancelling.value = false;
  }
};

onUnmounted(() => animation?.kill());
</script>

<template>
  <div
    ref="backdrop"
    class="backdrop"
  >
    <section
      ref="dialog"
      class="dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
    >
      <header class="header">
        <span>{{ title }}</span>
      </header>
      <div class="progress">
        <TheCourseProgressBar :progress="progress ?? 0" />
        <span class="percentage">{{ percent }}</span>
      </div>
      <div class="actions">
        <button
          type="button"
          :disabled="cancelling"
          @click="cancel"
          @pointerenter="scaleFeedback.handlePointerEnter"
          @pointerleave="scaleFeedback.handlePointerLeave"
          @pointerdown="scaleFeedback.handlePointerDown"
          @pointerup="scaleFeedback.handlePointerUp"
        >
          取消
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.backdrop {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4vmin;
  box-sizing: border-box;
  background: rgb(0 0 0 / 55%);
  pointer-events: auto;
}

.dialog {
  width: 30%;
  height: 18%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 1vmin 2vmin;
  border-radius: 1.25em;
  font-size: 1.8vmin;
  color: var(--theme-brand);
  background: var(--theme-page-gradient);
  box-shadow: 0 12px 40px rgb(0 0 0 / 25%);
}

.header {
  position: absolute;
  top: 7.5%;
  left: 5%;
  font-size: 1.15em;
}

.progress {
  width: 85%;
  height: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1vmin;
}

.percentage {
  flex: 0 0 auto;
  min-width: 3em;
  text-align: right;
}

.actions {
  position: absolute;
  right: 2vmin;
  bottom: 1vmin;
  display: flex;
}

.actions button {
  width: 4.4em;
  height: 2em;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--theme-brand);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.actions button:disabled {
  cursor: wait;
}
</style>

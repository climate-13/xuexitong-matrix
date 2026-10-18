<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from "vue";

const props = defineProps<{
  anchor: HTMLElement | null;
  anchorY: number;
  id: string;
  text: string;
  visible: boolean;
}>();
const emit = defineEmits<{
  pointerenter: [];
  pointerleave: [];
}>();

const tooltip = ref<HTMLElement | null>(null);
const tooltipStyle = ref<Record<string, string>>({});
const positionSide = ref<"left" | "right">("right");
let positionFrame: number | undefined;

const setPosition = async () => {
  if (!props.visible || !props.anchor) return;
  await nextTick();
  const element = tooltip.value;
  if (!element) return;

  const triggerRect = props.anchor.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const margin = 10;
  const gap = 12;
  const nextSide =
    triggerRect.right + gap + rect.width <= window.innerWidth - margin
      ? "right"
      : "left";
  if (positionSide.value !== nextSide) positionSide.value = nextSide;
  const left =
    nextSide === "right"
      ? triggerRect.right + gap
      : triggerRect.left - rect.width - gap;
  const top = Math.max(
    margin,
    Math.min(
      props.anchorY - 14,
      window.innerHeight - rect.height - margin,
    ),
  );
  const nextStyle = {
    left: `${Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin))}px`,
    top: `${top}px`,
    "--arrow-y": `${Math.max(12, Math.min(props.anchorY - top, rect.height - 12))}px`,
  };
  if (
    Object.entries(nextStyle).some(
      ([key, value]) => tooltipStyle.value[key] !== value,
    )
  ) {
    tooltipStyle.value = nextStyle;
  }
};

const schedulePositionUpdate = () => {
  if (positionFrame !== undefined) return;
  positionFrame = requestAnimationFrame(() => {
    positionFrame = undefined;
    void setPosition();
  });
};

watch(
  () => [props.anchor, props.anchorY] as const,
  schedulePositionUpdate,
  { flush: "post" },
);

const stopTrackingPosition = () => {
  window.removeEventListener("resize", schedulePositionUpdate);
  window.removeEventListener("scroll", schedulePositionUpdate, true);
  if (positionFrame !== undefined) {
    cancelAnimationFrame(positionFrame);
    positionFrame = undefined;
  }
};

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      stopTrackingPosition();
      return;
    }
    window.addEventListener("resize", schedulePositionUpdate);
    window.addEventListener("scroll", schedulePositionUpdate, true);
    schedulePositionUpdate();
  },
  { immediate: true, flush: "post" },
);

onUnmounted(() => {
  stopTrackingPosition();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="label-annotation">
      <div
        v-if="text"
        v-show="visible"
        :id="id"
        ref="tooltip"
        class="label-annotation"
        :class="`side-${positionSide}`"
        :style="tooltipStyle"
        role="tooltip"
        @pointerenter="emit('pointerenter')"
        @pointerleave="emit('pointerleave')"
      >
        {{ text }}
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.label-annotation {
  --annotation-background: conic-gradient(
    from 145deg at 50% 0%,
    color-mix(in srgb, var(--theme-brand), var(--theme-black) 25%) 0deg,
    var(--theme-brand) 160deg,
    color-mix(in srgb, var(--theme-brand), var(--theme-white) 75%) 180deg,
    var(--theme-brand) 200deg,
    color-mix(in srgb, var(--theme-brand), var(--theme-black) 25%) 360deg
  );
  position: fixed;
  z-index: 10000;
  width: max-content;
  max-width: min(320px, calc(100vw - 20px));
  box-sizing: border-box;
  padding: 14px 18px;
  font-size: 1.1rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
  color: var(--theme-surface);
  background: var(--annotation-background);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--theme-black) 20%, transparent);
  pointer-events: auto;
}

.label-annotation::before {
  content: "";
  position: absolute;
  width: 12px;
  height: 18px;
  background: var(--annotation-background);
}

.side-right::before,
.side-left::before {
  top: var(--arrow-y, 50%);
}

.side-right::before {
  left: -11px;
  clip-path: polygon(100% 0, 100% 100%, 0 50%);
}

.side-left::before {
  right: -11px;
  clip-path: polygon(0 0, 100% 50%, 0 100%);
}

.label-annotation-enter-active,
.label-annotation-leave-active {
  transition:
    opacity 160ms ease,
    transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.label-annotation-enter-from,
.label-annotation-leave-to {
  opacity: 0;
  transform: scaleX(0.15);
}
</style>

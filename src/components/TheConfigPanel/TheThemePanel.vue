<script setup lang="ts">
import { nextTick } from "vue";
import { useScaleFeedback } from "@/composables/useScaleFeedback";
import { commands } from "@/services/cmds";
import { showError } from "@/services/errors";
import { activeTheme, setTheme, themeNames, themes } from "@/theme";
import type { CSSProperties } from "vue";
import type { ThemeName } from "@/theme";

const scaleFeedback = useScaleFeedback({
  hoverScale: 1.1,
  pressScale: 0.9,
  targetSelector: ".theme-name",
});

const themeStyle = (name: ThemeName): CSSProperties => {
  const colors = themes[name];
  return {
    "--button-color": colors.brand,
    "--theme-page-gradient": `linear-gradient(135deg, ${colors.surface} 0%, ${colors.surfaceLight} 100%)`,
  } as CSSProperties;
};

const selectTheme = async (name: ThemeName) => {
  void setTheme(name).catch((cause) =>
    console.error("Failed to broadcast color theme:", cause),
  );
  await commands
    .setTheme(name)
    .catch((cause) => showError("Failed to update theme:", cause));
};

const handleThemeKeydown = (event: KeyboardEvent, index: number) => {
  if (themeNames.length === 0) return;

  let nextIndex: number | undefined;
  if (event.key === "ArrowDown" || event.key === "ArrowRight") {
    nextIndex = (index + 1) % themeNames.length;
  } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
    nextIndex = (index - 1 + themeNames.length) % themeNames.length;
  } else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = themeNames.length - 1;

  if (nextIndex === undefined) return;
  event.preventDefault();
  const name = themeNames[nextIndex];
  void selectTheme(name);
  void nextTick(() => document.getElementById(`theme-option-${name}`)?.focus());
};
</script>

<template>
  <div class="theme-panel">
    <div
      class="theme-list custom-scrollbar"
      role="radiogroup"
      aria-label="Color theme"
      aria-orientation="vertical"
    >
      <button
        v-for="(name, index) in themeNames"
        :id="`theme-option-${name}`"
        :key="name"
        type="button"
        role="radio"
        class="theme-option"
        :style="themeStyle(name)"
        :aria-checked="activeTheme === name"
        :tabindex="activeTheme === name ? 0 : -1"
        @click="selectTheme(name)"
        @keydown="handleThemeKeydown($event, index)"
        @pointerenter="scaleFeedback.handlePointerEnter"
        @pointerleave="scaleFeedback.handlePointerLeave"
        @pointerdown="scaleFeedback.handlePointerDown"
        @pointerup="scaleFeedback.handlePointerUp"
      >
        <span class="theme-name">{{ name }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.theme-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.theme-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior-y: contain;
}

.theme-option {
  position: relative;
  flex: 0 0 33%;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  color: var(--button-color);
  background: transparent;
  cursor: pointer;
}

.theme-option::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--theme-page-gradient);
  /* Mask black means opaque, independent of the theme's appearance mode. */
  -webkit-mask-image: linear-gradient(
    to right,
    transparent,
    #000 40%,
    #000 60%,
    transparent
  );
  mask-image: linear-gradient(
    to right,
    transparent,
    #000 40%,
    #000 60%,
    transparent
  );
  opacity: 0.25;
  clip-path: inset(0 50%);
  transition:
    clip-path 250ms ease,
    opacity 250ms ease;
}

.theme-option:hover::before {
  opacity: 1;
  clip-path: inset(0);
}

.theme-name {
  position: relative;
  font-size: 1.75rem;
  text-transform: capitalize;
}
</style>

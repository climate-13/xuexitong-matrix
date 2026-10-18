import { createApp } from "vue";
import TheMaskPage from "./TheMaskPage.vue";
import { commands } from "./services/cmds";
import { installConsoleLogger } from "./services/logger";
import {
  initializeTheme,
  listenForThemeColors,
  withThemeTransitionsDisabled,
} from "./theme";
import "./theme.css";

installConsoleLogger("mask");
void withThemeTransitionsDisabled(() =>
  commands
    .currentTheme()
    .then(initializeTheme)
    .catch((cause) => console.error("Failed to load mask color theme:", cause))
    .then(() => listenForThemeColors())
    .catch((cause) =>
      console.error("Failed to listen for mask color changes:", cause),
    )
    .then(() => {
      createApp(TheMaskPage).mount("#mask");
    }),
);

import { createApp } from "vue";
import TheChaoxingMaskPage from "./TheChaoxingMaskPage.vue";
import { commands } from "./services/cmds";
import { installConsoleLogger } from "./services/logger";
import { initializeTheme, listenForThemeColors } from "./theme";
import "./theme.css";

installConsoleLogger("chaoxing-mask");
void commands
  .currentTheme()
  .then(initializeTheme)
  .catch((cause) =>
    console.error("Failed to load Chaoxing mask color theme:", cause),
  )
  .then(() => listenForThemeColors())
  .catch((cause) =>
    console.error("Failed to listen for Chaoxing mask color changes:", cause),
  )
  .then(() => {
    createApp(TheChaoxingMaskPage).mount("#chaoxing-mask");
  });

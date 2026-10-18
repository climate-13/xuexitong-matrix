import { createApp } from "vue";
import { createPinia } from "pinia";
import TheMainPage from "./TheMainPage.vue";
import { commands } from "./services/cmds";
import { installConsoleLogger } from "./services/logger";
import { defaultTheme, initializeTheme } from "./theme";
import "./theme.css";

installConsoleLogger("main");
const app = createApp(TheMainPage).use(createPinia());
void commands
  .currentTheme()
  .then(initializeTheme)
  .catch((cause) => {
    console.error("Failed to load color theme:", cause);
    initializeTheme(defaultTheme);
  })
  .finally(() => app.mount("#main"));

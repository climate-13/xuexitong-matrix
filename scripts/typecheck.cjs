// Vue 的检查器需要 JS 编译器 API，单独使用兼容包，保留项目的 TypeScript 7。
require("vue-tsc").run(require.resolve("@typescript/typescript6/lib/tsc"));

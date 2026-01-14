import { defineConfig } from "vite";

export default defineConfig({
  // 保持默认即可；此处显式指定，便于后续需要时统一调整
  root: ".",
  server: {
    port: 4173,
    strictPort: true
  }
});


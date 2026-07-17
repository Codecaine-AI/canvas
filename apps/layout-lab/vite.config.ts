import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const APP_DIR = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  appType: "spa",
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(APP_DIR, "src"),
    },
  },
  server: {
    fs: {
      allow: [resolve(APP_DIR, "../..")],
    },
    host: "0.0.0.0",
    port: 4700,
  },
  preview: {
    host: "0.0.0.0",
    port: 4700,
  },
});

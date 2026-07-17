import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { createCanvasFileApiHandler } from "./server/canvas-file-api";

const STUDIO_DIR = dirname(fileURLToPath(import.meta.url));

function canvasFileApiPlugin(): Plugin {
  const canvasesDir = resolve(STUDIO_DIR, "../..", "canvases");

  return {
    name: "studio-canvas-file-api",
    configureServer(server) {
      if (!existsSync(canvasesDir)) {
        server.config.logger.warn(
          `[studio] Canvas directory is missing: ${canvasesDir}`,
        );
      }

      server.middlewares.use(createCanvasFileApiHandler({ canvasesDir }));
    },
  };
}

export default defineConfig({
  appType: "spa",
  plugins: [canvasFileApiPlugin(), react()],
  resolve: {
    alias: {
      "@": resolve(STUDIO_DIR, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3999,
  },
  preview: {
    host: "0.0.0.0",
    port: 3999,
  },
});

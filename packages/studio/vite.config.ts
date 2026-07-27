import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { createAgentProxyHandler } from "./server/agent-proxy";
import { createCanvasFileApiHandler } from "./server/canvas-file-api";
import { createEvalsApiHandler } from "./server/evals-api";

const STUDIO_DIR = dirname(fileURLToPath(import.meta.url));

function canvasFileApiPlugin(): Plugin {
  const canvasesDir = resolve(STUDIO_DIR, "../..", "canvases");
  const evalRunsDir = resolve(STUDIO_DIR, "..", "eval-suite", "runs");

  return {
    name: "studio-canvas-file-api",
    configureServer(server) {
      if (!existsSync(canvasesDir)) {
        server.config.logger.warn(
          `[studio] Canvas directory is missing: ${canvasesDir}`,
        );
      }

      // The agent proxy mounts first: /api/canvases/:id/agent/* must reach
      // the harness, not the canvas file API's catch-all /api/canvases branch.
      server.middlewares.use(createAgentProxyHandler({}));
      server.middlewares.use(createCanvasFileApiHandler({ canvasesDir }));
      // The dev server always has dev pages (import.meta.env.DEV), so the
      // evals API mounts unconditionally here; the Electron server gates it.
      server.middlewares.use(createEvalsApiHandler({ runsDir: evalRunsDir }));
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

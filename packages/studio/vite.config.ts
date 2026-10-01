import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { createAgentProxyHandler } from "./server/agent-proxy";
import { createCanvasFileApiHandler } from "./server/canvas-file-api";
import {
  CANVAS_FILE_CHANGED_EVENT,
  CANVAS_STYLE_CHANGED_EVENT,
  createCanvasChangeNotifier,
} from "./server/canvas-file-watch";
import { createEvalsApiHandler } from "./server/evals-api";

const STUDIO_DIR = dirname(fileURLToPath(import.meta.url));

function canvasFileApiPlugin(): Plugin {
  // CANVAS_DIR points the dev server at another canvases directory (a scratch
  // copy for experiments), the same override the Electron build honors.
  const canvasesDir = process.env.CANVAS_DIR
    ? resolve(process.env.CANVAS_DIR)
    : resolve(STUDIO_DIR, "../..", "canvases");
  const evalRunsDir = resolve(STUDIO_DIR, "..", "eval-suite", "runs");

  return {
    name: "studio-canvas-file-api",
    configureServer(server) {
      if (!existsSync(canvasesDir)) {
        server.config.logger.warn(
          `[studio] Canvas directory is missing: ${canvasesDir}`,
        );
      }

      // External writers (the canvas MCP server, editors, git) change canvas
      // files under an open Studio. The canvases dir sits outside the Vite
      // root, so add it to the watcher explicitly; nothing imports these
      // files, so a change never triggers Vite's own HMR/full reload.
      const changeNotifier = createCanvasChangeNotifier({
        canvasesDir,
        send: (payload) => {
          server.ws.send({ type: "custom", event: CANVAS_FILE_CHANGED_EVENT, data: payload });
        },
        // canvas-style.json (workspace style settings) edited by an agent or by hand.
        sendStyleChanged: (payload) => {
          server.ws.send({ type: "custom", event: CANVAS_STYLE_CHANGED_EVENT, data: payload });
        },
      });
      server.watcher.add(canvasesDir);
      const onCanvasFileEvent = (path: string) => {
        void changeNotifier.handleFileEvent(path);
      };
      server.watcher.on("add", onCanvasFileEvent);
      server.watcher.on("change", onCanvasFileEvent);
      // Only canvas-style.json acts on deletes; canvas unlinks are ignored.
      server.watcher.on("unlink", onCanvasFileEvent);

      // The agent proxy mounts first: /api/canvases/:id/agent/* must reach
      // the harness, not the canvas file API's catch-all /api/canvases branch.
      server.middlewares.use(createAgentProxyHandler({}));
      server.middlewares.use(
        createCanvasFileApiHandler({
          canvasesDir,
          onCanvasWrite: changeNotifier.recordWrite,
          onCanvasStyleWrite: changeNotifier.recordStyleWrite,
        }),
      );
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

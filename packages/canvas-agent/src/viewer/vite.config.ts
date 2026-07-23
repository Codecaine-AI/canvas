import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/postcss";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The standalone agent trace viewer (HARNESS-SETUP-PLAN.md §2b) — a small
 * Vite React app on :4830, launched side-by-side with studio via
 * `make traces`. All data comes from the canvas-agent harness on :4820; the
 * dev-server proxy below pipes /api/* through so every existing
 * /api/agent/... fetch path works verbatim with zero CORS work.
 */
const VIEWER_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(VIEWER_DIR, "../../../..");

/**
 * The sibling agent-kernel checkout: the viewer packages
 * (@agent-kernel/viewer-{core,ui,shell}, @codecaine-ai/prompt-kit) are
 * machine-local `link:` deps whose exports point at TS *source*, so Vite
 * compiles them through the node_modules symlinks. That needs (a) fs.allow
 * for the sibling repo, (b) react/react-dom dedupe (the linked packages
 * carry their own react in agent-kernel/node_modules — resolving two Reacts
 * crashes hooks), and (c) optimizeDeps.exclude so esbuild never pre-bundles
 * the symlinked source with its own React copy baked in.
 */
const AGENT_KERNEL_DIR = resolve(REPO_ROOT, "../agent-kernel");
const LINKED_AGENT_KERNEL_PACKAGES = [
  "@agent-kernel/viewer-core",
  "@agent-kernel/viewer-ui",
  "@agent-kernel/viewer-shell",
  "@codecaine-ai/prompt-kit",
];

const HARNESS_TARGET = "http://127.0.0.1:4820";

export default defineConfig({
  root: VIEWER_DIR,
  appType: "spa",
  plugins: [react()],
  css: {
    postcss: { plugins: [tailwindcss()] },
  },
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    exclude: LINKED_AGENT_KERNEL_PACKAGES,
  },
  server: {
    host: "127.0.0.1",
    port: 4830,
    strictPort: true,
    fs: {
      allow: [REPO_ROOT, AGENT_KERNEL_DIR],
    },
    proxy: {
      "/api": {
        target: HARNESS_TARGET,
        // While the harness is down, answer the same 502 JSON studio's
        // agent proxy uses, so the pages keep their calm "agent service is
        // not running" empty state instead of vite's default 500.
        configure(proxy) {
          proxy.on("error", (_error, _req, res) => {
            if (res && "writeHead" in res) {
              if (!res.headersSent) {
                res.writeHead(502, {
                  "content-type": "application/json; charset=utf-8",
                });
                res.end(`${JSON.stringify({ error: "agent service is not running" })}\n`);
              } else {
                res.destroy();
              }
            } else {
              res?.destroy?.();
            }
          });
        },
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4830,
  },
});

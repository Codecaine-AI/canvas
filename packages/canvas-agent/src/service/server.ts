/**
 * The canvas-agent harness server — a sibling Bun service on :4820 that
 * studio fronts through its agent proxy (HARNESS-SETUP-PLAN §1/§4). Boots the
 * kernel database + manifest, builds the session store (which owns the kernel
 * instance), and mounts:
 *
 *   /api/canvases/:id/agent/sessions*   session create/refine/accept/reject,
 *                                       SSE events, draft.svg
 *   /api/agent/kernel/*                 kernel trace read API (+ the
 *                                       sessions list/detail studio calls)
 *   /api/agent/catalog/*                agent manifest + prompt editing
 *   /api/agent/doctor                   trace doctor over the kernel db
 *   /health
 */
import { Elysia } from "elysia";

import { bootKernelDatabase } from "./kernel";
import { LayoutSessionStore } from "./session";
import { createCatalogRoutes } from "./routes/catalog";
import { createKernelReadRoutes } from "./routes/kernel-read";
import { createSessionRoutes } from "./routes/sessions";
import { createTranscriptRoutes } from "./routes/transcript";

const port = Number(Bun.env.PORT ?? 4820);

const boot = await bootKernelDatabase();
const store = new LayoutSessionStore(boot.db);
const kernel = store.kernel;

const app = new Elysia()
  .use(createSessionRoutes(store))
  .use(createKernelReadRoutes(kernel, boot.db))
  .use(createTranscriptRoutes())
  .use(createCatalogRoutes(kernel))
  .get("/api/agent/doctor", () => kernel.doctor())
  .get("/health", () => ({ status: "ok", kernel: kernel.id }))
  .listen({ hostname: "127.0.0.1", port });

function shutdown(): void {
  kernel.dispose();
  boot.close();
}

process.once("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.once("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

console.log(`canvas-agent harness listening on http://127.0.0.1:${port}`);
console.log(`Trace database: ${boot.dbPath}`);

export { app };

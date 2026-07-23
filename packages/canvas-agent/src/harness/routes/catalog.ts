/**
 * Agent catalog routes (HARNESS-SETUP-PLAN §4):
 *
 *   GET /api/agent/catalog/:agent        manifest + prompt document + rendered
 *   PUT /api/agent/catalog/:agent/prompt write prompt.json (the kernel's
 *       catalog service re-canonicalizes, regenerates prompt.rendered.md,
 *       upserts the prompt revision, hot-swaps the registry) → new promptHash
 *
 * Plus the kernel's STANDARD catalog API mounted under the reserved prefix —
 * /api/agent/kernel/catalog/agents[...] — because studio's agent-config page
 * embeds @agent-kernel/viewer-ui's AgentPromptLabContainer, which speaks
 * KERNEL_CATALOG_PATHS (detail, prompt PUT, manifest PUT, revisions,
 * revision stats) against a baseUrl of /api/agent.
 *
 * Backed by kernel.catalogApiService (writes enabled — this is the dev
 * harness; prompt edits are file edits versioned in this repo).
 */
import { Elysia } from "elysia";

import type { KernelInstance } from "@agent-kernel/kernel";
import { createKernelCatalogApi } from "@agent-kernel/kernel/catalog-api";

export function createCatalogRoutes(kernel: KernelInstance<unknown>) {
  const service = kernel.catalogApiService({ allowWrites: true });

  // Same elysia-copy cast as kernel-read.ts: the kernel package resolves its
  // own structurally-identical Elysia.
  const standardCatalogApi = createKernelCatalogApi(service, {
    prefix: "/api/agent/kernel",
    allowWrites: true,
  }) as unknown as Elysia;

  return new Elysia()
    .use(standardCatalogApi)
    .get("/api/agent/catalog/:agent", async ({ params, set }) => {
      try {
        const detail = await service.getAgentDetail(params.agent);
        if (!detail) {
          set.status = 404;
          return { error: `Agent ${params.agent} not found in catalog` };
        }
        return detail;
      } catch (error) {
        console.error("canvas-agent catalog read error:", error);
        set.status = 500;
        return { error: "Failed to read the agent catalog" };
      }
    })
    .put("/api/agent/catalog/:agent/prompt", async ({ params, body, set }) => {
      try {
        const result = await service.savePrompt(params.agent, body);
        if (result === null) {
          set.status = 404;
          return { error: `Agent ${params.agent} not found in catalog` };
        }
        if (!result.ok) {
          set.status = 400;
          return { ok: false, errors: result.errors };
        }
        return { ok: true, promptHash: result.hash };
      } catch (error) {
        console.error("canvas-agent catalog write error:", error);
        set.status = 500;
        return { error: "Failed to save the agent prompt" };
      }
    });
}

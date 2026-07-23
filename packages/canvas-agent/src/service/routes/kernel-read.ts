/**
 * Kernel trace read routes (HARNESS-SETUP-PLAN §4):
 *
 *   /api/agent/kernel/*                the standard kernel read API
 *     (containers/:id/trace, trace-sessions, trace-sessions/:id)
 *   GET /api/agent/kernel/sessions     the list path studio's TracesPage calls
 *   GET /api/agent/kernel/sessions/:id the detail path studio's SessionPage calls
 *
 * Everything maps through the kernel's readApiService. One wrinkle: the
 * default listSessionContainers only lists containers of kind "session",
 * while layout sessions live under kind "layout-session" — so the list paths
 * query layout-session containers directly (same stats query, same response
 * shape) and the detail path stays the container-backed default.
 */
import { Elysia } from "elysia";

import { listSessionContainersWithStats, type KernelDatabase } from "@agent-kernel/db";
import type { KernelInstance } from "@agent-kernel/kernel";
import {
  createKernelTraceReadApi,
  parseKernelTraceLimit,
  type KernelTraceReadQuery,
} from "@agent-kernel/kernel/read-api";

import { KERNEL_ID } from "../kernel";

function metadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function createKernelReadRoutes(
  kernel: KernelInstance<unknown>,
  db: KernelDatabase,
) {
  const readService = kernel.readApiService;

  /** trace-sessions over kind "layout-session" — read-service list shape. */
  const listLayoutSessions = async (query: KernelTraceReadQuery = {}) => {
    await kernel.traceWriter.flush();
    const rows = await listSessionContainersWithStats(db, {
      kernelId: KERNEL_ID,
      kind: "layout-session",
      limit: query.limit ?? 100,
    });
    const traceSessions = rows.map(({ container, piSessionCount, eventCount, latestEventAt }) => ({
      id: container.id,
      containerId: container.id,
      kind: container.kind,
      label: container.label ?? container.id,
      topic:
        metadataString(container.metadata as Record<string, unknown> | null, "instruction")
        ?? container.label
        ?? null,
      status: container.status,
      phase: container.phase ?? null,
      createdAt: container.createdAt,
      updatedAt: latestEventAt ?? container.endedAt ?? container.startedAt ?? container.createdAt,
      piSessionCount,
      eventCount,
      latestEventAt,
      metadata: (container.metadata as Record<string, unknown> | null) ?? {},
    }));
    traceSessions.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return { trace_sessions: traceSessions };
  };

  // The standard read API under the reserved prefix, with the list backed by
  // layout-session containers so /api/agent/kernel/trace-sessions is not empty.
  const readApi = createKernelTraceReadApi(
    {
      getContainerTrace: (containerId, query) => readService.getContainerTrace(containerId, query),
      listSessionContainers: (query) => listLayoutSessions(query),
      // Request-snapshot reads (blobs + per-turn context) delegate straight to
      // the kernel's default service — omitting them here would 404 the routes.
      getBlob: (hash) => readService.getBlob(hash),
      getRunTurnContext: (runId, turnNumber) => readService.getRunTurnContext(runId, turnNumber),
    },
    { prefix: "/api/agent/kernel" },
  );

  // The kernel package resolves its own elysia copy (same version, separate
  // node_modules), so the route factory's Elysia type is nominally foreign —
  // structurally identical at runtime, hence the cast.
  return new Elysia()
    .use(readApi as unknown as Elysia)
    .get("/api/agent/kernel/sessions", async ({ query, set }) => {
      try {
        return await listLayoutSessions({
          limit: parseKernelTraceLimit(query.limit, { fallback: 100, max: 500 }),
        });
      } catch (error) {
        console.error("canvas-agent kernel session list error:", error);
        set.status = 500;
        return { error: "Failed to list kernel sessions" };
      }
    })
    .get("/api/agent/kernel/sessions/:id", async ({ params, query, set }) => {
      try {
        const detail = await readService.getContainerTrace(params.id, {
          after: query.after ?? null,
          limit: parseKernelTraceLimit(query.limit, { fallback: 5000, max: 10000 }),
        });
        if (!detail) {
          set.status = 404;
          return { error: `Kernel session ${params.id} not found` };
        }
        return detail;
      } catch (error) {
        console.error("canvas-agent kernel session detail error:", error);
        set.status = 500;
        return { error: "Failed to fetch kernel session" };
      }
    });
}

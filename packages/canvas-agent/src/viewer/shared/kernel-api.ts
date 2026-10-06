import {
  KERNEL_CATALOG_PATHS,
  KERNEL_TRACE_READ_PATHS,
} from "@agent-kernel/viewer-core";

/**
 * The viewer's vite dev proxy pipes /api/* to the harness (:4820), which
 * mounts the kernel's standard read + catalog APIs under the
 * /api/agent/kernel prefix (src/service/routes/{kernel-read,catalog}.ts).
 * The viewer packages' path constants all start with /kernel/..., so the
 * proxy base is exactly "/api/agent".
 */
export const AGENT_API_BASE = "/api/agent";

/** The one agent the canvas harness registers today. */
export const LAYOUT_AGENT_NAME = "layout-editor";

export function traceSessionListPath(): string {
  return `${AGENT_API_BASE}${KERNEL_TRACE_READ_PATHS.listTraceSessions}`;
}

export function traceSessionDetailPath(id: string): string {
  return `${AGENT_API_BASE}${KERNEL_TRACE_READ_PATHS.traceSessionDetail(id)}`;
}

export function catalogAgentDetailPath(name: string): string {
  return `${AGENT_API_BASE}${KERNEL_CATALOG_PATHS.agentDetail(name)}`;
}

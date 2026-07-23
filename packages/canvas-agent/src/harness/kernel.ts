/**
 * The canvas-agent kernel instance (HARNESS-SETUP-PLAN §3, §6).
 *
 * Per the app-adapter recipe (agent-kernel docs, 70-app-adapters/
 * 10-application-setup): open the kernel SQLite db at repo-root
 * .agent-kernel/trace.db, ensure the observability schema, write the local
 * kernel manifest, and create the kernel from one config object. Model access
 * goes through the local models process — the codex-lb provider declared in
 * repo-root .pi-agent/models.json — never interactive provider auth.
 */
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  ensureKernelObservabilitySchema,
  kernelDatabasePath,
  openKernelDatabase,
  writeKernelManifest,
  type KernelDatabase,
} from "@agent-kernel/db";
import { createKernel, type KernelInstance } from "@agent-kernel/kernel";

import { boardStateLoader } from "./loaders/board-state";
import { editorStateLoader } from "./loaders/editor-state";
import { styleGuideLoader } from "./loaders/style-guide";
import type { LayoutToolRuntime } from "./tool-runtime";

export const KERNEL_ID = "canvas-agent";

/** The canvas repo root (this file lives at packages/canvas-agent/src/harness/). */
export const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");
export const AGENT_KERNEL_DIR = join(REPO_ROOT, ".agent-kernel");
export const PI_SESSIONS_DIR = join(AGENT_KERNEL_DIR, "pi-sessions");
export const PI_AGENT_DIR = join(REPO_ROOT, ".pi-agent");
export const CANVASES_DIR = join(REPO_ROOT, "canvases");
export const AGENT_CATALOG_DIR = join(import.meta.dir, "agent-catalog");

/**
 * The `layout` model alias resolves to the model served by the codex-lb
 * provider in .pi-agent/models.json (gpt-5.6-sol today — retargeting the agent
 * is this line plus, if the id changes, a models.json edit).
 */
export const LAYOUT_MODEL = "codex-lb/gpt-5.6-sol";

export interface KernelDatabaseBoot {
  db: KernelDatabase;
  dbPath: string;
  close: () => void;
}

/** Open trace.db (WAL), ensure the schema, and write .agent-kernel/kernel.json. */
export async function bootKernelDatabase(): Promise<KernelDatabaseBoot> {
  mkdirSync(PI_SESSIONS_DIR, { recursive: true });
  const dbPath = kernelDatabasePath(REPO_ROOT);
  const handle = openKernelDatabase({ path: dbPath });
  await ensureKernelObservabilitySchema(handle.db);
  await writeKernelManifest(REPO_ROOT, {
    kernelId: KERNEL_ID,
    displayName: "Canvas Agent",
    piSessionsDir: PI_SESSIONS_DIR,
    viewerBaseUrl: "http://127.0.0.1:3999",
  });
  return { db: handle.db, dbPath, close: () => handle.close() };
}

/** Create the canvas-agent kernel over the given db + layout tool runtime. */
export function createLayoutKernel(
  db: KernelDatabase,
  toolRuntime: LayoutToolRuntime,
): KernelInstance<LayoutToolRuntime> {
  return createKernel<LayoutToolRuntime>({
    id: KERNEL_ID,
    db,
    catalog: { roots: [AGENT_CATALOG_DIR] },
    models: {
      aliases: { layout: LAYOUT_MODEL },
      prices: { [LAYOUT_MODEL]: { inputPerMTok: 1.25, outputPerMTok: 10 } },
    },
    loaders: [editorStateLoader, styleGuideLoader, boardStateLoader],
    toolRuntime,
    piSessionsDir: PI_SESSIONS_DIR,
    piAgentDir: PI_AGENT_DIR,
    concurrency: { maxBackgroundAgents: 1 },
    logger: console,
  });
}

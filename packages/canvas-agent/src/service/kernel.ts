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
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  ensureKernelObservabilitySchema,
  kernelDatabasePath,
  openKernelDatabase,
  writeKernelManifest,
  type KernelDatabase,
} from "@agent-kernel/db";
import {
  createKernel,
  type CatalogRootSpec,
  type KernelInstance,
} from "@agent-kernel/kernel";

import { capabilitiesLoader } from "./loaders/capabilities";
import { stateGrammarLoader } from "./loaders/state-grammar";
import { styleGuideLoader } from "./loaders/style-guide";
import { promptEditSharedTools } from "./prompt-edit";
import type { LayoutToolRuntime } from "./session/tools";

export const KERNEL_ID = "canvas-agent";

/** The canvas repo root (this file lives at packages/canvas-agent/src/service/). */
export const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");
export const AGENT_KERNEL_DIR = join(REPO_ROOT, ".agent-kernel");
export const PI_SESSIONS_DIR = join(AGENT_KERNEL_DIR, "pi-sessions");
export const PI_AGENT_DIR = join(REPO_ROOT, ".pi-agent");
export const CANVASES_DIR =
  Bun.env.CANVAS_AGENT_CANVASES_DIR ?? join(REPO_ROOT, "canvases");
export const AGENT_CATALOG_DIR = join(import.meta.dir, "..", "catalog");

/**
 * The prompt-editor agent bundle lives in the sibling prompt-kit repo's
 * prompt-kit-agent catalog. Present only in the Core meta-workspace layout —
 * standalone canvas checkouts must still boot, so it joins the runtime registry
 * conditionally.
 */
export const PROMPT_EDITOR_CATALOG_DIR = resolve(
  REPO_ROOT,
  "..",
  "prompt-kit",
  "packages",
  "prompt-kit-agent",
  "catalog",
);

const promptEditorCatalogPresent = existsSync(PROMPT_EDITOR_CATALOG_DIR);
if (!promptEditorCatalogPresent) {
  console.warn(
    `canvas-agent: prompt-editor catalog not found at ${PROMPT_EDITOR_CATALOG_DIR}; `
    + "prompt-edit sessions will not resolve the prompt-editor agent "
    + "(standalone checkout without the sibling prompt-kit repo).",
  );
}

/** Browseable catalog paths exposed through the kernel manifest. */
export const CATALOG_ROOTS = [AGENT_CATALOG_DIR];

/**
 * Registry roots used by createKernel. The shared prompt-editor remains
 * resolvable for edit-session spawns and direct detail reads, but is omitted
 * from Canvas's browseable agent list.
 */
export const KERNEL_CATALOG_ROOTS: CatalogRootSpec[] = promptEditorCatalogPresent
  ? [AGENT_CATALOG_DIR, { path: PROMPT_EDITOR_CATALOG_DIR, listed: false }]
  : [AGENT_CATALOG_DIR];

export const AGENT_THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;
export type AgentThinkingLevel = (typeof AGENT_THINKING_LEVELS)[number];

function agentThinkingOverride(raw: string | undefined): AgentThinkingLevel | undefined {
  if (raw === undefined) return undefined;
  if ((AGENT_THINKING_LEVELS as readonly string[]).includes(raw)) {
    return raw as AgentThinkingLevel;
  }
  throw new Error(
    `CANVAS_AGENT_THINKING must be one of ${AGENT_THINKING_LEVELS.join(", ")}; got ${
      JSON.stringify(raw)
    }.`,
  );
}

export const AGENT_THINKING_OVERRIDE = agentThinkingOverride(
  Bun.env.CANVAS_AGENT_THINKING,
);

export function toolCallCapOverride(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  if (raw === "1" || raw === "2" || raw === "3") {
    return Number(raw);
  }
  throw new Error(
    `CANVAS_AGENT_TOOL_CALL_CAP must be an integer from 1 to 3; got ${
      JSON.stringify(raw)
    }.`,
  );
}

export const TOOL_CALL_CAP_OVERRIDE = toolCallCapOverride(
  Bun.env.CANVAS_AGENT_TOOL_CALL_CAP,
);

/**
 * The `layout` model alias resolves to the model served by the codex-lb
 * provider in .pi-agent/models.json (gpt-5.6-sol today — retargeting the agent
 * is this line plus, if the id changes, a models.json edit).
 */
export const LAYOUT_MODEL = "codex-lb/gpt-5.6-sol";

/**
 * The prompt-editor bundle (prompt-kit-agent catalog) declares model
 * "prompt-editor" — without this alias its spawns fail. Same model as layout
 * unless overridden.
 */
export const PROMPT_EDITOR_MODEL =
  Bun.env.CANVAS_AGENT_PROMPT_EDITOR_MODEL ?? LAYOUT_MODEL;

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
    manifestVersion: 2,
    kernelId: KERNEL_ID,
    displayName: "Canvas Agent",
    kernelRoot: AGENT_KERNEL_DIR,
    dbPath,
    catalogRoots: CATALOG_ROOTS,
    piSessionsDir: PI_SESSIONS_DIR,
    readApiBaseUrl: `http://127.0.0.1:${Bun.env.CANVAS_AGENT_PORT ?? 4820}`,
    viewerBaseUrl: "http://127.0.0.1:4830",
  });
  return { db: handle.db, dbPath, close: () => handle.close() };
}

/**
 * The prompt-kit kernel OWNS prompt-edit traces (Ford's ownership rule: a
 * kernel owns every trace of its domain, wherever the run executed). When the
 * sibling prompt-kit repo is present, prompt-editor spawns run through this
 * auxiliary kernel — id `prompt-kit-kernel`, trace.db and pi-sessions under
 * prompt-kit-agent/.agent-kernel — so canvas prompt edits land in the Prompt
 * Kit project's trace surface, not this harness's. Standalone canvas
 * checkouts answer null and fall back to the canvas kernel.
 */
export const PROMPT_KIT_AGENT_ROOT = resolve(
  REPO_ROOT,
  "..",
  "prompt-kit",
  "packages",
  "prompt-kit-agent",
);
export const PROMPT_KIT_KERNEL_ID = "prompt-kit-kernel";

export interface PromptEditTraceKernelBoot {
  kernel: KernelInstance<unknown>;
  close: () => void;
}

export async function bootPromptEditTraceKernel(): Promise<PromptEditTraceKernelBoot | null> {
  if (!promptEditorCatalogPresent) return null;
  const piSessionsDir = join(PROMPT_KIT_AGENT_ROOT, ".agent-kernel", "pi-sessions");
  mkdirSync(piSessionsDir, { recursive: true });
  const handle = openKernelDatabase({
    path: kernelDatabasePath(PROMPT_KIT_AGENT_ROOT),
  });
  await ensureKernelObservabilitySchema(handle.db);
  // No manifest write: the prompt-kit harness owns its kernel.json.
  const kernel = createKernel({
    id: PROMPT_KIT_KERNEL_ID,
    db: handle.db,
    catalog: { roots: [PROMPT_EDITOR_CATALOG_DIR] },
    models: { aliases: { "prompt-editor": PROMPT_EDITOR_MODEL } },
    // Same module-level launch queue as the canvas kernel's hook — whichever
    // kernel spawns the prompt-editor, the session tools bind.
    sharedTools: promptEditSharedTools,
    piSessionsDir,
    piAgentDir: PI_AGENT_DIR,
    concurrency: { maxBackgroundAgents: 1 },
    logger: console,
  });
  return {
    kernel,
    close: () => {
      kernel.dispose();
      handle.close();
    },
  };
}

/** Create the canvas-agent kernel over the given db + layout tool runtime. */
export function createLayoutKernel(
  db: KernelDatabase,
  toolRuntime: LayoutToolRuntime,
): KernelInstance<LayoutToolRuntime> {
  return createKernel<LayoutToolRuntime>({
    id: KERNEL_ID,
    db,
    catalog: { roots: KERNEL_CATALOG_ROOTS },
    models: {
      aliases: { layout: LAYOUT_MODEL, "prompt-editor": PROMPT_EDITOR_MODEL },
      prices: { [LAYOUT_MODEL]: { inputPerMTok: 1.25, outputPerMTok: 10 } },
    },
    // Section ② only. The board / editor / user-request loaders retired when
    // the layout-editor's state/ sidecar took over the working picture (③);
    // their snapshots still travel on sessionData, read by seed() instead.
    loaders: [capabilitiesLoader, stateGrammarLoader, styleGuideLoader],
    // Per-spawn tools hook: binds prompt-edit session tools onto
    // prompt-editor spawns (no-op for every other agent).
    sharedTools: promptEditSharedTools,
    toolRuntime,
    piSessionsDir: PI_SESSIONS_DIR,
    piAgentDir: PI_AGENT_DIR,
    concurrency: { maxBackgroundAgents: 1 },
    logger: console,
  });
}

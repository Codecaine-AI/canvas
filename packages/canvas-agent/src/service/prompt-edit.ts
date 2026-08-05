/**
 * Prompt-edit session wiring: the kernel's prompt-edit session service bound
 * to THIS kernel's registry, catalog service, and spawn machinery, so the
 * standard catalog API (routes/catalog.ts) can mount the session routes and
 * "launch" actually spawns the prompt-editor agent in the canvas harness.
 *
 * Two seams, per agent-kernel's prompt-edit-session/launch.ts header:
 *
 *   1. `spawnAgent(launch)` — enqueue `launch.tools`, then
 *      `kernel.spawnAgent(launch.spawn.agentName, launch.spawn.prompt, null,
 *      { variables, sessionData })`.
 *   2. `sharedTools` on createKernel — the kernel's only per-spawn tools hook.
 *      `promptEditSharedTools` hands the queued `launch.tools` binder to the
 *      spawn, gated on the agent being the prompt-editor.
 *
 * FIFO assumption: spawnAgent enqueues immediately before calling
 * kernel.spawnAgent, and the kernel invokes sharedTools (buildToolFactories)
 * synchronously inside that spawn call, so queue order matches spawn order.
 * Concurrent session creates could theoretically interleave enqueue/spawn
 * pairs and cross-bind tools — acceptable for this dev harness (single
 * operator, maxBackgroundAgents: 1); revisit if the harness goes multi-user.
 */
import { updateContainerStatus } from "@agent-kernel/db";

import { REPO_ROOT } from "./kernel";
import {
  createPromptEditSessionService,
  PROMPT_EDITOR_AGENT_NAME,
  type CreateKernelConfig,
  type KernelInstance,
  type LaunchedPromptEditSession,
  type PromptEditSessionService,
} from "@agent-kernel/kernel";

/** Launches whose tools binder awaits the matching prompt-editor spawn. */
const pendingLaunches: LaunchedPromptEditSession[] = [];

/** Queue a launch for the next prompt-editor spawn (exported for tests). */
export function enqueuePromptEditLaunch(launch: LaunchedPromptEditSession): void {
  pendingLaunches.push(launch);
}

/**
 * `sharedTools` hook for createKernel: binds the queued prompt-edit session
 * tools onto prompt-editor spawns; every other agent gets no extra tools.
 */
export const promptEditSharedTools: NonNullable<
  CreateKernelConfig["sharedTools"]
> = (config) => {
  if (config.name !== PROMPT_EDITOR_AGENT_NAME) return [];
  const launch = pendingLaunches.shift();
  return launch ? [launch.tools] : [];
};

/**
 * Build the prompt-edit session service over the canvas kernel. Session
 * bookkeeping (registry, catalog writes) stays on the canvas kernel — the
 * TARGET bundle lives here — but the prompt-editor run itself goes through
 * `spawnKernel`: the prompt-kit-bound trace kernel when the sibling repo is
 * present (prompt-edit traces belong to the prompt-kit kernel), else the
 * canvas kernel.
 */
export function createCanvasPromptEditSessions<TToolRuntime>(
  kernel: KernelInstance<TToolRuntime>,
  spawnKernel?: KernelInstance<unknown>,
): PromptEditSessionService {
  const runner: KernelInstance<unknown> =
    spawnKernel ?? (kernel as KernelInstance<unknown>);
  return createPromptEditSessionService({
    registry: () => kernel.registry(),
    catalog: kernel.catalogApiService({ allowWrites: true }),
    // Writes hardcoded on — the same gate routes/catalog.ts uses for prompt
    // saves: this is the dev harness, prompt edits are file edits versioned
    // in this repo.
    allowWrites: true,
    spawnAgent: async (launch) => {
      enqueuePromptEditLaunch(launch);
      // Kind "session" + this label + the status updates mirror the
      // prompt-kit harness's own prompt-edit containers, so canvas-driven
      // edits list identically in that kernel's trace surface.
      const container = await runner.container({
        kind: "session",
        key: [launch.session.targetAgent, launch.session.id],
        label: `Edit prompt: ${launch.session.targetAgent}`,
        phase: "prompt-edit",
        phaseVocabulary: ["prompt-edit"],
        workingDir: REPO_ROOT,
        metadata: {
          app: "canvas-agent",
          topic: `Edit ${launch.session.targetAgent}`,
          targetAgent: launch.session.targetAgent,
          promptEditSessionId: launch.session.id,
        },
      });
      if (runner.db) {
        await updateContainerStatus(runner.db, container.id, "active", {
          startedAt: new Date().toISOString(),
        });
      }
      try {
        await runner.spawnAgent(launch.spawn.agentName, launch.spawn.prompt, null, {
          containerId: container.id,
          trigger: "operator",
          phase: "prompt-edit",
          sessionData: launch.spawn.sessionData,
          workingDir: REPO_ROOT,
          displayLabel: "Prompt Editor",
        });
        if (runner.db) {
          await updateContainerStatus(runner.db, container.id, "done", {
            endedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        if (runner.db) {
          await updateContainerStatus(runner.db, container.id, "error", {
            endedAt: new Date().toISOString(),
          });
        }
        throw error;
      }
    },
  });
}

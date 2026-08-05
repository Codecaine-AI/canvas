/**
 * Prompt-edit session wiring smoke tests:
 *
 *   1. The prompt-editor bundle (sibling prompt-kit repo's catalog) is
 *      resolvable but unlisted when registered as Canvas's spawn-only root.
 *   2. The session routes mount through createCatalogRoutes when a session
 *      service is passed — list / create / state driven via app.handle().
 *   3. promptEditSharedTools binds a queued launch's tools only onto
 *      prompt-editor spawns, FIFO, once.
 *
 * Fixture-agent pattern mirrors agent-kernel's prompt-edit-session-api.test.ts
 * (temp catalog dir + temp kernel db); temp-dir lifecycle per transcript.test.ts.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  ensureKernelObservabilitySchema,
  kernelDatabasePath,
  openKernelDatabase,
  type KernelDatabaseHandle,
} from "@agent-kernel/db";
import {
  buildRegistry,
  createKernelCatalogService,
  PROMPT_EDITOR_AGENT_NAME,
  type AgentConfig,
  type AgentRegistry,
  type KernelCatalogService,
  type KernelInstance,
  type LaunchedPromptEditSession,
  type PromptEditSessionService,
} from "@agent-kernel/kernel";
import { createPromptEditSessionService } from "@agent-kernel/kernel";
import {
  canonicalizePrompt,
  PROMPT_KIT_SCHEMA_VERSION,
  type PromptDocument,
} from "@codecaine-ai/prompt-kit";

import {
  KERNEL_CATALOG_ROOTS,
  PROMPT_EDITOR_CATALOG_DIR,
} from "../src/service/kernel";
import {
  enqueuePromptEditLaunch,
  promptEditSharedTools,
} from "../src/service/prompt-edit";
import { createCatalogRoutes } from "../src/service/routes/catalog";

const AGENT = "canvas-prompt-edit-fixture";
const DOC_ID = "canvas-prompt-edit-doc";

function makePromptDocument(): PromptDocument {
  return {
    kind: "prompt",
    schemaVersion: PROMPT_KIT_SCHEMA_VERSION,
    id: DOC_ID,
    title: "Canvas Prompt Edit Fixture",
    nodes: [
      {
        type: "section",
        id: "sec-purpose",
        tag: "purpose",
        children: [
          {
            type: "paragraph",
            id: "para-0",
            content: ["You are the canvas fixture agent."],
          },
        ],
      },
    ],
  } as PromptDocument;
}

function writeFixtureAgent(catalogRoot: string): void {
  const agentDir = join(catalogRoot, AGENT);
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(
    join(agentDir, "agent.json"),
    `${JSON.stringify(
      {
        $schema: "agent-kernel/agent-v1",
        name: AGENT,
        description: "Canvas prompt-edit fixture agent.",
        model: "test-model-alias",
        variables: {},
      },
      null,
      "\t",
    )}\n`,
    "utf8",
  );
  writeFileSync(
    join(agentDir, "prompt.json"),
    canonicalizePrompt(makePromptDocument()),
    "utf8",
  );
}

describe("prompt-editor bundle discovery", () => {
  test("spawn-only prompt-editor root is resolvable but excluded from list", async () => {
    expect(existsSync(PROMPT_EDITOR_CATALOG_DIR)).toBe(true);
    const registry = await buildRegistry({ roots: KERNEL_CATALOG_ROOTS });
    expect(registry.tryGet(PROMPT_EDITOR_AGENT_NAME)).not.toBeNull();
    expect(registry.list().map(({ name }) => name)).toEqual(["layout-editor"]);
  });
});

describe("prompt-edit session routes through createCatalogRoutes", () => {
  let dir: string;
  let handle: KernelDatabaseHandle;
  let registry: AgentRegistry;
  let catalog: KernelCatalogService;
  let sessions: PromptEditSessionService;
  let app: ReturnType<typeof createCatalogRoutes>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "canvas-prompt-edit-routes-"));
    const catalogRoot = join(dir, "agent-catalog");
    writeFixtureAgent(catalogRoot);

    handle = openKernelDatabase({ path: kernelDatabasePath(dir) });
    await ensureKernelObservabilitySchema(handle.db);
    registry = await buildRegistry({
      roots: [
        catalogRoot,
        { path: PROMPT_EDITOR_CATALOG_DIR, listed: false },
      ],
    });
    catalog = createKernelCatalogService({
      registry: async () => registry,
      db: () => handle.db,
      allowWrites: true,
    });
    sessions = createPromptEditSessionService({
      registry: async () => registry,
      catalog,
      allowWrites: true,
    });
    // Stub kernel: createCatalogRoutes only calls catalogApiService.
    const stubKernel = {
      catalogApiService: () => catalog,
    } as unknown as KernelInstance<unknown>;
    app = createCatalogRoutes(stubKernel, sessions);
  });

  afterEach(() => {
    sessions?.disposeAll();
    handle?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function url(path: string): string {
    return `http://localhost${path}`;
  }

  test("list, create (201 with state.sessionId), and state routes answer", async () => {
    const listed = await app.handle(
      new Request(url("/api/agent/kernel/catalog/agents")),
    );
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as {
      agents: Array<{ name: string }>;
    };
    expect(listedBody.agents.map(({ name }) => name)).toEqual([AGENT]);
    expect(
      listedBody.agents.some(({ name }) => name === PROMPT_EDITOR_AGENT_NAME),
    ).toBe(false);

    const promptEditorDetail = await app.handle(
      new Request(
        url(`/api/agent/kernel/catalog/agents/${PROMPT_EDITOR_AGENT_NAME}`),
      ),
    );
    expect(promptEditorDetail.status).toBe(200);

    const empty = await app.handle(
      new Request(url("/api/agent/kernel/prompt-edit-sessions")),
    );
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ sessions: [] });

    // An open agent-request annotation on the fixture prompt feeds the queue.
    const added = await catalog.addAnnotation(AGENT, {
      target: { kind: "prompt-node", docId: DOC_ID, nodeId: "para-0" },
      body: "Sharpen the opening.",
      intent: "agent-request",
      author: "test",
    });
    if (!added || !added.ok) throw new Error("fixture annotation add failed");

    const created = await app.handle(
      new Request(
        url(`/api/agent/kernel/catalog/agents/${AGENT}/edit-sessions`),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ instruction: "Work the queue." }),
        },
      ),
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as { state: { sessionId: string } };
    expect(typeof body.state.sessionId).toBe("string");

    const state = await app.handle(
      new Request(
        url(`/api/agent/kernel/prompt-edit-sessions/${body.state.sessionId}`),
      ),
    );
    expect(state.status).toBe(200);
  });
});

describe("promptEditSharedTools", () => {
  test("other agents get no tools; prompt-editor drains the queue FIFO once", () => {
    const bound: string[] = [];
    const fakeLaunch = (label: string) =>
      ({ tools: () => bound.push(label) }) as unknown as LaunchedPromptEditSession;

    expect(promptEditSharedTools({ name: "layout" } as AgentConfig)).toEqual([]);

    enqueuePromptEditLaunch(fakeLaunch("first"));
    enqueuePromptEditLaunch(fakeLaunch("second"));

    // Other agents never consume the queue.
    expect(promptEditSharedTools({ name: "layout" } as AgentConfig)).toEqual([]);

    const editorConfig = { name: PROMPT_EDITOR_AGENT_NAME } as AgentConfig;
    const one = promptEditSharedTools(editorConfig);
    expect(one).toHaveLength(1);
    const two = promptEditSharedTools(editorConfig);
    expect(two).toHaveLength(1);
    // FIFO: binders come back in enqueue order.
    (one[0] as () => void)();
    (two[0] as () => void)();
    expect(bound).toEqual(["first", "second"]);

    // Drained: nothing left for a third prompt-editor spawn.
    expect(promptEditSharedTools(editorConfig)).toEqual([]);
  });
});

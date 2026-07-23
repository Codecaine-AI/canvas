import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import {
  LayoutSessionStore,
  type LayoutSession,
} from "../src/harness/session-store";
import type { LayoutToolRenderResult, LayoutToolTextResult } from "../src/harness/tool-runtime";
import type { AgentPatchOperation } from "../src/protocol";
import { fitScope } from "../src/pipeline";
import { box, connect, makeDocument } from "./synthetic";

function invokePrivate<T>(store: LayoutSessionStore, name: string, ...args: unknown[]): T {
  const method = Reflect.get(store, name) as (...methodArgs: unknown[]) => T;
  return method.apply(store, args);
}

function makeSession(
  baseline: InteractiveCanvasDocument,
  requestedScopeIds: string[],
): LayoutSession {
  const fit = fitScope(baseline, requestedScopeIds);
  return {
    id: "inventory-session",
    canvasId: "synthetic",
    canvasPath: "/tmp/inventory.canvas.json",
    baseline,
    baselineHash: "test-hash",
    requestedScopeIds,
    baselineFit: fit,
    currentFit: fit,
    scopeIds: new Set(fit.scopeObjectIds),
    draft: baseline,
    lastSketch: null,
    proposalCount: 0,
    proposal: null,
    status: "running",
    error: null,
    instruction: "Edit the selected board objects",
    annotations: [],
    viewport: undefined,
    containerId: "inventory-container",
    sessionDir: "/tmp/inventory-session",
    events: [],
    subscribers: new Set(),
    runPromise: null,
    exemplarShown: true,
  };
}

function makeToolStore(session: LayoutSession): LayoutSessionStore {
  const store = Object.create(LayoutSessionStore.prototype) as LayoutSessionStore;
  Object.defineProperty(store, "currentSession", { value: () => session });
  return store;
}

function styledBaseline(): InteractiveCanvasDocument {
  const alpha = box("alpha", 0, 0);
  const beta = box("beta", 320, 0);
  const edge = {
    ...connect("alpha-beta", "alpha", "beta"),
    label: "next",
    style: "dashed" as const,
    color: "red" as const,
  };
  return makeDocument([alpha, beta], [edge]);
}

describe("connection inventory", () => {
  test("fit_scope lists in-scope connections with ids and channels", () => {
    const session = makeSession(styledBaseline(), ["alpha", "beta"]);
    const store = makeToolStore(session);

    const result = invokePrivate<LayoutToolRenderResult>(store, "toolFitScope");

    expect(result.isError).not.toBe(true);
    expect(result.text).toContain("Connections (use updateConnection");
    expect(result.text).toContain('alpha-beta: alpha → beta label="next" style=dashed color=red');
  });

  test("inspect resolves a connection id to its channels", () => {
    const session = makeSession(styledBaseline(), ["alpha", "beta"]);
    const store = makeToolStore(session);

    const result = invokePrivate<LayoutToolTextResult>(store, "toolInspect", ["alpha-beta"]);

    expect(result.isError).not.toBe(true);
    expect(result.text).toContain(
      'connection alpha-beta: alpha → beta label="next" style=dashed color=red arrow=forward',
    );
  });

  test("apply_ops refuses self-loops with an honest reason", () => {
    const session = makeSession(styledBaseline(), ["alpha", "beta"]);
    const store = makeToolStore(session);

    const operations: AgentPatchOperation[] = [
      {
        type: "addConnection",
        connection: { id: "alpha-self", from: { objectId: "alpha" }, to: { objectId: "alpha" }, label: "loop" },
      },
    ];
    const result = invokePrivate<LayoutToolTextResult>(store, "toolApplyOps", operations);

    expect(result.isError).not.toBe(true);
    expect(result.text).toContain("self-loops are not yet supported");
    expect(session.draft.connections).toHaveLength(1);
  });

  test("apply_ops warns when adding an edge that duplicates an existing pair", () => {
    const session = makeSession(styledBaseline(), ["alpha", "beta"]);
    const store = makeToolStore(session);

    const operations: AgentPatchOperation[] = [
      {
        type: "addConnection",
        connection: {
          id: "alpha-beta-2",
          from: { objectId: "alpha" },
          to: { objectId: "beta" },
          label: "restyled",
          style: "solid",
          color: "teal",
        },
      },
    ];
    const result = invokePrivate<LayoutToolTextResult>(store, "toolApplyOps", operations);

    expect(result.isError).not.toBe(true);
    expect(result.text).toContain("possible duplicate of alpha-beta");
    expect(result.text).toContain("use updateConnection");
    expect(session.draft.connections).toHaveLength(2);
  });
});

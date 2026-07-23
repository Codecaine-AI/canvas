import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import {
  LayoutSessionStore,
  type LayoutSession,
} from "../src/harness/session-store";
import type { LayoutToolTextResult } from "../src/harness/tool-runtime";
import type { AgentPatchOperation } from "../src/protocol";
import { fitScope, parseSketch } from "../src/pipeline";
import { box, connect, makeDocument } from "./synthetic";

const ONE_ITEM_PROGRAM = [
  "item 1 text=alpha type=process size=M at=C",
  "",
  "arrows",
].join("\n");

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
    id: "apply-ops-session",
    canvasId: "synthetic",
    canvasPath: "/tmp/apply-ops.canvas.json",
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
    containerId: "apply-ops-container",
    sessionDir: "/tmp/apply-ops-session",
    events: [],
    subscribers: new Set(),
    runPromise: null,
    exemplarShown: false,
    lastDiagnostics: undefined,
  };
}

function makeToolStore(session: LayoutSession): LayoutSessionStore {
  const store = Object.create(LayoutSessionStore.prototype) as LayoutSessionStore;
  Object.defineProperty(store, "currentSession", { value: () => session });
  return store;
}

describe("apply_ops", () => {
  test("validates the whole batch before applying any operation", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeSession(baseline, ["alpha"]);
    const store = makeToolStore(session);
    const draftBefore = session.draft;
    const sketchBefore = parseSketch(ONE_ITEM_PROGRAM);
    session.lastSketch = sketchBefore;

    const operations: AgentPatchOperation[] = [
      { type: "updateObject", objectId: "alpha", patch: { text: "changed" } },
      { type: "updateObject", objectId: "missing", patch: { color: "blue" } },
    ];
    const result = invokePrivate<LayoutToolTextResult>(store, "toolApplyOps", operations);

    expect(result.isError).toBe(true);
    expect(result.text).toContain("no operations were applied");
    expect(result.text).toContain('op 2: updateObject id "missing" is not in the draft.');
    expect(session.draft).toBe(draftBefore);
    expect(session.draft.objects[0]!.text).toBe("alpha");
    expect(session.lastSketch).toBe(sketchBefore);
    expect(session.events).toEqual([]);
  });

  test("applies object and connection channel edits and clears the stale sketch", () => {
    const alpha = {
      ...box("alpha", 0, 0),
      color: "red" as const,
      style: { strokeWidth: 2 },
    };
    const beta = box("beta", 320, 0);
    const connection = {
      ...connect("alpha-beta", "alpha", "beta"),
      label: "before",
      style: "solid" as const,
      color: "gray" as const,
    };
    const baseline = makeDocument([alpha, beta], [connection]);
    const session = makeSession(baseline, ["alpha", "beta"]);
    session.lastSketch = parseSketch(ONE_ITEM_PROGRAM);
    const store = makeToolStore(session);

    const operations: AgentPatchOperation[] = [
      {
        type: "updateObject",
        objectId: "alpha",
        patch: { text: "renamed", color: "blue", style: { strokeWidth: 6 } },
      },
      {
        type: "updateConnection",
        connectionId: "alpha-beta",
        patch: { label: "after", style: "dashed", color: "violet" },
      },
    ];
    const result = invokePrivate<LayoutToolTextResult>(store, "toolApplyOps", operations);

    expect(result.isError).toBeUndefined();
    expect(session.draft.objects.find((object) => object.id === "alpha")).toMatchObject({
      text: "renamed",
      color: "blue",
      style: { strokeWidth: 6 },
      geometry: alpha.geometry,
    });
    expect(session.draft.connections.find((item) => item.id === "alpha-beta")).toMatchObject({
      label: "after",
      style: "dashed",
      color: "violet",
    });
    expect(session.lastSketch).toBeNull();
    expect(session.events.map((event) => event.type)).toEqual(["proposal", "delta"]);
  });

  test("re-derives membership for both moved and added objects", () => {
    const sectionA = box("section-a", 0, 0, 400, 320, "section");
    const sectionB = box("section-b", 500, 0, 400, 320, "section");
    const child = { ...box("child", 80, 112), parentId: "section-a" };
    const baseline = makeDocument([sectionA, sectionB, child]);
    const session = makeSession(baseline, ["section-a", "section-b"]);
    const store = makeToolStore(session);

    const operations: AgentPatchOperation[] = [
      {
        type: "updateObject",
        objectId: "child",
        patch: {
          parentId: "section-a",
          geometry: { x: 580, y: 112, width: 160, height: 96 },
        },
      },
      {
        type: "addObject",
        object: {
          id: "new-child",
          type: "rectangle",
          text: "new child",
          parentId: "section-b",
          geometry: { x: 160, y: 112, width: 160, height: 96 },
        },
      },
    ];
    const result = invokePrivate<LayoutToolTextResult>(store, "toolApplyOps", operations);

    expect(result.isError).toBeUndefined();
    expect(session.draft.objects.find((object) => object.id === "child")?.parentId)
      .toBe("section-b");
    expect(session.draft.objects.find((object) => object.id === "new-child")?.parentId)
      .toBe("section-a");
  });

  test("returns the change delta and first-round diagnostics without rejecting the edit", () => {
    const baseline = makeDocument([
      box("alpha", 0, 0),
      box("beta", 320, 0),
    ], [{ ...connect("edge", "alpha", "beta"), label: "go" }]);
    const session = makeSession(baseline, ["alpha", "beta"]);
    const store = makeToolStore(session);

    const result = invokePrivate<LayoutToolTextResult>(store, "toolApplyOps", [{
      type: "updateObject",
      objectId: "beta",
      patch: { geometry: { x: 208, y: 0, width: 160, height: 96 } },
    }]);

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · 1 op");
    expect(result.text).toContain("DELTA");
    expect(result.text).toContain("beta  320,0 → 208,0");
    // First apply of the session: the LINTS slot carries the full list.
    expect(result.text).toContain("DIAGNOSTICS · 0 errors · 1 warning");
    expect(result.text).toContain('W1 unreadable-labels: labeled edge alpha↔beta: 48px gap is too tight for its "go" chip (give it ≥128px so the label breathes) [quickfix]');
    expect(result.text).not.toContain("BOARD ·");
    expect(session.lastDiagnostics).toHaveLength(1);
    expect(session.draft.objects.find((object) => object.id === "beta")?.geometry)
      .toEqual({ x: 208, y: 0, width: 160, height: 96 });
  });
});

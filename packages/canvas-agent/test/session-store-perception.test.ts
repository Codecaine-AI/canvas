import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import {
  LayoutSessionStore,
  type LayoutSession,
} from "../src/harness/session-store";
import type { LayoutToolRenderResult } from "../src/harness/tool-runtime";
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
    id: "perception-session",
    canvasId: "synthetic",
    canvasPath: "/tmp/perception.canvas.json",
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
    containerId: "perception-container",
    sessionDir: "/tmp/perception-session",
    events: [],
    subscribers: new Set(),
    runPromise: null,
    exemplarShown: true,
    lastDiagnostics: undefined,
  };
}

function makeToolStore(session: LayoutSession): LayoutSessionStore {
  const store = Object.create(LayoutSessionStore.prototype) as LayoutSessionStore;
  Object.defineProperty(store, "currentSession", { value: () => session });
  return store;
}

function applyOps(
  store: LayoutSessionStore,
  operations: AgentPatchOperation[],
): LayoutToolRenderResult {
  return invokePrivate<LayoutToolRenderResult>(store, "toolApplyOps", operations);
}

describe("spawn board-state snapshot", () => {
  test("carries the full digest plus the full lint report as one string", () => {
    // 48px gap under a "go" chip → unreadable-labels warning in the report.
    const baseline = makeDocument(
      [box("alpha", 0, 0), box("beta", 208, 0)],
      [{ ...connect("edge", "alpha", "beta"), label: "go" }],
    );
    const session = makeSession(baseline, ["alpha", "beta"]);
    const store = makeToolStore(session);

    const snapshot = invokePrivate<string>(store, "boardStateSnapshot", session);

    expect(snapshot).toContain("BOARD ·");
    expect(snapshot).toContain('"alpha"');
    expect(snapshot).toContain("\n\nDIAGNOSTICS ·");
    // 48px gap under a "go" chip — the full lint report rides along.
    expect(snapshot).toContain("unreadable-labels");
  });

  test("recomputes from the current draft, so refinements get a fresh snapshot", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeSession(baseline, ["alpha"]);
    const store = makeToolStore(session);

    const first = invokePrivate<string>(store, "boardStateSnapshot", session);
    session.draft = makeDocument([{ ...box("alpha", 0, 0), text: "renamed alpha" }]);
    const second = invokePrivate<string>(store, "boardStateSnapshot", session);

    expect(first).not.toBe(second);
    expect(second).toContain("renamed alpha");
  });
});

describe("apply_ops DELTA block", () => {
  test("reports moves, recolors, adds, and removes from the before/after documents", () => {
    const baseline = makeDocument([
      box("alpha", 0, 0),
      box("beta", 320, 0),
      box("gamma", 640, 0),
    ]);
    const session = makeSession(baseline, ["alpha", "beta", "gamma"]);
    const store = makeToolStore(session);

    const result = applyOps(store, [
      {
        type: "updateObject",
        objectId: "beta",
        patch: { geometry: { x: 320, y: 240, width: 160, height: 96 } },
      },
      { type: "updateObject", objectId: "alpha", patch: { color: "blue" } },
      {
        type: "addObject",
        object: {
          id: "note",
          type: "rectangle",
          text: "hello",
          geometry: { x: 960, y: 0, width: 160, height: 96 },
        },
      },
      { type: "removeObject", objectId: "gamma" },
    ]);

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · 4 ops");
    expect(result.text).toContain("DELTA");
    expect(result.text).toContain("beta  320,0 → 320,240");
    expect(result.text).toContain("alpha  color gray → blue");
    expect(result.text).toContain('+ note  rectangle 960,0 160×96 "hello"');
    expect(result.text).toContain("− gamma");
  });

  test("shows membership-reconciliation parentId moves the op payload never named", () => {
    const sectionA = box("section-a", 0, 0, 400, 320, "section");
    const sectionB = box("section-b", 500, 0, 400, 320, "section");
    const child = { ...box("child", 80, 112), parentId: "section-a" };
    const baseline = makeDocument([sectionA, sectionB, child]);
    const session = makeSession(baseline, ["section-a", "section-b"]);
    const store = makeToolStore(session);

    const result = applyOps(store, [{
      type: "updateObject",
      objectId: "child",
      patch: { geometry: { x: 576, y: 112, width: 160, height: 96 } },
    }]);

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("child  80,112 → 576,112");
    expect(result.text).toContain("child  parentId section-a → section-b");
  });

  test("reports connection channel changes, adds, and removes", () => {
    const baseline = makeDocument(
      [box("alpha", 0, 0), box("beta", 480, 0), box("gamma", 960, 0)],
      [
        { ...connect("alpha-beta", "alpha", "beta"), label: "before" },
        connect("beta-gamma", "beta", "gamma"),
      ],
    );
    const session = makeSession(baseline, ["alpha", "beta", "gamma"]);
    const store = makeToolStore(session);

    const result = applyOps(store, [
      {
        type: "updateConnection",
        connectionId: "alpha-beta",
        patch: { label: "after", color: "orange" },
      },
      { type: "removeConnection", connectionId: "beta-gamma" },
      {
        type: "addConnection",
        connection: { id: "alpha-gamma", from: { objectId: "alpha" }, to: { objectId: "gamma" } },
      },
    ]);

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("alpha-beta  label before → after");
    expect(result.text).toContain("alpha-beta  color gray → orange");
    expect(result.text).toContain("− beta-gamma");
    expect(result.text).toContain("+ alpha-gamma  alpha → gamma");
  });
});

describe("apply_ops LINTS delta", () => {
  test("first apply reports the full list; later applies report +new/−resolved", () => {
    const baseline = makeDocument([box("alpha", 0, 0), box("beta", 480, 0)]);
    const session = makeSession(baseline, ["alpha", "beta"]);
    const store = makeToolStore(session);

    // Round 1 — introduce a covered-content error (beta 75% onto alpha).
    const round1 = applyOps(store, [{
      type: "updateObject",
      objectId: "beta",
      patch: { geometry: { x: 40, y: 0, width: 160, height: 96 } },
    }]);
    expect(round1.isError).toBeUndefined();
    // First apply of the session: full-list behavior, not a delta.
    expect(round1.text).toContain("DIAGNOSTICS · 1 error");
    expect(round1.text).toContain("covered-content");
    expect(round1.text).not.toContain("LINTS ·");
    expect(session.lastDiagnostics).toHaveLength(1);

    // Round 2 — fix it: the finding resolves and is reported as −.
    const round2 = applyOps(store, [{
      type: "updateObject",
      objectId: "beta",
      patch: { geometry: { x: 480, y: 0, width: 160, height: 96 } },
    }]);
    expect(round2.isError).toBeUndefined();
    expect(round2.text).toContain("LINTS · +0 −1");
    expect(round2.text).toContain("− E1 covered-content");
    expect(round2.text).toContain("(resolved)");
    expect(round2.text).not.toContain("DIAGNOSTICS ·");
    expect(session.lastDiagnostics).toHaveLength(0);

    // Round 3 — nothing changes lint-wise: clean, no noise.
    const round3 = applyOps(store, [{
      type: "updateObject",
      objectId: "alpha",
      patch: { text: "renamed" },
    }]);
    expect(round3.isError).toBeUndefined();
    expect(round3.text).toContain("LINTS · clean");
  });

  test("new findings after the baseline are listed in full with +", () => {
    const baseline = makeDocument([box("alpha", 0, 0), box("beta", 480, 0)]);
    const session = makeSession(baseline, ["alpha", "beta"]);
    const store = makeToolStore(session);

    // Round 1 — channel-only, clean baseline.
    applyOps(store, [{ type: "updateObject", objectId: "alpha", patch: { color: "teal" } }]);

    // Round 2 — introduce the overlap.
    const round2 = applyOps(store, [{
      type: "updateObject",
      objectId: "beta",
      patch: { geometry: { x: 40, y: 0, width: 160, height: 96 } },
    }]);
    expect(round2.text).toContain("LINTS · +1 −0");
    expect(round2.text).toContain("  + E1 covered-content:");
  });

  test("fingerprint matching survives id renumbering", () => {
    // Two separate overlapping pairs → two covered-content errors E1/E2.
    const baseline = makeDocument([
      box("a1", 0, 0),
      box("a2", 40, 0),
      box("b1", 2000, 0),
      box("b2", 2040, 0),
    ]);
    const session = makeSession(baseline, ["a1", "a2", "b1", "b2"]);
    const store = makeToolStore(session);

    // Round 1 — baseline carries both errors.
    const round1 = applyOps(store, [{
      type: "updateObject",
      objectId: "a1",
      patch: { text: "pair a" },
    }]);
    expect(round1.text).toContain("DIAGNOSTICS · 2 errors");
    expect(session.lastDiagnostics!.map((diagnostic) => diagnostic.id)).toEqual(["E1", "E2"]);

    // Round 2 — fix pair a. The surviving b-pair finding renumbers E2 → E1,
    // but it is the same finding: not new, not resolved.
    const round2 = applyOps(store, [{
      type: "updateObject",
      objectId: "a2",
      patch: { geometry: { x: 480, y: 0, width: 160, height: 96 } },
    }]);
    expect(round2.text).toContain("LINTS · +0 −1");
    expect(round2.text).toContain("− E1 covered-content");
    expect(round2.text).not.toContain("+ E1 covered-content");
    expect(session.lastDiagnostics!.map((diagnostic) => diagnostic.id)).toEqual(["E1"]);
  });
});

describe("apply_ops auto close-up", () => {
  test("geometry changes attach a close-up png of the touched region", () => {
    const baseline = makeDocument([box("alpha", 0, 0), box("beta", 480, 0)]);
    const session = makeSession(baseline, ["alpha", "beta"]);
    const store = makeToolStore(session);

    const result = applyOps(store, [{
      type: "updateObject",
      objectId: "beta",
      patch: { geometry: { x: 480, y: 240, width: 160, height: 96 } },
    }]);

    expect(result.isError).toBeUndefined();
    expect(result.png).toBeInstanceOf(Buffer);
    expect(result.png!.length).toBeGreaterThan(0);
  });

  test("channel-only edits get no image", () => {
    const baseline = makeDocument(
      [box("alpha", 0, 0), box("beta", 480, 0)],
      [connect("alpha-beta", "alpha", "beta")],
    );
    const session = makeSession(baseline, ["alpha", "beta"]);
    const store = makeToolStore(session);

    const result = applyOps(store, [
      { type: "updateObject", objectId: "alpha", patch: { color: "violet", text: "renamed" } },
      { type: "updateConnection", connectionId: "alpha-beta", patch: { label: "flows" } },
    ]);

    expect(result.isError).toBeUndefined();
    expect(result.png).toBeUndefined();
    expect(result.text).toContain("alpha  color gray → violet");
    expect(result.text).toContain("alpha-beta  label — → flows");
  });
});

describe("apply_quickfix perception", () => {
  test("shares the DELTA + LINTS-delta + close-up result path", () => {
    // Labeled pair 44px apart — quickfix pushes beta right (geometry change).
    const baseline = makeDocument(
      [box("alpha", 0, 0), box("beta", 204, 0)],
      [{ ...connect("edge", "alpha", "beta"), label: "X" }],
    );
    const session = makeSession(baseline, ["alpha", "beta"]);
    // Simulate a prior apply so the quickfix round reports a delta.
    session.lastDiagnostics = undefined;
    const store = makeToolStore(session);
    const seed = applyOps(store, [{ type: "updateObject", objectId: "alpha", patch: { text: "alpha" } }]);
    expect(seed.text).toContain("DIAGNOSTICS · 0 errors · 1 warning");

    const result = invokePrivate<LayoutToolRenderResult>(store, "toolApplyQuickfix", "W1");

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · quickfix W1 (unreadable-labels) · 1 op");
    expect(result.text).toContain("beta  204,0 → 288,0");
    expect(result.text).toContain("LINTS · +0 −1");
    expect(result.text).toContain("− W1 unreadable-labels");
    expect(result.png).toBeInstanceOf(Buffer);
  });
});

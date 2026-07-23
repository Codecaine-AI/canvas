import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import {
  boardStateSnapshot,
  emitSessionEvent,
  toolApplyOps,
  toolApplyQuickfix,
  type LayoutSession,
} from "../src/service/session";
import type { LayoutToolRenderResult } from "../src/service/tool-runtime";
import type { AgentPatchOperation } from "../src/protocol";
import { resolveScope } from "../src/board/scope";
import { box, connect, makeDocument } from "./synthetic";

function makeSession(
  baseline: InteractiveCanvasDocument,
  requestedScopeIds: string[],
): LayoutSession {
  const scopeResolution = resolveScope(baseline, requestedScopeIds);
  return {
    id: "perception-session",
    canvasId: "synthetic",
    canvasPath: "/tmp/perception.canvas.json",
    baseline,
    baselineHash: "test-hash",
    scopeResolution,
    scopeIds: new Set(scopeResolution.scopeObjectIds),
    draft: baseline,
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

function applyOps(
  session: LayoutSession,
  operations: AgentPatchOperation[],
): LayoutToolRenderResult {
  return toolApplyOps(session, operations, emitSessionEvent);
}

describe("spawn board-state snapshot", () => {
  test("carries the full digest plus the full lint report as one string", () => {
    // 48px gap under a "go" chip → unreadable-labels warning in the report.
    const baseline = makeDocument(
      [box("alpha", 0, 0), box("beta", 208, 0)],
      [{ ...connect("edge", "alpha", "beta"), label: "go" }],
    );
    const session = makeSession(baseline, ["alpha", "beta"]);

    const snapshot = boardStateSnapshot(session);

    expect(snapshot).toContain("BOARD ·");
    expect(snapshot).toContain('"alpha"');
    expect(snapshot).toContain("\n\nDIAGNOSTICS ·");
    // 48px gap under a "go" chip — the full lint report rides along.
    expect(snapshot).toContain("unreadable-labels");
  });

  test("recomputes from the current draft, so refinements get a fresh snapshot", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeSession(baseline, ["alpha"]);

    const first = boardStateSnapshot(session);
    session.draft = makeDocument([{ ...box("alpha", 0, 0), text: "renamed alpha" }]);
    const second = boardStateSnapshot(session);

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

    const result = applyOps(session, [
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

    const result = applyOps(session, [{
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

    const result = applyOps(session, [
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

    // Round 1 — introduce a covered-content error (beta 75% onto alpha).
    const round1 = applyOps(session, [{
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
    const round2 = applyOps(session, [{
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
    const round3 = applyOps(session, [{
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

    // Round 1 — channel-only, clean baseline.
    applyOps(session, [{ type: "updateObject", objectId: "alpha", patch: { color: "teal" } }]);

    // Round 2 — introduce the overlap.
    const round2 = applyOps(session, [{
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

    // Round 1 — baseline carries both errors.
    const round1 = applyOps(session, [{
      type: "updateObject",
      objectId: "a1",
      patch: { text: "pair a" },
    }]);
    expect(round1.text).toContain("DIAGNOSTICS · 2 errors");
    expect(session.lastDiagnostics!.map((diagnostic) => diagnostic.id)).toEqual(["E1", "E2"]);

    // Round 2 — fix pair a. The surviving b-pair finding renumbers E2 → E1,
    // but it is the same finding: not new, not resolved.
    const round2 = applyOps(session, [{
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

    const result = applyOps(session, [{
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

    const result = applyOps(session, [
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
    // Labeled pair 44px apart — the rendered 41px chip needs 73px, so the
    // quickfix pushes beta right by the grid-snapped deficit (geometry change).
    const baseline = makeDocument(
      [box("alpha", 0, 0), box("beta", 204, 0)],
      [{ ...connect("edge", "alpha", "beta"), label: "X" }],
    );
    const session = makeSession(baseline, ["alpha", "beta"]);
    // Simulate a prior apply so the quickfix round reports a delta.
    session.lastDiagnostics = undefined;
    const seed = applyOps(session, [{ type: "updateObject", objectId: "alpha", patch: { text: "alpha" } }]);
    expect(seed.text).toContain("DIAGNOSTICS · 0 errors · 1 warning");

    const result = toolApplyQuickfix(session, "W1", emitSessionEvent);

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · quickfix W1 (unreadable-labels) · 1 op");
    expect(result.text).toContain("beta  204,0 → 240,0");
    expect(result.text).toContain("LINTS · +0 −1");
    expect(result.text).toContain("− W1 unreadable-labels");
    expect(result.png).toBeInstanceOf(Buffer);
  });
});

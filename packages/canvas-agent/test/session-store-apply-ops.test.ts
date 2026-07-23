import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { pageFrameOf } from "../src/board/helpers";
import {
  draftWithPageFrame,
  emitSessionEvent,
  toolApplyOps,
  wreckedDocumentError,
  type LayoutSession,
} from "../src/service/session";
import type { AgentPatchOperation } from "../src/protocol";
import { resolveScope } from "../src/board/scope";
import { box, connect, makeDocument } from "./synthetic";

function makeSession(
  baseline: InteractiveCanvasDocument,
  requestedScopeIds: string[],
): LayoutSession {
  const scopeResolution = resolveScope(baseline, requestedScopeIds);
  return {
    id: "apply-ops-session",
    canvasId: "synthetic",
    canvasPath: "/tmp/apply-ops.canvas.json",
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
    containerId: "apply-ops-container",
    sessionDir: "/tmp/apply-ops-session",
    events: [],
    subscribers: new Set(),
    runPromise: null,
    exemplarShown: false,
    lastDiagnostics: undefined,
  };
}

describe("apply_ops", () => {
  test("rejects removed annotation operations as an unknown batch kind", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeSession(baseline, ["alpha"]);
    const draftBefore = session.draft;

    const result = toolApplyOps(session, [{
      type: "addAnnotation",
      annotation: {
        id: "comment-1",
        intent: "request",
        body: "Move this",
        target: { kind: "object", objectId: "alpha" },
      },
    } as unknown as AgentPatchOperation], emitSessionEvent);

    expect(result.isError).toBe(true);
    expect(result.text).toContain('unknown operation kind "addAnnotation"');
    expect(result.text).toContain("no operations were applied");
    expect(session.draft).toBe(draftBefore);
  });

  test("validates the whole batch before applying any operation", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeSession(baseline, ["alpha"]);
    const draftBefore = session.draft;

    const operations: AgentPatchOperation[] = [
      { type: "updateObject", objectId: "alpha", patch: { text: "changed" } },
      { type: "updateObject", objectId: "missing", patch: { color: "blue" } },
    ];
    const result = toolApplyOps(session, operations, emitSessionEvent);

    expect(result.isError).toBe(true);
    expect(result.text).toContain("no operations were applied");
    expect(result.text).toContain('op 2: updateObject id "missing" is not in the draft.');
    expect(session.draft).toBe(draftBefore);
    expect(session.draft.objects[0]!.text).toBe("alpha");
    expect(session.events).toEqual([]);
  });

  test("applies object and connection channel edits", () => {
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
    const result = toolApplyOps(session, operations, emitSessionEvent);

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
    expect(session.events.map((event) => event.type)).toEqual(["proposal", "delta"]);
  });

  test("applies waypoint steering on update and rejects malformed waypoints", () => {
    const baseline = makeDocument(
      [box("alpha", 0, 0), box("beta", 480, 0)],
      [connect("alpha-beta", "alpha", "beta")],
    );
    const session = makeSession(baseline, ["alpha", "beta"]);

    const malformed = toolApplyOps(session, [
      {
        type: "updateConnection",
        connectionId: "alpha-beta",
        patch: { waypoints: [[100, "x"]] },
      } as unknown as AgentPatchOperation,
    ], emitSessionEvent);
    expect(malformed.isError).toBe(true);
    expect(malformed.text).toContain(
      "waypoints must be an array of [x, y] finite-number pairs.",
    );

    const steered = toolApplyOps(session, [
      {
        type: "updateConnection",
        connectionId: "alpha-beta",
        patch: { waypoints: [[240, 160]], from: { objectId: "alpha", anchor: "bottom" } },
      },
    ], emitSessionEvent);
    expect(steered.isError).toBeUndefined();
    expect(session.draft.connections[0]).toMatchObject({
      waypoints: [[240, 160]],
      from: { objectId: "alpha", anchor: "bottom" },
    });
  });

  test("re-derives membership for both moved and added objects", () => {
    const sectionA = box("section-a", 0, 0, 400, 320, "section");
    const sectionB = box("section-b", 500, 0, 400, 320, "section");
    const child = { ...box("child", 80, 112), parentId: "section-a" };
    const baseline = makeDocument([sectionA, sectionB, child]);
    const session = makeSession(baseline, ["section-a", "section-b"]);

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
    const result = toolApplyOps(session, operations, emitSessionEvent);

    expect(result.isError).toBeUndefined();
    expect(session.draft.objects.find((object) => object.id === "child")?.parentId)
      .toBe("section-b");
    expect(session.draft.objects.find((object) => object.id === "new-child")?.parentId)
      .toBe("section-a");
  });

  test("auto-fits an affected section once per batch and reports it in DELTA", () => {
    const section = box("section-a", 0, 0, 400, 320, "section");
    const child = { ...box("child", 80, 112), parentId: "section-a" };
    const baseline = makeDocument([section, child]);
    const session = makeSession(baseline, ["section-a"]);

    const result = toolApplyOps(session, [{
      type: "addObject",
      object: {
        id: "new-child",
        type: "rectangle",
        text: "new child",
        geometry: { x: 288, y: 112, width: 160, height: 96 },
      },
    }], emitSessionEvent);

    expect(result.isError).toBeUndefined();
    expect(session.draft.objects.find((object) => object.id === "new-child")?.parentId)
      .toBe("section-a");
    expect(session.draft.objects.find((object) => object.id === "section-a")?.geometry)
      .toEqual({ x: 64, y: 64, width: 416, height: 176 });
    expect(result.text).toContain("section-a  0,0 400×320 → 64,64 416×176");
  });

  test("auto-fit cascades from a nested section to its ancestor", () => {
    const outer = box("outer", 0, 0, 800, 700, "section");
    const inner = { ...box("inner", 100, 150, 400, 300, "section"), parentId: "outer" };
    const child = { ...box("child", 180, 240, 100, 80), parentId: "inner" };
    const baseline = makeDocument([outer, inner, child]);
    const session = makeSession(baseline, ["outer"]);

    const result = toolApplyOps(session, [{
      type: "addObject",
      object: {
        id: "new-child",
        type: "rectangle",
        text: "new child",
        geometry: { x: 420, y: 240, width: 100, height: 80 },
      },
    }], emitSessionEvent);

    expect(result.isError).toBeUndefined();
    expect(session.draft.objects.find((object) => object.id === "inner")?.geometry)
      .not.toEqual(inner.geometry);
    expect(session.draft.objects.find((object) => object.id === "outer")?.geometry)
      .not.toEqual(outer.geometry);
    expect(result.text).toContain("inner  ");
    expect(result.text).toContain("outer  ");
  });

  test("explicit section resize wins over auto-fit for the batch", () => {
    const section = box("section-a", 0, 0, 400, 320, "section");
    const child = { ...box("child", 80, 112), parentId: "section-a" };
    const baseline = makeDocument([section, child]);
    const session = makeSession(baseline, ["section-a"]);

    const result = toolApplyOps(session, [
      {
        type: "updateObject",
        objectId: "section-a",
        patch: { geometry: { x: 0, y: 0, width: 512, height: 400 } },
      },
      {
        type: "updateObject",
        objectId: "child",
        patch: { geometry: { x: 96, y: 128, width: 160, height: 96 } },
      },
    ], emitSessionEvent);

    expect(result.isError).toBeUndefined();
    expect(session.draft.objects.find((object) => object.id === "section-a")?.geometry)
      .toEqual({ x: 0, y: 0, width: 512, height: 400 });
  });

  test("does not auto-fit or remove a background-locked page frame", () => {
    const frame = {
      ...box("page-frame", 32, 32, 1136, 656, "section"),
      locked: "background" as const,
    };
    const child = { ...box("child", 80, 112), parentId: "page-frame" };
    const baseline = makeDocument([frame, child]);
    const session = makeSession(baseline, ["child"]);

    const applied = toolApplyOps(session, [{
      type: "updateObject",
      objectId: "child",
      patch: { geometry: { x: 96, y: 128, width: 160, height: 96 } },
    }], emitSessionEvent);
    expect(applied.isError).toBeUndefined();
    expect(session.draft.objects.find((object) => object.id === "page-frame")?.geometry)
      .toEqual(frame.geometry);

    const draftBeforeRemove = session.draft;
    const removed = toolApplyOps(session, [{
      type: "removeObject",
      objectId: "page-frame",
    }], emitSessionEvent);
    expect(removed.isError).toBe(true);
    expect(removed.text).toContain('removeObject id "page-frame" is a locked background frame.');
    expect(session.draft).toBe(draftBeforeRemove);
  });

  test("injects a conventional page frame into frameless drafts only", () => {
    const child = box("child", 80, 112);
    const baseline = { ...makeDocument([child]), size: { width: 1200, height: 720 } };

    const draft = draftWithPageFrame(baseline);

    expect(baseline.objects).toEqual([child]);
    expect(draft.objects[0]).toMatchObject({
      id: "page-frame",
      type: "section",
      text: "Synthetic",
      color: "white",
      parentId: null,
      geometry: { x: 32, y: 32, width: 1136, height: 656 },
      style: { shape: "section" },
      locked: "background",
    });
    expect(pageFrameOf(draft)?.geometry).toEqual({
      x: 32,
      y: 32,
      width: 1136,
      height: 656,
    });
    expect(wreckedDocumentError(draft)).toBeNull();
    expect(draftWithPageFrame(draft)).toBe(draft);
  });

  test("derives a snapped padded frame without document size and defaults an empty page", () => {
    const contentDraft = draftWithPageFrame(makeDocument([
      box("child", 83, 117, 161, 97),
    ]));
    expect(contentDraft.objects[0]?.geometry)
      .toEqual({ x: 48, y: 80, width: 240, height: 176 });

    const emptyDraft = draftWithPageFrame(makeDocument([]));
    expect(emptyDraft.objects[0]?.geometry)
      .toEqual({ x: 32, y: 32, width: 1136, height: 656 });
  });

  test("returns the change delta and first-round diagnostics without rejecting the edit", () => {
    const baseline = makeDocument([
      box("alpha", 0, 0),
      box("beta", 320, 0),
    ], [{ ...connect("edge", "alpha", "beta"), label: "go" }]);
    const session = makeSession(baseline, ["alpha", "beta"]);

    const result = toolApplyOps(session, [{
      type: "updateObject",
      objectId: "beta",
      patch: { geometry: { x: 208, y: 0, width: 160, height: 96 } },
    }], emitSessionEvent);

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · 1 op");
    expect(result.text).toContain("DELTA");
    expect(result.text).toContain("beta  320,0 → 208,0");
    // First apply of the session: the LINTS slot carries the full list.
    expect(result.text).toContain("DIAGNOSTICS · 0 errors · 1 warning");
    expect(result.text).toContain(
      'W1 unreadable-labels: label "go" chip on edge (43×30px) bleeds onto alpha and beta: '
      + '48px of corridor where the chip needs 76px '
      + "(open the alpha↔beta corridor to ≥76px so the chip and its 16px margins fit) [quickfix]",
    );
    expect(result.text).not.toContain("BOARD ·");
    expect(session.lastDiagnostics).toHaveLength(1);
    expect(session.draft.objects.find((object) => object.id === "beta")?.geometry)
      .toEqual({ x: 208, y: 0, width: 160, height: 96 });
  });
});

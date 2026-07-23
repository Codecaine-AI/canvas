import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import {
  LayoutSessionStore,
  type LayoutSession,
} from "../src/harness/session-store";
import type { LayoutToolTextResult } from "../src/harness/tool-runtime";
import { fitScope, parseSketch } from "../src/pipeline";
import { box, makeDocument } from "./synthetic";

const ITEM_PROGRAM = [
  "item 1 text=task type=process size=M at=C",
  "",
  "arrows",
].join("\n");

const SECTION_PROGRAM = [
  'section 1 text=section label="Section"',
  "  item 2 text=task type=process size=M at=C",
  "",
  "arrows",
].join("\n");

const EMPTY_SECTION_PROGRAM = [
  'section 1 text=section label="Section"',
  "  group",
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
    id: "wrecked-gate-session",
    canvasId: "synthetic",
    canvasPath: "/tmp/wrecked-gate.canvas.json",
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
    instruction: "Arrange without crushing content",
    annotations: [],
    viewport: undefined,
    containerId: "wrecked-gate-container",
    sessionDir: "/tmp/wrecked-gate-session",
    events: [],
    subscribers: new Set(),
    runPromise: null,
  };
}

function makeToolStore(
  session: LayoutSession,
  builtDraft?: InteractiveCanvasDocument,
): LayoutSessionStore {
  const store = Object.create(LayoutSessionStore.prototype) as LayoutSessionStore;
  Object.defineProperty(store, "currentSession", { value: () => session });
  if (builtDraft) {
    // Feed a deterministic bad solver result through the actual proposal
    // boundary. The production solver should no longer generate one, but the
    // harness gate must remain independently testable as belt and braces.
    Object.defineProperty(store, "buildDraft", { value: () => builtDraft });
  }
  return store;
}

describe("wrecked-layout harness gate", () => {
  test("propose_program rejects an undersized item without mutating session state", () => {
    const baseline = makeDocument([box("task", 0, 0, 184, 96, "process")]);
    const session = makeSession(baseline, ["task"]);
    const wrecked = makeDocument([box("task", 0, 0, 80, 40, "process")]);
    const store = makeToolStore(session, wrecked);
    const draftBefore = session.draft;
    const eventsBefore = [...session.events];

    const result = invokePrivate<LayoutToolTextResult>(
      store,
      "toolProposeProgram",
      ITEM_PROGRAM,
    );

    expect(result.isError).toBe(true);
    expect(result.text).toContain("Wrecked layout rejected:");
    expect(result.text).toContain(
      'item "task" solved to 80×40, below its M minimum 184×96.',
    );
    expect(session.draft).toBe(draftBefore);
    expect(session.lastSketch).toBeNull();
    expect(session.proposalCount).toBe(0);
    expect(session.events).toEqual(eventsBefore);
  });

  test("propose_program rejects a section that does not contain its child", () => {
    const baseline = makeDocument([
      box("section", 0, 0, 480, 360, "section"),
      box("task", 120, 144, 184, 96, "process"),
    ]);
    const session = makeSession(baseline, ["section"]);
    const wrecked = makeDocument([
      box("section", 0, 0, 160, 120, "section"),
      box("task", 240, 160, 184, 96, "process"),
    ]);
    const store = makeToolStore(session, wrecked);

    const result = invokePrivate<LayoutToolTextResult>(
      store,
      "toolProposeProgram",
      SECTION_PROGRAM,
    );

    expect(result.isError).toBe(true);
    expect(result.text).toContain(
      'section "section" (160×120) does not contain its children (bounds 184×96).',
    );
    expect(session.proposalCount).toBe(0);
    expect(session.lastSketch).toBeNull();
  });

  test("propose_program enforces the empty-section legibility floor", () => {
    const baseline = makeDocument([
      box("section", 0, 0, 480, 360, "section"),
    ]);
    const session = makeSession(baseline, ["section"]);
    const wrecked = makeDocument([
      box("section", 0, 0, 80, 80, "section"),
    ]);
    const store = makeToolStore(session, wrecked);

    const result = invokePrivate<LayoutToolTextResult>(
      store,
      "toolProposeProgram",
      EMPTY_SECTION_PROGRAM,
    );

    expect(result.isError).toBe(true);
    expect(result.text).toContain(
      'section "section" solved to 80×80, below its legibility minimum 112×176.',
    );
    expect(session.proposalCount).toBe(0);
  });

  test("propose_program reconciles section membership before storing the draft", () => {
    const sectionA = box("section-a", 0, 0, 480, 360, "section");
    const sectionB = box("section-b", 560, 0, 480, 360, "section");
    const task = {
      ...box("task", 120, 144, 184, 96, "process"),
      parentId: "section-a",
    };
    const baseline = makeDocument([sectionA, sectionB, task]);
    const session = makeSession(baseline, ["task"]);
    const movedWithStaleMembership = makeDocument([
      sectionA,
      sectionB,
      {
        ...task,
        parentId: "section-a",
        geometry: { ...task.geometry, x: 680 },
      },
    ]);
    const store = makeToolStore(session, movedWithStaleMembership);

    const result = invokePrivate<LayoutToolTextResult>(
      store,
      "toolProposeProgram",
      ITEM_PROGRAM,
    );

    expect(result.isError).not.toBe(true);
    expect(session.draft.objects.find((object) => object.id === "task")?.parentId).toBe(
      "section-b",
    );
    expect(session.proposalCount).toBe(1);
  });

  // The old "commit rechecks the current draft" case died with the sketch
  // gate at commit: the v4 commit gate blocks on error-tier diagnostics only
  // (covered in session-store-doc-commit.test.ts). propose_program still
  // refuses wrecked solves at the proposal boundary, per the cases above.
});

import { describe, expect, test } from "bun:test";

import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
} from "@codecaine-ai/canvas/schema";

import {
  LayoutSessionStore,
  type LayoutSession,
} from "../src/harness/session-store";
import type { LayoutToolTextResult } from "../src/harness/tool-runtime";
import { fitScope } from "../src/pipeline";
import { box, connect, makeDocument } from "./synthetic";

const ITEMS = [
  "row 1|1|1",
  "  item 1 text=alpha type=rectangle size=M at=C",
  "  item 2 text=beta type=rectangle size=M at=C",
  "  item 3 text=gamma type=rectangle size=M at=C",
  "",
  "arrows",
];

const NO_ARROW_PROGRAM = ITEMS.join("\n");
const AUTHORITATIVE_ARROW_PROGRAM = [...ITEMS, "  1 > 2"].join("\n");

function invokePrivate<T>(store: LayoutSessionStore, name: string, ...args: unknown[]): T {
  const method = Reflect.get(store, name) as (...methodArgs: unknown[]) => T;
  return method.apply(store, args);
}

function makeSession(baseline: InteractiveCanvasDocument): LayoutSession {
  const requestedScopeIds = baseline.objects.map((object) => object.id);
  const fit = fitScope(baseline, requestedScopeIds);
  return {
    id: "propose-program-connections-session",
    canvasId: "synthetic",
    canvasPath: "/tmp/propose-program-connections.canvas.json",
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
    instruction: "Arrange the selected objects",
    annotations: [],
    viewport: undefined,
    containerId: "propose-program-connections-container",
    sessionDir: "/tmp/propose-program-connections-session",
    events: [],
    subscribers: new Set(),
    runPromise: null,
    exemplarShown: false,
  };
}

function makeToolStore(session: LayoutSession): LayoutSessionStore {
  const store = Object.create(LayoutSessionStore.prototype) as LayoutSessionStore;
  Object.defineProperty(store, "currentSession", { value: () => session });
  return store;
}

function threeObjects(): InteractiveCanvasDocument["objects"] {
  return [
    box("alpha", 0, 0),
    box("beta", 320, 0),
    box("gamma", 640, 0),
  ];
}

describe("propose_program connection rebuilding", () => {
  test("a program with no arrows preserves connections and their channels", () => {
    const connection: InteractiveCanvasConnection = {
      ...connect("alpha-beta", "alpha", "beta"),
      label: "Approval path",
      style: "dashed",
      color: "blue",
    };
    const baseline = makeDocument(threeObjects(), [connection]);
    const session = makeSession(baseline);
    const store = makeToolStore(session);

    const result = invokePrivate<LayoutToolTextResult>(
      store,
      "toolProposeProgram",
      NO_ARROW_PROGRAM,
    );

    expect(result.isError).toBeUndefined();
    expect(session.draft.connections).toEqual([connection]);
    expect(result.text).not.toContain("connection DELETED");
  });

  test("a non-empty arrows block still drops omitted in-scope connections", () => {
    const kept = connect("alpha-beta", "alpha", "beta");
    const omitted = connect("beta-gamma", "beta", "gamma");
    const baseline = makeDocument(threeObjects(), [kept, omitted]);
    const session = makeSession(baseline);
    const store = makeToolStore(session);

    const result = invokePrivate<LayoutToolTextResult>(
      store,
      "toolProposeProgram",
      AUTHORITATIVE_ARROW_PROGRAM,
    );

    expect(result.isError).toBeUndefined();
    expect(session.draft.connections).toEqual([kept]);
    expect(result.text).toContain("*** 1 connection DELETED: beta → gamma ***");
  });
});

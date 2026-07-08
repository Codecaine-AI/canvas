import { afterEach, describe, expect, it } from "bun:test";
import {
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
  type CanvasAction,
} from "../../../../state/actions";
import { sectionFitGeometry } from "../../../../state/geometry";
import type {
  CanvasGeometry,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../../../state/schema";
import { animateSectionFitToChildren, isSectionFitted } from "../animate-section-fit";

type RafGlobal = typeof globalThis & {
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame?: (handle: number) => void;
  matchMedia?: Window["matchMedia"];
};

const rafGlobal = globalThis as RafGlobal;
const originalRequestAnimationFrame = rafGlobal.requestAnimationFrame;
const originalCancelAnimationFrame = rafGlobal.cancelAnimationFrame;
const originalMatchMedia = rafGlobal.matchMedia;

function makeObject(
  overrides: Partial<InteractiveCanvasObject> & { id: string },
): InteractiveCanvasObject {
  return {
    id: overrides.id,
    type: "process",
    text: overrides.id,
    geometry: { x: 0, y: 0, width: 100, height: 100 },
    ...overrides,
  };
}

function sectionFitDocument(children: InteractiveCanvasObject[] = []): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "section-fit-animation-test",
    mode: "diagram",
    objects: [
      makeObject({
        id: "section-a",
        type: "section",
        text: "Section A",
        geometry: { x: 100, y: 80, width: 520, height: 360 },
        style: { shape: "section" },
      }),
      ...children,
    ],
    connections: [],
  };
}

function childObject(): InteractiveCanvasObject {
  return makeObject({
    id: "child-a",
    text: "Child A",
    parentId: "section-a",
    geometry: { x: 260, y: 220, width: 120, height: 80 },
  });
}

function sectionGeometry(document: InteractiveCanvasDocument): CanvasGeometry {
  const section = document.objects.find((object) => object.id === "section-a");
  expect(section).toBeTruthy();
  return section!.geometry;
}

function installNoRaf() {
  rafGlobal.requestAnimationFrame = undefined;
  rafGlobal.cancelAnimationFrame = undefined;
  rafGlobal.matchMedia = undefined;
}

function installFakeRaf() {
  let nextHandle = 1;
  const pending = new Map<number, FrameRequestCallback>();
  rafGlobal.requestAnimationFrame = (callback) => {
    const handle = nextHandle++;
    pending.set(handle, callback);
    return handle;
  };
  rafGlobal.cancelAnimationFrame = (handle) => {
    pending.delete(handle);
  };
  rafGlobal.matchMedia = undefined;

  return {
    runFrame(timestamp: number) {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback(timestamp);
    },
    get pendingCount() {
      return pending.size;
    },
  };
}

afterEach(() => {
  rafGlobal.requestAnimationFrame = originalRequestAnimationFrame;
  rafGlobal.cancelAnimationFrame = originalCancelAnimationFrame;
  rafGlobal.matchMedia = originalMatchMedia;
});

describe("animateSectionFitToChildren", () => {
  it("falls back to the instant fit action when requestAnimationFrame is unavailable", () => {
    installNoRaf();
    let state = createInteractiveCanvasState(sectionFitDocument([childObject()]));
    const originalGeometry = sectionGeometry(state.document);
    const targetGeometry = sectionFitGeometry(state.document, "section-a");
    const actions: CanvasAction[] = [];
    const dispatch = (action: CanvasAction) => {
      actions.push(action);
      state = reduceInteractiveCanvasState(state, action);
    };

    expect(
      animateSectionFitToChildren({
        document: state.document,
        dispatch,
        sectionId: "section-a",
      }),
    ).toBe(true);

    expect(actions).toEqual([{ type: "canvas.fitSectionToChildren", sectionId: "section-a" }]);
    expect(sectionGeometry(state.document)).toEqual(targetGeometry);
    expect(state.history.past.length).toBe(1);

    state = reduceInteractiveCanvasState(state, { type: "canvas.undo" });
    expect(sectionGeometry(state.document)).toEqual(originalGeometry);
  });

  it("no-ops without dispatching when a section has no children", () => {
    installNoRaf();
    let state = createInteractiveCanvasState(sectionFitDocument());
    const actions: CanvasAction[] = [];
    const dispatch = (action: CanvasAction) => {
      actions.push(action);
      state = reduceInteractiveCanvasState(state, action);
    };

    expect(
      animateSectionFitToChildren({
        document: state.document,
        dispatch,
        sectionId: "section-a",
      }),
    ).toBe(false);

    expect(actions).toEqual([]);
    expect(state.history.past.length).toBe(0);
  });

  it("keeps animation frames out of history and makes undo restore the exact original geometry", () => {
    const raf = installFakeRaf();
    let state = createInteractiveCanvasState(sectionFitDocument([childObject()]));
    const originalGeometry = sectionGeometry(state.document);
    const targetGeometry = sectionFitGeometry(state.document, "section-a");
    const actions: CanvasAction[] = [];
    const dispatch = (action: CanvasAction) => {
      actions.push(action);
      state = reduceInteractiveCanvasState(state, action);
    };

    expect(
      animateSectionFitToChildren({
        document: state.document,
        dispatch,
        sectionId: "section-a",
      }),
    ).toBe(true);
    expect(raf.pendingCount).toBe(1);
    expect(actions).toEqual([]);

    raf.runFrame(0);
    raf.runFrame(90);
    expect(actions.every((action) => action.type !== "canvas.fitSectionToChildren")).toBe(true);
    expect(state.history.past.length).toBe(0);
    expect(sectionGeometry(state.document)).not.toEqual(originalGeometry);
    expect(sectionGeometry(state.document)).not.toEqual(targetGeometry);

    raf.runFrame(180);
    expect(actions.at(-1)).toEqual({ type: "canvas.fitSectionToChildren", sectionId: "section-a" });
    expect(sectionGeometry(state.document)).toEqual(targetGeometry);
    expect(state.history.past.length).toBe(1);
    expect(sectionGeometry(state.history.past[0]!)).toEqual(originalGeometry);

    state = reduceInteractiveCanvasState(state, { type: "canvas.undo" });
    expect(sectionGeometry(state.document)).toEqual(originalGeometry);
  });

  it("cancels an overlapping fit on the same section before starting the next tween", () => {
    const raf = installFakeRaf();
    let state = createInteractiveCanvasState(sectionFitDocument([childObject()]));
    const originalGeometry = sectionGeometry(state.document);
    const targetGeometry = sectionFitGeometry(state.document, "section-a");
    const actions: CanvasAction[] = [];
    const dispatch = (action: CanvasAction) => {
      actions.push(action);
      state = reduceInteractiveCanvasState(state, action);
    };

    animateSectionFitToChildren({
      document: state.document,
      dispatch,
      sectionId: "section-a",
    });
    raf.runFrame(0);
    raf.runFrame(90);
    expect(sectionGeometry(state.document)).not.toEqual(originalGeometry);

    animateSectionFitToChildren({
      document: state.document,
      dispatch,
      sectionId: "section-a",
    });
    expect(sectionGeometry(state.document)).toEqual(originalGeometry);
    expect(raf.pendingCount).toBe(1);

    raf.runFrame(180);
    raf.runFrame(360);
    expect(sectionGeometry(state.document)).toEqual(targetGeometry);
    expect(actions.filter((action) => action.type === "canvas.fitSectionToChildren").length).toBe(1);

    state = reduceInteractiveCanvasState(state, { type: "canvas.undo" });
    expect(sectionGeometry(state.document)).toEqual(originalGeometry);
  });
});

describe("isSectionFitted", () => {
  it("reports fitted only for sections with no target or geometry already at the fit target", () => {
    let state = createInteractiveCanvasState(sectionFitDocument([childObject()]));
    expect(isSectionFitted(state.document, "section-a")).toBe(false);
    expect(isSectionFitted(state.document, "child-a")).toBe(false);
    expect(isSectionFitted(sectionFitDocument(), "section-a")).toBe(true);

    const targetGeometry = sectionFitGeometry(state.document, "section-a");
    expect(targetGeometry).toBeTruthy();
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.fitSectionToChildren",
      sectionId: "section-a",
    });

    expect(sectionGeometry(state.document)).toEqual(targetGeometry);
    expect(isSectionFitted(state.document, "section-a")).toBe(true);
  });
});

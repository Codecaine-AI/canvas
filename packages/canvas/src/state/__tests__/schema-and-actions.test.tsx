import { afterEach, describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import syntheticCanvas from "../../../../../canvases/synthetic.canvas.json";
import v2FlowSampleDocumentJson from "../../../../../canvases/v2-flow-interactive.canvas.json";
import {
  buildPastePayload,
  copySelection,
  createInteractiveCanvasState,
  InteractiveCanvasEditor,
  reduceInteractiveCanvasState,
  validateInteractiveCanvasDocument,
  type CanvasAction,
  type InteractiveCanvasDocument,
  type InteractiveCanvasObject,
  type InteractiveCanvasObjectType,
} from "../../index";
import { reconcileSectionMembership } from "../section-membership";

const syntheticCanvasDocument = syntheticCanvas as InteractiveCanvasDocument;
const v2FlowSampleDocument = v2FlowSampleDocumentJson as InteractiveCanvasDocument;

afterEach(() => {
  cleanup();
});

async function waitForAnimationFrame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

function makeSetParentDocument(): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "test-doc",
    mode: "diagram",
    objects: [
      {
        id: "section-a",
        type: "section",
        text: "Section A",
        color: "gray",
        geometry: { x: 40, y: 40, width: 320, height: 220 },
      },
      {
        id: "section-b",
        type: "section",
        text: "Section B",
        color: "blue",
        parentId: "section-a",
        geometry: { x: 80, y: 80, width: 180, height: 120 },
      },
      {
        id: "process-a",
        type: "process",
        text: "Process A",
        geometry: { x: 420, y: 120, width: 160, height: 96 },
      },
      {
        id: "process-b",
        type: "process",
        text: "Process B",
        parentId: "section-a",
        geometry: { x: 190, y: 160, width: 160, height: 96 },
      },
    ],
    connections: [],
  };
}

function makeConnectionDocument(): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "connection-test-doc",
    mode: "diagram",
    objects: [
      {
        id: "process-a",
        type: "process",
        text: "Process A",
        geometry: { x: 40, y: 40, width: 160, height: 96 },
      },
      {
        id: "process-b",
        type: "process",
        text: "Process B",
        geometry: { x: 260, y: 40, width: 160, height: 96 },
      },
      {
        id: "process-c",
        type: "process",
        text: "Process C",
        geometry: { x: 480, y: 40, width: 160, height: 96 },
      },
    ],
    connections: [
      {
        id: "connection-a",
        from: { objectId: "process-a", anchor: "right" },
        to: { objectId: "process-b", anchor: "left" },
        label: "A to B",
        style: "solid",
        arrow: "forward",
      },
      {
        id: "connection-b",
        from: { objectId: "process-b", anchor: "right" },
        to: { objectId: "process-c", anchor: "left" },
        style: "dashed",
      },
    ],
    annotations: [
      {
        id: "annotation-connection-a",
        target: { kind: "connection", connectionId: "connection-a" },
        intent: "note",
        body: "Review connector",
        status: "open",
        createdBy: "human",
      },
      {
        id: "annotation-object-a",
        target: { kind: "object", objectId: "process-a" },
        intent: "note",
        body: "Keep object annotation",
        status: "open",
        createdBy: "human",
      },
    ],
  };
}

function makeClipboardDocument(): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "clipboard-test-doc",
    mode: "diagram",
    objects: [
      {
        id: "section-a",
        type: "section",
        text: "Section A",
        color: "gray",
        geometry: { x: 40, y: 40, width: 360, height: 240 },
      },
      {
        id: "process-a",
        type: "process",
        text: "Process A",
        parentId: "section-a",
        geometry: { x: 80, y: 96, width: 160, height: 96 },
      },
      {
        id: "process-b",
        type: "process",
        text: "Process B",
        parentId: "section-a",
        geometry: { x: 280, y: 112, width: 160, height: 96 },
      },
      {
        id: "process-c",
        type: "process",
        text: "Process C",
        geometry: { x: 520, y: 120, width: 160, height: 96 },
      },
    ],
    connections: [
      {
        id: "connection-a",
        from: { objectId: "process-a", anchor: "right" },
        to: { objectId: "process-b", anchor: "left" },
        style: "solid",
      },
      {
        id: "connection-b",
        from: { objectId: "process-b", anchor: "right" },
        to: { objectId: "process-c", anchor: "left" },
        style: "dashed",
      },
    ],
  };
}

function boundsCenter(document: InteractiveCanvasDocument, ids: string[]): { x: number; y: number } {
  const objects = document.objects.filter((object) => ids.includes(object.id));
  const minX = Math.min(...objects.map((object) => object.geometry.x));
  const minY = Math.min(...objects.map((object) => object.geometry.y));
  const maxX = Math.max(...objects.map((object) => object.geometry.x + object.geometry.width));
  const maxY = Math.max(...objects.map((object) => object.geometry.y + object.geometry.height));
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

function makeMembershipObject(
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

function makeMembershipSection(
  overrides: Partial<InteractiveCanvasObject> & { id: string },
): InteractiveCanvasObject {
  return makeMembershipObject({
    type: "section",
    text: overrides.id,
    color: "gray",
    ...overrides,
  });
}

function makeMembershipDocument(objects: InteractiveCanvasObject[]): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "section-membership-actions-doc",
    mode: "diagram",
    objects,
    connections: [],
  };
}

function parentId(document: InteractiveCanvasDocument, objectId: string): string | null | undefined {
  return document.objects.find((object) => object.id === objectId)?.parentId;
}

function expectSectionMembershipReconciled(document: InteractiveCanvasDocument) {
  expect(reconcileSectionMembership(document)).toBe(document);
}

describe("interactive canvas schema and actions", () => {
  it("validates the synthetic canvas JSON", () => {
    const validation = validateInteractiveCanvasDocument(syntheticCanvasDocument);

    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.document.objects.some((object) => object.type === "decision")).toBe(true);
      expect(validation.document.connections.some((connection) => connection.style === "dashed")).toBe(true);
      expect(validation.document.annotations?.length).toBeGreaterThan(0);
    }
  });

  it("validates the V2 Flow-style canvas JSON after the synthetic baseline", () => {
    const validation = validateInteractiveCanvasDocument(v2FlowSampleDocument);

    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.document.objects.some((object) => object.id === "memory-bank")).toBe(true);
      expect(validation.document.objects.some((object) => object.type === "decision")).toBe(true);
      expect(validation.document.connections.some((connection) => connection.role === "feedback-loop")).toBe(true);
    }
  });

  it("validates every canvas JSON file in this repo's canvases/ store", async () => {
    // Repo-local store only (canvases/*.canvas.json at the repo root) — this
    // repo's tests must not reach into a host monorepo's files.
    const storeDir = join(import.meta.dir, "..", "..", "..", "..", "..", "canvases");
    const entries = (await readdir(storeDir)).filter((name) => name.endsWith(".canvas.json"));
    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      const raw = await readFile(join(storeDir, entry), "utf8");
      const validation = validateInteractiveCanvasDocument(JSON.parse(raw));
      expect(validation.ok).toBe(true);
    }
  });

  it("rejects duplicate IDs and unknown endpoints", () => {
    const validation = validateInteractiveCanvasDocument({
      ...syntheticCanvasDocument,
      objects: [
        syntheticCanvasDocument.objects[0],
        { ...syntheticCanvasDocument.objects[0] },
      ],
      connections: [
        {
          id: "bad",
          from: { objectId: "missing" },
          to: { objectId: "interview-flow" },
        },
      ],
    });

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues.map((issue) => issue.message).join(" ")).toContain("Duplicate");
      expect(validation.issues.map((issue) => issue.message).join(" ")).toContain("Unknown");
    }
  });

  it("rejects parentId cycles", () => {
    const validation = validateInteractiveCanvasDocument({
      ...syntheticCanvasDocument,
      objects: [
        {
          id: "section-a",
          type: "section",
          text: "Section A",
          color: "gray",
          parentId: "section-b",
          geometry: { x: 0, y: 0, width: 200, height: 160 },
        },
        {
          id: "section-b",
          type: "section",
          text: "Section B",
          color: "blue",
          parentId: "section-a",
          geometry: { x: 20, y: 20, width: 120, height: 80 },
        },
      ],
      connections: [],
    });

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues.map((issue) => issue.message).join(" ")).toContain("Parent cycle");
    }
  });

  it("rejects a parentId that references a non-section object", () => {
    const validation = validateInteractiveCanvasDocument({
      ...syntheticCanvasDocument,
      objects: [
        {
          id: "process-a",
          type: "process",
          text: "Process A",
          geometry: { x: 0, y: 0, width: 160, height: 96 },
        },
        {
          id: "process-b",
          type: "process",
          text: "Process B",
          parentId: "process-a",
          geometry: { x: 220, y: 0, width: 160, height: 96 },
        },
      ],
      connections: [],
    });

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(
        validation.issues.some(
          (issue) =>
            issue.path === "$.objects.process-b.parentId" &&
            issue.message.includes("Parent must be a section"),
        ),
      ).toBe(true);
    }
  });

  it("accepts the expanded object vocabulary (document/person/database/chat) with color picks", () => {
    const document: InteractiveCanvasDocument = {
      schemaVersion: 1,
      id: "expanded-vocab-doc",
      mode: "diagram",
      objects: [
        {
          id: "doc-a",
          type: "document",
          text: "Doc A",
          geometry: { x: 0, y: 0, width: 160, height: 120 },
          color: "violet",
        },
        {
          id: "person-a",
          type: "person",
          text: "Person A",
          geometry: { x: 200, y: 0, width: 120, height: 140 },
          color: "green",
        },
        {
          id: "database-a",
          type: "database",
          text: "Database A",
          geometry: { x: 400, y: 0, width: 140, height: 120 },
          color: "violet",
        },
        {
          id: "chat-a",
          type: "chat",
          text: "Chat A",
          geometry: { x: 600, y: 0, width: 180, height: 110 },
          color: "blue",
        },
      ],
      connections: [],
    };

    const validation = validateInteractiveCanvasDocument(document);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      const types = validation.document.objects.map((object) => object.type);
      expect(types).toEqual(["document", "person", "database", "chat"]);
      expect(validation.document.objects.map((object) => object.color)).toEqual([
        "violet",
        "green",
        "violet",
        "blue",
      ]);
      expect(validation.warnings).toBeUndefined();
    }
  });

  it("drops an unknown color id with a non-fatal validation warning", () => {
    const document = {
      schemaVersion: 1,
      id: "bad-color-doc",
      mode: "diagram",
      objects: [
        {
          id: "doc-a",
          type: "document",
          text: "Doc A",
          geometry: { x: 0, y: 0, width: 160, height: 120 },
          color: "not-a-real-color",
        },
      ],
      connections: [],
    };

    const validation = validateInteractiveCanvasDocument(document);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.document.objects[0]?.color).toBeUndefined();
      expect(validation.warnings?.length).toBe(1);
      expect(validation.warnings?.[0]?.message).toContain("not-a-real-color");
    }
  });

  it("addObject applies defaults (geometry/text/color/shape) for each new object type", () => {
    // canvas.addObject runs the default geometry through snapGeometry (16px
    // grid), so expected sizes here are the *snapped* values, matching how
    // e.g. the pre-existing rectangle default (360) already snaps to 368.
    const base = createInteractiveCanvasState(syntheticCanvasDocument);
    const cases: Array<{
      objectType: InteractiveCanvasObjectType;
      expectedShape: string;
      expectedSize: { width: number; height: number };
    }> = [
      { objectType: "document", expectedShape: "document", expectedSize: { width: 160, height: 128 } },
      { objectType: "person", expectedShape: "person", expectedSize: { width: 128, height: 144 } },
      { objectType: "database", expectedShape: "database", expectedSize: { width: 144, height: 128 } },
      { objectType: "chat", expectedShape: "chat", expectedSize: { width: 176, height: 112 } },
    ];

    for (const testCase of cases) {
      const state = reduceInteractiveCanvasState(base, {
        type: "canvas.addObject",
        objectType: testCase.objectType,
      });
      const added = state.document.objects.at(-1);
      expect(added?.type).toBe(testCase.objectType);
      expect(added?.style?.shape).toBe(testCase.expectedShape);
      expect(added?.geometry.width).toBe(testCase.expectedSize.width);
      expect(added?.geometry.height).toBe(testCase.expectedSize.height);
      // D17 — new objects take the per-kind first-use color (no pick made yet).
      expect(added?.color).toBe("gray");
    }
  });

  it("moves and resizes objects through editor pointer interactions before saving", async () => {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if ((this as HTMLElement).dataset.canvasStage === "true") {
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          width: 1240,
          height: 760,
          right: 1240,
          bottom: 760,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return originalRect.call(this);
    };

    try {
      const saved: InteractiveCanvasDocument[] = [];
      render(
        <InteractiveCanvasEditor
          document={syntheticCanvasDocument}
          onSave={(document) => {
            saved.push(document);
          }}
          onCancel={() => undefined}
        />,
      );

      expect(document.querySelector("[data-canvas-stage='true']")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Select" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Hand" })).toBeTruthy();
      expect(screen.queryByText("Tools")).toBeNull();

      const canvasLayer = Array.from(
        document.querySelectorAll(".interactive-canvas-stage .interactive-canvas-layer"),
      ).find((element) => element instanceof HTMLElement && element.tagName === "DIV");
      expect(canvasLayer).toBeTruthy();
      fireEvent.contextMenu(canvasLayer!, {
        clientX: 220,
        clientY: 220,
      });
      expect(screen.getByRole("menu", { name: "Canvas context menu" })).toBeTruthy();
      fireEvent.click(screen.getByRole("menuitem", { name: "Add sticky" }));
      expect(screen.queryByRole("menu", { name: "Canvas context menu" })).toBeNull();
      const sticky = screen.getByRole("button", { name: "sticky" });
      expect(sticky.querySelector(".interactive-canvas-sticky-body")?.textContent?.trim()).toBe("");

      const object = screen.getByRole("button", { name: /Agent summarizes/i });
      fireEvent.contextMenu(object, {
        clientX: 560,
        clientY: 220,
      });
      expect(screen.getByRole("menuitem", { name: "Delete object" })).toBeTruthy();
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("menu", { name: "Canvas context menu" })).toBeNull();

      const originalGeometry = syntheticCanvasDocument.objects.find(
        (candidate) => candidate.id === "agent-summarizes",
      )?.geometry;
      expect(originalGeometry).toBeTruthy();

      await act(async () => {
        fireEvent.pointerDown(object, {
          pointerId: 1,
          button: 0,
          clientX: 560,
          clientY: 220,
        });
        fireEvent.pointerMove(window, {
          pointerId: 1,
          clientX: 660,
          clientY: 252,
        });
        fireEvent.pointerUp(window, { pointerId: 1 });
      });

      const resizeHandle = document.querySelector('[data-canvas-handle="se"]');
      expect(resizeHandle).toBeTruthy();
      await act(async () => {
        fireEvent.pointerDown(resizeHandle!, {
          pointerId: 2,
          button: 0,
          clientX: 720,
          clientY: 304,
        });
        fireEvent.pointerMove(window, {
          pointerId: 2,
          clientX: 800,
          clientY: 368,
        });
        fireEvent.pointerUp(window, { pointerId: 2 });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Save/i }));
      });

      const savedGeometry = saved[0]?.objects.find(
        (candidate) => candidate.id === "agent-summarizes",
      )?.geometry;
      expect(savedGeometry).toBeTruthy();
      expect(savedGeometry!.x).toBeGreaterThan(originalGeometry!.x);
      expect(savedGeometry!.width).toBeGreaterThan(originalGeometry!.width);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalRect;
    }
  });

  it("pans with the hand tool without starting marquee or changing selection", async () => {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if ((this as HTMLElement).dataset.canvasStage === "true") {
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          width: 1240,
          height: 760,
          right: 1240,
          bottom: 760,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return originalRect.call(this);
    };

    try {
      render(
        <InteractiveCanvasEditor
          document={syntheticCanvasDocument}
          onSave={() => undefined}
          onCancel={() => undefined}
        />,
      );

      const stage = document.querySelector("[data-canvas-stage='true']") as HTMLElement;
      const worldLayer = document.querySelector(".interactive-canvas-world-layer") as HTMLElement;
      const object = screen.getByRole("button", { name: /Agent summarizes/i });

      fireEvent.pointerDown(object, { pointerId: 11, button: 0, clientX: 560, clientY: 220 });
      fireEvent.pointerUp(window, { pointerId: 11 });
      expect(object.getAttribute("data-selected")).toBe("true");

      fireEvent.click(screen.getByRole("button", { name: "Hand" }));
      const beforeTransform = worldLayer.style.transform;

      fireEvent.pointerDown(stage, { pointerId: 12, button: 0, clientX: 400, clientY: 300 });
      expect(stage.style.cursor).toBe("grabbing");
      fireEvent.pointerMove(stage, { pointerId: 12, clientX: 360, clientY: 280 });
      await waitForAnimationFrame();
      fireEvent.pointerUp(stage, { pointerId: 12 });

      expect(worldLayer.style.transform).not.toBe(beforeTransform);
      expect(document.querySelector("[data-canvas-marquee='true']")).toBeNull();
      expect(object.getAttribute("data-selected")).toBe("true");
      expect(stage.style.cursor).toBe("grab");

      fireEvent.keyDown(window, { key: "v", code: "KeyV" });
      expect(stage.style.cursor).toContain('url("data:image/svg+xml');
      expect(stage.style.cursor).toContain(", default");
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalRect;
    }
  });

  it("does not stay in space-pan mode after a lost keyup (window blur)", async () => {
    render(
      <InteractiveCanvasEditor
        document={syntheticCanvasDocument}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    const stage = document.querySelector("[data-canvas-stage='true']") as HTMLElement;

    // Space keydown reaches the app, but the keyup is swallowed elsewhere
    // (macOS ⌘⇧4+Space screenshot mode, app switch). The blur must reset the
    // held state — otherwise every plain left-drag in select mode pans.
    fireEvent.keyDown(window, { key: " ", code: "Space" });

    // Sanity: while space is held, a drag really is a pan (cursor: grabbing).
    fireEvent.pointerDown(stage, { pointerId: 13, button: 0, clientX: 400, clientY: 300 });
    expect(stage.style.cursor).toBe("grabbing");
    fireEvent.pointerUp(stage, { pointerId: 13 });

    fireEvent.keyDown(window, { key: " ", code: "Space" });
    fireEvent.blur(window);

    // After the lost keyup, a plain drag must NOT enter pan mode.
    fireEvent.pointerDown(stage, { pointerId: 14, button: 0, clientX: 400, clientY: 300 });
    expect(stage.style.cursor).not.toBe("grabbing");
    fireEvent.pointerUp(stage, { pointerId: 14 });
  });
});

describe("interactive canvas: canvas.setParent action", () => {
  it("reparents an object into a section", () => {
    const initialState = createInteractiveCanvasState(makeSetParentDocument());
    const originalGeometry = initialState.document.objects.find(
      (object) => object.id === "process-a",
    )?.geometry;

    const state = reduceInteractiveCanvasState(initialState, {
      type: "canvas.setParent",
      objectIds: ["process-a"],
      parentId: "section-a",
    });

    const object = state.document.objects.find((candidate) => candidate.id === "process-a");
    expect(object?.parentId).toBe("section-a");
    expect(object?.geometry).toEqual(originalGeometry);
    expect(state.lastChange?.summary).toBe("Moved into Section A");
    expect(state.history.past.length).toBe(initialState.history.past.length + 1);
  });

  it("clears parentId when dropped on open canvas", () => {
    const state = reduceInteractiveCanvasState(createInteractiveCanvasState(makeSetParentDocument()), {
      type: "canvas.setParent",
      objectIds: ["process-b"],
      parentId: null,
    });

    expect(state.document.objects.find((object) => object.id === "process-b")?.parentId).toBeNull();
    expect(state.lastChange?.summary).toBe("Moved out of section");
  });

  it("rejects a non-section parent target", () => {
    const initialState = createInteractiveCanvasState(makeSetParentDocument());

    const state = reduceInteractiveCanvasState(initialState, {
      type: "canvas.setParent",
      objectIds: ["process-b"],
      parentId: "process-a",
    });

    expect(state).toBe(initialState);
    expect(state.document.objects.find((object) => object.id === "process-b")?.parentId).toBe(
      "section-a",
    );
    expect(state.history.past.length).toBe(initialState.history.past.length);
  });

  it("rejects cycles", () => {
    const initialState = createInteractiveCanvasState(makeSetParentDocument());

    const state = reduceInteractiveCanvasState(initialState, {
      type: "canvas.setParent",
      objectIds: ["section-a"],
      parentId: "section-b",
    });

    expect(state).toBe(initialState);
    expect(state.document.objects.find((object) => object.id === "section-a")?.parentId).toBe(
      null,
    );
    expect(state.history.past.length).toBe(initialState.history.past.length);
  });

  it("is undoable", () => {
    let state = createInteractiveCanvasState(makeSetParentDocument());

    state = reduceInteractiveCanvasState(state, {
      type: "canvas.setParent",
      objectIds: ["process-a"],
      parentId: "section-a",
    });
    state = reduceInteractiveCanvasState(state, { type: "canvas.undo" });

    expect(state.document.objects.find((object) => object.id === "process-a")?.parentId).toBe(
      null,
    );
  });
});

describe("interactive canvas: canvas.captureSectionContents action", () => {
  // Recorded chain: grand > mid > capturing > child-section. Every non-section
  // object sits geometrically inside "capturing"; what varies is the recorded
  // parentId, which is what the adoption predicate keys on.
  function makeCaptureDocument(): InteractiveCanvasDocument {
    return {
      schemaVersion: 1,
      id: "capture-doc",
      mode: "diagram",
      objects: [
        {
          id: "grand",
          type: "section",
          text: "Grand",
          color: "gray",
          geometry: { x: 0, y: 0, width: 1000, height: 1000 },
        },
        {
          id: "mid",
          type: "section",
          text: "Mid",
          color: "blue",
          parentId: "grand",
          geometry: { x: 50, y: 50, width: 600, height: 600 },
        },
        {
          id: "capturing",
          type: "section",
          text: "Capturing",
          color: "green",
          parentId: "mid",
          geometry: { x: 100, y: 100, width: 400, height: 400 },
        },
        {
          id: "child-section",
          type: "section",
          text: "Child",
          color: "gray",
          parentId: "capturing",
          geometry: { x: 120, y: 120, width: 200, height: 200 },
        },
        {
          id: "deep-note",
          type: "process",
          text: "Deep note",
          parentId: "child-section",
          geometry: { x: 140, y: 140, width: 50, height: 50 },
        },
        // Legacy flat-doc shape: inside "capturing" but recorded on the outer
        // ancestor "grand".
        {
          id: "legacy-flat",
          type: "process",
          text: "Legacy flat",
          parentId: "grand",
          geometry: { x: 360, y: 360, width: 50, height: 50 },
        },
        {
          id: "unparented",
          type: "process",
          text: "Unparented",
          geometry: { x: 420, y: 360, width: 50, height: 50 },
        },
        {
          id: "sibling-section",
          type: "section",
          text: "Sibling",
          color: "blue",
          geometry: { x: 2000, y: 0, width: 300, height: 300 },
        },
        // Recorded member of the unrelated sibling section, parked inside
        // "capturing" geometrically.
        {
          id: "sibling-member",
          type: "process",
          text: "Sibling member",
          parentId: "sibling-section",
          geometry: { x: 360, y: 420, width: 50, height: 50 },
        },
      ],
      connections: [],
    };
  }

  function capture(): Map<string, string | null | undefined> {
    const state = reduceInteractiveCanvasState(createInteractiveCanvasState(makeCaptureDocument()), {
      type: "canvas.captureSectionContents",
      sectionId: "capturing",
    });
    return new Map(state.document.objects.map((object) => [object.id, object.parentId]));
  }

  it("adopts objects parented to a strict ancestor of the capturing section (legacy flat-doc repair)", () => {
    const parents = capture();
    expect(parents.get("legacy-flat")).toBe("capturing");
    // Unparented captured objects are still adopted, as before.
    expect(parents.get("unparented")).toBe("capturing");
  });

  it("repairs stale unrelated parentIds before capture runs", () => {
    const parents = capture();
    expect(parents.get("sibling-member")).toBe("capturing");
  });

  it("does not flatten objects parented to the capturing section's own descendants", () => {
    const parents = capture();
    expect(parents.get("deep-note")).toBe("child-section");
    expect(parents.get("child-section")).toBe("capturing");
  });
});

describe("interactive canvas: section membership reconciliation", () => {
  it("canvas.reconcileSectionMembership adopts stale live geometry and can record history", () => {
    const document = makeMembershipDocument([
      makeMembershipSection({ id: "section", geometry: { x: 0, y: 0, width: 300, height: 300 } }),
      makeMembershipObject({ id: "card", geometry: { x: 500, y: 0, width: 100, height: 100 } }),
    ]);
    let state = createInteractiveCanvasState(document);

    state = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObjectGeometries",
      geometries: { card: { x: 50, y: 50, width: 100, height: 100 } },
      recordHistory: false,
      snap: false,
    });
    expect(parentId(state.document, "card")).toBeNull();

    state = reduceInteractiveCanvasState(state, { type: "canvas.reconcileSectionMembership" });
    expect(parentId(state.document, "card")).toBe("section");
    expect(state.history.past.length).toBe(1);
    expect(state.lastChange?.summary).toBe("Reconciled section membership");
    expectSectionMembershipReconciled(state.document);
  });

  it("move commit adopts objects with at least 60 percent overlap and rejects smaller overlaps", () => {
    const document = makeMembershipDocument([
      makeMembershipSection({ id: "section", geometry: { x: 300, y: 0, width: 300, height: 300 } }),
      makeMembershipObject({ id: "card", geometry: { x: 0, y: 0, width: 100, height: 100 } }),
    ]);

    let state = createInteractiveCanvasState(document);
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObjectGeometries",
      geometries: { card: { x: 260, y: 20, width: 100, height: 100 } },
      recordHistory: true,
      snap: false,
      summary: "Dragged selection",
    });
    expect(parentId(state.document, "card")).toBeNull();
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.reconcileSectionMembership",
      recordHistory: false,
    });
    expect(parentId(state.document, "card")).toBe("section");
    expect(state.history.past.length).toBe(1);

    state = createInteractiveCanvasState(document);
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObjectGeometries",
      geometries: { card: { x: 250, y: 20, width: 100, height: 100 } },
      recordHistory: true,
      snap: false,
      summary: "Dragged selection",
    });
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.reconcileSectionMembership",
      recordHistory: false,
    });
    expect(parentId(state.document, "card")).toBeNull();
    expect(state.history.past.length).toBe(1);
    expectSectionMembershipReconciled(state.document);
  });

  it("keeps one undo entry for a move gesture across live frames and commit reconcile", () => {
    const document = makeMembershipDocument([
      makeMembershipSection({ id: "section", geometry: { x: 300, y: 0, width: 300, height: 300 } }),
      makeMembershipObject({ id: "card", geometry: { x: 0, y: 0, width: 100, height: 100 } }),
    ]);
    let state = createInteractiveCanvasState(document);
    const initialHistoryLength = state.history.past.length;

    state = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObjectGeometries",
      geometries: { card: { x: 240, y: 20, width: 100, height: 100 } },
      recordHistory: true,
      snap: false,
      summary: "Dragged selection",
    });
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObjectGeometries",
      geometries: { card: { x: 260, y: 20, width: 100, height: 100 } },
      recordHistory: false,
      snap: false,
      summary: "Dragged selection",
    });
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.reconcileSectionMembership",
      recordHistory: false,
    });

    expect(parentId(state.document, "card")).toBe("section");
    expect(state.history.past.length).toBe(initialHistoryLength + 1);
  });

  it("canvas.resizeObject releases outside children and adopts newly covered objects", () => {
    let state = createInteractiveCanvasState(
      makeMembershipDocument([
        makeMembershipSection({ id: "section", geometry: { x: 0, y: 0, width: 300, height: 300 } }),
        makeMembershipObject({
          id: "child",
          parentId: "section",
          geometry: { x: 240, y: 20, width: 100, height: 100 },
        }),
      ]),
    );
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.resizeObject",
      objectId: "section",
      width: 250,
      height: 300,
      snap: false,
    });
    expect(parentId(state.document, "child")).toBeNull();
    expectSectionMembershipReconciled(state.document);

    state = createInteractiveCanvasState(
      makeMembershipDocument([
        makeMembershipSection({ id: "section", geometry: { x: 0, y: 0, width: 250, height: 300 } }),
        makeMembershipObject({ id: "child", geometry: { x: 260, y: 20, width: 100, height: 100 } }),
      ]),
    );
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.resizeObject",
      objectId: "section",
      width: 400,
      height: 300,
      snap: false,
    });
    expect(parentId(state.document, "child")).toBe("section");
    expectSectionMembershipReconciled(state.document);
  });

  it("resize gesture commit reconciles after live geometry frames without another history entry", () => {
    let state = createInteractiveCanvasState(
      makeMembershipDocument([
        makeMembershipSection({ id: "section", geometry: { x: 0, y: 0, width: 250, height: 300 } }),
        makeMembershipObject({ id: "child", geometry: { x: 260, y: 20, width: 100, height: 100 } }),
      ]),
    );

    state = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObjectGeometries",
      geometries: { section: { x: 0, y: 0, width: 400, height: 300 } },
      recordHistory: true,
      snap: false,
      summary: "Resized object",
    });
    expect(parentId(state.document, "child")).toBeNull();
    expect(state.history.past.length).toBe(1);

    state = reduceInteractiveCanvasState(state, {
      type: "canvas.reconcileSectionMembership",
      recordHistory: false,
    });
    expect(parentId(state.document, "child")).toBe("section");
    expect(state.history.past.length).toBe(1);

    state = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObjectGeometries",
      geometries: { section: { x: 0, y: 0, width: 250, height: 300 } },
      recordHistory: true,
      snap: false,
      summary: "Resized object",
    });
    expect(parentId(state.document, "child")).toBe("section");
    expect(state.history.past.length).toBe(2);

    state = reduceInteractiveCanvasState(state, {
      type: "canvas.reconcileSectionMembership",
      recordHistory: false,
    });
    expect(parentId(state.document, "child")).toBeNull();
    expect(state.history.past.length).toBe(2);
    expectSectionMembershipReconciled(state.document);
  });

  it("canvas.updateObject keeps children when collapsing a section", () => {
    const state = createInteractiveCanvasState(
      makeMembershipDocument([
        makeMembershipSection({ id: "section", geometry: { x: 0, y: 0, width: 300, height: 300 } }),
        makeMembershipObject({
          id: "child",
          parentId: "section",
          geometry: { x: 80, y: 80, width: 80, height: 80 },
        }),
      ]),
    );

    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObject",
      objectId: "section",
      patch: { contentHidden: true },
    });

    expect(next.document.objects.find((object) => object.id === "section")?.contentHidden).toBe(true);
    expect(parentId(next.document, "child")).toBe("section");
    expectSectionMembershipReconciled(next.document);
  });

  it("canvas.updateObject geometry patches reparent objects immediately", () => {
    const state = createInteractiveCanvasState(
      makeMembershipDocument([
        makeMembershipSection({ id: "section", geometry: { x: 0, y: 0, width: 320, height: 320 } }),
        makeMembershipObject({ id: "card", geometry: { x: 500, y: 40, width: 80, height: 80 } }),
      ]),
    );

    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObject",
      objectId: "card",
      patch: { geometry: { x: 80, y: 80, width: 80, height: 80 } },
    });

    expect(parentId(next.document, "card")).toBe("section");
    expectSectionMembershipReconciled(next.document);
  });

  it("canvas.setObjectType releases children when a section becomes a shape", () => {
    const state = createInteractiveCanvasState(
      makeMembershipDocument([
        makeMembershipSection({ id: "outer", geometry: { x: 0, y: 0, width: 500, height: 500 } }),
        makeMembershipSection({ id: "inner", geometry: { x: 80, y: 80, width: 240, height: 240 } }),
        makeMembershipObject({
          id: "child",
          parentId: "inner",
          geometry: { x: 140, y: 140, width: 80, height: 80 },
        }),
      ]),
    );

    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.setObjectType",
      objectId: "inner",
      objectType: "process",
    });

    const converted = next.document.objects.find((object) => object.id === "inner");
    expect(converted?.type).toBe("process");
    expect(parentId(next.document, "inner")).toBe("outer");
    expect(parentId(next.document, "child")).toBe("outer");
    expectSectionMembershipReconciled(next.document);
  });

  it("placement inside a section gets a geometric parent in one undo entry", () => {
    const initialState = createInteractiveCanvasState(
      makeMembershipDocument([
        makeMembershipSection({ id: "section", geometry: { x: 0, y: 0, width: 400, height: 400 } }),
      ]),
    );

    const state = reduceInteractiveCanvasState(initialState, {
      type: "canvas.addObject",
      objectType: "sticky",
      geometry: { x: 100, y: 100, width: 120, height: 80 },
    });
    const created = state.document.objects.find(
      (object) => !initialState.document.objects.some((existing) => existing.id === object.id),
    );

    expect(created?.parentId).toBe("section");
    expect(state.history.past.length).toBe(1);
    expectSectionMembershipReconciled(state.document);

    const undone = reduceInteractiveCanvasState(state, { type: "canvas.undo" });
    expect(undone.document).toEqual(initialState.document);
  });

  it("leaves section membership reconciled after each covered discrete action", () => {
    const baseDocument = makeMembershipDocument([
      makeMembershipSection({ id: "section", geometry: { x: 0, y: 0, width: 420, height: 320 } }),
      makeMembershipObject({ id: "a", parentId: "section", geometry: { x: 40, y: 40, width: 80, height: 80 } }),
      makeMembershipObject({ id: "b", parentId: "section", geometry: { x: 160, y: 60, width: 80, height: 80 } }),
      makeMembershipObject({ id: "c", parentId: "section", geometry: { x: 280, y: 80, width: 80, height: 80 } }),
    ]);
    const selectedState = (objectIds: string[]) => ({
      ...createInteractiveCanvasState(baseDocument),
      selection: { kind: "objects" as const, objectIds },
    });
    const cases: Array<{
      name: string;
      state: ReturnType<typeof createInteractiveCanvasState>;
      action: CanvasAction;
    }> = [
      {
        name: "canvas.addObject",
        state: createInteractiveCanvasState(baseDocument),
        action: {
          type: "canvas.addObject",
          objectType: "process",
          geometry: { x: 80, y: 180, width: 80, height: 80 },
        },
      },
      {
        name: "canvas.addObjects",
        state: createInteractiveCanvasState(baseDocument),
        action: {
          type: "canvas.addObjects",
          objects: [
            makeMembershipObject({
              id: "pasted",
              geometry: { x: 90, y: 190, width: 80, height: 80 },
            }),
          ],
        },
      },
      {
        name: "canvas.duplicateSelection",
        state: selectedState(["a"]),
        action: { type: "canvas.duplicateSelection" },
      },
      {
        name: "canvas.deleteSelection",
        state: selectedState(["a"]),
        action: { type: "canvas.deleteSelection" },
      },
      {
        name: "canvas.quickConnect",
        state: createInteractiveCanvasState(
          makeMembershipDocument([
            makeMembershipSection({ id: "section", geometry: { x: 0, y: 0, width: 420, height: 320 } }),
            makeMembershipObject({ id: "from", geometry: { x: 700, y: 40, width: 80, height: 80 } }),
          ]),
        ),
        action: {
          type: "canvas.quickConnect",
          fromObjectId: "from",
          fromAnchor: "right",
          drop: { point: { x: 120, y: 120 } },
        },
      },
      {
        name: "canvas.moveSelection",
        state: selectedState(["a"]),
        action: { type: "canvas.moveSelection", dx: 240, dy: 0, snap: false },
      },
      {
        name: "canvas.resizeObject",
        state: createInteractiveCanvasState(baseDocument),
        action: { type: "canvas.resizeObject", objectId: "section", width: 240, height: 320, snap: false },
      },
      {
        name: "canvas.alignSelection",
        state: selectedState(["a", "b", "c"]),
        action: { type: "canvas.alignSelection", axis: "left" },
      },
      {
        name: "canvas.distributeSelection",
        state: selectedState(["a", "b", "c"]),
        action: { type: "canvas.distributeSelection", axis: "horizontal" },
      },
      {
        name: "canvas.fitSectionToChildren",
        state: createInteractiveCanvasState(baseDocument),
        action: { type: "canvas.fitSectionToChildren", sectionId: "section", padding: 24 },
      },
      {
        name: "canvas.setObjectType",
        state: selectedState(["a"]),
        action: { type: "canvas.setObjectType", objectId: "a", objectType: "decision" },
      },
      {
        name: "canvas.updateObject",
        state: createInteractiveCanvasState(baseDocument),
        action: {
          type: "canvas.updateObject",
          objectId: "a",
          patch: { geometry: { x: 500, y: 40, width: 80, height: 80 } },
        },
      },
    ];

    for (const { state, action } of cases) {
      const next = reduceInteractiveCanvasState(state, action);
      expectSectionMembershipReconciled(next.document);
    }
  });
});

describe("interactive canvas: connection actions", () => {
  it("updates a connection endpoint", () => {
    let state = createInteractiveCanvasState(makeConnectionDocument());

    state = reduceInteractiveCanvasState(state, {
      type: "canvas.updateConnection",
      connectionId: "connection-a",
      patch: { to: { objectId: "process-c", anchor: "left" } },
    });

    expect(state.lastChange?.summary).toBe("Reconnected connector");
    expect(state.document.connections.find((connection) => connection.id === "connection-a")?.to.objectId)
      .toBe("process-c");
    expect(state.lastChange?.changedConnectionIds).toEqual(["connection-a"]);

    state = reduceInteractiveCanvasState(state, { type: "canvas.undo" });
    expect(state.document.connections.find((connection) => connection.id === "connection-a")?.to.objectId)
      .toBe("process-b");
  });

  it("updates connection metadata without reconnecting", () => {
    let state = createInteractiveCanvasState(makeConnectionDocument());

    state = reduceInteractiveCanvasState(state, {
      type: "canvas.updateConnection",
      connectionId: "connection-a",
      patch: { label: "Reviewed connector" },
    });

    expect(state.lastChange?.summary).toBe("Updated connector");
    expect(state.document.connections.find((connection) => connection.id === "connection-a")?.label)
      .toBe("Reviewed connector");
  });

  it("rejects an unknown endpoint objectId", () => {
    const initialState = createInteractiveCanvasState(makeConnectionDocument());

    const state = reduceInteractiveCanvasState(initialState, {
      type: "canvas.updateConnection",
      connectionId: "connection-a",
      patch: { to: { objectId: "does-not-exist" } },
    });

    expect(state).toBe(initialState);
    expect(state.document.connections.find((connection) => connection.id === "connection-a")?.to.objectId)
      .toBe("process-b");
    expect(state.history.past.length).toBe(initialState.history.past.length);
  });

  it("rejects a self-loop connection update", () => {
    const initialState = createInteractiveCanvasState(makeConnectionDocument());

    const state = reduceInteractiveCanvasState(initialState, {
      type: "canvas.updateConnection",
      connectionId: "connection-a",
      patch: { to: { objectId: "process-a", anchor: "left" } },
    });

    expect(state).toBe(initialState);
    expect(state.document.connections.find((connection) => connection.id === "connection-a")?.to.objectId)
      .toBe("process-b");
    expect(state.history.past.length).toBe(initialState.history.past.length);
  });

  it("deletes a connection and its connection annotations", () => {
    let state = createInteractiveCanvasState(makeConnectionDocument());

    state = reduceInteractiveCanvasState(state, {
      type: "canvas.deleteConnection",
      connectionId: "connection-a",
    });

    expect(state.document.connections.some((connection) => connection.id === "connection-a")).toBe(false);
    expect(state.document.annotations?.some((annotation) => annotation.id === "annotation-connection-a"))
      .toBe(false);
    expect(state.document.annotations?.some((annotation) => annotation.id === "annotation-object-a"))
      .toBe(true);
    expect(state.lastChange?.summary).toBe("Deleted connector");

    state = reduceInteractiveCanvasState(state, { type: "canvas.undo" });
    expect(state.document.connections.some((connection) => connection.id === "connection-a")).toBe(true);
    expect(state.document.annotations?.some((annotation) => annotation.id === "annotation-connection-a"))
      .toBe(true);
  });

  it("deletes a selected connection", () => {
    let state = createInteractiveCanvasState(makeConnectionDocument());

    state = reduceInteractiveCanvasState(state, {
      type: "canvas.select",
      selection: { kind: "connection", connectionId: "connection-a" },
    });
    state = reduceInteractiveCanvasState(state, { type: "canvas.deleteSelection" });

    expect(state.document.connections.some((connection) => connection.id === "connection-a")).toBe(false);
    expect(state.selection).toEqual({ kind: "none" });
    expect(state.lastChange?.summary).toBe("Deleted connector");
  });

  it("records anchors passed to canvas.addConnection", () => {
    let state = createInteractiveCanvasState(makeConnectionDocument());

    state = reduceInteractiveCanvasState(state, {
      type: "canvas.addConnection",
      fromObjectId: "process-a",
      toObjectId: "process-c",
      fromAnchor: "bottom",
      toAnchor: "top",
    });

    const created = state.document.connections.find(
      (connection) => connection.from.objectId === "process-a" && connection.to.objectId === "process-c",
    );
    expect(created?.from.anchor).toBe("bottom");
    expect(created?.to.anchor).toBe("top");
  });
});

describe("interactive canvas: canvas.duplicateSelection action", () => {
  it("duplicates one selected object with fresh id, offset geometry, and selection", () => {
    let state = createInteractiveCanvasState(makeClipboardDocument());
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.select",
      selection: { kind: "objects", objectIds: ["process-a"] },
    });

    state = reduceInteractiveCanvasState(state, { type: "canvas.duplicateSelection" });

    const cloneId = state.selection.kind === "objects" ? state.selection.objectIds[0] : "";
    const clone = state.document.objects.find((object) => object.id === cloneId);
    expect(cloneId).not.toBe("process-a");
    expect(clone?.text).toBe("Process A");
    expect(clone?.parentId).toBe("section-a");
    expect(clone?.geometry).toEqual({ x: 104, y: 120, width: 160, height: 96 });
    expect(state.selection).toEqual({ kind: "objects", objectIds: [cloneId] });
  });

  it("reconciles a cloned child's parent from geometry after duplicating a section", () => {
    let state = createInteractiveCanvasState(makeClipboardDocument());
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.select",
      selection: { kind: "objects", objectIds: ["section-a", "process-a"] },
    });

    state = reduceInteractiveCanvasState(state, { type: "canvas.duplicateSelection" });

    const cloneIds = state.selection.kind === "objects" ? state.selection.objectIds : [];
    const clonedSection = state.document.objects.find(
      (object) => cloneIds.includes(object.id) && object.type === "section",
    );
    const clonedChild = state.document.objects.find(
      (object) => cloneIds.includes(object.id) && object.text === "Process A",
    );
    expect(clonedSection).toBeTruthy();
    expect(clonedChild?.parentId).toBe("section-a");
    expectSectionMembershipReconciled(state.document);
  });

  it("duplicates only fully internal selected connections", () => {
    let state = createInteractiveCanvasState(makeClipboardDocument());
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.select",
      selection: { kind: "objects", objectIds: ["process-a", "process-b"] },
    });

    state = reduceInteractiveCanvasState(state, { type: "canvas.duplicateSelection" });

    const cloneIds = state.selection.kind === "objects" ? state.selection.objectIds : [];
    expect(state.document.connections.length).toBe(3);
    const clonedConnection = state.document.connections.find(
      (connection) =>
        cloneIds.includes(connection.from.objectId) && cloneIds.includes(connection.to.objectId),
    );
    expect(clonedConnection?.id).not.toBe("connection-a");
    expect(clonedConnection?.from.objectId).toBe(cloneIds[0]);
    expect(clonedConnection?.to.objectId).toBe(cloneIds[1]);
    expect(
      state.document.connections.filter((connection) => connection.id === "connection-b").length,
    ).toBe(1);
  });

  it("records duplicate as one undo step", () => {
    let state = createInteractiveCanvasState(makeClipboardDocument());
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.select",
      selection: { kind: "objects", objectIds: ["process-a", "process-b"] },
    });
    const historyLength = state.history.past.length;

    state = reduceInteractiveCanvasState(state, { type: "canvas.duplicateSelection" });
    expect(state.history.past.length).toBe(historyLength + 1);
    expect(state.document.objects.length).toBe(6);
    expect(state.document.connections.length).toBe(3);

    state = reduceInteractiveCanvasState(state, { type: "canvas.undo" });
    expect(state.document.objects.length).toBe(4);
    expect(state.document.connections.length).toBe(2);
  });

  it("is a no-op without object selection", () => {
    const initialState = createInteractiveCanvasState(makeClipboardDocument());
    const state = reduceInteractiveCanvasState(initialState, { type: "canvas.duplicateSelection" });

    expect(state).toBe(initialState);
    expect(state.history.past.length).toBe(initialState.history.past.length);
  });
});

describe("interactive canvas: canvas.addObjects action", () => {
  it("pastes copied objects at a target point with fresh ids and selection", () => {
    const document = makeClipboardDocument();
    const clipboard = copySelection(document, {
      kind: "objects",
      objectIds: ["section-a"],
    });
    expect(clipboard).toBeTruthy();
    const payload = buildPastePayload(clipboard!, { x: 700, y: 400 });

    const state = reduceInteractiveCanvasState(createInteractiveCanvasState(document), {
      type: "canvas.addObjects",
      ...payload,
    });

    const cloneIds = state.selection.kind === "objects" ? state.selection.objectIds : [];
    expect(cloneIds).toHaveLength(3);
    expect(cloneIds).not.toContain("section-a");
    expect(cloneIds).not.toContain("process-a");
    expect(cloneIds).not.toContain("process-b");
    expect(boundsCenter(state.document, cloneIds)).toEqual({ x: 700, y: 400 });
  });

  it("keeps pasted ids collision-free when originals remain", () => {
    const document = makeClipboardDocument();
    const clipboard = copySelection(document, {
      kind: "objects",
      objectIds: ["process-a"],
    });
    const payload = buildPastePayload(clipboard!);

    const state = reduceInteractiveCanvasState(createInteractiveCanvasState(document), {
      type: "canvas.addObjects",
      ...payload,
    });

    const ids = state.document.objects.map((object) => object.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(state.document.objects.some((object) => object.id === "process-a")).toBe(true);
  });

  it("remaps pasted internal connection endpoints to new pasted ids", () => {
    const document = makeClipboardDocument();
    const clipboard = copySelection(document, {
      kind: "objects",
      objectIds: ["section-a"],
    });
    const payload = buildPastePayload(clipboard!);

    const state = reduceInteractiveCanvasState(createInteractiveCanvasState(document), {
      type: "canvas.addObjects",
      ...payload,
    });

    const cloneIds = state.selection.kind === "objects" ? state.selection.objectIds : [];
    const clonedConnection = state.document.connections.find(
      (connection) =>
        cloneIds.includes(connection.from.objectId) && cloneIds.includes(connection.to.objectId),
    );
    expect(clonedConnection).toBeTruthy();
    expect(clonedConnection?.from.objectId).not.toBe("process-a");
    expect(clonedConnection?.to.objectId).not.toBe("process-b");
  });

  it("records paste as one undo step", () => {
    const document = makeClipboardDocument();
    const clipboard = copySelection(document, {
      kind: "objects",
      objectIds: ["section-a"],
    });
    const payload = buildPastePayload(clipboard!);
    let state = createInteractiveCanvasState(document);

    state = reduceInteractiveCanvasState(state, { type: "canvas.addObjects", ...payload });
    expect(state.history.past.length).toBe(1);
    expect(state.document.objects.length).toBe(7);

    state = reduceInteractiveCanvasState(state, { type: "canvas.undo" });
    expect(state.document.objects.length).toBe(4);
  });
});

describe("interactive canvas clipboard", () => {
  it("returns null for none or empty object selections", () => {
    const document = makeClipboardDocument();

    expect(copySelection(document, { kind: "none" })).toBeNull();
    expect(copySelection(document, { kind: "objects", objectIds: [] })).toBeNull();
  });

  it("copies selected sections with all recorded descendants and internal connections", () => {
    const clipboard = copySelection(makeClipboardDocument(), {
      kind: "objects",
      objectIds: ["section-a"],
    });

    expect(clipboard?.objects.map((object) => object.id).sort()).toEqual([
      "process-a",
      "process-b",
      "section-a",
    ]);
    expect(clipboard?.connections.map((connection) => connection.id)).toEqual(["connection-a"]);
  });

  it("does not copy connections with only one endpoint captured", () => {
    const clipboard = copySelection(makeClipboardDocument(), {
      kind: "objects",
      objectIds: ["process-b"],
    });

    expect(clipboard?.objects.map((object) => object.id)).toEqual(["process-b"]);
    expect(clipboard?.connections).toEqual([]);
  });

  it("builds paste payload whose bounds center lands on target point", () => {
    const clipboard = copySelection(makeClipboardDocument(), {
      kind: "objects",
      objectIds: ["section-a"],
    });
    const payload = buildPastePayload(clipboard!, { x: 900, y: 500 });
    const pastedDocument = { ...makeClipboardDocument(), objects: payload.objects };

    expect(boundsCenter(pastedDocument, payload.objects.map((object) => object.id))).toEqual({
      x: 900,
      y: 500,
    });
  });

  it("builds paste payload with flat offset when no target point exists", () => {
    const clipboard = copySelection(makeClipboardDocument(), {
      kind: "objects",
      objectIds: ["process-a"],
    });
    const payload = buildPastePayload(clipboard!);
    const object = payload.objects.find((candidate) => candidate.id === "process-a");

    expect(object?.geometry.x).toBe(104);
    expect(object?.geometry.y).toBe(120);
  });

  it("builds independent paste payloads from the same clipboard", () => {
    const clipboard = copySelection(makeClipboardDocument(), {
      kind: "objects",
      objectIds: ["process-a"],
    });
    const first = buildPastePayload(clipboard!);
    first.objects[0]!.geometry.x = 999;
    const second = buildPastePayload(clipboard!);

    expect(second.objects[0]?.geometry.x).toBe(104);
  });
});

describe("interactive canvas: quickConnect action (3.3.2)", () => {
  it("connecting to an existing object records one history entry with anchors", () => {
    const initialState = createInteractiveCanvasState(makeConnectionDocument());

    const state = reduceInteractiveCanvasState(initialState, {
      type: "canvas.quickConnect",
      fromObjectId: "process-a",
      fromAnchor: "bottom",
      drop: { objectId: "process-c", anchor: "top" },
    });

    expect(state.document.objects.length).toBe(initialState.document.objects.length);
    const created = state.document.connections.find(
      (connection) => connection.from.objectId === "process-a" && connection.to.objectId === "process-c",
    );
    expect(created).toBeTruthy();
    expect(created?.from.anchor).toBe("bottom");
    expect(created?.to.anchor).toBe("top");
    expect(state.history.past.length).toBe(initialState.history.past.length + 1);

    const undone = reduceInteractiveCanvasState(state, { type: "canvas.undo" });
    expect(
      undone.document.connections.some(
        (connection) => connection.from.objectId === "process-a" && connection.to.objectId === "process-c",
      ),
    ).toBe(false);
  });

  it("rejects a self-connect to the same object", () => {
    const initialState = createInteractiveCanvasState(makeConnectionDocument());

    const state = reduceInteractiveCanvasState(initialState, {
      type: "canvas.quickConnect",
      fromObjectId: "process-a",
      fromAnchor: "right",
      drop: { objectId: "process-a", anchor: "left" },
    });

    expect(state).toBe(initialState);
  });

  it("rejects an unknown drop target", () => {
    const initialState = createInteractiveCanvasState(makeConnectionDocument());

    const state = reduceInteractiveCanvasState(initialState, {
      type: "canvas.quickConnect",
      fromObjectId: "process-a",
      fromAnchor: "right",
      drop: { objectId: "does-not-exist", anchor: "left" },
    });

    expect(state).toBe(initialState);
  });

  it("dropping on empty canvas creates an object + connection as a single undoable history entry", () => {
    const initialState = createInteractiveCanvasState(makeConnectionDocument());

    const state = reduceInteractiveCanvasState(initialState, {
      type: "canvas.quickConnect",
      fromObjectId: "process-a",
      fromAnchor: "bottom",
      drop: { point: { x: 500, y: 500 } },
    });

    expect(state.document.objects.length).toBe(initialState.document.objects.length + 1);
    expect(state.document.connections.length).toBe(initialState.document.connections.length + 1);
    expect(state.history.past.length).toBe(initialState.history.past.length + 1);

    const newObject = state.document.objects.find(
      (object) => !initialState.document.objects.some((existing) => existing.id === object.id),
    );
    expect(newObject).toBeTruthy();
    const newConnection = state.document.connections.find(
      (connection) => connection.to.objectId === newObject?.id,
    );
    expect(newConnection?.from.objectId).toBe("process-a");
    expect(newConnection?.from.anchor).toBe("bottom");

    const undone = reduceInteractiveCanvasState(state, { type: "canvas.undo" });
    expect(undone.document.objects.length).toBe(initialState.document.objects.length);
    expect(undone.document.connections.length).toBe(initialState.document.connections.length);
  });

  it("returns the same state when fromObjectId does not exist", () => {
    const initialState = createInteractiveCanvasState(makeConnectionDocument());

    const state = reduceInteractiveCanvasState(initialState, {
      type: "canvas.quickConnect",
      fromObjectId: "does-not-exist",
      fromAnchor: "right",
      drop: { point: { x: 500, y: 500 } },
    });

    expect(state).toBe(initialState);
  });
});

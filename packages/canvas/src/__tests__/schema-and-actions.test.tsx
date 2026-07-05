import { afterEach, describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  buildPastePayload,
  CANVAS_PALETTE_TOKENS,
  canvasToneStyle,
  copySelection,
  createInteractiveCanvasState,
  InteractiveCanvasEditor,
  paletteTokenStyle,
  reduceInteractiveCanvasState,
  resolveCanvasLinkStatuses,
  resolveObjectColors,
  syntheticInteractiveCanvas,
  v2FlowInteractiveCanvas,
  validateInteractiveCanvasDocument,
  type InteractiveCanvasDocument,
  type InteractiveCanvasObjectType,
} from "../index";

afterEach(() => {
  cleanup();
});

function makeSetParentDocument(): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "test-doc",
    mode: "diagram",
    objects: [
      {
        id: "container-a",
        type: "container",
        label: "Container A",
        geometry: { x: 40, y: 40, width: 320, height: 220 },
      },
      {
        id: "container-b",
        type: "container",
        label: "Container B",
        parentId: "container-a",
        geometry: { x: 80, y: 80, width: 180, height: 120 },
      },
      {
        id: "process-a",
        type: "process",
        label: "Process A",
        geometry: { x: 420, y: 120, width: 160, height: 96 },
      },
      {
        id: "process-b",
        type: "process",
        label: "Process B",
        parentId: "container-a",
        geometry: { x: 460, y: 260, width: 160, height: 96 },
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
        label: "Process A",
        geometry: { x: 40, y: 40, width: 160, height: 96 },
      },
      {
        id: "process-b",
        type: "process",
        label: "Process B",
        geometry: { x: 260, y: 40, width: 160, height: 96 },
      },
      {
        id: "process-c",
        type: "process",
        label: "Process C",
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
        style: "dotted",
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
        id: "container-a",
        type: "container",
        label: "Container A",
        geometry: { x: 40, y: 40, width: 360, height: 240 },
      },
      {
        id: "process-a",
        type: "process",
        label: "Process A",
        parentId: "container-a",
        geometry: { x: 80, y: 96, width: 160, height: 96 },
      },
      {
        id: "process-b",
        type: "process",
        label: "Process B",
        parentId: "process-a",
        geometry: { x: 280, y: 112, width: 160, height: 96 },
      },
      {
        id: "process-c",
        type: "process",
        label: "Process C",
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
        style: "dotted",
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

describe("interactive canvas schema and actions", () => {
  it("validates the synthetic canvas fixture", () => {
    const validation = validateInteractiveCanvasDocument(syntheticInteractiveCanvas);

    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.document.objects.some((object) => object.type === "decision")).toBe(true);
      expect(validation.document.connections.some((connection) => connection.style === "dotted")).toBe(true);
      expect(validation.document.annotations?.length).toBeGreaterThan(0);
    }
  });

  it("validates the V2 Flow-style fixture after the synthetic baseline", () => {
    const validation = validateInteractiveCanvasDocument(v2FlowInteractiveCanvas);

    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.document.objects.some((object) => object.id === "memory-bank")).toBe(true);
      expect(validation.document.objects.some((object) => object.type === "decision")).toBe(true);
      expect(validation.document.connections.some((connection) => connection.role === "feedback-loop")).toBe(true);
    }
  });

  it("validates the docs sidecar JSON files for synthetic and V2 Flow canvases", async () => {
    const docsRoot = join(process.cwd(), "../../docs/10-system-design/50-interactive-canvas");
    const sidecars = [
      "assets/canvases/synthetic.canvas.json",
      "v2-flow/assets/canvases/v2-flow.canvas.json",
    ];

    for (const sidecar of sidecars) {
      const raw = await readFile(join(docsRoot, sidecar), "utf8");
      const validation = validateInteractiveCanvasDocument(JSON.parse(raw));
      expect(validation.ok).toBe(true);
    }
  });

  it("rejects duplicate IDs and unknown endpoints", () => {
    const validation = validateInteractiveCanvasDocument({
      ...syntheticInteractiveCanvas,
      objects: [
        syntheticInteractiveCanvas.objects[0],
        { ...syntheticInteractiveCanvas.objects[0] },
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

  it("accepts the expanded object vocabulary (document/person/database/chat) with paletteToken", () => {
    const document: InteractiveCanvasDocument = {
      schemaVersion: 1,
      id: "expanded-vocab-doc",
      mode: "diagram",
      objects: [
        {
          id: "doc-a",
          type: "document",
          label: "Doc A",
          geometry: { x: 0, y: 0, width: 160, height: 120 },
          style: { paletteToken: "memory" },
        },
        {
          id: "person-a",
          type: "person",
          label: "Person A",
          geometry: { x: 200, y: 0, width: 120, height: 140 },
          style: { paletteToken: "input" },
        },
        {
          id: "database-a",
          type: "database",
          label: "Database A",
          geometry: { x: 400, y: 0, width: 140, height: 120 },
          style: { paletteToken: "memory" },
        },
        {
          id: "chat-a",
          type: "chat",
          label: "Chat A",
          geometry: { x: 600, y: 0, width: 180, height: 110 },
          style: { paletteToken: "process" },
        },
      ],
      connections: [],
    };

    const validation = validateInteractiveCanvasDocument(document);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      const types = validation.document.objects.map((object) => object.type);
      expect(types).toEqual(["document", "person", "database", "chat"]);
      expect(validation.document.objects.map((object) => object.style?.paletteToken)).toEqual([
        "memory",
        "input",
        "memory",
        "process",
      ]);
      expect(validation.warnings).toBeUndefined();
    }
  });

  it("drops an unknown paletteToken with a non-fatal validation warning", () => {
    const document = {
      schemaVersion: 1,
      id: "bad-token-doc",
      mode: "diagram",
      objects: [
        {
          id: "doc-a",
          type: "document",
          label: "Doc A",
          geometry: { x: 0, y: 0, width: 160, height: 120 },
          style: { paletteToken: "not-a-real-token" },
        },
      ],
      connections: [],
    };

    const validation = validateInteractiveCanvasDocument(document);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.document.objects[0]?.style?.paletteToken).toBeUndefined();
      expect(validation.warnings?.length).toBe(1);
      expect(validation.warnings?.[0]?.message).toContain("not-a-real-token");
    }
  });

  it("addObject applies defaults (geometry/label/tone/shape) for each new object type", () => {
    // canvas.addObject runs the default geometry through snapGeometry (16px
    // grid), so expected sizes here are the *snapped* values, matching how
    // e.g. the pre-existing container default (360) already snaps to 368.
    const base = createInteractiveCanvasState(syntheticInteractiveCanvas);
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
      expect(added?.style?.tone).toBeTruthy();
    }
  });

  it("resolves source and doc link statuses through a typed document update", () => {
    const document = resolveCanvasLinkStatuses(
      {
        ...syntheticInteractiveCanvas,
        links: [
          ...(syntheticInteractiveCanvas.links ?? []),
          {
            id: "stale-source-link",
            objectId: "agent-summarizes",
            target: {
              kind: "source",
              path: "packages/canvas/src/actions.ts",
              label: "Canvas actions",
            },
            status: "unresolved",
          },
          {
            id: "missing-doc-link",
            objectId: "write-spec",
            target: {
              kind: "doc",
              path: "docs/missing.md",
              label: "Missing docs",
            },
            status: "unresolved",
          },
        ],
      },
      {
        knownPaths: [
          "docs/10-system-design/40-docs-mdx-lab.mdx",
          "packages/canvas/src/actions.ts",
        ],
        stalePaths: ["packages/canvas/src/actions.ts"],
        checkedAt: "2026-06-24T00:00:00.000Z",
      },
    );

    const statuses = new Map(document.links?.map((link) => [link.id, link.status]));
    expect(statuses.get("docs-link-current-docs")).toBe("resolved");
    expect(statuses.get("stale-source-link")).toBe("stale");
    expect(statuses.get("missing-doc-link")).toBe("missing");

    let state = createInteractiveCanvasState({
      ...syntheticInteractiveCanvas,
      links: document.links,
    });
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.resolveLinkStatuses",
      knownPaths: ["docs/10-system-design/40-docs-mdx-lab.mdx"],
    });
    expect(state.history.past.length).toBe(1);
    expect(state.lastChange?.summary).toBe("Resolved link statuses");
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
          document={syntheticInteractiveCanvas}
          onSave={(document) => {
            saved.push(document);
          }}
          onCancel={() => undefined}
        />,
      );

      expect(document.querySelector("[data-canvas-stage='true']")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Select" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Hand tool" })).toBeTruthy();
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
      expect(screen.getAllByText("Sticky").length).toBeGreaterThan(0);

      const object = screen.getByRole("button", { name: /Agent summarizes/i });
      fireEvent.contextMenu(object, {
        clientX: 560,
        clientY: 220,
      });
      expect(screen.getByRole("menuitem", { name: "Delete object" })).toBeTruthy();
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("menu", { name: "Canvas context menu" })).toBeNull();

      const originalGeometry = syntheticInteractiveCanvas.objects.find(
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
});

describe("interactive canvas theme: resolveObjectColors precedence (PD4)", () => {
  it("uses the palette token colors when paletteToken is set, ignoring tone", () => {
    const withToken = resolveObjectColors({ tone: "warning", paletteToken: "memory" });
    const memoryOnly = paletteTokenStyle("memory");
    expect(withToken).toEqual(memoryOnly);
    expect(withToken).not.toEqual(canvasToneStyle("warning"));
  });

  it("falls back to tone-based colors when no paletteToken is set", () => {
    const toneOnly = resolveObjectColors({ tone: "agent" });
    expect(toneOnly).toEqual(canvasToneStyle("agent"));
  });

  it("falls back to neutral colors when neither paletteToken nor tone is set", () => {
    expect(resolveObjectColors(undefined)).toEqual(canvasToneStyle(undefined));
    expect(resolveObjectColors({})).toEqual(canvasToneStyle("neutral"));
  });

  it("gives each palette token a distinct fill/border/accent", () => {
    const tokens = CANVAS_PALETTE_TOKENS.map((entry) => entry.token);
    const styles = tokens.map((token) => paletteTokenStyle(token));
    const fills = new Set(styles.map((style) => style.fill));
    expect(fills.size).toBe(tokens.length);
  });
});

describe("interactive canvas: canvas.setParent action", () => {
  it("reparents an object into a container", () => {
    const initialState = createInteractiveCanvasState(makeSetParentDocument());
    const originalGeometry = initialState.document.objects.find(
      (object) => object.id === "process-a",
    )?.geometry;

    const state = reduceInteractiveCanvasState(initialState, {
      type: "canvas.setParent",
      objectIds: ["process-a"],
      parentId: "container-a",
    });

    const object = state.document.objects.find((candidate) => candidate.id === "process-a");
    expect(object?.parentId).toBe("container-a");
    expect(object?.geometry).toEqual(originalGeometry);
    expect(state.lastChange?.summary).toBe("Moved into Container A");
    expect(state.history.past.length).toBe(initialState.history.past.length + 1);
  });

  it("clears parentId when dropped on open canvas", () => {
    const state = reduceInteractiveCanvasState(createInteractiveCanvasState(makeSetParentDocument()), {
      type: "canvas.setParent",
      objectIds: ["process-b"],
      parentId: null,
    });

    expect(state.document.objects.find((object) => object.id === "process-b")?.parentId).toBeNull();
    expect(state.lastChange?.summary).toBe("Moved out of container");
  });

  it("rejects a non-container target", () => {
    const initialState = createInteractiveCanvasState(makeSetParentDocument());

    const state = reduceInteractiveCanvasState(initialState, {
      type: "canvas.setParent",
      objectIds: ["process-b"],
      parentId: "process-a",
    });

    expect(state).toBe(initialState);
    expect(state.document.objects.find((object) => object.id === "process-b")?.parentId).toBe(
      "container-a",
    );
    expect(state.history.past.length).toBe(initialState.history.past.length);
  });

  it("rejects cycles", () => {
    const initialState = createInteractiveCanvasState(makeSetParentDocument());

    const state = reduceInteractiveCanvasState(initialState, {
      type: "canvas.setParent",
      objectIds: ["container-a"],
      parentId: "container-b",
    });

    expect(state).toBe(initialState);
    expect(state.document.objects.find((object) => object.id === "container-a")?.parentId).toBe(
      undefined,
    );
    expect(state.history.past.length).toBe(initialState.history.past.length);
  });

  it("is undoable", () => {
    let state = createInteractiveCanvasState(makeSetParentDocument());

    state = reduceInteractiveCanvasState(state, {
      type: "canvas.setParent",
      objectIds: ["process-a"],
      parentId: "container-a",
    });
    state = reduceInteractiveCanvasState(state, { type: "canvas.undo" });

    expect(state.document.objects.find((object) => object.id === "process-a")?.parentId).toBe(
      undefined,
    );
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
    expect(clone?.label).toBe("Process A");
    expect(clone?.parentId).toBe("container-a");
    expect(clone?.geometry).toEqual({ x: 104, y: 120, width: 160, height: 96 });
    expect(state.selection).toEqual({ kind: "objects", objectIds: [cloneId] });
  });

  it("remaps a cloned child to the cloned selected container", () => {
    let state = createInteractiveCanvasState(makeClipboardDocument());
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.select",
      selection: { kind: "objects", objectIds: ["container-a", "process-a"] },
    });

    state = reduceInteractiveCanvasState(state, { type: "canvas.duplicateSelection" });

    const cloneIds = state.selection.kind === "objects" ? state.selection.objectIds : [];
    const clonedContainer = state.document.objects.find(
      (object) => cloneIds.includes(object.id) && object.type === "container",
    );
    const clonedChild = state.document.objects.find(
      (object) => cloneIds.includes(object.id) && object.label === "Process A",
    );
    expect(clonedChild?.parentId).toBe(clonedContainer?.id);
    expect(clonedChild?.parentId).not.toBe("container-a");
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
      objectIds: ["process-a"],
    });
    expect(clipboard).toBeTruthy();
    const payload = buildPastePayload(clipboard!, { x: 700, y: 400 });

    const state = reduceInteractiveCanvasState(createInteractiveCanvasState(document), {
      type: "canvas.addObjects",
      ...payload,
    });

    const cloneIds = state.selection.kind === "objects" ? state.selection.objectIds : [];
    expect(cloneIds).toHaveLength(2);
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
      objectIds: ["container-a"],
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
      objectIds: ["process-a"],
    });
    const payload = buildPastePayload(clipboard!);
    let state = createInteractiveCanvasState(document);

    state = reduceInteractiveCanvasState(state, { type: "canvas.addObjects", ...payload });
    expect(state.history.past.length).toBe(1);
    expect(state.document.objects.length).toBe(6);

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

  it("copies selected containers with all descendants and internal connections", () => {
    const clipboard = copySelection(makeClipboardDocument(), {
      kind: "objects",
      objectIds: ["container-a"],
    });

    expect(clipboard?.objects.map((object) => object.id).sort()).toEqual([
      "container-a",
      "process-a",
      "process-b",
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
      objectIds: ["container-a"],
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

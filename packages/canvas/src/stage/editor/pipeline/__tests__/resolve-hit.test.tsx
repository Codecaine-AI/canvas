/**
 * D16 (P3) — resolveHit's outline veto: a pointer event whose DOM target is
 * an object button but whose world point sits outside the object's declared
 * outline must NOT resolve to that object — it falls through to the object
 * behind, or to canvas. Downstream, that makes a corner press+drag a
 * marquee and a corner double-click a no-op instead of opening the editor.
 */

import { describe, expect, it } from "bun:test";
import { stepInteraction } from "../core";
import {
  IDLE_INTERACTION_STATE,
  type CanvasPointerEvent,
  type InteractionContext,
} from "../../../../interaction/interaction";
import type { CanvasPoint } from "../../../../state/geometry";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../../../state/schema";
import { anchorScreenPoint, HIT_TARGET_PX } from "../../../../connectors/AnchorDots";
import { screenToWorld, type ViewportState } from "../../../viewport";
import { resolveHit } from "../use-interaction-pipeline";

const diamond: InteractiveCanvasObject = {
  id: "diamond",
  type: "decision",
  text: "Diamond",
  geometry: { x: 0, y: 0, width: 100, height: 100 },
  style: { shape: "diamond" },
};

const rectBehind: InteractiveCanvasObject = {
  id: "rect-behind",
  type: "process",
  text: "Rect",
  geometry: { x: 0, y: 0, width: 100, height: 100 },
};

const section: InteractiveCanvasObject = {
  id: "section",
  type: "section",
  text: "Tiny section",
  geometry: { x: 0, y: 0, width: 20, height: 20 },
};

const process: InteractiveCanvasObject = {
  id: "process",
  type: "process",
  text: "Process",
  geometry: { x: 100, y: 100, width: 100, height: 100 },
};

function doc(objects: InteractiveCanvasObject[]): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "resolve-hit-doc",
    mode: "diagram",
    objects,
    connections: [],
  };
}

/** A stand-in for the diamond's full-bbox object button. */
function diamondButton(): HTMLElement {
  const el = window.document.createElement("button");
  el.setAttribute("data-canvas-object-id", "diamond");
  return el;
}

function objectButton(objectId: string): HTMLElement {
  const el = window.document.createElement("button");
  el.setAttribute("data-canvas-object-id", objectId);
  return el;
}

function resizeHandle(objectId: string): HTMLElement {
  const el = window.document.createElement("div");
  el.setAttribute("data-canvas-object-id", objectId);
  el.setAttribute("data-canvas-handle", "nw");
  return el;
}

function endpointHandle(): SVGCircleElement {
  const el = window.document.createElementNS("http://www.w3.org/2000/svg", "circle");
  el.setAttribute("data-canvas-connection-id", "connection-a");
  el.setAttribute("data-canvas-endpoint", "from");
  return el;
}

function sectionTitleChip(): HTMLElement {
  const el = window.document.createElement("span");
  el.setAttribute("data-canvas-object-id", "section");
  el.setAttribute("data-canvas-section-title-chip", "section");
  return el;
}

function pointerEvent(
  type: CanvasPointerEvent["type"],
  world: CanvasPoint,
  document: InteractiveCanvasDocument,
  target: Element,
): CanvasPointerEvent {
  return {
    type,
    world,
    screen: world,
    button: 0,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    hit: resolveHit(target, document, world),
  };
}

function ctx(document: InteractiveCanvasDocument): InteractionContext {
  return {
    document,
    selection: { kind: "none" },
    tool: "select",
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

describe("resolveHit outline veto (D16)", () => {
  it("resolves the object when the world point is inside its outline", () => {
    const document = doc([diamond]);
    expect(resolveHit(diamondButton(), document, { x: 50, y: 50 })).toEqual({
      kind: "object",
      objectId: "diamond",
    });
  });

  it("vetoes a corner hit and falls through to the object behind", () => {
    const document = doc([rectBehind, diamond]);
    expect(resolveHit(diamondButton(), document, { x: 5, y: 5 })).toEqual({
      kind: "object",
      objectId: "rect-behind",
    });
  });

  it("vetoes a corner hit with nothing behind and resolves to canvas", () => {
    const document = doc([diamond]);
    expect(resolveHit(diamondButton(), document, { x: 5, y: 5 })).toEqual({ kind: "canvas" });
  });

  it("still resolves anchor-dot ports before the object/outline tier", () => {
    const document = doc([diamond]);
    const dot = window.document.createElement("div");
    dot.setAttribute("data-canvas-port", "left");
    dot.setAttribute("data-canvas-object-id", "diamond");
    // A dot sits off the outline (screen-space overlay) — the port branch
    // wins regardless of the outline veto.
    expect(resolveHit(dot, document, { x: 5, y: 50 })).toEqual({
      kind: "port",
      objectId: "diamond",
      anchor: "left",
    });
  });

  it("resolves a section title chip to its section even outside the section outline", () => {
    const document = doc([section]);
    expect(resolveHit(sectionTitleChip(), document, { x: 90, y: 10 })).toEqual({
      kind: "object",
      objectId: "section",
    });
  });

  it("resolves connector bend segment pills before the generic connection tier", () => {
    const document = doc([diamond]);
    const pill = window.document.createElementNS("http://www.w3.org/2000/svg", "rect");
    pill.setAttribute("data-canvas-connection-id", "connection-a");
    pill.setAttribute("data-canvas-bend-segment", "2");

    expect(resolveHit(pill, document, { x: 50, y: 50 })).toEqual({
      kind: "bend-segment",
      connectionId: "connection-a",
      segmentIndex: 2,
    });
  });

  it("press+drag from a diamond corner becomes a MARQUEE, not an object move", () => {
    const document = doc([diamond]);
    const context = ctx(document);
    const down = stepInteraction(
      IDLE_INTERACTION_STATE,
      pointerEvent("down", { x: 5, y: 5 }, document, diamondButton()),
      context,
    );
    expect(down.state.kind).toBe("pressing");
    const move = stepInteraction(
      down.state,
      pointerEvent("move", { x: 15, y: 15 }, document, diamondButton()),
      context,
    );
    expect(move.state.kind).toBe("marquee");
  });

  it("double-click on a diamond corner does NOT open the text editor", () => {
    const document = doc([diamond]);
    const result = stepInteraction(
      IDLE_INTERACTION_STATE,
      pointerEvent("double", { x: 5, y: 5 }, document, diamondButton()),
      ctx(document),
    );
    expect(result.overlay.editObjectTextId).toBeUndefined();
  });

  it("double-click inside the outline still opens the text editor", () => {
    const document = doc([diamond]);
    const result = stepInteraction(
      IDLE_INTERACTION_STATE,
      pointerEvent("double", { x: 50, y: 50 }, document, diamondButton()),
      ctx(document),
    );
    expect(result.overlay.editObjectTextId).toBe("diamond");
  });
});

describe("resolveHit anchor-dot proximity", () => {
  const viewport: ViewportState = { x: 0, y: 0, zoom: 1 };

  function hitAtScreen(screen: CanvasPoint, options: { portProximityObjectIds?: readonly string[] } = {}) {
    return resolveHit(objectButton("process"), doc([process]), screenToWorld(viewport, screen), {
      viewport,
      screen,
      ...options,
    });
  }

  function selectedDotScreen() {
    const center = anchorScreenPoint(viewport, process, "top");
    return { x: center.x, y: center.y + 10 };
  }

  it("resolves to the selected object's port inside the rendered dot hit target", () => {
    const screen = selectedDotScreen();

    expect(hitAtScreen(screen, { portProximityObjectIds: ["process"] })).toEqual({
      kind: "port",
      objectId: "process",
      anchor: "top",
    });
  });

  it("keeps object resolution when the pointer is outside the dot hit target", () => {
    const center = anchorScreenPoint(viewport, process, "top");
    const screen = { x: center.x, y: center.y + HIT_TARGET_PX / 2 + 7 };

    expect(hitAtScreen(screen, { portProximityObjectIds: ["process"] })).toEqual({
      kind: "object",
      objectId: "process",
    });
  });

  it("does not resolve an unselected object's nearby dot", () => {
    const screen = selectedDotScreen();

    expect(hitAtScreen(screen, { portProximityObjectIds: ["other"] })).toEqual({ kind: "canvas" });
  });

  it("keeps existing behavior when port proximity is not enabled", () => {
    const screen = selectedDotScreen();

    expect(hitAtScreen(screen)).toEqual({ kind: "canvas" });
  });

  it("keeps resize handles above anchor-dot proximity", () => {
    const screen = selectedDotScreen();

    expect(
      resolveHit(resizeHandle("process"), doc([process]), screenToWorld(viewport, screen), {
        viewport,
        screen,
        portProximityObjectIds: ["process"],
      }),
    ).toEqual({ kind: "handle", objectId: "process", handle: "nw" });
  });

  it("keeps connector endpoints above anchor-dot proximity", () => {
    const screen = selectedDotScreen();

    expect(
      resolveHit(endpointHandle(), doc([process]), screenToWorld(viewport, screen), {
        viewport,
        screen,
        portProximityObjectIds: ["process"],
      }),
    ).toEqual({ kind: "endpoint", connectionId: "connection-a", end: "from" });
  });
});

"use client";

import { useCallback, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { buildPastePayload, copySelection, getClipboardMemory, setClipboardMemory } from "../../../interaction/clipboard";
import { hitTestObjects } from "../../../interaction/hit-testing";
import { outlineContainsPoint } from "../../../objects/geometry";
import { defaultGeometryFor, type CanvasAction } from "../../../state/actions";
import type { CanvasBounds, CanvasPoint } from "../../../state/geometry";
import { stageFromEventTarget, stageScreenPointFromClient } from "../../stage-dom";
import type {
  CanvasGeometry,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
} from "../../../state/schema";

export type CanvasContextMenuState =
  | {
      kind: "canvas";
      x: number;
      y: number;
      canvasPoint: CanvasPoint;
    }
  | {
      kind: "object";
      x: number;
      y: number;
      objectId: string;
      canvasPoint: CanvasPoint;
    };

/**
 * D16 (P3) context-menu retargeting: the right-clicked BUTTON covers the full
 * bbox, but the menu must respect the def-declared outline. Returns the
 * object whose menu should open — the clicked one when the point is inside
 * its outline, else the topmost outline-containing object behind it, else
 * null (open the canvas menu instead). Exported for unit tests.
 */
export function resolveContextMenuTarget(
  document: InteractiveCanvasDocument,
  clicked: InteractiveCanvasObject,
  world: CanvasPoint,
): InteractiveCanvasObject | null {
  if (outlineContainsPoint(clicked, world)) return clicked;
  return hitTestObjects(document, world);
}

function geometryForContextObject(
  objectType: InteractiveCanvasObjectType,
  point: CanvasPoint,
): CanvasGeometry {
  const size = defaultGeometryFor(objectType);
  return {
    x: point.x - size.width / 2,
    y: point.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

export interface UseCanvasContextMenuArgs {
  document: InteractiveCanvasDocument;
  dispatch: (action: CanvasAction) => void;
  screenToWorld: (point: CanvasPoint) => CanvasPoint;
}

export interface CanvasContextMenuApi {
  contextMenu: CanvasContextMenuState | null;
  /** The right-clicked object for an object-kind menu (null otherwise). */
  contextObject: InteractiveCanvasObject | null | undefined;
  isContextMenuOpen: () => boolean;
  closeContextMenu: () => void;
  openCanvasContextMenu: (event: ReactMouseEvent<HTMLElement>, bounds: CanvasBounds) => void;
  openObjectContextMenu: (
    event: ReactMouseEvent<HTMLElement>,
    object: InteractiveCanvasObject,
    bounds: CanvasBounds,
  ) => void;
  addObjectFromContextMenu: (objectType: InteractiveCanvasObjectType) => void;
  pasteFromContextMenu: () => void;
  canPasteFromContextMenu: boolean;
  copyFromContextMenu: () => void;
  setLockFromContextMenu: (mode: "all" | "background" | undefined) => void;
  addContextAnnotation: () => void;
  fitContextObject: () => void;
  tidySectionMembership: () => void;
  deleteContextSelection: () => void;
}

/**
 * Canvas/object context menu state + actions, extracted verbatim from
 * InteractiveCanvasEditor.tsx. Owns the menu open/close state and every menu
 * entry's handler; the parent wires openCanvasContextMenu/openObjectContextMenu
 * into CanvasStage, feeds isContextMenuOpen/closeContextMenu to the hotkeys
 * (Escape) and pointer-down plumbing, and renders <CanvasContextMenu>.
 */
export function useCanvasContextMenu({
  document,
  dispatch,
  screenToWorld,
}: UseCanvasContextMenuArgs): CanvasContextMenuApi {
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState | null>(null);

  const contextMenuRef = useRef(contextMenu);
  contextMenuRef.current = contextMenu;

  const isContextMenuOpen = useCallback(() => contextMenuRef.current !== null, []);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const canvasPointFromContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>): CanvasPoint => {
      const stage = stageFromEventTarget(event.currentTarget);
      if (!stage) return { x: 0, y: 0 };
      return screenToWorld(stageScreenPointFromClient(event.nativeEvent, stage));
    },
    [screenToWorld],
  );

  const openCanvasContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>, _bounds: CanvasBounds) => {
      event.preventDefault();
      event.stopPropagation();
      dispatch({ type: "canvas.select", selection: { kind: "none" } });
      setContextMenu({
        kind: "canvas",
        x: event.clientX,
        y: event.clientY,
        canvasPoint: canvasPointFromContextMenu(event),
      });
    },
    [canvasPointFromContextMenu, dispatch],
  );

  const openObjectContextMenu = useCallback(
    (
      event: ReactMouseEvent<HTMLElement>,
      object: InteractiveCanvasObject,
      bounds: CanvasBounds,
    ) => {
      const canvasPoint = canvasPointFromContextMenu(event);
      // D16: a right-click in a true-outline shape's empty bbox corner
      // retargets to the object behind it, or to the canvas menu.
      const target = resolveContextMenuTarget(document, object, canvasPoint);
      if (!target) {
        openCanvasContextMenu(event, bounds);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      dispatch({
        type: "canvas.select",
        selection: { kind: "objects", objectIds: [target.id] },
      });
      setContextMenu({
        kind: "object",
        x: event.clientX,
        y: event.clientY,
        objectId: target.id,
        canvasPoint,
      });
    },
    [canvasPointFromContextMenu, dispatch, document, openCanvasContextMenu],
  );

  const addObjectFromContextMenu = (objectType: InteractiveCanvasObjectType) => {
    if (!contextMenu) return;
    const contextObject =
      contextMenu.kind === "object"
        ? document.objects.find((object) => object.id === contextMenu.objectId)
        : null;
    dispatch({
      type: "canvas.addObject",
      objectType,
      geometry: geometryForContextObject(objectType, contextMenu.canvasPoint),
      parentId:
        contextObject?.type === "section"
          ? contextObject.id
          : contextObject?.parentId ?? null,
    });
    setContextMenu(null);
  };

  /**
   * "Paste" context-menu entry (Wave 3a scope item 5) — reuses the exact
   * clipboard mechanism already backing Cmd/Ctrl-V (use-canvas-hotkeys.ts):
   * clipboard.ts's in-memory store + buildPastePayload, targeted at the
   * right-clicked canvas point instead of the last pointer position.
   */
  const pasteFromContextMenu = () => {
    if (!contextMenu) return;
    const clipboard = getClipboardMemory();
    if (!clipboard) return;
    const payload = buildPastePayload(clipboard, contextMenu.canvasPoint);
    dispatch({
      type: "canvas.addObjects",
      objects: payload.objects,
      connections: payload.connections,
      select: true,
    });
    setContextMenu(null);
  };

  const canPasteFromContextMenu = getClipboardMemory() !== null;

  /**
   * "Copy" context-menu entry — pairs with "Paste" above using the same
   * clipboard.ts mechanism as the Cmd/Ctrl-C hotkey. Right-clicking an
   * object doesn't necessarily change state.selection (see
   * setLockFromContextMenu, which also reads contextMenu.objectId
   * directly), so this builds a one-off selection over just the
   * right-clicked object rather than assuming it's already selected.
   */
  const copyFromContextMenu = () => {
    if (contextMenu?.kind !== "object") return;
    const payload = copySelection(document, {
      kind: "objects",
      objectIds: [contextMenu.objectId],
    });
    if (!payload) return;
    setClipboardMemory(payload);
    setContextMenu(null);
  };

  const setLockFromContextMenu = (mode: "all" | "background" | undefined) => {
    if (contextMenu?.kind !== "object") return;
    const object = document.objects.find((item) => item.id === contextMenu.objectId);
    if (!object) return;
    dispatch({
      type: "canvas.updateObject",
      objectId: object.id,
      patch: { locked: mode },
    });
    setContextMenu(null);
  };

  const addContextAnnotation = () => {
    if (contextMenu?.kind !== "object") return;
    dispatch({
      type: "canvas.addAnnotation",
      target: { kind: "object", objectId: contextMenu.objectId },
      body: "Review this object.",
      intent: "agent-request",
    });
    setContextMenu(null);
  };

  const fitContextObject = () => {
    if (contextMenu?.kind !== "object") return;
    const contextObject = document.objects.find((object) => object.id === contextMenu.objectId);
    if (contextObject?.type !== "section") return;
    dispatch({
      type: "canvas.fitSectionToChildren",
      sectionId: contextObject.id,
    });
    setContextMenu(null);
  };

  const tidySectionMembership = () => {
    if (contextMenu?.kind !== "object") return;
    const contextObject = document.objects.find((object) => object.id === contextMenu.objectId);
    if (contextObject?.type !== "section") return;
    dispatch({
      type: "canvas.reconcileSectionMembership",
    });
    setContextMenu(null);
  };

  const deleteContextSelection = () => {
    dispatch({ type: "canvas.deleteSelection" });
    setContextMenu(null);
  };

  const contextObject =
    contextMenu?.kind === "object"
      ? document.objects.find((object) => object.id === contextMenu.objectId)
      : null;

  return {
    contextMenu,
    contextObject,
    isContextMenuOpen,
    closeContextMenu,
    openCanvasContextMenu,
    openObjectContextMenu,
    addObjectFromContextMenu,
    pasteFromContextMenu,
    canPasteFromContextMenu,
    copyFromContextMenu,
    setLockFromContextMenu,
    addContextAnnotation,
    fitContextObject,
    tidySectionMembership,
    deleteContextSelection,
  };
}

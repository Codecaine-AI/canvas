"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { LockIcon, UnlockIcon } from "lucide-react";
import {
  buildSelectionContext,
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
  type CanvasAction,
  type CanvasSelection,
  type CanvasTool,
} from "../model/actions";
import { CanvasStage } from "../render/CanvasStage";
import {
  ColorPalettePopover,
  type ColorPalettePopoverProps,
} from "../chrome/ColorPalettePopover";
import {
  CONTEXT_TOOLBAR_REGISTRY,
  ContextToolbar,
  type ContextToolbarActionId,
  type ContextToolbarVariant,
} from "../chrome/ContextToolbar";
import { positionContextToolbar } from "../chrome/context-toolbar-position";
import { FigJamDock, type ToolId } from "../chrome/FigJamDock";
import { ShapeSearchPopover } from "../chrome/ShapeSearchPopover";
import { ShapesPanel } from "../chrome/ShapesPanel";
import { DashIcon, NoStrokeIcon, StrokeIcon } from "../chrome/toolbar-icons";
import { ZoomControls } from "../chrome/ZoomControls";
import { computeEdgePan } from "../interaction/edge-pan";
import { boundsForGeometries, type CanvasBounds, type CanvasPoint } from "../model/geometry";
import {
  cancelInteraction,
  createFrameCoalescer,
  hitTestObjects,
  IDLE_INTERACTION_STATE,
  stepInteraction,
  type CanvasHit,
  type CanvasPointerEvent,
  type FrameCoalescer,
  type InteractionContext,
  type InteractionOverlay,
  type InteractionState,
  type ResizeHandle,
} from "../interaction/interaction";
import { CONNECTOR_COLORS, CONNECTOR_DEFAULT_COLOR } from "../render/figjam-tokens";
import { type Anchor } from "../routing/routing";
import { paletteTokenStyle, resolveSectionColors } from "../render/theme";
import { CanvasContextMenu } from "./features/context-menu/CanvasContextMenu";
import { useCanvasContextMenu } from "./features/context-menu/use-canvas-context-menu";
import { Inspector } from "./features/inspector/Inspector";
import { LabelEditingOverlay } from "./features/label-editing/LabelEditingOverlay";
import { useLabelEditing } from "./features/label-editing/use-label-editing";
import { TopBar } from "./features/top-bar/TopBar";
import { stageFromEventTarget, stageScreenPointFromClient } from "./stage-dom";
import { useCanvasHotkeys } from "./use-canvas-hotkeys";
import { useCanvasViewport } from "./use-canvas-viewport";
import { panBy, worldToScreen } from "./viewport";
import type {
  CanvasPaletteToken,
  CanvasSectionStrokeStyle,
  CanvasSectionTint,
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
} from "../model/schema";

export interface InteractiveCanvasEditorProps {
  document: InteractiveCanvasDocument;
  onSave?: (document: InteractiveCanvasDocument) => void | Promise<void>;
  onCancel?: () => void;
  onDocumentChange?: (document: InteractiveCanvasDocument) => void;
  title?: string;
  titleContent?: ReactNode;
  editableTitle?: boolean;
  showInspector?: boolean;
  topBarLeading?: ReactNode;
  topBarActions?: ReactNode;
}

function reducer(state: ReturnType<typeof createInteractiveCanvasState>, action: CanvasAction) {
  return reduceInteractiveCanvasState(state, action);
}

function selectedObjectIds(selection: CanvasSelection): string[] {
  return selection.kind === "objects" ? selection.objectIds : [];
}

/** Width of the stage-edge band (screen px) where drag auto-pan kicks in (T1.2.1). */
const EDGE_PAN_BAND_PX = 36;
/** Max auto-pan speed in screen px per animation frame, reached right at the stage edge. */
const EDGE_PAN_MAX_SPEED_PX = 14;
/**
 * Interaction kinds that represent a continuous pointer-drag where edge
 * auto-pan should engage. "pressing" is deliberately excluded (sub-threshold —
 * panning before the 3px drag threshold is crossed would feel jumpy), and
 * "idle" never has an active gesture.
 */
const EDGE_PAN_DRAG_KINDS = new Set<InteractionState["kind"]>([
  "move",
  "resize",
  "marquee",
  "place",
  "connector-endpoint-drag",
  "connector-create",
]);

/**
 * Latest raw pointer sample for the active gesture: enough of the native event
 * for buildPointerEvent (position/buttons/modifiers/DOM target for hit
 * resolution) plus the stage element it belongs to. Stored per pointermove for
 * the frame coalescer, and re-used by the edge-pan loop to synthesize move
 * re-steps while the pointer sits still inside the edge band.
 */
type DragPointerSnapshot = {
  event: Pick<
    PointerEvent,
    "clientX" | "clientY" | "button" | "shiftKey" | "altKey" | "metaKey" | "target"
  >;
  stage: HTMLElement;
};

/**
 * Wave 3a — FigJamDock ↔ CanvasTool mapping.
 *
 * The dock speaks a small fixed vocabulary of chrome-level tool ids
 * (ToolId, from chrome/FigJamDock.tsx) while the reducer speaks the much
 * larger CanvasTool vocabulary (one entry per placeable object type, plus
 * select/hand/annotation). Most dock ids map 1:1 to an editor tool; "shapes"
 * is special-cased (it opens ShapesPanel instead of arming a single type —
 * see `shapesPanelOpen` state below).
 */
const DOCK_TOOL_TO_CANVAS_TOOL: Partial<Record<ToolId, CanvasTool>> = {
  select: "select",
  hand: "hand",
  text: "text",
  section: "section",
  sticky: "sticky",
  connector: "select", // quick-connect is driven by hovering a port while in "select", not a distinct tool.
};

/** Inverse of DOCK_TOOL_TO_CANVAS_TOOL, for reflecting reducer tool state back onto the dock's activeTool. */
const CANVAS_TOOL_TO_DOCK_TOOL: Partial<Record<CanvasTool, ToolId>> = {
  select: "select",
  hand: "hand",
  text: "text",
  section: "section",
  sticky: "sticky",
};

/**
 * Every other CanvasTool value (container/process/decision/source-node/
 * document/person/database/chat/pill/arrow-shape/predefined-process/
 * code-block/chip-icon/annotation) is armed exclusively via the Shapes panel
 * or the shape-search swap popover now — the dock's "shapes" button opens
 * that surface (see ShapesPanel wiring below) rather than exposing 16
 * individual per-type buttons as the old toolbar did.
 */
function dockToolForCanvasTool(tool: CanvasTool): ToolId | null {
  return CANVAS_TOOL_TO_DOCK_TOOL[tool] ?? null;
}

/**
 * Hex color -> nearest CanvasPaletteToken, for bridging ColorPalettePopover's
 * raw FigJam hex swatches onto the schema's 5-value semantic palette
 * (CanvasPaletteToken). Converts to HSL and picks the token whose anchor hue
 * (theme.ts's PALETTE_TOKEN_HUE, restated here as plain hue angles since
 * that map is OKLCH-string-only and not exported in a form usable for
 * distance math) is angularly closest on the hue circle. Low-saturation
 * (near-gray) swatches fall back to "note" (yellow) only when hue is
 * otherwise undefined (achromatic) — picked arbitrarily among the 5 anchors
 * since a gray swap has no strong semantic match; documented as a known
 * approximation in the wave-3a report.
 */
const PALETTE_TOKEN_HUE_ANGLES: Record<CanvasPaletteToken, number> = {
  process: 255,
  input: 145,
  hot: 35,
  memory: 300,
  note: 95,
};

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return null;
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  if ([r, g, b].some((value) => Number.isNaN(value))) return null;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function nearestPaletteToken(hex: string): CanvasPaletteToken {
  const hsl = hexToHsl(hex);
  if (!hsl || hsl.s < 0.08) return "note";
  let best: CanvasPaletteToken = "note";
  let bestDistance = Infinity;
  for (const token of Object.keys(PALETTE_TOKEN_HUE_ANGLES) as CanvasPaletteToken[]) {
    const distance = hueDistance(hsl.h, PALETTE_TOKEN_HUE_ANGLES[token]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = token;
    }
  }
  return best;
}

/** Derives the ContextToolbar variant for the current selection (Wave 3a scope item 2). */
function contextToolbarVariantForSelection(args: {
  selection: CanvasSelection;
  selectedObjects: InteractiveCanvasObject[];
  selectedConnection: InteractiveCanvasConnection | undefined;
}): ContextToolbarVariant | null {
  const { selection, selectedObjects, selectedConnection } = args;
  if (selection.kind === "connection" && selectedConnection) return "connector";
  if (selection.kind === "objects" && selectedObjects.length > 0) {
    if (selectedObjects.length > 1) return "multi";
    const object = selectedObjects[0];
    if (object.type === "section") return "section";
    if (object.type === "sticky") return "sticky";
    if (object.type === "text") return "text";
    return "shape";
  }
  return null;
}

/**
 * Resolves a raw pointer event's target into a CanvasHit by walking the DOM:
 * resize handles carry data-canvas-handle + data-canvas-object-id; connector
 * endpoint handles carry data-canvas-endpoint + data-canvas-connection-id;
 * object edge ports carry data-canvas-port + data-canvas-object-id; connector
 * hit paths carry data-canvas-connection-id (checked after endpoint, since an
 * endpoint circle is rendered as a sibling, not inside, the hit path — order
 * here matters only for elements nested under one another); object shapes
 * carry data-canvas-object-id; everything else falls through to a pure
 * world-space hitTestObjects (topmost-first, container border band).
 */
function resolveHit(
  target: Element,
  document: InteractiveCanvasDocument,
  world: CanvasPoint,
): CanvasHit {
  const handleElement = target.closest("[data-canvas-handle]");
  if (handleElement instanceof HTMLElement) {
    const objectId = handleElement.getAttribute("data-canvas-object-id");
    const handle = handleElement.getAttribute("data-canvas-handle") as ResizeHandle | null;
    if (objectId && handle) {
      return { kind: "handle", objectId, handle };
    }
  }
  // NOTE: endpoint circles and connector hit paths are SVG elements
  // (SVGCircleElement/SVGPathElement), so these two branches must check
  // `instanceof Element`, not HTMLElement — an HTMLElement check silently
  // never matches and every connector click used to fall through to the
  // world-space object hit test (W3b fix).
  const endpointElement = target.closest("[data-canvas-endpoint]");
  if (endpointElement instanceof Element) {
    const connectionId = endpointElement.getAttribute("data-canvas-connection-id");
    const end = endpointElement.getAttribute("data-canvas-endpoint") as "from" | "to" | null;
    if (connectionId && end) {
      return { kind: "endpoint", connectionId, end };
    }
  }
  const portElement = target.closest("[data-canvas-port]");
  if (portElement instanceof HTMLElement) {
    const objectId = portElement.getAttribute("data-canvas-object-id");
    const anchor = portElement.getAttribute("data-canvas-port") as Anchor | null;
    if (objectId && anchor) {
      return { kind: "port", objectId, anchor };
    }
  }
  const connectionElement = target.closest("[data-canvas-connection-id]");
  if (connectionElement instanceof Element) {
    const connectionId = connectionElement.getAttribute("data-canvas-connection-id");
    if (connectionId) return { kind: "connection", connectionId };
  }
  const objectElement = target.closest("[data-canvas-object-id]");
  if (objectElement instanceof HTMLElement) {
    const objectId = objectElement.getAttribute("data-canvas-object-id");
    if (objectId) return { kind: "object", objectId };
  }
  const hit = hitTestObjects(document, world);
  if (hit) return { kind: "object", objectId: hit.id };
  return { kind: "canvas" };
}

export function InteractiveCanvasEditor({
  document,
  onSave,
  onCancel,
  onDocumentChange,
  title,
  titleContent,
  editableTitle = false,
  showInspector = false,
  topBarLeading,
  topBarActions,
}: InteractiveCanvasEditorProps) {
  const [state, dispatch] = useReducer(reducer, document, createInteractiveCanvasState);
  const stageRef = useRef<HTMLDivElement | null>(null);
  // Inline label editing (connector labels + object labels/section titles) —
  // state and callbacks live in editor/features/label-editing.
  const labelEditing = useLabelEditing({ document: state.document, dispatch });
  const {
    labelEditConnectionId,
    objectLabelEditId,
    setObjectLabelEditId,
    setObjectLabelEditValue,
    openConnectionLabelEditor,
    openObjectLabelEditor,
  } = labelEditing;
  // FigJamDock modal rule (Wave 3a scope item 1): while the Shapes panel is
  // open, the dock shows no active tool (activeTool=null) — the panel owns
  // placement-arming until a shape is picked or the panel is dismissed.
  const [shapesPanelOpen, setShapesPanelOpen] = useState(false);
  // Which ContextToolbar flyout (if any) is currently open, tracked by action
  // id since ContextToolbar's buttons only report `onAction(action)` without
  // exposing their own open/closed state to the parent.
  const [openFlyout, setOpenFlyout] = useState<ContextToolbarActionId | null>(null);
  const contextToolbarRef = useRef<HTMLDivElement | null>(null);
  const [contextToolbarSize, setContextToolbarSize] = useState({ width: 220, height: 29 });
  const { viewport, setViewport, isPanning, controls, screenToWorld } = useCanvasViewport({
    document: state.document,
    stageRef,
    panOnPlainDrag: state.tool === "hand",
  });
  // Right-click context menu (canvas + object variants) — state and actions
  // live in editor/features/context-menu.
  const canvasContextMenu = useCanvasContextMenu({
    document: state.document,
    dispatch,
    screenToWorld,
  });
  const {
    isContextMenuOpen,
    closeContextMenu,
    openCanvasContextMenu,
    openObjectContextMenu,
  } = canvasContextMenu;
  const selectedIds = selectedObjectIds(state.selection);
  const selectedObject = state.document.objects.find((object) => object.id === selectedIds[0]);
  const selectedConnectionId = state.selection.kind === "connection" ? state.selection.connectionId : null;
  const selectedConnection = state.document.connections.find(
    (connection) => connection.id === selectedConnectionId,
  );
  const selectedLinks = selectedObject
    ? (state.document.links ?? []).filter((link) => link.objectId === selectedObject.id)
    : [];
  const selectedObjectsForToolbar = useMemo(
    () => state.document.objects.filter((object) => selectedIds.includes(object.id)),
    [state.document.objects, selectedIds],
  );
  const contextToolbarVariant = contextToolbarVariantForSelection({
    selection: state.selection,
    selectedObjects: selectedObjectsForToolbar,
    selectedConnection,
  });
  /**
   * Screen-space rect the ContextToolbar anchors above (Wave 3a scope item 2).
   * Computed read-only from CanvasStage's own pure helpers — worldToScreen
   * (viewport.ts) + boundsForGeometries (geometry.ts) — rather than touching
   * CanvasStage.tsx, per this wave's file-ownership constraints. Recomputes on
   * every viewport change (pan/zoom) since it's derived, not stored.
   */
  const selectionScreenRect = useMemo(() => {
    if (!contextToolbarVariant) return null;
    let worldBounds: CanvasBounds | null = null;
    if (contextToolbarVariant === "connector" && selectedConnection) {
      const from = state.document.objects.find((o) => o.id === selectedConnection.from.objectId);
      const to = state.document.objects.find((o) => o.id === selectedConnection.to.objectId);
      if (from && to) worldBounds = boundsForGeometries([from.geometry, to.geometry]);
    } else if (selectedObjectsForToolbar.length > 0) {
      worldBounds = boundsForGeometries(selectedObjectsForToolbar.map((object) => object.geometry));
    }
    if (!worldBounds) return null;
    const topLeft = worldToScreen(viewport, { x: worldBounds.x, y: worldBounds.y });
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: worldBounds.width * viewport.zoom,
      height: worldBounds.height * viewport.zoom,
    };
  }, [contextToolbarVariant, selectedConnection, selectedObjectsForToolbar, state.document.objects, viewport]);
  const contextToolbarPosition = useMemo(() => {
    if (!selectionScreenRect || !stageRef.current) return null;
    const stageRect = stageRef.current.getBoundingClientRect();
    return positionContextToolbar(selectionScreenRect, contextToolbarSize, {
      width: stageRect.width,
      height: stageRect.height,
    });
  }, [selectionScreenRect, contextToolbarSize]);
  const selectionContext = useMemo(
    () => buildSelectionContext(state.document, state.selection),
    [state.document, state.selection],
  );
  /**
   * Inspector "Color" swatches (checkpoint 5, D16) apply to every selected
   * object, not just the primary one — canvas.updateObject only patches a
   * single objectId, so dispatch once per id. Its style merge
   * (`{ ...object.style, ...patch.style }`) only overwrites `paletteToken`,
   * leaving `shape`/`tone` untouched.
   */
  const applyPaletteTokenToSelection = useCallback(
    (token: CanvasPaletteToken | undefined) => {
      const tokenStyle = token ? paletteTokenStyle(token) : undefined;
      for (const objectId of selectedIds) {
        const object = state.document.objects.find((item) => item.id === objectId);
        if (object?.type === "section") {
          dispatch({
            type: "canvas.updateObject",
            objectId,
            patch: { style: { fill: tokenStyle?.fill, stroke: tokenStyle?.border } },
          });
          continue;
        }
        dispatch({
          type: "canvas.updateObject",
          objectId,
          patch: { style: { paletteToken: token } },
        });
      }
    },
    [dispatch, selectedIds, state.document.objects],
  );

  const applySectionFillToSelection = useCallback(
    (fill: string) => {
      for (const object of selectedObjectsForToolbar) {
        if (object.type !== "section") continue;
        dispatch({
          type: "canvas.updateObject",
          objectId: object.id,
          patch: { style: { fill } },
        });
      }
    },
    [dispatch, selectedObjectsForToolbar],
  );

  const applySectionStrokeToSelection = useCallback(
    (stroke: string) => {
      for (const object of selectedObjectsForToolbar) {
        if (object.type !== "section") continue;
        dispatch({
          type: "canvas.updateObject",
          objectId: object.id,
          patch: { style: { stroke } },
        });
      }
    },
    [dispatch, selectedObjectsForToolbar],
  );

  // Measure the ContextToolbar's actual rendered size so positioning is exact
  // rather than assumed — width varies per variant (different control counts).
  useEffect(() => {
    const element = contextToolbarRef.current;
    if (!element || !contextToolbarVariant) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContextToolbarSize({ width: rect.width, height: rect.height });
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [contextToolbarVariant]);

  // Close any open ContextToolbar flyout whenever the selection changes shape
  // (different variant, or selection cleared) so a stale flyout doesn't linger
  // anchored to a control that's no longer rendered.
  useEffect(() => {
    setOpenFlyout(null);
  }, [contextToolbarVariant, selectedConnectionId, selectedIds.join(",")]);

  const primarySelectedObject = selectedObjectsForToolbar[0];

  /**
   * Section lock toggle (Wave 3a scope item 2's "lock" action + scope item
   * 5's context-menu Lock/Unlock entry) — `locked` is a real schema.ts field
   * on every object (reserved primarily for sections, "no enforcement yet"),
   * so this just flips it via the existing canvas.updateObject action.
   */
  const toggleLockForSelection = useCallback(() => {
    for (const object of selectedObjectsForToolbar) {
      dispatch({
        type: "canvas.updateObject",
        objectId: object.id,
        patch: { locked: !object.locked },
      });
    }
  }, [dispatch, selectedObjectsForToolbar]);

  const toggleSectionContentHiddenForSelection = useCallback(() => {
    for (const object of selectedObjectsForToolbar) {
      if (object.type !== "section") continue;
      dispatch({
        type: "canvas.updateObject",
        objectId: object.id,
        patch: { contentHidden: !object.contentHidden },
      });
    }
  }, [dispatch, selectedObjectsForToolbar]);

  const applyTintToSelection = useCallback(
    (tint: CanvasSectionTint) => {
      for (const object of selectedObjectsForToolbar) {
        if (object.type !== "section") continue;
        dispatch({ type: "canvas.updateObject", objectId: object.id, patch: { tint } });
      }
    },
    [dispatch, selectedObjectsForToolbar],
  );

  const applySectionBorderStyleToSelection = useCallback(
    (strokeStyle: CanvasSectionStrokeStyle) => {
      for (const object of selectedObjectsForToolbar) {
        if (object.type !== "section") continue;
        dispatch({
          type: "canvas.updateObject",
          objectId: object.id,
          patch: { style: { strokeStyle } },
        });
      }
    },
    [dispatch, selectedObjectsForToolbar],
  );

  const swapSelectedShape = useCallback(
    (objectType: InteractiveCanvasObjectType) => {
      if (!primarySelectedObject) return;
      dispatch({ type: "canvas.setObjectType", objectId: primarySelectedObject.id, objectType });
      setOpenFlyout(null);
    },
    [dispatch, primarySelectedObject],
  );

  /**
   * ContextToolbar onAction dispatch table (Wave 3a scope item 2). Actions
   * with a real backing schema field dispatch immediately on click (bold-ish
   * toggle actions have none to toggle, so those are effectively disabled —
   * see the report's disabled-with-tooltip list); actions that need a value
   * picker (color/tint/dash/routing/arrowhead/shape-swap/lock) instead toggle
   * a flyout, rendered just below the toolbar in the overlay.
   */
  const handleContextToolbarAction = useCallback(
    (action: ContextToolbarActionId, value?: unknown) => {
      if (action === "section-border-style" && (value === "solid" || value === "dashed" || value === "none")) {
        applySectionBorderStyleToSelection(value);
        return;
      }
      if (action === "color" && typeof value === "string") {
        if (contextToolbarVariant === "section") {
          applySectionFillToSelection(value);
        } else {
          applyPaletteTokenToSelection(nearestPaletteToken(value));
        }
        return;
      }
      if (action === "rename" && primarySelectedObject) {
        setObjectLabelEditId(primarySelectedObject.id);
        setObjectLabelEditValue(
          primarySelectedObject.type === "section"
            ? (primarySelectedObject.title ?? primarySelectedObject.label)
            : primarySelectedObject.label,
        );
        return;
      }
      if (action === "visibility") {
        toggleSectionContentHiddenForSelection();
        return;
      }
      const FLYOUT_ACTIONS = new Set<ContextToolbarActionId>([
        "shape-swap",
        "color",
        "tint",
        "section-border-style",
        "dash",
        "routing",
        "arrowhead",
        "lock",
      ]);
      if (FLYOUT_ACTIONS.has(action)) {
        setOpenFlyout((current) => (current === action ? null : action));
        return;
      }
      if (action === "expand") {
        controls.fit();
        return;
      }
      // align/font-style/size/bold/strikethrough/link/bullets/paragraph-align/
      // list/frame/visibility/label-align/add-label: no supporting schema
      // field exists yet (object/connection style is limited to
      // paletteToken/tone + shape, and connections to style/arrow) — these
      // render but are no-ops beyond ContextToolbar's own local
      // aria-expanded toggle. Documented in the wave-3a report as
      // disabled-with-tooltip (ContextToolbar doesn't support a disabled prop
      // per-control today, so the tooltip still shows via ChromeTooltip's
      // hover label; clicking is inert).
    },
    [
      applyPaletteTokenToSelection,
      applySectionFillToSelection,
      applySectionBorderStyleToSelection,
      controls,
      contextToolbarVariant,
      primarySelectedObject,
      toggleSectionContentHiddenForSelection,
    ],
  );

  // Interaction machine: a ref holds the current InteractionState (gestures
  // happen faster than React state updates should be trusted for), while
  // overlay is mirrored into useState so CanvasStage's overlay slot re-renders.
  const interactionStateRef = useRef<InteractionState>(IDLE_INTERACTION_STATE);
  const [interactionOverlay, setInteractionOverlay] = useState<InteractionOverlay>({});
  const stateRef = useRef(state);
  stateRef.current = state;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const didReportInitialDocumentRef = useRef(false);

  useEffect(() => {
    if (!didReportInitialDocumentRef.current) {
      didReportInitialDocumentRef.current = true;
      return;
    }
    onDocumentChange?.(state.document);
  }, [onDocumentChange, state.document]);

  // Tracks the pointerId + stage element of an in-progress gesture so window-level
  // move/up listeners (attached only while a gesture is active) can keep receiving
  // events even when the pointer leaves the stage's bounding box during a fast drag.
  const activeGestureRef = useRef<{ pointerId: number; stage: HTMLElement } | null>(null);

  const buildPointerEvent = useCallback(
    (
      type: CanvasPointerEvent["type"],
      nativeEvent: Pick<
        PointerEvent,
        "clientX" | "clientY" | "button" | "shiftKey" | "altKey" | "metaKey" | "target"
      >,
      stage: HTMLElement,
    ): CanvasPointerEvent => {
      const screen = stageScreenPointFromClient(nativeEvent, stage);
      const world = screenToWorld(screen);
      const target = nativeEvent.target instanceof Element ? nativeEvent.target : stage;
      const hit = resolveHit(target, stateRef.current.document, world);
      return {
        type,
        world,
        screen,
        button: nativeEvent.button,
        shiftKey: nativeEvent.shiftKey,
        altKey: nativeEvent.altKey,
        metaKey: nativeEvent.metaKey,
        hit,
      };
    },
    [screenToWorld],
  );

  const runInteraction = useCallback(
    (canvasEvent: CanvasPointerEvent) => {
      const ctx: InteractionContext = {
        document: stateRef.current.document,
        selection: stateRef.current.selection,
        tool: stateRef.current.tool,
        viewport: viewportRef.current,
      };
      const result = stepInteraction(interactionStateRef.current, canvasEvent, ctx);
      interactionStateRef.current = result.state;
      setInteractionOverlay(result.overlay);
      for (const action of result.dispatch) {
        dispatch(action);
      }
      // One-shot signal (4.2.1): the machine resolved a double-click to "open
      // the inline label editor for this object id" — for a freshly created
      // object the id was predicted via the same createObjectId() call the
      // canvas.addObject reducer makes, so it's already correct even though
      // the dispatch above hasn't been reflected in `state` yet this tick.
      if (result.overlay.editObjectLabelId) {
        const objectId = result.overlay.editObjectLabelId;
        const existing = stateRef.current.document.objects.find((item) => item.id === objectId);
        setObjectLabelEditId(objectId);
        setObjectLabelEditValue(existing?.label ?? result.overlay.editObjectLabelSeed ?? "");
      }
    },
    [dispatch],
  );

  // ——— rAF drag pipeline (checkpoint 1, T1.1.1 + T1.2.1) ————————————————————
  //
  // Two cooperating rAF mechanisms, deliberately structured so that at most ONE
  // stepInteraction move-commit happens per animation frame regardless of how
  // many sources produced input that frame:
  //
  //  1. `moveCoalescer` — pointermove events never call stepInteraction
  //     directly; they only record the latest DragPointerSnapshot and schedule
  //     one commit per frame (createFrameCoalescer, latest-wins). pointerup /
  //     pointercancel synchronously flush() a still-pending move BEFORE the
  //     up/cancel is stepped, so the final drag position is never dropped.
  //     Single-shot events (down / double / up / cancel) stay uncoalesced.
  //
  //  2. The edge-pan loop — a self-rescheduling rAF tick that runs for the
  //     whole life of a gesture (started on pointerdown, self-terminates when
  //     activeGestureRef clears). While the interaction is in a drag kind and
  //     the pointer sits inside the stage-edge band, each tick pans the
  //     viewport by computeEdgePan's delta and *pushes the last pointer
  //     snapshot into the same moveCoalescer* rather than stepping directly —
  //     the re-step against the moved viewport then lands on the next frame's
  //     single commit. This keeps geometry following the pan even when no new
  //     pointermove arrives (pointer parked in the band), without ever racing
  //     or double-stepping against real pointermove traffic.
  //
  // The coalescer commit and edge-pan tick read runInteraction/buildPointerEvent
  // through refs (updated every render) so both rAF callbacks — created once —
  // always see the latest document/selection/viewport-closing callbacks.
  const runInteractionRef = useRef(runInteraction);
  runInteractionRef.current = runInteraction;
  const buildPointerEventRef = useRef(buildPointerEvent);
  buildPointerEventRef.current = buildPointerEvent;

  const lastDragPointerRef = useRef<DragPointerSnapshot | null>(null);

  const moveCoalescerRef = useRef<FrameCoalescer<DragPointerSnapshot> | null>(null);
  if (moveCoalescerRef.current === null) {
    moveCoalescerRef.current = createFrameCoalescer<DragPointerSnapshot>(({ event, stage }) => {
      runInteractionRef.current(buildPointerEventRef.current("move", event, stage));
    });
  }
  const moveCoalescer = moveCoalescerRef.current;

  const edgePanFrameRef = useRef<number | null>(null);

  const stopEdgePanLoop = useCallback(() => {
    if (edgePanFrameRef.current !== null) {
      cancelAnimationFrame(edgePanFrameRef.current);
      edgePanFrameRef.current = null;
    }
  }, []);

  const startEdgePanLoop = useCallback(() => {
    if (edgePanFrameRef.current !== null) return;
    const tick = () => {
      edgePanFrameRef.current = null;
      const active = activeGestureRef.current;
      const last = lastDragPointerRef.current;
      // Gesture ended (pointerup/cancel/Escape cleared the refs) — loop stops.
      if (!active || !last) return;
      if (EDGE_PAN_DRAG_KINDS.has(interactionStateRef.current.kind)) {
        const rect = active.stage.getBoundingClientRect();
        const pointer = {
          x: last.event.clientX - rect.left,
          y: last.event.clientY - rect.top,
        };
        const pan = computeEdgePan(
          pointer,
          { width: rect.width, height: rect.height },
          EDGE_PAN_BAND_PX,
          EDGE_PAN_MAX_SPEED_PX,
        );
        if (pan.dx !== 0 || pan.dy !== 0) {
          setViewport((previous) => panBy(previous, pan.dx, pan.dy));
          // Re-step against the moved viewport via the shared coalescer: the
          // commit fires next frame, by which point React has re-rendered and
          // the viewport refs (here and inside useCanvasViewport) hold the
          // panned state — so the dragged geometry keeps following the pan.
          moveCoalescer.push(last);
        }
      }
      edgePanFrameRef.current = requestAnimationFrame(tick);
    };
    edgePanFrameRef.current = requestAnimationFrame(tick);
  }, [moveCoalescer, setViewport]);

  const handleStageDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (stateRef.current.tool === "hand") return;
      const stage = stageFromEventTarget(event.currentTarget);
      if (!stage) return;
      const target = event.target instanceof Element ? event.target : null;
      const sectionChip = target?.closest("[data-canvas-section-title-chip]");
      if (sectionChip instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        const objectId = sectionChip.getAttribute("data-canvas-section-title-chip");
        if (objectId) openObjectLabelEditor(objectId);
        return;
      }
      const sectionObject = target?.closest('[data-canvas-object-type="section"]');
      if (sectionObject) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      runInteraction(buildPointerEvent("double", event.nativeEvent, stage));
    },
    [buildPointerEvent, openObjectLabelEditor, runInteraction],
  );

  const onWindowPointerMove = useCallback(
    (event: PointerEvent) => {
      const active = activeGestureRef.current;
      if (!active || active.pointerId !== event.pointerId) return;
      // T1.1.1: record + schedule only — the coalescer commits at most one
      // stepInteraction per animation frame with the latest position.
      const snapshot: DragPointerSnapshot = { event, stage: active.stage };
      lastDragPointerRef.current = snapshot;
      moveCoalescer.push(snapshot);
    },
    [moveCoalescer],
  );

  const onWindowPointerEnd = useCallback(
    (event: PointerEvent) => {
      const active = activeGestureRef.current;
      if (!active || active.pointerId !== event.pointerId) return;
      // Flush any coalesced-but-uncommitted move synchronously BEFORE stepping
      // the up/cancel so the final drag position is never dropped behind a
      // frame that will no longer fire.
      moveCoalescer.flush();
      const type = event.type === "pointercancel" ? "cancel" : "up";
      runInteraction(buildPointerEvent(type, event, active.stage));
      activeGestureRef.current = null;
      lastDragPointerRef.current = null;
      stopEdgePanLoop();
    },
    [buildPointerEvent, moveCoalescer, runInteraction, stopEdgePanLoop],
  );

  useEffect(() => {
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerEnd);
    window.addEventListener("pointercancel", onWindowPointerEnd);
    return () => {
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerEnd);
      window.removeEventListener("pointercancel", onWindowPointerEnd);
      // Unmount mid-gesture: drop any pending coalesced move (committing into
      // an unmounted tree would be wrong) and stop the edge-pan loop.
      moveCoalescer.cancel();
      stopEdgePanLoop();
    };
  }, [onWindowPointerMove, onWindowPointerEnd, moveCoalescer, stopEdgePanLoop]);

  const handleStagePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      if (stateRef.current.tool === "hand") return;
      const stage = event.currentTarget;
      closeContextMenu();
      activeGestureRef.current = { pointerId: event.pointerId, stage };
      // Seed the pointer snapshot so the edge-pan loop has a position even
      // before the first pointermove, then start the per-gesture rAF loop
      // (it idles cheaply until the interaction enters a drag kind).
      lastDragPointerRef.current = { event: event.nativeEvent, stage };
      startEdgePanLoop();
      runInteraction(buildPointerEvent("down", event.nativeEvent, stage));
    },
    [buildPointerEvent, closeContextMenu, runInteraction, startEdgePanLoop],
  );

  const applyCancelInteraction = useCallback((result: ReturnType<typeof cancelInteraction>) => {
    // Drop any coalesced-but-uncommitted move and stop edge-panning first: a
    // queued move committing one frame AFTER Escape restored the pre-drag
    // geometry would re-step a gesture the user just cancelled.
    moveCoalescer.cancel();
    stopEdgePanLoop();
    lastDragPointerRef.current = null;
    interactionStateRef.current = result.state;
    setInteractionOverlay(result.overlay);
    activeGestureRef.current = null;
    for (const action of result.dispatch) {
      dispatch(action);
    }
  }, [dispatch, moveCoalescer, stopEdgePanLoop]);

  const isTypingContextActive = useCallback(
    () => labelEditConnectionId !== null || objectLabelEditId !== null,
    [labelEditConnectionId, objectLabelEditId],
  );

  useCanvasHotkeys({
    document: state.document,
    selection: state.selection,
    dispatch,
    isTypingContextActive,
    interactionStateRef,
    onCancelInteraction: applyCancelInteraction,
    isContextMenuOpen,
    onCloseContextMenu: closeContextMenu,
    controls,
  });

  const handleShapePick = useCallback(
    (shapeType: InteractiveCanvasObjectType) => {
      dispatch({ type: "canvas.setTool", tool: shapeType });
      setShapesPanelOpen(false);
    },
    [dispatch],
  );

  const closeShapesPanel = useCallback(() => setShapesPanelOpen(false), []);

  const handleDockSelectTool = useCallback(
    (tool: ToolId) => {
      if (tool === "shapes") return;
      setShapesPanelOpen(false);
      const canvasTool = DOCK_TOOL_TO_CANVAS_TOOL[tool];
      if (canvasTool) dispatch({ type: "canvas.setTool", tool: canvasTool });
    },
    [dispatch],
  );

  const openShapesPanel = useCallback(() => setShapesPanelOpen(true), []);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-background">
      <CanvasStage
        stageRef={stageRef}
        document={state.document}
        viewport={viewport}
        selectedObjectIds={selectedIds}
        changedObjectIds={state.lastChange?.changedObjectIds}
        selectedConnectionId={selectedConnectionId}
        onCanvasContextMenu={openCanvasContextMenu}
        onObjectContextMenu={openObjectContextMenu}
        onConnectionDoubleClick={openConnectionLabelEditor}
        onStagePointerEvent={handleStagePointerDown}
        onStageDoubleClick={handleStageDoubleClick}
        interactionOverlay={interactionOverlay}
        editingLabelObjectId={objectLabelEditId}
        activeTool={state.tool}
        className="h-full"
        style={{
          cursor: isPanning
            ? "grabbing"
            : state.tool === "hand"
              ? "grab"
              : state.tool !== "select"
                ? "crosshair"
                : undefined,
        }}
        worldOverlay={<LabelEditingOverlay labelEditing={labelEditing} zoom={viewport.zoom} />}
      />

      <CanvasContextMenu menu={canvasContextMenu} />

      <TopBar
        title={title}
        titleContent={titleContent}
        editableTitle={editableTitle}
        documentTitle={state.document.title}
        documentId={state.document.id}
        historyPastLength={state.history.past.length}
        historyFutureLength={state.history.future.length}
        dispatch={dispatch}
        onSave={onSave ? () => void onSave(state.document) : undefined}
        onCancel={onCancel}
        topBarLeading={topBarLeading}
        topBarActions={topBarActions}
      />

      {showInspector ? (
        <Inspector
          lastChange={state.lastChange}
          selectedObject={selectedObject}
          selectedConnection={selectedConnection}
          selectedLinks={selectedLinks}
          selectionContext={selectionContext}
          dispatch={dispatch}
          applyPaletteTokenToSelection={applyPaletteTokenToSelection}
        />
      ) : null}

      {contextToolbarVariant && contextToolbarPosition && (
        <div
          ref={contextToolbarRef}
          className="pointer-events-auto absolute z-40"
          style={{ left: contextToolbarPosition.x, top: contextToolbarPosition.y }}
        >
          <ContextToolbar
            variant={contextToolbarVariant}
            onAction={handleContextToolbarAction}
            currentColor={
              primarySelectedObject?.type === "section"
                ? primarySelectedObject.style?.fill ?? resolveSectionColors(primarySelectedObject.tint).tint
                : primarySelectedObject
                  ? paletteTokenStyle(primarySelectedObject.style?.paletteToken ?? "note").accent
                  : selectedConnection?.color ?? CONNECTOR_DEFAULT_COLOR
            }
            currentSectionBorderStyle={
              primarySelectedObject?.type === "section" ? (primarySelectedObject.style?.strokeStyle ?? "solid") : undefined
            }
            currentSectionStroke={
              primarySelectedObject?.type === "section"
                ? primarySelectedObject.style?.stroke ?? resolveSectionColors(primarySelectedObject.tint).chipBorder ?? "transparent"
                : undefined
            }
            activeFlyout={openFlyout}
            sectionContentHidden={primarySelectedObject?.type === "section" ? primarySelectedObject.contentHidden : undefined}
            sectionLocked={primarySelectedObject?.type === "section" ? primarySelectedObject.locked : undefined}
          />
          {openFlyout === "color" && primarySelectedObject?.type === "section" && contextToolbarVariant === "section" && (
            <div className="absolute left-0 top-full z-50 mt-2">
              <ColorPalettePopover
                currentColor={primarySelectedObject.style?.fill ?? resolveSectionColors(primarySelectedObject.tint).tint}
                onPick={(color: string) => {
                  applySectionFillToSelection(color);
                  setOpenFlyout(null);
                }}
              />
            </div>
          )}
          {openFlyout === "section-border-style" && primarySelectedObject?.type === "section" && contextToolbarVariant === "section" && (
            <div className="absolute left-0 top-full z-50 mt-2">
              <ColorPalettePopover
                currentColor={primarySelectedObject.style?.stroke ?? resolveSectionColors(primarySelectedObject.tint).chipBorder ?? "transparent"}
                onPick={(color: string) => {
                  applySectionStrokeToSelection(color);
                  setOpenFlyout(null);
                }}
                header={
                  <div data-toolbar-flyout="section-border" style={{ display: "grid", gap: 12 }}>
                    <div role="menu" aria-label="Border style" style={{ display: "flex", gap: 8 }}>
                      {(
                        [
                          ["solid", "Solid", StrokeIcon],
                          ["dashed", "Dashed", DashIcon],
                          ["none", "None", NoStrokeIcon],
                        ] as const
                      ).map(([value, label, Icon]) => {
                        const active = (primarySelectedObject.style?.strokeStyle ?? "solid") === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            role="menuitem"
                            aria-label={label}
                            data-section-border-style={value}
                            onClick={(event) => {
                              event.stopPropagation();
                              applySectionBorderStyleToSelection(value);
                            }}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              height: 30,
                              padding: "0 10px",
                              border: "none",
                              borderRadius: 8,
                              background: active ? "#8C2EF2" : "rgba(255,255,255,0.08)",
                              color: "#FFFFFF",
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                            title={label}
                          >
                            <Icon className="h-4 w-4" />
                            <span>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ height: 1, background: "rgba(255,255,255,0.14)" }} />
                  </div>
                }
              />
            </div>
          )}
          {openFlyout === "color" && primarySelectedObject && contextToolbarVariant !== "connector" && contextToolbarVariant !== "section" && (
            <div className="absolute left-0 top-full z-50 mt-2">
              <ColorPalettePopover
                currentColor={
                  primarySelectedObject.type === "section"
                    ? primarySelectedObject.style?.fill ?? paletteTokenStyle("note").fill
                    : paletteTokenStyle(primarySelectedObject.style?.paletteToken ?? "note").accent
                }
                onPick={(color: Parameters<NonNullable<ColorPalettePopoverProps["onPick"]>>[0]) => {
                  applyPaletteTokenToSelection(nearestPaletteToken(color));
                  setOpenFlyout(null);
                }}
              />
            </div>
          )}
          {openFlyout === "color" && contextToolbarVariant === "connector" && selectedConnection && (
            <div className="absolute left-0 top-full z-50 mt-2">
              {/* Connector color flyout (W3b/W4): the sampled FigJam connector
                  stroke set (figjam-tokens.ts CONNECTOR_COLORS), patched onto
                  the selected connection as `color`. */}
              <ColorPalettePopover
                currentColor={selectedConnection.color ?? CONNECTOR_DEFAULT_COLOR}
                swatches={[Object.values(CONNECTOR_COLORS)]}
                onPick={(color: string) => {
                  dispatch({
                    type: "canvas.updateConnection",
                    connectionId: selectedConnection.id,
                    patch: { color },
                  });
                  setOpenFlyout(null);
                }}
              />
            </div>
          )}
          {openFlyout === "tint" && (
            <div className="absolute left-0 top-full z-50 mt-2 flex gap-1 rounded-full bg-[#1D1D1D] p-2 shadow-xl">
              {(
                [
                  "green", "purple", "orange", "yellow", "gray",
                  "white", "pink", "red", "blue", "teal",
                ] as CanvasSectionTint[]
              ).map((tint) => (
                <button
                  key={tint}
                  type="button"
                  aria-label={`Section color ${tint}`}
                  data-section-tint={tint}
                  className="h-5 w-5 rounded-full border border-white/20"
                  style={{ background: `var(--canvas-section-${tint}, ${tint})` }}
                  onClick={() => {
                    applyTintToSelection(tint);
                    setOpenFlyout(null);
                  }}
                />
              ))}
            </div>
          )}
          {openFlyout === "shape-swap" && (
            <div className="absolute left-0 top-full z-50 mt-2">
              <ShapeSearchPopover onPick={swapSelectedShape} />
            </div>
          )}
          {openFlyout === "lock" && (
            <div className="absolute left-0 top-full z-50 mt-2 rounded-md bg-[#1D1D1D] p-1 shadow-xl">
              <button
                type="button"
                role="menuitem"
                className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-white hover:bg-white/10"
                onClick={() => {
                  toggleLockForSelection();
                  setOpenFlyout(null);
                }}
              >
                {primarySelectedObject?.locked ? (
                  <UnlockIcon className="h-4 w-4" />
                ) : (
                  <LockIcon className="h-4 w-4" />
                )}
                {primarySelectedObject?.locked ? "Unlock section" : "Lock section"}
              </button>
            </div>
          )}
          {(openFlyout === "dash" || openFlyout === "routing" || openFlyout === "arrowhead") &&
            selectedConnection && (
              <div className="absolute left-0 top-full z-50 mt-2 grid gap-1 rounded-md bg-[#1D1D1D] p-1 shadow-xl">
                {openFlyout === "dash" &&
                  (["solid", "dotted"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="menuitem"
                      className="rounded px-2 py-1.5 text-left text-sm capitalize text-white hover:bg-white/10"
                      onClick={() => {
                        dispatch({
                          type: "canvas.updateConnection",
                          connectionId: selectedConnection.id,
                          patch: { style: value },
                        });
                        setOpenFlyout(null);
                      }}
                    >
                      {value}
                    </button>
                  ))}
                {openFlyout === "routing" &&
                  (["elbow", "smooth"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="menuitem"
                      className="rounded px-2 py-1.5 text-left text-sm capitalize text-white hover:bg-white/10"
                      onClick={() => {
                        dispatch({
                          type: "canvas.updateConnection",
                          connectionId: selectedConnection.id,
                          patch: { style: value },
                        });
                        setOpenFlyout(null);
                      }}
                    >
                      {value}
                    </button>
                  ))}
                {openFlyout === "arrowhead" &&
                  (["none", "forward", "back", "both"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="menuitem"
                      className="rounded px-2 py-1.5 text-left text-sm capitalize text-white hover:bg-white/10"
                      onClick={() => {
                        dispatch({
                          type: "canvas.updateConnection",
                          connectionId: selectedConnection.id,
                          patch: { arrow: value },
                        });
                        setOpenFlyout(null);
                      }}
                    >
                      {value}
                    </button>
                  ))}
              </div>
            )}
        </div>
      )}

      {shapesPanelOpen && (
        <div className="pointer-events-auto absolute bottom-4 left-4 top-20 z-30">
          <ShapesPanel
            className="h-full"
            onPick={handleShapePick}
            onClose={closeShapesPanel}
          />
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
        <FigJamDock
          className="pointer-events-auto"
          activeTool={shapesPanelOpen ? null : dockToolForCanvasTool(state.tool)}
          onSelectTool={handleDockSelectTool}
          onOpenShapes={openShapesPanel}
        />
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 z-30 flex items-center justify-end gap-2">
        <ZoomControls
          className="pointer-events-auto"
          zoomPercent={viewport.zoom}
          onZoomIn={controls.zoomIn}
          onZoomOut={controls.zoomOut}
          onZoomPercentClick={controls.zoomTo100}
        />
      </div>
    </div>
  );
}

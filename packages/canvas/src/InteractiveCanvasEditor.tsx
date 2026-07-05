"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AlignCenterHorizontalIcon,
  AlignCenterVerticalIcon,
  AlignHorizontalDistributeCenterIcon,
  AlignVerticalDistributeCenterIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  BoxIcon,
  CheckIcon,
  ClipboardPasteIcon,
  CopyIcon,
  DiamondIcon,
  FrameIcon,
  GitBranchIcon,
  LockIcon,
  MessageSquareIcon,
  PlusIcon,
  RotateCcwIcon,
  SaveIcon,
  StickyNoteIcon,
  Trash2Icon,
  TypeIcon,
  Undo2Icon,
  UnlockIcon,
  XIcon,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  buildSelectionContext,
  createInteractiveCanvasState,
  defaultGeometryFor,
  reduceInteractiveCanvasState,
  type CanvasAction,
  type CanvasSelection,
  type CanvasTool,
} from "./actions";
import { CanvasStage } from "./CanvasStage";
import { buildPastePayload, copySelection, getClipboardMemory, setClipboardMemory } from "./clipboard";
import {
  ColorPalettePopover,
  type ColorPalettePopoverProps,
} from "./chrome/ColorPalettePopover";
import {
  CONTEXT_TOOLBAR_REGISTRY,
  ContextToolbar,
  type ContextToolbarActionId,
  type ContextToolbarVariant,
} from "./chrome/ContextToolbar";
import { positionContextToolbar } from "./chrome/context-toolbar-position";
import { FigJamDock, type ToolId } from "./chrome/FigJamDock";
import { ShapeSearchPopover } from "./chrome/ShapeSearchPopover";
import { ShapesPanel } from "./chrome/ShapesPanel";
import { ZoomControls } from "./chrome/ZoomControls";
import { computeEdgePan } from "./edge-pan";
import { boundsForGeometries, type CanvasBounds, type CanvasPoint } from "./geometry";
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
} from "./interaction";
import { CONNECTOR_COLORS, CONNECTOR_DEFAULT_COLOR } from "./figjam-tokens";
import { routeConnection, type Anchor } from "./routing";
import { CANVAS_PALETTE_TOKENS, paletteTokenStyle } from "./theme";
import { useCanvasHotkeys } from "./use-canvas-hotkeys";
import { useCanvasViewport } from "./use-canvas-viewport";
import { panBy, worldToScreen } from "./viewport";
import type {
  CanvasGeometry,
  CanvasPaletteToken,
  CanvasSectionTint,
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
} from "./schema";

export interface InteractiveCanvasEditorProps {
  document: InteractiveCanvasDocument;
  onSave: (document: InteractiveCanvasDocument) => void | Promise<void>;
  onCancel: () => void;
  title?: string;
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
 * see `shapesPanelOpen` state below) and a few dock ids have no backing
 * editor capability yet and are rendered disabled with a "coming soon"
 * tooltip (pen/highlighter/table/stamp/widgets).
 */
const DOCK_TOOL_TO_CANVAS_TOOL: Partial<Record<ToolId, CanvasTool>> = {
  select: "select",
  hand: "hand",
  text: "text",
  sticky: "sticky",
  connector: "select", // quick-connect is driven by hovering a port while in "select", not a distinct tool.
  // FigJam's comment tool drops a pin annotation on the canvas — closest
  // existing capability is the "annotation-marker" object tool.
  comment: "annotation-marker",
};

/** Dock ids with no backing editor capability yet — rendered disabled with a tooltip. */
const DOCK_TOOLS_COMING_SOON = new Set<ToolId>([
  "pen",
  "highlighter",
  "table",
  "stamp",
  "widgets",
]);

/** Inverse of DOCK_TOOL_TO_CANVAS_TOOL, for reflecting reducer tool state back onto the dock's activeTool. */
const CANVAS_TOOL_TO_DOCK_TOOL: Partial<Record<CanvasTool, ToolId>> = {
  select: "select",
  hand: "hand",
  text: "text",
  sticky: "sticky",
  "annotation-marker": "comment",
};

/**
 * Every other CanvasTool value (container/process/decision/source-node/
 * document/person/database/chat/section/pill/arrow-shape/predefined-process/
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

type CanvasContextMenuState =
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

/** Client (viewport) coords -> stage-relative screen coords, for screenToWorld(). */
function stageScreenPointFromClient(
  event: Pick<PointerEvent | MouseEvent, "clientX" | "clientY">,
  stage: HTMLElement,
): CanvasPoint {
  const rect = stage.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function stageFromEventTarget(target: Element): HTMLElement | null {
  const stage = target.closest("[data-canvas-stage='true']");
  return stage instanceof HTMLElement ? stage : null;
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

export function InteractiveCanvasEditor({
  document,
  onSave,
  onCancel,
  title,
}: InteractiveCanvasEditorProps) {
  const [state, dispatch] = useReducer(reducer, document, createInteractiveCanvasState);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [annotationBody, setAnnotationBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState | null>(null);
  const [labelEditConnectionId, setLabelEditConnectionId] = useState<string | null>(null);
  const [labelEditValue, setLabelEditValue] = useState("");
  // Inline OBJECT label editor (4.2.1) — distinct from the connector label
  // editor above. Opened by the interaction machine's double-click intent
  // (overlay.editObjectLabelId) for both existing objects and freshly created
  // ones (typing starts immediately after a canvas double-click).
  const [objectLabelEditId, setObjectLabelEditId] = useState<string | null>(null);
  const [objectLabelEditValue, setObjectLabelEditValue] = useState("");
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
      for (const objectId of selectedIds) {
        dispatch({
          type: "canvas.updateObject",
          objectId,
          patch: { style: { paletteToken: token } },
        });
      }
    },
    [dispatch, selectedIds],
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

  const applyTintToSelection = useCallback(
    (tint: CanvasSectionTint) => {
      for (const object of selectedObjectsForToolbar) {
        if (object.type !== "section") continue;
        dispatch({ type: "canvas.updateObject", objectId: object.id, patch: { tint } });
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
    (action: ContextToolbarActionId) => {
      const FLYOUT_ACTIONS = new Set<ContextToolbarActionId>([
        "shape-swap",
        "color",
        "tint",
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
    [controls],
  );

  const labelEditConnection = state.document.connections.find(
    (connection) => connection.id === labelEditConnectionId,
  );
  const labelEditFromObject = labelEditConnection
    ? state.document.objects.find((object) => object.id === labelEditConnection.from.objectId)
    : undefined;
  const labelEditToObject = labelEditConnection
    ? state.document.objects.find((object) => object.id === labelEditConnection.to.objectId)
    : undefined;
  const labelEditPoint =
    labelEditConnection && labelEditFromObject && labelEditToObject
      ? routeConnection(labelEditFromObject, labelEditToObject, labelEditConnection, state.document.objects).labelPoint
      : null;

  const openConnectionLabelEditor = useCallback(
    (connectionId: string) => {
      const connection = state.document.connections.find((item) => item.id === connectionId);
      setLabelEditConnectionId(connectionId);
      setLabelEditValue(connection?.label ?? "");
    },
    [state.document.connections],
  );

  const commitConnectionLabel = useCallback(() => {
    if (!labelEditConnectionId) return;
    dispatch({
      type: "canvas.updateConnection",
      connectionId: labelEditConnectionId,
      patch: { label: labelEditValue.trim() === "" ? undefined : labelEditValue },
    });
    setLabelEditConnectionId(null);
    setLabelEditValue("");
  }, [labelEditConnectionId, labelEditValue, dispatch]);

  const cancelConnectionLabelEdit = useCallback(() => {
    setLabelEditConnectionId(null);
    setLabelEditValue("");
  }, []);

  const objectLabelEditTarget = state.document.objects.find(
    (object) => object.id === objectLabelEditId,
  );

  const openObjectLabelEditor = useCallback(
    (objectId: string) => {
      const object = state.document.objects.find((item) => item.id === objectId);
      setObjectLabelEditId(objectId);
      setObjectLabelEditValue(object?.label ?? "");
    },
    [state.document.objects],
  );

  const commitObjectLabel = useCallback(() => {
    if (!objectLabelEditId) return;
    dispatch({
      type: "canvas.updateObject",
      objectId: objectLabelEditId,
      patch: { label: objectLabelEditValue },
    });
    setObjectLabelEditId(null);
    setObjectLabelEditValue("");
  }, [objectLabelEditId, objectLabelEditValue, dispatch]);

  const cancelObjectLabelEdit = useCallback(() => {
    setObjectLabelEditId(null);
    setObjectLabelEditValue("");
  }, []);

  const save = async () => {
    setIsSaving(true);
    try {
      await onSave(state.document);
    } finally {
      setIsSaving(false);
    }
  };

  // Interaction machine: a ref holds the current InteractionState (gestures
  // happen faster than React state updates should be trusted for), while
  // overlay is mirrored into useState so CanvasStage's overlay slot re-renders.
  const interactionStateRef = useRef<InteractionState>(IDLE_INTERACTION_STATE);
  const [interactionOverlay, setInteractionOverlay] = useState<InteractionOverlay>({});
  const stateRef = useRef(state);
  stateRef.current = state;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
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
      const stage = stageFromEventTarget(event.currentTarget);
      if (!stage) return;
      runInteraction(buildPointerEvent("double", event.nativeEvent, stage));
    },
    [buildPointerEvent, runInteraction],
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
      const stage = event.currentTarget;
      setContextMenu(null);
      activeGestureRef.current = { pointerId: event.pointerId, stage };
      // Seed the pointer snapshot so the edge-pan loop has a position even
      // before the first pointermove, then start the per-gesture rAF loop
      // (it idles cheaply until the interaction enters a drag kind).
      lastDragPointerRef.current = { event: event.nativeEvent, stage };
      startEdgePanLoop();
      runInteraction(buildPointerEvent("down", event.nativeEvent, stage));
    },
    [buildPointerEvent, runInteraction, startEdgePanLoop],
  );

  const contextMenuRef = useRef(contextMenu);
  contextMenuRef.current = contextMenu;

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

  const isContextMenuOpen = useCallback(() => contextMenuRef.current !== null, []);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

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
    [canvasPointFromContextMenu],
  );

  const openObjectContextMenu = useCallback(
    (
      event: ReactMouseEvent<HTMLElement>,
      object: InteractiveCanvasObject,
      _bounds: CanvasBounds,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      dispatch({
        type: "canvas.select",
        selection: { kind: "objects", objectIds: [object.id] },
      });
      setContextMenu({
        kind: "object",
        x: event.clientX,
        y: event.clientY,
        objectId: object.id,
        canvasPoint: canvasPointFromContextMenu(event),
      });
    },
    [canvasPointFromContextMenu],
  );

  const addAnnotation = () => {
    const body = annotationBody.trim();
    if (!selectedObject || !body) return;
    dispatch({
      type: "canvas.addAnnotation",
      target: { kind: "object", objectId: selectedObject.id },
      body,
      intent: "agent-request",
    });
    setAnnotationBody("");
  };

  const addObjectFromContextMenu = (objectType: InteractiveCanvasObjectType) => {
    if (!contextMenu) return;
    const contextObject =
      contextMenu.kind === "object"
        ? state.document.objects.find((object) => object.id === contextMenu.objectId)
        : null;
    dispatch({
      type: "canvas.addObject",
      objectType,
      geometry: geometryForContextObject(objectType, contextMenu.canvasPoint),
      parentId:
        contextObject?.type === "container"
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
   * toggleLockFromContextMenu, which also reads contextMenu.objectId
   * directly), so this builds a one-off selection over just the
   * right-clicked object rather than assuming it's already selected.
   */
  const copyFromContextMenu = () => {
    if (contextMenu?.kind !== "object") return;
    const payload = copySelection(state.document, {
      kind: "objects",
      objectIds: [contextMenu.objectId],
    });
    if (!payload) return;
    setClipboardMemory(payload);
    setContextMenu(null);
  };

  const toggleLockFromContextMenu = () => {
    if (contextMenu?.kind !== "object") return;
    const object = state.document.objects.find((item) => item.id === contextMenu.objectId);
    if (!object) return;
    dispatch({
      type: "canvas.updateObject",
      objectId: object.id,
      patch: { locked: !object.locked },
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
    const contextObject = state.document.objects.find((object) => object.id === contextMenu.objectId);
    if (contextObject?.type !== "container") return;
    dispatch({
      type: "canvas.fitContainerToChildren",
      containerId: contextObject.id,
    });
    setContextMenu(null);
  };

  const deleteContextSelection = () => {
    dispatch({ type: "canvas.deleteSelection" });
    setContextMenu(null);
  };

  const contextObject =
    contextMenu?.kind === "object"
      ? state.document.objects.find((object) => object.id === contextMenu.objectId)
      : null;

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
        worldOverlay={
          <>
          {objectLabelEditTarget && (
            <textarea
              autoFocus
              aria-label="Object label"
              value={objectLabelEditValue}
              onChange={(event) => setObjectLabelEditValue(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              onBlur={commitObjectLabel}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  commitObjectLabel();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancelObjectLabelEdit();
                }
              }}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              rows={1}
              style={{
                position: "absolute",
                left: `${objectLabelEditTarget.geometry.x}px`,
                top: `${objectLabelEditTarget.geometry.y}px`,
                width: `${objectLabelEditTarget.geometry.width}px`,
                height: `${objectLabelEditTarget.geometry.height}px`,
                // Unlike the connector label input above, this overlay is
                // rendered inside the transformed world layer WITHOUT a
                // counter-scale transform — it scales naturally with zoom so
                // the textarea always matches the object's on-screen size.
                pointerEvents: "auto",
                resize: "none",
                border: "1.5px solid var(--primary)",
                borderRadius: "8px",
                padding: "8px",
                fontSize: "13px",
                fontWeight: 600,
                textAlign: "center",
                background: "var(--background)",
                color: "var(--foreground)",
                outline: "none",
              }}
            />
          )}
          {labelEditConnectionId && labelEditPoint ? (
            <input
              autoFocus
              aria-label="Connector label"
              value={labelEditValue}
              onChange={(event) => setLabelEditValue(event.target.value)}
              onBlur={commitConnectionLabel}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitConnectionLabel();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancelConnectionLabelEdit();
                }
              }}
              onClick={(event) => event.stopPropagation()}
              style={{
                position: "absolute",
                left: `${labelEditPoint.x}px`,
                top: `${labelEditPoint.y}px`,
                transform: `translate(-50%, -50%) scale(${1 / viewport.zoom})`,
                // The worldOverlay container is pointer-events: none (inherited),
                // so mouse interaction must be re-enabled on the input itself.
                pointerEvents: "auto",
                minWidth: "80px",
                maxWidth: "220px",
                border: "1.5px solid var(--primary)",
                borderRadius: "999px",
                padding: "2px 8px",
                fontSize: "11px",
                fontWeight: 600,
                textAlign: "center",
                background: "var(--background)",
                color: "var(--foreground)",
                outline: "none",
              }}
            />
          ) : null}
          </>
        }
      />

      {contextMenu && (
        <div
          role="menu"
          aria-label="Canvas context menu"
          className="absolute z-40 w-56 overflow-hidden rounded-md border border-border/70 bg-background/95 p-1 text-sm shadow-xl backdrop-blur"
          style={{
            left: `min(${contextMenu.x}px, calc(100vw - 15rem))`,
            top: `min(${contextMenu.y}px, calc(100vh - 18rem))`,
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          {contextMenu.kind === "object" && contextObject ? (
            <>
              <div className="truncate border-b border-border/60 px-2 py-1.5 text-xs text-muted-foreground">
                {contextObject.label}
              </div>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                onClick={addContextAnnotation}
              >
                <MessageSquareIcon className="h-4 w-4 text-muted-foreground" />
                Add annotation
              </button>
              {contextObject.type === "container" && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                  onClick={fitContextObject}
                >
                  <CheckIcon className="h-4 w-4 text-muted-foreground" />
                  Fit children
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                onClick={copyFromContextMenu}
              >
                <CopyIcon className="h-4 w-4 text-muted-foreground" />
                Copy
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                onClick={toggleLockFromContextMenu}
              >
                {contextObject.locked ? (
                  <UnlockIcon className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <LockIcon className="h-4 w-4 text-muted-foreground" />
                )}
                {contextObject.locked ? "Unlock" : "Lock"}
              </button>
              <div className="my-1 border-t border-border/60" />
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-destructive hover:bg-muted hover:text-destructive"
                onClick={deleteContextSelection}
              >
                <Trash2Icon className="h-4 w-4" />
                Delete object
              </button>
            </>
          ) : (
            <>
              <div className="border-b border-border/60 px-2 py-1.5 text-xs text-muted-foreground">
                Add to canvas
              </div>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                onClick={pasteFromContextMenu}
                disabled={!canPasteFromContextMenu}
                title={canPasteFromContextMenu ? undefined : "Nothing to paste — copy something first"}
              >
                <ClipboardPasteIcon className="h-4 w-4 text-muted-foreground" />
                Paste
              </button>
              <div className="my-1 border-t border-border/60" />
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                onClick={() => addObjectFromContextMenu("process")}
              >
                <ArrowRightIcon className="h-4 w-4 text-muted-foreground" />
                Add process
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                onClick={() => addObjectFromContextMenu("sticky")}
              >
                <StickyNoteIcon className="h-4 w-4 text-muted-foreground" />
                Add sticky
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                onClick={() => addObjectFromContextMenu("text")}
              >
                <TypeIcon className="h-4 w-4 text-muted-foreground" />
                Add text
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                onClick={() => addObjectFromContextMenu("decision")}
              >
                <DiamondIcon className="h-4 w-4 text-muted-foreground" />
                Add decision
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                onClick={() => addObjectFromContextMenu("container")}
              >
                <BoxIcon className="h-4 w-4 text-muted-foreground" />
                Add container
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                onClick={() => addObjectFromContextMenu("section")}
              >
                <FrameIcon className="h-4 w-4 text-muted-foreground" />
                Add section
              </button>
            </>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-wrap items-start justify-between gap-3 p-3">
        <div className="pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-md border border-border/70 bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
          <div className="min-w-0">
            <div className="truncate font-display text-sm font-semibold">
              {title ?? state.document.title ?? "Interactive Canvas"}
            </div>
            <div className="truncate font-mono text-[11px] text-muted-foreground">
              {state.document.id}
            </div>
          </div>
          <div className="hidden items-center gap-2 border-l border-border/60 pl-3 text-[11px] text-muted-foreground sm:flex">
            <span>{state.document.objects.length} objects</span>
            <span>{state.document.connections.length} connectors</span>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-border/70 bg-background/95 p-1 shadow-lg backdrop-blur">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Undo"
            title="Undo"
            onClick={() => dispatch({ type: "canvas.undo" })}
            disabled={state.history.past.length === 0}
          >
            <Undo2Icon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Redo"
            title="Redo"
            onClick={() => dispatch({ type: "canvas.redo" })}
            disabled={state.history.future.length === 0}
          >
            <RotateCcwIcon className="h-4 w-4" />
          </Button>
          <span className="mx-1 h-6 border-l border-border/60" />
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            <XIcon className="h-4 w-4" />
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={isSaving}>
            <SaveIcon className="h-4 w-4" />
            Save
          </Button>
        </div>
      </div>

      <aside className="absolute bottom-24 right-4 top-20 z-20 w-[320px] max-w-[calc(100vw-2rem)] overflow-auto rounded-md border border-border/70 bg-background/95 p-3 shadow-xl backdrop-blur">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Inspector
          </div>
          {state.lastChange && (
            <div className="truncate text-[11px] text-muted-foreground">
              {state.lastChange.summary}
            </div>
          )}
        </div>

        {selectedObject ? (
          <div className="grid gap-3">
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">Label</span>
              <Input
                value={selectedObject.label}
                onChange={(event) =>
                  dispatch({
                    type: "canvas.updateObject",
                    objectId: selectedObject.id,
                    patch: { label: event.target.value },
                  })
                }
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">Body</span>
              <Textarea
                value={selectedObject.body ?? ""}
                onChange={(event) =>
                  dispatch({
                    type: "canvas.updateObject",
                    objectId: selectedObject.id,
                    patch: { body: event.target.value },
                  })
                }
              />
            </label>
            <div className="grid grid-cols-4 gap-1">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Move left"
                title="Move left"
                onClick={() => dispatch({ type: "canvas.moveSelection", dx: -16, dy: 0 })}
              >
                <ArrowLeftIcon className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Move right"
                title="Move right"
                onClick={() => dispatch({ type: "canvas.moveSelection", dx: 16, dy: 0 })}
              >
                <ArrowRightIcon className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Move up"
                title="Move up"
                onClick={() => dispatch({ type: "canvas.moveSelection", dx: 0, dy: -16 })}
              >
                <ArrowUpIcon className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Move down"
                title="Move down"
                onClick={() => dispatch({ type: "canvas.moveSelection", dx: 0, dy: 16 })}
              >
                <ArrowDownIcon className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                aria-label="Object width"
                value={selectedObject.geometry.width}
                onChange={(event) =>
                  dispatch({
                    type: "canvas.resizeObject",
                    objectId: selectedObject.id,
                    width: Number(event.target.value),
                    height: selectedObject.geometry.height,
                  })
                }
              />
              <Input
                type="number"
                aria-label="Object height"
                value={selectedObject.geometry.height}
                onChange={(event) =>
                  dispatch({
                    type: "canvas.resizeObject",
                    objectId: selectedObject.id,
                    width: selectedObject.geometry.width,
                    height: Number(event.target.value),
                  })
                }
              />
            </div>
            <div className="grid gap-1.5 text-xs">
              <span className="text-muted-foreground">Color</span>
              <div className="flex flex-wrap gap-1.5">
                {CANVAS_PALETTE_TOKENS.map(({ token, label, description }) => (
                  <button
                    key={token}
                    type="button"
                    title={description}
                    aria-label={`Set color: ${label}`}
                    aria-pressed={selectedObject.style?.paletteToken === token}
                    data-canvas-palette-swatch={token}
                    data-selected={selectedObject.style?.paletteToken === token ? "true" : undefined}
                    className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      background: paletteTokenStyle(token).accent,
                      borderColor:
                        selectedObject.style?.paletteToken === token
                          ? "var(--foreground)"
                          : "transparent",
                    }}
                    onClick={() => applyPaletteTokenToSelection(token)}
                  />
                ))}
                <button
                  type="button"
                  title="Clear semantic color — fall back to the object's tone"
                  aria-label="Set color: none"
                  aria-pressed={!selectedObject.style?.paletteToken}
                  data-canvas-palette-swatch="none"
                  data-selected={!selectedObject.style?.paletteToken ? "true" : undefined}
                  className="flex h-6 w-6 items-center justify-center rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    borderColor: !selectedObject.style?.paletteToken
                      ? "var(--foreground)"
                      : "var(--border)",
                  }}
                  onClick={() => applyPaletteTokenToSelection(undefined)}
                >
                  <XIcon className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            </div>
            {selectedObject.type === "container" && (
              <Button
                type="button"
                variant="outline"
                className="justify-start"
                onClick={() =>
                  dispatch({
                    type: "canvas.fitContainerToChildren",
                    containerId: selectedObject.id,
                  })
                }
              >
                <CheckIcon className="h-4 w-4" />
                Fit children
              </Button>
            )}
            <div className="rounded-md border border-border/70 p-2">
              <div className="mb-2 text-xs font-medium text-muted-foreground">Links</div>
              {selectedLinks.length > 0 ? (
                <div className="grid gap-1.5">
                  {selectedLinks.map((link) => (
                    <div
                      key={link.id}
                      className="rounded-md border border-border/70 bg-background px-2 py-1.5 text-xs"
                    >
                      <div className="truncate font-medium">
                        {link.target.label ?? link.target.path}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {link.status} / {link.target.kind}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  No source or doc links on this object.
                </div>
              )}
            </div>
            <div className="rounded-md border border-border/70 p-2">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <MessageSquareIcon className="h-3.5 w-3.5" />
                Annotation
              </div>
              <Textarea
                value={annotationBody}
                onChange={(event) => setAnnotationBody(event.target.value)}
                placeholder="Add a request or note"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={addAnnotation}
                disabled={!annotationBody.trim()}
              >
                <PlusIcon className="h-4 w-4" />
                Annotate
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => dispatch({ type: "canvas.deleteSelection" })}
            >
              <Trash2Icon className="h-4 w-4" />
              Delete
            </Button>
          </div>
        ) : selectedConnection ? (
          <div className="grid gap-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <GitBranchIcon className="h-3.5 w-3.5" />
              Connector
            </div>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">Label</span>
              <Input
                value={selectedConnection.label ?? ""}
                onChange={(event) =>
                  dispatch({
                    type: "canvas.updateConnection",
                    connectionId: selectedConnection.id,
                    patch: { label: event.target.value === "" ? undefined : event.target.value },
                  })
                }
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">Style</span>
              <select
                aria-label="Connector style"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                value={selectedConnection.style ?? "solid"}
                onChange={(event) =>
                  dispatch({
                    type: "canvas.updateConnection",
                    connectionId: selectedConnection.id,
                    patch: { style: event.target.value as InteractiveCanvasConnection["style"] },
                  })
                }
              >
                <option value="solid">Solid</option>
                <option value="dotted">Dotted</option>
                <option value="elbow">Elbow</option>
                <option value="smooth">Smooth</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">Arrow</span>
              <select
                aria-label="Connector arrow"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                value={selectedConnection.arrow ?? "forward"}
                onChange={(event) =>
                  dispatch({
                    type: "canvas.updateConnection",
                    connectionId: selectedConnection.id,
                    patch: { arrow: event.target.value as InteractiveCanvasConnection["arrow"] },
                  })
                }
              >
                <option value="none">None</option>
                <option value="forward">Forward</option>
                <option value="back">Back</option>
                <option value="both">Both</option>
              </select>
            </label>
            <Button
              type="button"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => dispatch({ type: "canvas.deleteSelection" })}
            >
              <Trash2Icon className="h-4 w-4" />
              Delete
            </Button>
          </div>
        ) : (
          <div className="rounded-md border border-border/70 p-3 text-sm text-muted-foreground">
            Select a canvas object to inspect links, geometry, annotations, and agent
            context.
          </div>
        )}

        <div className="mt-4 rounded-md border border-border/70 p-3 text-xs text-muted-foreground">
          <div className="font-medium text-foreground">Selection context</div>
          <div>{selectionContext.objects.length} selected objects</div>
          <div>{selectionContext.connections.length} nearby connectors</div>
          <div>{selectionContext.annotations.length} annotations</div>
        </div>
      </aside>

      {contextToolbarVariant && contextToolbarPosition && (
        <div
          ref={contextToolbarRef}
          className="pointer-events-auto absolute z-40"
          style={{ left: contextToolbarPosition.x, top: contextToolbarPosition.y }}
        >
          <ContextToolbar variant={contextToolbarVariant} onAction={handleContextToolbarAction} />
          {openFlyout === "color" && primarySelectedObject && contextToolbarVariant !== "connector" && (
            <div className="absolute left-0 top-full z-50 mt-2">
              <ColorPalettePopover
                currentColor={paletteTokenStyle(primarySelectedObject.style?.paletteToken ?? "note").accent}
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
            onPick={(shapeType) => {
              dispatch({ type: "canvas.setTool", tool: shapeType });
              setShapesPanelOpen(false);
            }}
            onClose={() => setShapesPanelOpen(false)}
          />
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
        <FigJamDock
          className="pointer-events-auto"
          activeTool={shapesPanelOpen ? null : dockToolForCanvasTool(state.tool)}
          onSelectTool={(tool) => {
            if (DOCK_TOOLS_COMING_SOON.has(tool)) return;
            // "shapes" fires both onOpenShapes and onSelectTool("shapes") on
            // the same click (see FigJamDock) — don't let this handler close
            // the panel that onOpenShapes just opened.
            if (tool === "shapes") return;
            setShapesPanelOpen(false);
            const canvasTool = DOCK_TOOL_TO_CANVAS_TOOL[tool];
            if (canvasTool) dispatch({ type: "canvas.setTool", tool: canvasTool });
          }}
          onOpenShapes={() => setShapesPanelOpen(true)}
        />
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 z-30 flex items-center justify-end gap-2">
        {/*
          FigJamDock/ZoomControls (the chrome catalog's ground truth) have no
          slot for align/distribute/fit-to-content/bulk-delete — real
          capabilities the old toolbar exposed. Rather than dropping them,
          they get a small secondary pill alongside the dock's zoom controls
          so nothing regresses.
        */}
        <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-border/70 bg-background/95 p-1 shadow-lg backdrop-blur">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Align center"
            title="Align center"
            onClick={() => dispatch({ type: "canvas.alignSelection", axis: "center-x" })}
            disabled={selectedIds.length < 2}
          >
            <AlignCenterHorizontalIcon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Align middle"
            title="Align middle"
            onClick={() => dispatch({ type: "canvas.alignSelection", axis: "center-y" })}
            disabled={selectedIds.length < 2}
          >
            <AlignCenterVerticalIcon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Distribute horizontally"
            title="Distribute horizontally"
            onClick={() => dispatch({ type: "canvas.distributeSelection", axis: "horizontal" })}
            disabled={selectedIds.length < 3}
          >
            <AlignHorizontalDistributeCenterIcon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Distribute vertically"
            title="Distribute vertically"
            onClick={() => dispatch({ type: "canvas.distributeSelection", axis: "vertical" })}
            disabled={selectedIds.length < 3}
          >
            <AlignVerticalDistributeCenterIcon className="h-4 w-4" />
          </Button>
          <span className="mx-1 h-6 border-l border-border/60" />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Fit to content"
            title="Fit to content"
            onClick={controls.fit}
          >
            <CheckIcon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Delete"
            title="Delete"
            onClick={() => dispatch({ type: "canvas.deleteSelection" })}
            disabled={selectedIds.length === 0}
          >
            <Trash2Icon className="h-4 w-4" />
          </Button>
        </div>
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

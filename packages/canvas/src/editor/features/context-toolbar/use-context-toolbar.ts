"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type {
  ContextToolbarActionId,
  ContextToolbarVariant,
} from "../../../chrome/ContextToolbar";
import {
  positionContextToolbar,
  type PositionContextToolbarResult,
} from "../../../chrome/context-toolbar-position";
import type { CanvasAction, CanvasSelection } from "../../../model/actions";
import { boundsForGeometries, type CanvasBounds } from "../../../model/geometry";
import { paletteTokenStyle } from "../../../render/theme";
import type { CanvasViewportControls } from "../../use-canvas-viewport";
import { worldToScreen, type ViewportState } from "../../viewport";
import type {
  CanvasPaletteToken,
  CanvasSectionStrokeStyle,
  CanvasSectionTint,
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
} from "../../../model/schema";

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

export function nearestPaletteToken(hex: string): CanvasPaletteToken {
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

export interface UseContextToolbarArgs {
  document: InteractiveCanvasDocument;
  dispatch: (action: CanvasAction) => void;
  selection: CanvasSelection;
  /** selectedObjectIds(selection) — the parent already derives it for CanvasStage. */
  selectedIds: string[];
  selectedConnection: InteractiveCanvasConnection | undefined;
  selectedConnectionId: string | null;
  viewport: ViewportState;
  stageRef: RefObject<HTMLDivElement | null>;
  /** Viewport controls — the "expand" toolbar action calls controls.fit(). */
  controls: CanvasViewportControls;
  /**
   * Raw object-label-editor setters (use-label-editing.ts) — the "rename"
   * action seeds the inline editor with values computed here.
   */
  setObjectLabelEditId: Dispatch<SetStateAction<string | null>>;
  setObjectLabelEditValue: Dispatch<SetStateAction<string>>;
}

export interface ContextToolbarApi {
  /** Attached to the positioned wrapper so the measuring ResizeObserver sees the real size. */
  contextToolbarRef: RefObject<HTMLDivElement | null>;
  contextToolbarVariant: ContextToolbarVariant | null;
  contextToolbarPosition: PositionContextToolbarResult | null;
  openFlyout: ContextToolbarActionId | null;
  setOpenFlyout: Dispatch<SetStateAction<ContextToolbarActionId | null>>;
  selectedObjectsForToolbar: InteractiveCanvasObject[];
  primarySelectedObject: InteractiveCanvasObject | undefined;
  handleContextToolbarAction: (action: ContextToolbarActionId, value?: unknown) => void;
  /** Also wired into the Inspector's "Color" swatches (checkpoint 5, D16). */
  applyPaletteTokenToSelection: (token: CanvasPaletteToken | undefined) => void;
  applySectionFillToSelection: (fill: string) => void;
  applySectionStrokeToSelection: (stroke: string) => void;
  toggleLockForSelection: () => void;
  applyTintToSelection: (tint: CanvasSectionTint) => void;
  applySectionBorderStyleToSelection: (strokeStyle: CanvasSectionStrokeStyle) => void;
  swapSelectedShape: (objectType: InteractiveCanvasObjectType) => void;
}

/**
 * ContextToolbar layer state + actions, extracted verbatim from
 * InteractiveCanvasEditor.tsx: the selection-derived variant/anchor-rect/
 * position memos, the measured toolbar size (ResizeObserver), the open-flyout
 * state, every style-apply callback, and the onAction dispatch table. The
 * action/flyout tables deliberately keep their current shape — they migrate
 * into the object registry in a later restructure step (RESTRUCTURE.md step
 * 5); this module is a pure move.
 */
export function useContextToolbar({
  document,
  dispatch,
  selection,
  selectedIds,
  selectedConnection,
  selectedConnectionId,
  viewport,
  stageRef,
  controls,
  setObjectLabelEditId,
  setObjectLabelEditValue,
}: UseContextToolbarArgs): ContextToolbarApi {
  // Which ContextToolbar flyout (if any) is currently open, tracked by action
  // id since ContextToolbar's buttons only report `onAction(action)` without
  // exposing their own open/closed state to the parent.
  const [openFlyout, setOpenFlyout] = useState<ContextToolbarActionId | null>(null);
  const contextToolbarRef = useRef<HTMLDivElement | null>(null);
  const [contextToolbarSize, setContextToolbarSize] = useState({ width: 220, height: 29 });
  const selectedObjectsForToolbar = useMemo(
    () => document.objects.filter((object) => selectedIds.includes(object.id)),
    [document.objects, selectedIds],
  );
  const contextToolbarVariant = contextToolbarVariantForSelection({
    selection,
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
      const from = document.objects.find((o) => o.id === selectedConnection.from.objectId);
      const to = document.objects.find((o) => o.id === selectedConnection.to.objectId);
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
  }, [contextToolbarVariant, selectedConnection, selectedObjectsForToolbar, document.objects, viewport]);
  const contextToolbarPosition = useMemo(() => {
    if (!selectionScreenRect || !stageRef.current) return null;
    const stageRect = stageRef.current.getBoundingClientRect();
    return positionContextToolbar(selectionScreenRect, contextToolbarSize, {
      width: stageRect.width,
      height: stageRect.height,
    });
  }, [selectionScreenRect, contextToolbarSize, stageRef]);
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
        const object = document.objects.find((item) => item.id === objectId);
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
    [dispatch, selectedIds, document.objects],
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
      setObjectLabelEditId,
      setObjectLabelEditValue,
    ],
  );

  return {
    contextToolbarRef,
    contextToolbarVariant,
    contextToolbarPosition,
    openFlyout,
    setOpenFlyout,
    selectedObjectsForToolbar,
    primarySelectedObject,
    handleContextToolbarAction,
    applyPaletteTokenToSelection,
    applySectionFillToSelection,
    applySectionStrokeToSelection,
    toggleLockForSelection,
    applyTintToSelection,
    applySectionBorderStyleToSelection,
    swapSelectedShape,
  };
}

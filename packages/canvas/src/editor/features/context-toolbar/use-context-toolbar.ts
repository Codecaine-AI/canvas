"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { ContextToolbarActionId } from "../../../chrome/ContextToolbar";
import {
  positionContextToolbar,
  type PositionContextToolbarResult,
} from "../../../chrome/context-toolbar-position";
import type { CanvasAction, CanvasSelection } from "../../../model/actions";
import { boundsForGeometries, type CanvasBounds } from "../../../model/geometry";
import {
  connectorDef,
  intersectToolbarControls,
  objectDefForType,
  type ObjectDef,
  type ToolbarControlSpec,
  type ToolbarFlyoutProps,
} from "../../../objects/object-def";
import { nearestPaletteToken } from "../../../objects/palette";
import { paletteTokenStyle } from "../../../tokens/theme";
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

// Moved to objects/palette.ts (step 5) so toolbar flyout components declared
// on ObjectDefs can share it; re-exported here for existing importers.
export { nearestPaletteToken } from "../../../objects/palette";

/** The registry-resolved context toolbar for the current selection (step 5). */
interface ResolvedContextToolbar {
  /** "connector" | "multi" | the primary def's kind. */
  kind: string;
  /**
   * DOM back-compat string for `data-variant` / the toolbar aria label:
   * single-object non-special kinds keep reading "shape" like the
   * pre-registry variant derivation did.
   */
  variantLabel: string;
  controls: readonly ToolbarControlSpec[];
  /** Flyout components of the PRIMARY selection's def (order donor for multi). */
  flyouts: Readonly<Record<string, ComponentType<ToolbarFlyoutProps>>> | undefined;
}

const SPECIAL_SINGLE_VARIANT_LABELS = new Set(["section", "sticky", "text"]);

/**
 * Derives the toolbar for the current selection by def resolution (step 5):
 * connection → connectorDef; single object → its type's def; multi → the
 * capability intersection over the selected defs in selection order (first
 * selected donates control order and the flyout table).
 */
function resolveContextToolbarForSelection(args: {
  selection: CanvasSelection;
  selectedObjects: InteractiveCanvasObject[];
  selectedConnection: InteractiveCanvasConnection | undefined;
}): ResolvedContextToolbar | null {
  const { selection, selectedObjects, selectedConnection } = args;
  if (selection.kind === "connection" && selectedConnection) {
    return {
      kind: "connector",
      variantLabel: "connector",
      controls: connectorDef.toolbar?.controls ?? [],
      flyouts: connectorDef.toolbar?.flyouts,
    };
  }
  if (selection.kind === "objects" && selectedObjects.length > 0) {
    const defs = selectedObjects.map((object) => objectDefForType(object.type));
    const primaryDef = defs[0];
    if (selectedObjects.length > 1) {
      // Defs without a toolbar (or unknown types) contribute nothing, which
      // collapses the intersection to empty — hide the toolbar entirely then
      // rather than float an empty pill.
      const controls = defs.some((def) => !def)
        ? []
        : intersectToolbarControls(defs as ObjectDef[]);
      if (controls.length === 0) return null;
      return {
        kind: "multi",
        variantLabel: "multi",
        controls,
        flyouts: primaryDef?.toolbar?.flyouts,
      };
    }
    if (!primaryDef?.toolbar) return null;
    return {
      kind: primaryDef.kind,
      variantLabel: SPECIAL_SINGLE_VARIANT_LABELS.has(primaryDef.kind) ? primaryDef.kind : "shape",
      controls: primaryDef.toolbar.controls,
      flyouts: primaryDef.toolbar.flyouts,
    };
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
  /** Resolved toolbar kind: "connector" | "multi" | the primary def's kind. */
  contextToolbarVariant: string | null;
  /** DOM back-compat `data-variant`/aria string (single non-special kinds read "shape"). */
  contextToolbarVariantLabel: string | null;
  /** Registry-resolved control specs for the chrome ContextToolbar host. */
  contextToolbarControls: readonly ToolbarControlSpec[] | null;
  /** The primary selection's flyout components, keyed by opening action id. */
  contextToolbarFlyouts: Readonly<Record<string, ComponentType<ToolbarFlyoutProps>>> | null;
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
 * ContextToolbar layer state + actions: the selection-derived toolbar
 * resolution (registry-driven since RESTRUCTURE.md step 5), anchor-rect/
 * position memos, the measured toolbar size (ResizeObserver), the open-flyout
 * state, every style-apply callback, and the onAction dispatch table. Control
 * lists and flyout components live on the ObjectDefs (objects/); this hook
 * resolves them per selection and hands them to ContextToolbarLayer.
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
  // IN SELECTION ORDER (selection.objectIds click order), not document order:
  // step 5's multi-select capability intersection makes the FIRST SELECTED
  // object the order donor, and its def donates the flyout table.
  const selectedObjectsForToolbar = useMemo(
    () =>
      selectedIds
        .map((id) => document.objects.find((object) => object.id === id))
        .filter((object): object is InteractiveCanvasObject => object !== undefined),
    [document.objects, selectedIds],
  );
  const resolvedToolbar = resolveContextToolbarForSelection({
    selection,
    selectedObjects: selectedObjectsForToolbar,
    selectedConnection,
  });
  const contextToolbarVariant = resolvedToolbar?.kind ?? null;
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
  const primaryDefKind = primarySelectedObject
    ? objectDefForType(primarySelectedObject.type)?.kind
    : undefined;
  const contextToolbarFlyouts = resolvedToolbar?.flyouts ?? null;

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
        if (primaryDefKind === "section") {
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
      // An action opens a flyout iff the resolved def's flyout table declares
      // a component for it (replaces the static FLYOUT_ACTIONS set) — e.g.
      // section: color/section-border-style/tint/lock; connector: color/dash/
      // routing/arrowhead; shape: shape-swap/color; sticky/text: color.
      if (contextToolbarFlyouts && action in contextToolbarFlyouts) {
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
      contextToolbarFlyouts,
      primaryDefKind,
      primarySelectedObject,
      toggleSectionContentHiddenForSelection,
      setObjectLabelEditId,
      setObjectLabelEditValue,
    ],
  );

  return {
    contextToolbarRef,
    contextToolbarVariant,
    contextToolbarVariantLabel: resolvedToolbar?.variantLabel ?? null,
    contextToolbarControls: resolvedToolbar?.controls ?? null,
    contextToolbarFlyouts,
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

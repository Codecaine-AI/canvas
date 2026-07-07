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
import type { SelectionToolbarActionId } from "./SelectionToolbar";
import {
  positionSelectionToolbar,
  type PositionSelectionToolbarResult,
} from "./position";
import { toolbarFlyoutsForKind, type ToolbarFlyoutTable } from "./flyouts";
import type { CanvasAction, CanvasSelection } from "../../../state/actions";
import { boundsForGeometries, type CanvasBounds } from "../../../state/geometry";
import {
  connectorDef,
  intersectToolbarControls,
  objectDefForType,
  type ObjectDef,
  type ToolbarControlSpec,
} from "../../../objects/object-def";
import { nearestPaletteToken } from "../../../objects/palette";
import { worldToScreen, type ViewportState } from "../../../render/viewport";
import type {
  CanvasPaletteToken,
  CanvasSectionStrokeStyle,
  CanvasSectionTint,
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
} from "../../../state/schema";

// Moved to objects/palette.ts (step 5) so toolbar flyout components declared
// on ObjectDefs can share it; re-exported here for existing importers.
export { nearestPaletteToken } from "../../../objects/palette";

/** The registry-resolved selection toolbar for the current selection (step 5). */
interface ResolvedSelectionToolbar {
  /** "connector" | "multi" | the primary def's kind. */
  kind: string;
  /**
   * DOM back-compat string for `data-variant` / the toolbar aria label:
   * single-object non-special kinds keep reading "shape" like the
   * pre-registry variant derivation did.
   */
  variantLabel: string;
  controls: readonly ToolbarControlSpec[];
  /**
   * Flyout components for the PRIMARY selection's def kind (order donor for
   * multi), resolved from the EDITOR-side flyout registry (./flyouts) — defs
   * carry data-only control lists since the co-location alignment.
   */
  flyouts: ToolbarFlyoutTable | undefined;
}

const SPECIAL_SINGLE_VARIANT_LABELS = new Set(["section", "sticky"]);

const PALETTE_TOKEN_SECTION_TINT: Record<CanvasPaletteToken, CanvasSectionTint> = {
  process: "blue",
  input: "green",
  hot: "orange",
  memory: "purple",
  note: "yellow",
};

/**
 * Derives the toolbar for the current selection by def resolution (step 5):
 * connection → connectorDef; single object → its type's def; multi → the
 * capability intersection over the selected defs in selection order (first
 * selected donates control order and the flyout table).
 */
function resolveSelectionToolbarForSelection(args: {
  selection: CanvasSelection;
  selectedObjects: InteractiveCanvasObject[];
  selectedConnection: InteractiveCanvasConnection | undefined;
}): ResolvedSelectionToolbar | null {
  const { selection, selectedObjects, selectedConnection } = args;
  if (selection.kind === "connection" && selectedConnection) {
    return {
      kind: "connector",
      variantLabel: "connector",
      controls: connectorDef.toolbar?.controls ?? [],
      flyouts: toolbarFlyoutsForKind("connector"),
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
        flyouts: primaryDef ? toolbarFlyoutsForKind(primaryDef.kind) : undefined,
      };
    }
    if (!primaryDef?.toolbar) return null;
    return {
      kind: primaryDef.kind,
      variantLabel: SPECIAL_SINGLE_VARIANT_LABELS.has(primaryDef.kind) ? primaryDef.kind : "shape",
      controls: primaryDef.toolbar.controls,
      flyouts: toolbarFlyoutsForKind(primaryDef.kind),
    };
  }
  return null;
}

export interface UseSelectionToolbarArgs {
  document: InteractiveCanvasDocument;
  dispatch: (action: CanvasAction) => void;
  selection: CanvasSelection;
  /** selectedObjectIds(selection) — the parent already derives it for CanvasStage. */
  selectedIds: string[];
  selectedConnection: InteractiveCanvasConnection | undefined;
  selectedConnectionId: string | null;
  viewport: ViewportState;
  stageRef: RefObject<HTMLDivElement | null>;
  /**
   * Target-aware inline text editor opener from useLabelEditing.
   */
  openObjectLabelEditor: (objectId: string) => void;
}

export interface SelectionToolbarApi {
  /** Attached to the positioned wrapper so the measuring ResizeObserver sees the real size. */
  selectionToolbarRef: RefObject<HTMLDivElement | null>;
  /** Resolved toolbar kind: "connector" | "multi" | the primary def's kind. */
  selectionToolbarVariant: string | null;
  /** DOM back-compat `data-variant`/aria string (single non-special kinds read "shape"). */
  selectionToolbarVariantLabel: string | null;
  /** Registry-resolved control specs for the chrome SelectionToolbar host. */
  selectionToolbarControls: readonly ToolbarControlSpec[] | null;
  /** The primary selection's flyout components, keyed by opening action id. */
  selectionToolbarFlyouts: ToolbarFlyoutTable | null;
  selectionToolbarPosition: PositionSelectionToolbarResult | null;
  openFlyout: SelectionToolbarActionId | null;
  setOpenFlyout: Dispatch<SetStateAction<SelectionToolbarActionId | null>>;
  selectedObjectsForToolbar: InteractiveCanvasObject[];
  primarySelectedObject: InteractiveCanvasObject | undefined;
  handleSelectionToolbarAction: (action: SelectionToolbarActionId, value?: unknown) => void;
  /** Also wired into the Inspector's "Color" swatches (checkpoint 5, D16). */
  applyPaletteTokenToSelection: (token: CanvasPaletteToken | undefined) => void;
  setLockForSelection: (mode: "all" | "background" | undefined) => void;
  applyTintToSelection: (tint: CanvasSectionTint) => void;
  applySectionBorderStyleToSelection: (strokeStyle: CanvasSectionStrokeStyle) => void;
  swapSelectedShape: (objectType: InteractiveCanvasObjectType) => void;
}

/**
 * SelectionToolbar layer state + actions: the selection-derived toolbar
 * resolution (registry-driven since RESTRUCTURE.md step 5), anchor-rect/
 * position memos, the measured toolbar size (ResizeObserver), the open-flyout
 * state, every style-apply callback, and the onAction dispatch table. Control
 * lists live on the ObjectDefs (objects/, data-only); flyout components live
 * in the editor-side registry (./flyouts, keyed by def kind + action id);
 * this hook resolves both per selection and hands them to
 * SelectionToolbarLayer.
 */
export function useSelectionToolbar({
  document,
  dispatch,
  selection,
  selectedIds,
  selectedConnection,
  selectedConnectionId,
  viewport,
  stageRef,
  openObjectLabelEditor,
}: UseSelectionToolbarArgs): SelectionToolbarApi {
  // Which SelectionToolbar flyout (if any) is currently open, tracked by action
  // id since SelectionToolbar's buttons only report `onAction(action)` without
  // exposing their own open/closed state to the parent.
  const [openFlyout, setOpenFlyout] = useState<SelectionToolbarActionId | null>(null);
  const selectionToolbarRef = useRef<HTMLDivElement | null>(null);
  const [selectionToolbarSize, setSelectionToolbarSize] = useState({ width: 220, height: 48 });
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
  const resolvedToolbar = resolveSelectionToolbarForSelection({
    selection,
    selectedObjects: selectedObjectsForToolbar,
    selectedConnection,
  });
  const selectionToolbarVariant = resolvedToolbar?.kind ?? null;
  /**
   * Screen-space rect the SelectionToolbar anchors above (Wave 3a scope item 2).
   * Computed read-only from CanvasStage's own pure helpers — worldToScreen
   * (viewport.ts) + boundsForGeometries (geometry.ts) — rather than touching
   * CanvasStage.tsx, per this wave's file-ownership constraints. Recomputes on
   * every viewport change (pan/zoom) since it's derived, not stored.
   */
  const selectionScreenRect = useMemo(() => {
    if (!selectionToolbarVariant) return null;
    let worldBounds: CanvasBounds | null = null;
    if (selectionToolbarVariant === "connector" && selectedConnection) {
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
  }, [selectionToolbarVariant, selectedConnection, selectedObjectsForToolbar, document.objects, viewport]);
  const selectionToolbarPosition = useMemo(() => {
    if (!selectionScreenRect || !stageRef.current) return null;
    const stageRect = stageRef.current.getBoundingClientRect();
    return positionSelectionToolbar(selectionScreenRect, selectionToolbarSize, {
      width: stageRect.width,
      height: stageRect.height,
    });
  }, [selectionScreenRect, selectionToolbarSize, stageRef]);
  /**
   * Inspector "Color" swatches (checkpoint 5, D16) apply to every selected
   * object, not just the primary one — canvas.updateObject only patches a
   * single objectId, so dispatch once per id. Its style merge
   * (`{ ...object.style, ...patch.style }`) overwrites the keys being changed
   * while leaving `shape`/`tone` untouched.
   */
  const applyPaletteTokenToSelection = useCallback(
    (token: CanvasPaletteToken | undefined) => {
      for (const objectId of selectedIds) {
        const object = document.objects.find((item) => item.id === objectId);
        if (object?.type === "section") {
          dispatch({
            type: "canvas.updateObject",
            objectId,
            patch: {
              tint: token ? PALETTE_TOKEN_SECTION_TINT[token] : "gray",
              style: { fill: undefined, stroke: undefined },
            },
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

  // Measure the SelectionToolbar's actual rendered size so positioning is exact
  // rather than assumed — width varies per variant (different control counts).
  useEffect(() => {
    const element = selectionToolbarRef.current;
    if (!element || !selectionToolbarVariant) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSelectionToolbarSize({ width: rect.width, height: rect.height });
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [selectionToolbarVariant]);

  // Close any open SelectionToolbar flyout whenever the selection changes shape
  // (different variant, or selection cleared) so a stale flyout doesn't linger
  // anchored to a control that's no longer rendered.
  useEffect(() => {
    setOpenFlyout(null);
  }, [selectionToolbarVariant, selectedConnectionId, selectedIds.join(",")]);

  const primarySelectedObject = selectedObjectsForToolbar[0];
  const selectionToolbarFlyouts = resolvedToolbar?.flyouts ?? null;

  const setLockForSelection = useCallback((mode: "all" | "background" | undefined) => {
    for (const object of selectedObjectsForToolbar) {
      dispatch({
        type: "canvas.updateObject",
        objectId: object.id,
        patch: { locked: mode },
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
        dispatch({
          type: "canvas.updateObject",
          objectId: object.id,
          patch: { tint, style: { fill: undefined, stroke: undefined } },
        });
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

  /** SelectionToolbar onAction dispatch table. */
  const handleSelectionToolbarAction = useCallback(
    (action: SelectionToolbarActionId, value?: unknown) => {
      if (action === "section-border-style" && (value === "solid" || value === "dashed" || value === "none")) {
        applySectionBorderStyleToSelection(value);
        return;
      }
      if (action === "color" && typeof value === "string") {
        applyPaletteTokenToSelection(nearestPaletteToken(value));
        return;
      }
      if ((action === "rename" || action === "text") && primarySelectedObject) {
        openObjectLabelEditor(primarySelectedObject.id);
        return;
      }
      if (action === "visibility") {
        toggleSectionContentHiddenForSelection();
        return;
      }
      // An action opens a flyout iff the editor-side flyout registry
      // (./flyouts) declares a component for the resolved def kind + action
      // id.
      if (selectionToolbarFlyouts && action in selectionToolbarFlyouts) {
        setOpenFlyout((current) => (current === action ? null : action));
        return;
      }
    },
    [
      applyPaletteTokenToSelection,
      applySectionBorderStyleToSelection,
      selectionToolbarFlyouts,
      primarySelectedObject,
      toggleSectionContentHiddenForSelection,
      openObjectLabelEditor,
    ],
  );

  return {
    selectionToolbarRef,
    selectionToolbarVariant,
    selectionToolbarVariantLabel: resolvedToolbar?.variantLabel ?? null,
    selectionToolbarControls: resolvedToolbar?.controls ?? null,
    selectionToolbarFlyouts,
    selectionToolbarPosition,
    openFlyout,
    setOpenFlyout,
    selectedObjectsForToolbar,
    primarySelectedObject,
    handleSelectionToolbarAction,
    applyPaletteTokenToSelection,
    setLockForSelection,
    applyTintToSelection,
    applySectionBorderStyleToSelection,
    swapSelectedShape,
  };
}

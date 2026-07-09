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
import type { CanvasAction, CanvasSelection } from "../../../../state/actions";
import { boundsForGeometries, type CanvasBounds } from "../../../../state/geometry";
import {
  connectorDef,
  intersectToolbarControls,
  objectDefForType,
  type ObjectDef,
  type ToolbarControlSpec,
} from "../../../../objects/object-def";
import { worldToScreen, type ViewportState } from "../../../viewport";
import { isCanvasColor } from "../../../../state/schema";
import { animateSectionFitToChildren, isSectionFitted } from "../section-fit/animate-section-fit";
import type {
  CanvasColor,
  CanvasSectionStrokeStyle,
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
} from "../../../../state/schema";

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
    // ConnectorDef (D19): connections resolve to the connector's own small
    // def — toolbar is a required field there, no object-def stubbing.
    return {
      kind: connectorDef.kind,
      variantLabel: "connector",
      controls: connectorDef.toolbar.controls,
      flyouts: toolbarFlyoutsForKind(connectorDef.kind),
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
   * Editability-aware in-place text editor opener from useTextEditing.
   */
  openObjectTextEditor: (objectId: string) => void;
  /** Connector-label editor opener from useTextEditing. */
  openConnectionLabelEditor: (connectionId: string) => void;
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
  /** Remount key for the toolbar pill so the FigJam entrance animation replays exactly when the selection identity changes (never on pan/zoom repositioning). */
  selectionSignature: string;
  selectionToolbarPosition: PositionSelectionToolbarResult | null;
  openFlyout: SelectionToolbarActionId | null;
  setOpenFlyout: Dispatch<SetStateAction<SelectionToolbarActionId | null>>;
  selectedObjectsForToolbar: InteractiveCanvasObject[];
  primarySelectedObject: InteractiveCanvasObject | undefined;
  primarySectionFitted: boolean;
  handleSelectionToolbarAction: (action: SelectionToolbarActionId, value?: unknown) => void;
  /** Applies a palette pick to every selected object (P1) — also wired into the Inspector's "Color" swatches. */
  applyColorToSelection: (color: CanvasColor) => void;
  setLockForSelection: (mode: "all" | "background" | undefined) => void;
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
  openObjectTextEditor,
  openConnectionLabelEditor,
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
  const selectedIdsSignature = selectedIds.join(",");
  const selectionSignature = `${selectionToolbarVariant}:${selectedConnectionId ?? ""}:${selectedIdsSignature}`;
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
   * One color pick applied to every selected object (P1, D12/D17) — a plain
   * `color` patch per id; the reducer records the pick in the per-kind
   * last-picked memory. canvas.updateObject only patches a single objectId,
   * so dispatch once per id.
   */
  const applyColorToSelection = useCallback(
    (color: CanvasColor) => {
      for (const objectId of selectedIds) {
        dispatch({
          type: "canvas.updateObject",
          objectId,
          patch: { color },
        });
      }
    },
    [dispatch, selectedIds],
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
  }, [selectionToolbarVariant, selectedConnectionId, selectedIdsSignature]);

  const primarySelectedObject = selectedObjectsForToolbar[0];
  const selectionToolbarFlyouts = resolvedToolbar?.flyouts ?? null;
  const primarySectionFitted =
    primarySelectedObject?.type === "section"
      ? isSectionFitted(document, primarySelectedObject.id)
      : false;

  const setLockForSelection = useCallback((mode: "all" | "background" | undefined) => {
    for (const object of selectedObjectsForToolbar) {
      dispatch({
        type: "canvas.updateObject",
        objectId: object.id,
        patch: { locked: mode },
      });
    }
  }, [dispatch, selectedObjectsForToolbar]);

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
      if (action === "color" && isCanvasColor(value)) {
        applyColorToSelection(value);
        return;
      }
      if (action === "text" && selectedConnectionId) {
        openConnectionLabelEditor(selectedConnectionId);
        return;
      }
      if (action === "fit-children" && primarySelectedObject?.type === "section") {
        animateSectionFitToChildren({
          document,
          dispatch,
          sectionId: primarySelectedObject.id,
        });
        return;
      }
      if ((action === "rename" || action === "text") && primarySelectedObject) {
        openObjectTextEditor(primarySelectedObject.id);
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
      applyColorToSelection,
      applySectionBorderStyleToSelection,
      dispatch,
      document,
      selectionToolbarFlyouts,
      selectedConnectionId,
      primarySelectedObject,
      openObjectTextEditor,
      openConnectionLabelEditor,
    ],
  );

  return {
    selectionToolbarRef,
    selectionToolbarVariant,
    selectionToolbarVariantLabel: resolvedToolbar?.variantLabel ?? null,
    selectionToolbarControls: resolvedToolbar?.controls ?? null,
    selectionToolbarFlyouts,
    selectionSignature,
    selectionToolbarPosition,
    openFlyout,
    setOpenFlyout,
    selectedObjectsForToolbar,
    primarySelectedObject,
    primarySectionFitted,
    handleSelectionToolbarAction,
    applyColorToSelection,
    setLockForSelection,
    applySectionBorderStyleToSelection,
    swapSelectedShape,
  };
}

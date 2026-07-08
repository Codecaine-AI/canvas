import type { ComponentType } from "react";
import type { CanvasAction } from "../../../../state/actions";
import type {
  CanvasColor,
  CanvasSectionStrokeStyle,
  InteractiveCanvasConnection,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
} from "../../../../state/schema";

/**
 * Props every toolbar flyout component receives from the
 * SelectionToolbarLayer host: the primary selection, the dispatcher, a
 * `close` callback, and the selection-wide style-apply helpers from
 * use-selection-toolbar. Flyouts pick the subset they need.
 *
 * Moved from objects/object-def.ts (co-location alignment): flyouts are
 * editor interface JSX, so their contract lives with the editor feature —
 * ObjectDefs carry only data-only control lists.
 */
export interface ToolbarFlyoutProps {
  primaryObject?: InteractiveCanvasObject;
  selectedConnection?: InteractiveCanvasConnection;
  dispatch: (action: CanvasAction) => void;
  close: () => void;
  /** Applies a palette pick to every selected object (P1 — dispatches `color` patches). */
  applyColorToSelection: (color: CanvasColor) => void;
  applySectionBorderStyleToSelection: (strokeStyle: CanvasSectionStrokeStyle) => void;
  setLockForSelection: (mode: "all" | "background" | undefined) => void;
  swapSelectedShape: (objectType: InteractiveCanvasObjectType) => void;
}

/** Flyout components keyed by the toolbar action id that opens them. */
export type ToolbarFlyoutTable = Readonly<Record<string, ComponentType<ToolbarFlyoutProps>>>;

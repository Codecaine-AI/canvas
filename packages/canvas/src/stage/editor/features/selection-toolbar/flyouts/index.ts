import { ColorPickerFlyout } from "./color-flyout";
import { CONNECTOR_FLYOUTS } from "./connector-flyouts";
import { SECTION_FLYOUTS } from "./section-flyouts";
import { SHAPE_FLYOUTS } from "./shape-flyouts";
import type { ToolbarFlyoutTable } from "./types";

export type { ToolbarFlyoutProps, ToolbarFlyoutTable } from "./types";

/**
 * Editor-owned flyout registry (co-location alignment): toolbar flyouts are
 * interface JSX, so they live with the selection-toolbar feature and are
 * resolved by def kind + action id. ObjectDefs (objects/) declare only
 * data-only control lists; whether an action opens a flyout is decided HERE —
 * use-selection-toolbar checks `action in toolbarFlyoutsForKind(kind)`.
 *
 * The sticky special kind only exposes the shared color flyout (no
 * shape-swap). Every other toolbar-carrying kind — the whole shape family
 * plus icon, which all share the shape toolbar — falls through to
 * SHAPE_FLYOUTS, mirroring the pre-move SHAPE_TOOLBAR.flyouts attachment in
 * objects/shapes/base.tsx. Every kind's `color` action opens the SAME
 * ColorPickerFlyout (P1, D12).
 */
const FLYOUTS_BY_KIND: Readonly<Record<string, ToolbarFlyoutTable>> = {
  connector: CONNECTOR_FLYOUTS,
  section: SECTION_FLYOUTS,
  sticky: { color: ColorPickerFlyout },
};

/**
 * Flyout table for a resolved toolbar's def kind. Only meaningful for kinds
 * whose def actually resolved a toolbar (use-selection-toolbar returns null
 * before flyout resolution otherwise); for multi-select the PRIMARY (first
 * selected) def's kind donates the table, as before.
 */
export function toolbarFlyoutsForKind(kind: string): ToolbarFlyoutTable {
  return FLYOUTS_BY_KIND[kind] ?? SHAPE_FLYOUTS;
}

/**
 * The craft targets: the dimensions a finished board sits at.
 *
 * The single source of truth for every number the agent is asked to hit. These
 * are where a composition aims, not where it breaks — the lint registry owns the
 * clearances below which a route cannot pass or a frame cannot hold its children,
 * and every target sits above the floor on its own axis. The style-guide loader
 * renders them into the <craft_targets> block of the injected style guide.
 */
import type { CraftTargets } from "./types";

export const CRAFT_TARGETS: CraftTargets = {
  nodeWidth: 280,
  nodeHeight: 100,
  nodeMinWidth: 240,
  nodeGapRow: 140,
  // A stacked pair gives a wire and its label a lane, so the column gap runs
  // a node's height of air rather than riding the crowding clearance.
  nodeGapColumn: 100,
  arrowCorridor: 100,
  sectionGutterSideBySide: 140,
  sectionGutterStacked: 160,
  framePadding: 40,
};

/** The craft targets as tight lines, one dimension per line. */
export function formatCraftTargets(targets: CraftTargets = CRAFT_TARGETS): string {
  return [
    "Starting dimensions for local peer groups, not composition mandates. Adjust them for content and actual routes; section sizes and counts follow meaning.",
    "",
    `- flow node: ${targets.nodeWidth}×${targets.nodeHeight}, never narrower than ${targets.nodeMinWidth}`,
    `- node gaps: ${targets.nodeGapRow} across a row, ${targets.nodeGapColumn} down a column`,
    `- arrow corridor: ${targets.arrowCorridor} of clear channel wherever a wire and its label pass between siblings`,
    `- section gutters: ${targets.sectionGutterSideBySide} side by side, ${targets.sectionGutterStacked} between stacked rows`,
    `- frame padding: ${targets.framePadding} inside every frame before its first child`,
  ].join("\n");
}

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
  nodeWidth: 288,
  nodeHeight: 96,
  nodeMinWidth: 224,
  nodeGapRow: 144,
  // A stacked pair gives a wire and its label a lane, so the column gap runs
  // a node's height of air rather than riding the crowding clearance.
  nodeGapColumn: 96,
  arrowCorridor: 96,
  sectionGutterSideBySide: 144,
  sectionGutterStacked: 160,
  framePadding: 48,
  boardAreaMultiple: 7,
  inkShare: 0.15,
  nodesPerSectionMin: 2,
  nodesPerSectionMax: 3,
};

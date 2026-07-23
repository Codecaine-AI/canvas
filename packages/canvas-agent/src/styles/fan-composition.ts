/**
 * Style topic: hub-over-fan composition.
 * Mined from src/rules/hub-balance.ts guidance, rulebook R6, and Round-1
 * calibration (v4r1-org-tree: dashed/exception edges are not fan children;
 * v4r1-nested-arch + v4r1-state-machine: corridor-hub and spine placements
 * are legitimate exceptions, not defects).
 */
import type { StyleTopic } from "./types";

export const style: StyleTopic = {
  id: "fan-composition",
  title: "Fan composition",
  prose: [
    "A fan centers its hub over its children: the children share one register on the fan",
    "side, evenly pitched, never closer than 64px to the hub, and the hub's center sits on",
    "the midpoint of their span. A hub more than ~32px off the midpoint reads as accidental —",
    "recenter it. Count only the real fan when you find that midpoint: dashed or exception",
    "edges (an \"acting\" line, a labeled cross-link) are not fan children — center the hub",
    "over its solid same-style children and let the exception hang off the side. When",
    "children straddle section boundaries, widen the spread rather than compress it past",
    "unrelated content. Some hubs are deliberately off-center: a bus parked in the corridor",
    "between two sections, or a spine where the flow runs left-to-right, is a legitimate",
    "composition — keep the corridor, don't force the midpoint. A default, not a law.",
  ].join("\n"),
};

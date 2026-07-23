/**
 * Style topic: hub-over-fan composition.
 */
import type { StyleTopic } from "./types";

const PROSE = `A fan centers its hub over its children.

- The children share one register on the fan side, evenly pitched, never closer than
  64px to the hub; the hub's center sits on the midpoint of their span. More than ~32px
  off the midpoint reads as accidental — recenter it.
- Count only the real fan when finding that midpoint: dashed or exception edges (an
  "acting" line, a labeled cross-link) are not fan children. Center the hub over its
  solid same-style children and let the exception hang off the side.
- When children straddle section boundaries, widen the spread rather than compress it
  past unrelated content.
- Some hubs are deliberately off-center: a bus parked in the corridor between two
  sections, or a spine where the flow runs left-to-right, is legitimate composition —
  keep the corridor, don't force the midpoint.

A default, not a law.`;

export const style: StyleTopic = {
  id: "fan-composition",
  title: "Fan composition",
  prose: PROSE,
};

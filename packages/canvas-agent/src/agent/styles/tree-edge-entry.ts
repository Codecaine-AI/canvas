/**
 * Style topic: hierarchy edge entry.
 */
import type { StyleTopic } from "./types";

const PROSE = `Tree edges enter on the face that points at the parent.

- In a downward hierarchy, reporting lines exit the parent's bottom and enter the
  child's top: set \`anchor: "bottom"\` on the from side and \`anchor: "top"\` on the to
  side of every parent→child connection. Without anchors the router side-enters outer
  children with long elbow runs — the signature tree defect.
- The same rule rotates with the flow: upward trees exit top and enter bottom;
  left-to-right trees exit right and enter left.
- Keep the gaps between sibling clusters visually even (one gutter width, measured
  cluster-edge to cluster-edge), keep each level's members on one shared register, and
  center each parent over its own children's span.
- Exception edges (dashed acting lines, dual reports) route around the fan, not through
  it, and don't disturb the centering.

Defaults, not laws.`;

export const style: StyleTopic = {
  id: "tree-edge-entry",
  title: "Tree edge entry",
  prose: PROSE,
};

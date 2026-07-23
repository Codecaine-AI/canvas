/**
 * Style topic: hierarchy edge entry.
 * NEW for v5 — grounded in v4r1-org-tree (side-entry elbows are the top
 * unfixed defect v2→v4; the schema's from/to.anchor fields went unused in
 * 40 connection ops) and its "cluster gaps visually even" finding.
 */
import type { StyleTopic } from "./types";

export const style: StyleTopic = {
  id: "tree-edge-entry",
  title: "Tree edge entry",
  prose: [
    "In a hierarchy, reporting lines exit the parent's bottom and enter the child's top: set",
    "`anchor: \"bottom\"` on the from side and `anchor: \"top\"` on the to side of every",
    "parent→child connection. Without anchors the router side-enters outer children with long",
    "elbow runs — the signature tree defect; both reference boards anchor bottom→top on every",
    "tree edge. The reverse holds for upward-flowing trees (exit top, enter bottom), and",
    "left-to-right trees exit right, enter left — the rule is: enter on the face that points",
    "at the parent. Keep the gaps between sibling clusters visually even (one gutter width,",
    "measured cluster-edge to cluster-edge), keep each level's members on one shared register,",
    "and center each parent over its own children's span. Exception edges (dashed acting",
    "lines, dual reports) route around the fan, not through it, and don't disturb the",
    "centering. Defaults, not laws.",
  ].join("\n"),
};

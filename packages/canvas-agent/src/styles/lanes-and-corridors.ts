/**
 * Style topic: swimlane craft.
 * NEW for v5 — grounded in v4r1-swimlane (S2's lane re-sequencing was the
 * round's best fix; S3's poll/spans wrap-around detours and margin-stranded
 * chips; lanes deliberately share full width — trim slack is the idiom).
 */
import type { StyleTopic } from "./types";

export const style: StyleTopic = {
  id: "lanes-and-corridors",
  title: "Lanes and corridors",
  prose: [
    "Swimlanes share one span: stacked lanes keep equal width, so side slack inside a lane is",
    "the idiom, not a defect — stages sit under their source columns and the shared timeline",
    "whitespace is doing alignment work. Order the lanes to minimize crossings: put lanes",
    "that hand off to each other adjacent, and re-sequencing the lane order is allowed and",
    "often THE fix — a handoff between adjacent lanes drops as a short straight vertical rail",
    "with its chip in open corridor air. Flows that skip lanes get a dedicated gutter (a",
    "reserved column at the board's edge or between columns) so they never trace a lane",
    "border or wrap the whole board; when inserting a lane, preserve the adjacency of the",
    "lanes it separates or expect mega-detours. Stage columns stagger so vertical handoffs",
    "never stack on one line, and each chip stays mid-run beside its own flow — not stranded",
    "in a margin. Defaults, not laws.",
  ].join("\n"),
};

/**
 * @codecaine-ai/canvas-agent — the pure layout pipeline.
 *
 * Everything exported here is deterministic math with no React, no IO, and no
 * kernel imports: document → program (fit), program text ↔ model (serialize),
 * program → geometry (expand), geometry → routed edges (route), plus the
 * round-trip metrics, occupancy read-back, and the weighted-unit allocator.
 */
export * from "./types";
export * from "./compiler-types";
export * from "./serialize";
export * from "./fit";
export * from "./expand";
export * from "./route";
export * from "./router";
export * from "./metrics";
export * from "./occupancy";
export * from "./occupancy-ascii";
export * from "./units";
export * from "./scope";
export * from "./diff";
export * from "./doc-diff";
export * from "./lint";

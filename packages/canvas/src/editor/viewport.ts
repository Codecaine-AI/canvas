"use client";

// Pure viewport math (ViewportState, worldToScreen, panBy, fitBounds, ...)
// moved to src/viewport.ts — a package-internal neutral module — so that
// non-editor layers (interaction/, render/) can depend on viewport types
// without importing from editor/. This barrel keeps the historical path
// working for src/index.ts and editor internals.
export * from "../viewport";

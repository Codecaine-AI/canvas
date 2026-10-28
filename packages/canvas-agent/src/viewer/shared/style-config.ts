import {
  loadStyleRailWidth,
  type StyleSystemConfig,
} from "@codecaine-ai/agent-kernel-viewer-shell";

/**
 * Canvas-scoped binding for the shared viewer style system (@codecaine-ai/agent-kernel-viewer-shell). The
 * engine derives its settings key from `settingsStorageKey` with the version raised by one
 * (canvasAgentViewerStyle.v2, decision 51); index.html reads the same keys before the first paint.
 */
export const CANVAS_STYLE_CONFIG: StyleSystemConfig = {
  settingsStorageKey: "canvasAgentViewerStyle.v1",
  railCollapsedStorageKey: "canvasAgentViewerStyleRailCollapsed",
  railWidthStorageKey: "canvasAgentViewerStyleRailWidth",
  defaultTheme: "dark",
  neutralTokenFormat: "triplet",
  // All four sections: adopting the shared KernelTraceWorkspace IS the
  // opt-in for LAYOUT — its geometry vars are consumed by the workspace.
};

/**
 * The width the user dragged the style inspector to, or null when they never did: the inspector
 * then keeps the shell's width token (guide/layout.md, --ds-layout-inspector-width).
 */
export function loadStoredStyleRailWidth(): number | null {
  try {
    if (localStorage.getItem(CANVAS_STYLE_CONFIG.railWidthStorageKey) === null) return null;
  } catch {
    return null;
  }
  return loadStyleRailWidth(CANVAS_STYLE_CONFIG);
}

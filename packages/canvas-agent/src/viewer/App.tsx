import { createContext, useCallback, useContext, useEffect, useState, type CSSProperties } from "react";
import {
  StyleOverlay,
  StyleSettingsRail,
  clampStyleRailWidth,
  defaultStyleSettings,
  loadStyleRailCollapsed,
  loadStyleRailWidth,
  loadStyleSettings,
  mergeStyleSettings,
  saveStyleRailCollapsed,
  saveStyleRailWidth,
  saveStyleSettings,
  styleEffectClass,
  styleVars,
  type StyleSettings,
  type StyleSettingsPatch,
  type StyleSystemConfig,
} from "@agent-kernel/viewer-shell";

import { Sidebar, type View } from "./components/Sidebar";
import { navigate } from "./lib/navigation";
import { AgentConfigPage } from "./pages/AgentConfigPage";
import { TracesPage } from "./pages/TracesPage";

/**
 * The viewer shell: a persistent sidebar around two views over the harness's
 * kernel APIs, addressed by pathname (the simplest honest routing for a
 * two-page tool):
 *
 *   /traces          session list + live trace viewer   (also "/")
 *   /config          agent manifest + prompt lab
 *
 * The whole app is the agent operator surface. Styling comes from the SHARED
 * viewer style system (@agent-kernel/viewer-shell): the right-edge style rail
 * (COLORS / EFFECTS / TRACE tabs) drives the same tokens the example app uses,
 * emitted here in hex format for this app's Tailwind v4 @theme mapping.
 * Canvas defaults to the DARK instrument look; the rail can flip it.
 */

/** Canvas-scoped binding for the shared style system. */
const CANVAS_STYLE_CONFIG: StyleSystemConfig = {
  settingsStorageKey: "canvasAgentViewerStyle.v1",
  railCollapsedStorageKey: "canvasAgentViewerStyleRailCollapsed",
  railWidthStorageKey: "canvasAgentViewerStyleRailWidth",
  defaultTheme: "dark",
  neutralTokenFormat: "hex",
  // All four sections: adopting the shared KernelTraceWorkspace IS the
  // opt-in for LAYOUT — its geometry vars are consumed by the workspace.
};

/** Style settings for pages that thread view options (trace icon side/style). */
const StyleSettingsContext = createContext<StyleSettings>(
  defaultStyleSettings(CANVAS_STYLE_CONFIG),
);

export function useViewerStyleSettings(): StyleSettings {
  return useContext(StyleSettingsContext);
}

function parseView(pathname: string): View {
  if (pathname === "/config" || pathname.startsWith("/config/")) return "config";
  return "traces";
}

function currentUrl(): string {
  return window.location.pathname + window.location.search;
}

export function App() {
  // Track the full pathname+search so back/forward across query changes
  // still remounts the page.
  const [url, setUrl] = useState(currentUrl);
  const [styleSettings, setStyleSettingsState] = useState<StyleSettings>(() =>
    loadStyleSettings(CANVAS_STYLE_CONFIG),
  );
  const [railCollapsed, setRailCollapsedState] = useState(() =>
    loadStyleRailCollapsed(CANVAS_STYLE_CONFIG),
  );
  const [railWidth, setRailWidthState] = useState(() => loadStyleRailWidth(CANVAS_STYLE_CONFIG));

  useEffect(() => {
    const handlePopState = () => setUrl(currentUrl());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    saveStyleSettings(CANVAS_STYLE_CONFIG, styleSettings);
    document.documentElement.dataset.theme = styleSettings.theme;
    document.documentElement.style.colorScheme = styleSettings.theme;
  }, [styleSettings]);

  const handleStyleChange = useCallback((updates: StyleSettingsPatch) => {
    setStyleSettingsState((current) => mergeStyleSettings(CANVAS_STYLE_CONFIG, current, updates));
  }, []);

  const setRailCollapsed = useCallback((collapsed: boolean) => {
    setRailCollapsedState(collapsed);
    saveStyleRailCollapsed(CANVAS_STYLE_CONFIG, collapsed);
  }, []);

  const setRailWidth = useCallback((width: number) => {
    setRailWidthState(clampStyleRailWidth(width));
  }, []);

  const finishRailResize = useCallback(() => {
    setRailWidthState((width) => {
      saveStyleRailWidth(CANVAS_STYLE_CONFIG, width);
      return width;
    });
  }, []);

  const view = parseView(url.split("?")[0] ?? "/");
  const ActivePage = view === "config" ? AgentConfigPage : TracesPage;

  const shellStyle = {
    ...styleVars(styleSettings, CANVAS_STYLE_CONFIG),
    "--research-style-rail-track": railCollapsed ? "52px" : `${railWidth}px`,
  } as CSSProperties;

  return (
    <StyleSettingsContext.Provider value={styleSettings}>
      <div
        className={`research-style-shell ${styleEffectClass(styleSettings)} flex h-screen bg-background text-foreground`}
        style={shellStyle}
      >
        <Sidebar view={view} onNavigate={navigate} />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          <ActivePage key={url} />
        </main>
        <div className="flex h-full shrink-0" style={{ width: railCollapsed ? 52 : railWidth }}>
          <StyleSettingsRail
            collapsed={railCollapsed}
            onCollapsedChange={setRailCollapsed}
            onResizeEnd={finishRailResize}
            onResizeStart={() => {}}
            onWidthChange={setRailWidth}
            orientation="vertical"
            sections={CANVAS_STYLE_CONFIG.sections}
            settings={styleSettings}
            onSettingsChange={handleStyleChange}
          />
        </div>
        <StyleOverlay settings={styleSettings.grain} />
      </div>
    </StyleSettingsContext.Provider>
  );
}

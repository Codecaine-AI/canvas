import { useCallback, useEffect, useState } from "react";
import {
  loadStyleSettings,
  mergeStyleSettings,
  saveStyleSettings,
  type StyleSettings,
  type StyleSettingsPatch,
} from "@agent-kernel/viewer-shell";

import { RouterShell, type View } from "./_components/RouterShell";
import { StyleSettingsContext } from "./shared/useViewerStyleSettings";
import { CANVAS_STYLE_CONFIG } from "./shared/style-config";
import { AgentConfigPage } from "./_components/AgentConfigPage";
import { TracesPage } from "./_components/TracesPage";

/**
 * The viewer: the design-system app shell (_components/RouterShell) around two views over the
 * harness's kernel APIs, addressed by pathname (the simplest honest routing for a two-page tool):
 *
 *   /traces          session list + live trace viewer   (also "/")
 *   /config          agent manifest + prompt lab
 *
 * The whole app is the agent operator surface. Styling comes from the SHARED viewer style system
 * (@agent-kernel/viewer-shell), whose panel is the shell's Style inspector (THEME / EFFECTS /
 * TRACE / LAYOUT tabs): it keeps its theme, size, density and grain controls; the colors come from
 * the design-system tokens and host contract (main.tsx), as RGB triplets. Canvas defaults to dark;
 * the topbar toggle and the inspector can flip it.
 */

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

  useEffect(() => {
    const handlePopState = () => setUrl(currentUrl());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    saveStyleSettings(CANVAS_STYLE_CONFIG, styleSettings);
  }, [styleSettings]);

  const handleStyleChange = useCallback((updates: StyleSettingsPatch) => {
    setStyleSettingsState((current) => mergeStyleSettings(CANVAS_STYLE_CONFIG, current, updates));
  }, []);

  const view = parseView(url.split("?")[0] ?? "/");
  const ActivePage = view === "config" ? AgentConfigPage : TracesPage;

  return (
    <StyleSettingsContext.Provider value={styleSettings}>
      <RouterShell
        view={view}
        styleSettings={styleSettings}
        onStyleSettingsChange={handleStyleChange}
      >
        <ActivePage key={url} />
      </RouterShell>
    </StyleSettingsContext.Provider>
  );
}

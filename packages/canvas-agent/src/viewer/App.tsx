import { useEffect, useState } from "react";
import { Sidebar, type View } from "./components/Sidebar";
import { navigate } from "./lib/navigation";
import { AgentConfigPage } from "./pages/AgentConfigPage";
import { SessionPage } from "./pages/SessionPage";
import { TracesPage } from "./pages/TracesPage";

/**
 * The viewer shell: a persistent sidebar around three views over the harness's
 * kernel APIs, addressed by pathname (the simplest honest routing for a
 * three-page tool):
 *
 *   /traces          session list + live trace viewer   (also "/")
 *   /session?id=…    one session's trace detail
 *   /config          agent manifest + prompt lab
 *
 * The session page keeps reading `?id=` from location.search, exactly as it
 * did inside studio. The whole app is the agent operator surface, so the
 * dark instrument token set (agent-theme.css) applies at :root — no scoping
 * wrapper.
 */

function parseView(pathname: string): View {
  if (pathname === "/session" || pathname.startsWith("/session/")) return "session";
  if (pathname === "/config" || pathname.startsWith("/config/")) return "config";
  return "traces";
}

function currentUrl(): string {
  return window.location.pathname + window.location.search;
}

export function App() {
  // Track the full pathname+search so back/forward between two sessions
  // (same view, different ?id=) still remounts the page.
  const [url, setUrl] = useState(currentUrl);

  useEffect(() => {
    const handlePopState = () => setUrl(currentUrl());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const view = parseView(url.split("?")[0] ?? "/");
  const ActivePage =
    view === "session" ? SessionPage : view === "config" ? AgentConfigPage : TracesPage;

  return (
    <div className="flex h-screen">
      <Sidebar view={view} onNavigate={navigate} />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        <ActivePage key={url} />
      </main>
    </div>
  );
}

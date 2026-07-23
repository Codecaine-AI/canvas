import { useEffect, useState } from "react";
import { AgentConfigPage } from "./AgentConfigPage";
import { SessionPage } from "./SessionPage";
import { TracesPage } from "./TracesPage";
import { navigate } from "./navigation";

/**
 * The viewer shell: three views over the harness's kernel APIs, addressed by
 * pathname (the simplest honest routing for a three-page tool):
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
type View = "traces" | "session" | "config";

function parseView(pathname: string): View {
  if (pathname === "/session" || pathname.startsWith("/session/")) return "session";
  if (pathname === "/config" || pathname.startsWith("/config/")) return "config";
  return "traces";
}

const NAV: { view: View; path: string; title: string }[] = [
  { view: "traces", path: "/traces", title: "Traces" },
  { view: "session", path: "/session", title: "Session" },
  { view: "config", path: "/config", title: "Config" },
];

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
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-2.5 font-mono">
        <h1 className="font-display text-[13px] font-bold uppercase tracking-[0.14em]">
          Canvas Agent
        </h1>
        <nav className="ml-2 flex items-center gap-1">
          {NAV.map((item) => (
            <button
              key={item.view}
              type="button"
              aria-current={item.view === view ? "page" : undefined}
              onClick={() => navigate(item.path)}
              className={`rounded-[2px] border px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors ${
                item.view === view
                  ? "border-status-info-border bg-status-info-fill/40 text-status-info"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              {item.title}
            </button>
          ))}
        </nav>
        <span className="ml-auto text-[11px] text-muted-foreground">
          harness :4820
        </span>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        <ActivePage key={url} />
      </main>
    </div>
  );
}

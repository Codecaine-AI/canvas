import { useEffect, useState, type MouseEvent } from "react";
import { FlowView } from "./guide/FlowView";
import { LanguageView, RulesView, WorkedView } from "./guide/GuideView";
import { LANGUAGE_ENTRIES } from "./guide/examples";
import { RULE_CARDS } from "./guide/rulesScenes";
import { CANDIDATE_RULE_CARDS } from "./guide/candidateRules";
import { SketchView } from "./sketch/SketchView";
import { navigate } from "./routing";

type View = "flow" | "language" | "rules" | "worked" | "sketch";

interface Route {
  view: View;
  subId: string | null;
}

const NAV: readonly { id: View; label: string; path: string }[] = [
  { id: "flow", label: "How it works", path: "/how-it-works" },
  { id: "language", label: "Language", path: "/language" },
  { id: "rules", label: "Rules", path: "/rules" },
  { id: "worked", label: "Worked example", path: "/worked-example" },
  { id: "sketch", label: "Sketch", path: "/sketch" },
];

const LANGUAGE_IDS = new Set(LANGUAGE_ENTRIES.map((entry) => entry.id));
const RULE_IDS = new Set([...RULE_CARDS, ...CANDIDATE_RULE_CARDS].map((card) => card.id));
const DEFAULT_RULE_ID = RULE_CARDS[0].id;

export function parseRoute(pathname: string): Route | null {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (clean === "/how-it-works") return { view: "flow", subId: null };
  if (clean === "/worked-example") return { view: "worked", subId: null };
  if (clean === "/sketch") return { view: "sketch", subId: null };
  const match = clean.match(/^\/(language|rules)(?:\/([^/]+))?$/);
  if (!match) return null;
  const view = match[1] as "language" | "rules";
  const subId = match[2] ? decodeURIComponent(match[2]) : null;
  if (subId === null) return { view, subId: null };
  if (view === "language") return LANGUAGE_IDS.has(subId) ? { view, subId } : null;
  return RULE_IDS.has(subId) ? { view, subId } : null;
}

/** Reads the address bar; unknown paths redirect (replace) to /how-it-works. */
function currentRoute(): Route {
  const parsed = parseRoute(window.location.pathname);
  if (parsed) return parsed;
  window.history.replaceState({}, "", "/how-it-works");
  return { view: "flow", subId: null };
}

function initialVisited(view: View): Record<View, boolean> {
  return {
    flow: view === "flow",
    language: view === "language",
    rules: view === "rules",
    worked: view === "worked",
    sketch: view === "sketch",
  };
}

export function App() {
  const [route, setRoute] = useState<Route>(currentRoute);
  const [visited, setVisited] = useState<Record<View, boolean>>(() => initialVisited(route.view));
  // Last sub-selection per deep-linkable view, so kept-alive hidden panels
  // hold their place while another tab is frontmost.
  const [languageSelection, setLanguageSelection] = useState<string>(
    route.view === "language" ? (route.subId ?? "anatomy") : "anatomy",
  );
  const [ruleSelection, setRuleSelection] = useState<string>(
    route.view === "rules" ? (route.subId ?? DEFAULT_RULE_ID) : DEFAULT_RULE_ID,
  );

  useEffect(() => {
    function handlePopState() {
      const next = currentRoute();
      setVisited((current) => (current[next.view] ? current : { ...current, [next.view]: true }));
      if (next.view === "language") setLanguageSelection(next.subId ?? "anatomy");
      if (next.view === "rules") setRuleSelection(next.subId ?? DEFAULT_RULE_ID);
      setRoute(next);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function follow(event: MouseEvent<HTMLAnchorElement>, path: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(path);
  }

  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <div className="product-mark" aria-label="Layout Lab">
          <span className="product-mark-glyph" aria-hidden="true"><i /><i /><i /></span>
          <strong>Layout Lab</strong>
        </div>
        <nav aria-label="Layout Lab views">
          {NAV.map((entry) => (
            <a
              key={entry.id}
              href={entry.path}
              className={route.view === entry.id ? "active" : ""}
              aria-current={route.view === entry.id ? "page" : undefined}
              onClick={(event) => follow(event, entry.path)}
            >
              {entry.label}
            </a>
          ))}
        </nav>
        <div className="app-sidebar-note">structure before content</div>
      </aside>
      <main className="app-main">
        {NAV.map((entry) => (
          visited[entry.id]
            ? (
              <div key={entry.id} className="view-panel" hidden={route.view !== entry.id}>
                {entry.id === "flow" ? <FlowView /> : null}
                {entry.id === "language" ? (
                  <LanguageView
                    selectedId={languageSelection}
                    onSelect={(id) => navigate(id === "anatomy" ? "/language" : `/language/${id}`)}
                  />
                ) : null}
                {entry.id === "rules" ? (
                  <RulesView
                    selectedId={ruleSelection}
                    onSelect={(id) => navigate(`/rules/${id}`)}
                  />
                ) : null}
                {entry.id === "worked" ? <WorkedView /> : null}
                {entry.id === "sketch" ? <SketchView /> : null}
              </div>
            )
            : null
        ))}
      </main>
    </div>
  );
}

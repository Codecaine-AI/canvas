export type View = "traces" | "config";

type SidebarProps = {
  view: View;
  onNavigate: (path: string) => void;
};

const NAV: { view: View; path: string; title: string }[] = [
  { view: "traces", path: "/traces", title: "Traces" },
  { view: "config", path: "/config", title: "Config" },
];

export function Sidebar({ view, onNavigate }: SidebarProps) {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border">
      <div className="px-5 py-4">
        <h1 className="font-display text-ui-sm font-bold uppercase tracking-micro-wide text-ink">
          Canvas Agent
        </h1>
      </div>
      <nav className="flex flex-col gap-1 px-3 font-mono">
        {NAV.map((item) => (
          <button
            key={item.view}
            type="button"
            aria-current={item.view === view ? "page" : undefined}
            onClick={() => onNavigate(item.path)}
            className={`w-full rounded border px-2.5 py-2 text-left text-ui-2xs font-bold uppercase tracking-micro transition-colors ${
              item.view === view
                ? "border-status-info-border bg-status-info-fill/40 text-status-info"
                : "border-transparent text-muted-foreground hover:bg-muted/35 hover:text-foreground"
            }`}
          >
            {item.title}
          </button>
        ))}
      </nav>
      <span className="mt-auto px-5 py-4 font-mono text-ui-2xs text-muted-foreground">
        harness :4820
      </span>
    </aside>
  );
}

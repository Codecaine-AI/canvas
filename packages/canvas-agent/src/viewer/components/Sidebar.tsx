export type View = "traces" | "session" | "config";

type SidebarProps = {
  view: View;
  onNavigate: (path: string) => void;
};

const NAV: { view: View; path: string; title: string }[] = [
  { view: "traces", path: "/traces", title: "Traces" },
  { view: "session", path: "/session", title: "Session" },
  { view: "config", path: "/config", title: "Config" },
];

export function Sidebar({ view, onNavigate }: SidebarProps) {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border">
      <div className="px-5 py-4">
        <h1 className="font-display text-[13px] font-bold uppercase tracking-[0.14em]">
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
            className={`w-full rounded-[2px] border px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-[0.08em] transition-colors ${
              item.view === view
                ? "border-status-info-border bg-status-info-fill/40 text-status-info"
                : "border-transparent text-muted-foreground hover:bg-muted/35 hover:text-foreground"
            }`}
          >
            {item.title}
          </button>
        ))}
      </nav>
      <span className="mt-auto px-5 py-4 font-mono text-[11px] text-muted-foreground">
        harness :4820
      </span>
    </aside>
  );
}

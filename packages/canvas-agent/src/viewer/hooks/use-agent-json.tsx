import { useEffect, useState } from "react";

/**
 * Fetch state for the viewer pages. The harness (HARNESS-SETUP-PLAN.md §1)
 * is a sibling Bun service the viewer's vite dev proxy pipes /api to; while
 * it isn't running the proxy answers 502 { error: "agent service is not
 * running" }, which these pages render as a calm empty state rather than an
 * error.
 *
 * The data is deliberately `unknown`: shape checks live beside each page
 * (isTraceDetail etc.), so a wrong-shaped answer degrades to a message, not
 * a crash.
 */
export type AgentJsonState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error"; message: string }
  | { status: "ready"; data: unknown };

export function useAgentJson(path: string | null): AgentJsonState {
  const [state, setState] = useState<AgentJsonState>({ status: "loading" });

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setState({ status: "loading" });

    fetch(path)
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 502) {
          setState({ status: "unavailable" });
          return;
        }
        if (!response.ok) {
          setState({
            status: "error",
            message: `${response.status} ${response.statusText}`,
          });
          return;
        }
        const data = (await response.json()) as unknown;
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch(() => {
        // A network-level failure means the viewer's dev server itself is
        // gone; treat it the same as the harness being down.
        if (!cancelled) setState({ status: "unavailable" });
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  return path ? state : { status: "loading" };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Shared calm empty state for when the harness process is not up. */
export function AgentServiceDownNotice({ subject }: { subject: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-6">
      <p className="text-sm font-medium">The agent service is not running.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {subject} will appear here once the agent service is up on port 4820.
        Nothing is broken — the viewer just could not reach it.
      </p>
    </div>
  );
}

export function AgentFetchErrorNotice({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-6">
      <p className="text-sm font-medium">Something went wrong.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        The agent service answered with “{message}”. Try reloading this page.
      </p>
    </div>
  );
}

export function PrettyJson({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-xs leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

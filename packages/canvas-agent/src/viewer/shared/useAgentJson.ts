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

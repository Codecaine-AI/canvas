import { useMemo } from "react";
import type { KernelTraceSessionDetail } from "@agent-kernel/viewer-core";
import { navigate } from "./navigation";
import { AgentSurface } from "./AgentSurface";
import { TraceDetailView } from "./TraceDetailView";
import { isTraceDetail, statusClass } from "./TracesPage";
import { traceSessionDetailPath } from "./kernel-api";
import {
  AgentFetchErrorNotice,
  AgentServiceDownNotice,
  useAgentJson,
} from "./use-agent-json";

/**
 * Session detail — one kernel trace session (HARNESS-SETUP-PLAN.md §2b),
 * rendered with the real viewer stack: a session header (status, phase,
 * prompt hash lineage from the pi sessions) over the UsageStrip +
 * KernelTraceViewer composition. Runs, tool calls, context-loader lifecycle
 * events and token usage all live in the span tree / detail panel.
 */
export function SessionPage() {
  const id = new URLSearchParams(window.location.search).get("id")?.trim() || null;
  const state = useAgentJson(id ? traceSessionDetailPath(id) : null);

  if (!id) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">
          No session selected. Pick one from the traces page.
        </p>
        <button
          type="button"
          onClick={() => navigate("/traces")}
          className="text-sm font-medium underline underline-offset-4"
        >
          Go to traces
        </button>
      </div>
    );
  }

  if (state.status === "loading") {
    return <p className="text-sm text-muted-foreground">Loading session {id}...</p>;
  }
  if (state.status === "unavailable") {
    return <AgentServiceDownNotice subject="This session's trace" />;
  }
  if (state.status === "error") {
    return <AgentFetchErrorNotice message={state.message} />;
  }

  if (!isTraceDetail(state.data)) {
    return (
      <p className="text-sm text-muted-foreground">
        The agent service answered, but not with the kernel trace detail shape
        this page expects.
      </p>
    );
  }

  return <SessionDetail detail={state.data} />;
}

function SessionDetail({ detail }: { detail: KernelTraceSessionDetail }) {
  const { session } = detail;
  const promptHashes = useMemo(() => {
    const hashes = new Set<string>();
    for (const piSession of detail.pi_sessions) {
      if (piSession.promptHash) hashes.add(piSession.promptHash);
    }
    return [...hashes];
  }, [detail]);

  return (
    <AgentSurface className="flex h-full min-h-[560px] flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-2.5 font-mono">
        <button
          type="button"
          onClick={() => navigate("/traces")}
          className="rounded-[2px] border border-border px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground transition-colors hover:border-status-info-border hover:text-foreground"
        >
          ← Traces
        </button>
        <h2 className="min-w-0 truncate text-[13px] font-bold">
          {session.topic ?? session.label ?? session.id}
        </h2>
        <span
          className={`rounded-[2px] border px-1.5 py-0.5 text-[10px] font-bold uppercase ${statusClass(session.status)}`}
        >
          {session.status}
        </span>
        <span className="truncate text-[11px] text-muted-foreground" title={session.id}>
          {session.id}
        </span>
        {promptHashes.map((hash) => (
          <span
            key={hash}
            title={`Prompt revision ${hash}`}
            className="rounded-[2px] border border-status-success-border bg-status-success-fill/30 px-1.5 py-0.5 text-[10px] text-status-success"
          >
            prompt {shortHash(hash)}
          </span>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {detail.pi_sessions.length} pi · {detail.agent_runs.length} runs ·{" "}
          {detail.events.length} events
        </span>
      </header>
      <TraceDetailView detail={detail} />
    </AgentSurface>
  );
}

function shortHash(hash: string): string {
  const body = hash.startsWith("pk1-") ? hash.slice(4) : hash;
  return body.length > 10 ? body.slice(0, 10) : body;
}

import { useEffect, useState } from "react";
import type {
  KernelTraceSessionDetail,
  KernelTraceSessionListResponse,
  KernelTraceSessionSummary,
} from "@agent-kernel/viewer-core";
import { navigate } from "../lib/navigation";
import { AgentSurface } from "../components/AgentSurface";
import { TraceDetailView } from "../components/TraceDetailView";
import { traceSessionDetailPath, traceSessionListPath } from "../lib/kernel-api";
import {
  AgentFetchErrorNotice,
  AgentServiceDownNotice,
  isRecord,
  useAgentJson,
} from "../hooks/use-agent-json";

/**
 * Traces — the kernel trace-session list beside the live trace viewer
 * (HARNESS-SETUP-PLAN.md §2b/§4), the TraceWorkspace composition from
 * agent-kernel's simple-research-kernel example: session rows on the left,
 * UsageStrip + KernelTraceViewer for the selected session on the right.
 * Everything reads the standard kernel read API through the viewer's dev
 * proxy (/api → the harness on :4820).
 */
export function TracesPage() {
  const state = useAgentJson(traceSessionListPath());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (state.status === "loading") {
    return <p className="text-sm text-muted-foreground">Loading sessions...</p>;
  }
  if (state.status === "unavailable") {
    return <AgentServiceDownNotice subject="Agent sessions" />;
  }
  if (state.status === "error") {
    return <AgentFetchErrorNotice message={state.message} />;
  }

  const sessions = extractSessions(state.data);
  if (!sessions) {
    return (
      <p className="text-sm text-muted-foreground">
        The agent service answered, but not with the kernel trace-session list
        shape this page expects.
      </p>
    );
  }

  if (sessions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No agent sessions yet. Sessions show up here after the agent runs.
      </p>
    );
  }

  const activeId = selectedId ?? sessions[0]?.id ?? null;

  return (
    <AgentSurface className="flex h-full min-h-[560px]">
      <aside className="flex w-[340px] shrink-0 flex-col border-r border-border">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.14em]">
            Traces
          </h2>
          <span className="text-xs text-muted-foreground">
            {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              selected={session.id === activeId}
              onSelect={() => setSelectedId(session.id)}
              onOpen={() =>
                navigate(`/session?id=${encodeURIComponent(session.id)}`)
              }
            />
          ))}
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {activeId ? (
          <SelectedTraceDetail id={activeId} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a trace.
          </div>
        )}
      </div>
    </AgentSurface>
  );
}

function SessionRow({
  session,
  selected,
  onSelect,
  onOpen,
}: {
  session: KernelTraceSessionSummary;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const title = session.topic ?? session.label;
  return (
    <div
      className={`relative grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border/70 text-left font-mono transition-colors ${
        selected
          ? "bg-status-info-fill/30 text-foreground before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-status-info-border"
          : "text-muted-foreground hover:bg-muted/35 hover:text-foreground"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-status-info-border"
      >
        <span className="block truncate text-[13px] font-bold leading-5">
          {title}
        </span>
        <span className="block truncate text-[11px] leading-4 text-muted-foreground">
          {session.piSessionCount} pi · {session.eventCount} events ·{" "}
          {session.updatedAt ?? session.createdAt ?? ""}
        </span>
      </button>
      <div className="flex items-center gap-1.5 pr-2">
        <span
          className={`rounded-[2px] border px-1.5 py-0.5 text-[10px] font-bold uppercase ${statusClass(session.status)}`}
        >
          {session.status}
        </span>
        <button
          type="button"
          onClick={onOpen}
          title="Open this session's detail page"
          className="rounded-[2px] border border-border px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground transition-colors hover:border-status-info-border hover:text-foreground"
        >
          Open
        </button>
      </div>
    </div>
  );
}

function SelectedTraceDetail({ id }: { id: string }) {
  const state = useAgentJson(traceSessionDetailPath(id));
  // Keep the previous trace on screen while the next one loads.
  const [detail, setDetail] = useState<KernelTraceSessionDetail | null>(null);
  useEffect(() => {
    if (state.status === "ready" && isTraceDetail(state.data)) {
      setDetail(state.data);
    }
  }, [state]);

  if (!detail) {
    if (state.status === "error") {
      return (
        <div className="flex h-full items-center justify-center text-sm text-destructive">
          Trace read failed: {state.message}
        </div>
      );
    }
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading kernel trace...
      </div>
    );
  }

  return <TraceDetailView detail={detail} />;
}

export function statusClass(status: string): string {
  switch (status) {
    case "done":
    case "completed":
      return "border-status-success-border bg-status-success-fill/40 text-status-success";
    case "error":
      return "border-destructive/50 bg-destructive/10 text-destructive";
    case "running":
    case "active":
    case "queued":
      return "border-status-info-border bg-status-info-fill/40 text-status-info";
    default:
      return "border-status-neutral-border bg-status-neutral-fill/40 text-status-neutral";
  }
}

export function isTraceDetail(value: unknown): value is KernelTraceSessionDetail {
  return (
    isRecord(value) &&
    isRecord(value.session) &&
    Array.isArray(value.events) &&
    Array.isArray(value.pi_sessions) &&
    Array.isArray(value.agent_runs)
  );
}

function extractSessions(data: unknown): KernelTraceSessionSummary[] | null {
  if (!isRecord(data) || !Array.isArray(data.trace_sessions)) return null;
  return (data as unknown as KernelTraceSessionListResponse).trace_sessions;
}

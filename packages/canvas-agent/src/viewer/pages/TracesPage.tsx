import { useEffect, useMemo, useState } from "react";
import type {
  KernelTraceSessionDetail,
  KernelTraceSessionListResponse,
  KernelTraceSessionSummary,
} from "@agent-kernel/viewer-core";
import { buildTraceSpans } from "@agent-kernel/viewer-core";
import {
  KernelTraceWorkspace,
  type TraceWorkspaceRow,
} from "@agent-kernel/viewer-shell";
import { createDetailBlockProvider } from "@codecaine-ai/canvas-agent/viewer-extension";
import { AgentSurface } from "../components/AgentSurface";
import { useCanvasTraceExtensions } from "../components/TraceDetailView";
import { useViewerStyleSettings } from "../App";
import {
  AGENT_API_BASE,
  traceSessionDetailPath,
  traceSessionListPath,
} from "../lib/kernel-api";
import {
  AgentFetchErrorNotice,
  AgentServiceDownNotice,
  isRecord,
  useAgentJson,
} from "../hooks/use-agent-json";

/**
 * Traces — the STANDARD trace workspace (@agent-kernel/viewer-shell's
 * KernelTraceWorkspace: list mode + drill-in + 40/60 split + divider), wired
 * to the harness's kernel read API through the dev proxy, with the canvas
 * transcript layers (run brief, additive tool-call blocks, and render
 * lightbox) plugged in through the workspace's extension slots.
 *
 * App-specific here: data fetching/adapting, the transcript extensions, and
 * NO delete (the harness read API is read-only, so the workspace renders no
 * delete affordances).
 */
export function TracesPage() {
  const state = useAgentJson(traceSessionListPath());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const styleSettings = useViewerStyleSettings();

  const sessions = state.status === "ready" ? extractSessions(state.data) : null;
  const activeId = selectedId ?? sessions?.[0]?.id ?? null;

  // Keep the previous trace on screen while the next one loads.
  const detailState = useAgentJson(activeId ? traceSessionDetailPath(activeId) : null);
  const [detail, setDetail] = useState<KernelTraceSessionDetail | null>(null);
  useEffect(() => {
    if (detailState.status === "ready" && isTraceDetail(detailState.data)) {
      setDetail(detailState.data);
    }
  }, [detailState]);

  const spans = useMemo(
    () =>
      detail
        ? buildTraceSpans(detail.events, detail.pi_sessions, detail.agent_runs)
        : [],
    [detail],
  );

  const extensions = useCanvasTraceExtensions(
    detail,
    AGENT_API_BASE,
    createDetailBlockProvider,
  );

  const rows = useMemo<TraceWorkspaceRow[]>(
    () =>
      (sessions ?? []).map((session) => ({
        id: session.id,
        title: session.topic ?? session.label,
        subtitle: `${session.piSessionCount} pi · ${session.eventCount} events · ${
          session.updatedAt ?? session.createdAt ?? ""
        }`,
        status: session.status,
      })),
    [sessions],
  );

  const selectedSession = useMemo(
    () =>
      (sessions ?? []).find(
        (session) =>
          session.id === activeId ||
          (detail !== null &&
            (session.id === detail.session.id ||
              session.containerId === detail.session.containerId)),
      ) ?? null,
    [sessions, activeId, detail],
  );

  const workspaceDetail = useMemo(
    () =>
      detail
        ? {
            id: detail.session.id,
            title:
              selectedSession?.topic ?? selectedSession?.label ?? detail.session.id,
            status: selectedSession?.status ?? detail.session.status ?? "unknown",
            subtitle: null,
          }
        : null,
    [detail, selectedSession],
  );

  const usageData = useMemo(
    () =>
      detail
        ? {
            container: detail.container ?? null,
            runs: detail.agent_runs,
            sessions: detail.pi_sessions,
          }
        : undefined,
    [detail],
  );

  if (state.status === "loading") {
    return <p className="text-sm text-muted-foreground">Loading sessions...</p>;
  }
  if (state.status === "unavailable") {
    return <AgentServiceDownNotice subject="Agent sessions" />;
  }
  if (state.status === "error") {
    return <AgentFetchErrorNotice message={state.message} />;
  }
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

  return (
    <AgentSurface className="flex h-full min-h-0 flex-1 flex-col">
      <KernelTraceWorkspace
        rows={rows}
        selectedRowId={selectedSession?.id ?? activeId}
        detail={workspaceDetail}
        spans={spans}
        loading={detailState.status === "loading" && detail === null}
        onSelect={setSelectedId}
        usageData={usageData}
        apiBase={AGENT_API_BASE}
        iconSide={styleSettings.traceIcons.side}
        iconStyle={styleSettings.traceIcons.style}
        labels={{ countNoun: "session", rowColumnLabel: "Session" }}
        detailBlockProvider={extensions.detailBlockProvider}
      />
    </AgentSurface>
  );
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

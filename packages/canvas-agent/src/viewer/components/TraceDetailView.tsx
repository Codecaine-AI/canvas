import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildTraceSpans,
  type KernelTraceSessionDetail,
} from "@agent-kernel/viewer-core";
import {
  SpanDetailPanel,
  UsageStrip,
  UsageSummaryPanel,
  findSpanInTree,
  readStringAttr,
  type RunUsageRow,
  type UsageContext,
} from "@agent-kernel/viewer-ui";
import { CanvasTraceViewer, type ViewerTraceSpan } from "./CanvasTraceViewer";
import { ContextWindowOverlay } from "./ContextWindowOverlay";
import { RunBrief, TranscriptToolCallDetail } from "./TranscriptInspector";
import { TranscriptLightbox } from "./TranscriptMedia";
import { isRecord } from "../hooks/use-agent-json";
import {
  collectTranscriptImages,
  indexTranscriptToolCalls,
  useSessionTranscript,
  type TranscriptToolCallEntry,
} from "../hooks/use-transcript";

/**
 * One kernel trace, rendered with the real viewer stack: the usage strip on
 * top, the CanvasTraceViewer (span tree + detail panel) below, and the full
 * usage summary taking over the detail column while the strip is toggled —
 * the composition simple-research-kernel's TraceWorkspace uses.
 *
 * Layered over the trace is the session transcript (use-transcript.ts),
 * fetched once per session view and joined to tool spans by tool_use_id:
 *
 *   - the run brief (initial user instruction + collapsed agent context)
 *     pinned above the tree
 *   - a rich inspector half for selected tool calls: thinking, params /
 *     program, full result text, and the call's images — each opening a
 *     full-size lightbox that navigates across all of the run's renders
 *     in chronological order
 *   - the CONTEXT WINDOW overlay (ContextWindowOverlay): the full prompt the
 *     model ran with for the selected turn, reconstructed from the trace's
 *     system_prompt_resolved event + the transcript, with the actual
 *     input-token count joined from pi_turn_end usage (turn_number aligns
 *     1:1 with transcript turns[].index per pi session; turns whose
 *     pi_turn_end never arrived — stuck-active runs — just omit the count)
 *
 * While the transcript route 404s (harness not serving it yet) all of this
 * quietly disappears and the view is exactly the pre-transcript viewer.
 */
export function TraceDetailView({ detail }: { detail: KernelTraceSessionDetail }) {
  const [usageViewOpen, setUsageViewOpen] = useState(false);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [contextWindow, setContextWindow] = useState<{
    piSessionId: string;
    turnIndex: number;
  } | null>(null);

  const containerId = detail.session.containerId || detail.session.id;
  const transcriptState = useSessionTranscript(containerId);
  const transcript =
    transcriptState.status === "ready" ? transcriptState.transcript : null;

  // Reset per-trace so a fresh selection opens the new trace, not stale state.
  useEffect(() => {
    setSelectedSpanId(null);
    setUsageViewOpen(false);
    setLightboxIndex(null);
    setContextWindow(null);
  }, [detail.session.id]);

  const spans = useMemo(
    () => buildTraceSpans(detail.events, detail.pi_sessions, detail.agent_runs),
    [detail],
  );

  const runImages = useMemo(
    () => (transcript ? collectTranscriptImages(transcript) : []),
    [transcript],
  );

  /**
   * Context-window inputs mined from the trace events:
   *
   *   - system_prompt_resolved → the full rendered system prompt, keyed by
   *     piSessionId (single-event traces also keep a fallback)
   *   - pi_turn_end → usage.inputTokens keyed by `piSessionId#turn_number`.
   *     turn_number is 0-based and matches transcript turns[].index 1:1
   *     (verified against live sessions; both count pi turns per session).
   *     Turns without a pi_turn_end (stuck-active runs) simply have no entry.
   */
  const contextMeta = useMemo(() => {
    const systemPrompts = new Map<string, string>();
    let fallbackPrompt: string | null = null;
    const turnInputTokens = new Map<string, number>();
    for (const event of detail.events) {
      const data = event.eventData;
      if (!isRecord(data)) continue;
      if (event.type === "system_prompt_resolved") {
        const prompt = data.rendered_prompt;
        if (typeof prompt === "string" && prompt.length > 0) {
          if (event.piSessionId) systemPrompts.set(event.piSessionId, prompt);
          if (fallbackPrompt === null) fallbackPrompt = prompt;
        }
      } else if (event.type === "pi_turn_end") {
        const turnNumber = data.turn_number;
        const usage = data.usage;
        if (
          typeof turnNumber === "number" &&
          isRecord(usage) &&
          typeof usage.inputTokens === "number" &&
          event.piSessionId
        ) {
          turnInputTokens.set(
            `${event.piSessionId}#${turnNumber}`,
            usage.inputTokens,
          );
        }
      }
    }
    return { systemPrompts, fallbackPrompt, turnInputTokens };
  }, [detail]);
  const toolCallIndex = useMemo(
    () =>
      transcript
        ? indexTranscriptToolCalls(transcript)
        : new Map<string, TranscriptToolCallEntry>(),
    [transcript],
  );

  const openImageById = useCallback(
    (imageId: string) => {
      const index = runImages.findIndex((image) => image.imageId === imageId);
      if (index >= 0) setLightboxIndex(index);
    },
    [runImages],
  );

  /** The transcript tool call behind a tool_call span, joined by tool_use_id. */
  const transcriptEntryFor = useCallback(
    (span: ViewerTraceSpan): TranscriptToolCallEntry | null => {
      const eventType = readStringAttr(span, "event_type");
      if (eventType !== "tool_call_start" && eventType !== "tool_call_end") {
        return null;
      }
      const toolUseId = readStringAttr(span, "tool_use_id");
      return (toolUseId && toolCallIndex.get(toolUseId)) || null;
    },
    [toolCallIndex],
  );

  const handleSelectedIdChange = useCallback((id: string | null) => {
    setSelectedSpanId(id);
    if (id !== null) setUsageViewOpen(false);
  }, []);

  // A run's own `run:<id>` span only exists when its pi session had >1 run;
  // fall back to the pi session span so the click always lands in the tree.
  const handleRunSelect = useCallback(
    (row: RunUsageRow) => {
      const runSpanId = `run:${row.id}`;
      const target = findSpanInTree(spans, runSpanId)
        ? runSpanId
        : `pi:${row.piSessionId}`;
      setSelectedSpanId(target);
      setUsageViewOpen(false);
    },
    [spans],
  );

  const toggleUsageView = useCallback(() => {
    setUsageViewOpen((open) => {
      const next = !open;
      if (next) setSelectedSpanId(null);
      return next;
    });
  }, []);

  const usageContext = useMemo<UsageContext>(
    () => ({
      runs: detail.agent_runs,
      container: detail.container ?? null,
      onRunSelect: handleRunSelect,
    }),
    [detail, handleRunSelect],
  );

  const renderSpanDetail = useCallback(
    (span: ViewerTraceSpan) => {
      const eventType = readStringAttr(span, "event_type");
      if (eventType !== "tool_call_start" && eventType !== "tool_call_end") {
        return null;
      }
      if (transcriptState.status === "absent") {
        return (
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1">
              <SpanDetailPanel span={span} usageContext={usageContext} />
            </div>
            <div className="shrink-0 border-t px-6 py-2 text-xs text-muted-foreground/70">
              Transcript unavailable
            </div>
          </div>
        );
      }
      const entry = transcriptEntryFor(span);
      if (!entry) return null;
      return (
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-[0.9] overflow-hidden">
            <SpanDetailPanel span={span} usageContext={usageContext} />
          </div>
          <div className="min-h-0 flex-[1.1] border-t border-border">
            <TranscriptToolCallDetail
              entry={entry}
              containerId={containerId}
              onOpenImage={openImageById}
              onOpenContextWindow={() =>
                setContextWindow({
                  piSessionId: entry.piSession.piSessionId,
                  turnIndex: entry.turn.index,
                })
              }
            />
          </div>
        </div>
      );
    },
    [transcriptState.status, transcriptEntryFor, usageContext, containerId, openImageById],
  );

  /** The pi session behind the open context window, when the join holds. */
  const contextPiSession =
    contextWindow && transcript
      ? (transcript.pi_sessions.find(
          (piSession) => piSession.piSessionId === contextWindow.piSessionId,
        ) ?? null)
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <UsageStrip
        className="shrink-0"
        container={detail.container ?? null}
        runs={detail.agent_runs}
        sessions={detail.pi_sessions}
        active={usageViewOpen}
        onToggle={toggleUsageView}
      />
      {transcript && <RunBrief className="shrink-0" transcript={transcript} />}
      <CanvasTraceViewer
        className="flex min-h-0 flex-1 flex-col p-3"
        spans={spans}
        initialTraceLevel={2}
        selectedId={selectedSpanId}
        onSelectedIdChange={handleSelectedIdChange}
        usageContext={usageContext}
        renderSpanDetail={renderSpanDetail}
        detailOverride={
          usageViewOpen ? (
            <div className="flex h-full flex-col">
              <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Usage summary
                </span>
                <button
                  type="button"
                  onClick={toggleUsageView}
                  className="rounded-[2px] border border-border px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-status-info-border hover:text-foreground"
                >
                  Close
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <UsageSummaryPanel
                  container={detail.container ?? null}
                  runs={detail.agent_runs}
                  sessions={detail.pi_sessions}
                  onRunSelect={handleRunSelect}
                />
              </div>
            </div>
          ) : undefined
        }
      />
      {contextWindow && contextPiSession && (
        <ContextWindowOverlay
          piSession={contextPiSession}
          turnIndex={contextWindow.turnIndex}
          systemPrompt={
            contextMeta.systemPrompts.get(contextWindow.piSessionId) ??
            contextMeta.fallbackPrompt
          }
          inputTokens={
            contextMeta.turnInputTokens.get(
              `${contextWindow.piSessionId}#${contextWindow.turnIndex}`,
            ) ?? null
          }
          containerId={containerId}
          keysSuspended={lightboxIndex !== null}
          onClose={() => setContextWindow(null)}
          onOpenImage={openImageById}
        />
      )}
      {lightboxIndex !== null && runImages.length > 0 && (
        <TranscriptLightbox
          images={runImages}
          index={Math.min(lightboxIndex, runImages.length - 1)}
          containerId={containerId}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}

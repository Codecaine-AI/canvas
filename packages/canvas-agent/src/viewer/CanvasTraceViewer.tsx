import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  SpanDetailPanel,
  TraceViewerApiContext,
  TreeView,
  collectSpanIds,
  filterSpansByTraceLevel,
  findSpanInTree,
  type UsageContext,
} from "@agent-kernel/viewer-ui";

import { AGENT_API_BASE } from "./kernel-api";

/**
 * viewer-ui renderers (request snapshots) resolve blob/context URLs as
 * `${apiBase}${KERNEL_TRACE_READ_PATHS...}`; the constants already carry the
 * /kernel prefix, so the base is the studio proxy root, not .../kernel.
 */
const API_CONTEXT_VALUE = { apiBase: AGENT_API_BASE };

/**
 * CanvasTraceViewer — a local composition of the viewer-ui building blocks
 * (TreeView + SpanDetailPanel + the L0–L3 trace-level filter), forked from
 * @agent-kernel/viewer-shell's KernelTraceViewer so the canvas viewer can add
 * a transcript extension point the shell doesn't expose:
 *
 *   renderSpanDetail — takes over the detail column for a selected span
 *                      (falls back to SpanDetailPanel when it returns null),
 *                      used for the rich tool-call inspector.
 *
 * Everything else — level slider semantics, expand-all, selection wiring, the
 * usage-summary detail override — matches KernelTraceViewer exactly.
 */

/** The agent-prism TraceSpan type, reachable only through viewer-ui's API. */
export type ViewerTraceSpan = NonNullable<ReturnType<typeof findSpanInTree>>;

interface TraceLevelInfo {
  marker: string;
  name: string;
  description: string;
}

const TRACE_LEVELS: readonly TraceLevelInfo[] = [
  {
    marker: "L0",
    name: "Conversation",
    description:
      "High-level conversation: user messages, assistant replies, and ask prompts.",
  },
  {
    marker: "L1",
    name: "Tools",
    description: "Adds tool calls and their results.",
  },
  {
    marker: "L2",
    name: "Full",
    description: "Adds system prompts, context, and processing detail.",
  },
  {
    marker: "L3",
    name: "Debug",
    description:
      "Adds low-level internal and lifecycle events for deep debugging.",
  },
];

export interface CanvasTraceViewerProps {
  spans: ViewerTraceSpan[];
  className?: string;
  initialTraceLevel?: number;
  selectedId?: string | null;
  onSelectedIdChange?: (id: string | null) => void;
  usageContext?: UsageContext;
  /** Takes over the detail column while no span is selected (usage summary). */
  detailOverride?: ReactNode;
  /**
   * Detail-column override for the selected span. Return null/undefined to
   * fall back to the standard SpanDetailPanel, so only known spans (tool
   * calls with transcript data) get the rich treatment.
   */
  renderSpanDetail?: (span: ViewerTraceSpan) => ReactNode;
}

export function CanvasTraceViewer({
  spans,
  className,
  initialTraceLevel = 2,
  selectedId: controlledSelectedId,
  onSelectedIdChange,
  usageContext,
  detailOverride,
  renderSpanDetail,
}: CanvasTraceViewerProps) {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const [expandedSpansIds, setExpandedSpansIds] = useState<string[]>([]);
  const [level, setLevel] = useState<number>(initialTraceLevel);
  const didInitExpand = useRef(false);

  const selectedId = controlledSelectedId ?? internalSelectedId;
  const setSelectedId = (id: string | null) => {
    setInternalSelectedId(id);
    onSelectedIdChange?.(id);
  };

  useEffect(() => {
    if (didInitExpand.current || spans.length === 0) return;
    didInitExpand.current = true;
    // Expand the entire tree (recursively) on first load.
    setExpandedSpansIds(collectSpanIds(spans));
  }, [spans]);

  const filteredSpans = useMemo(
    () => filterSpansByTraceLevel(spans, level),
    [spans, level],
  );

  const allExpanded = useMemo(() => {
    const total = collectSpanIds(filteredSpans).length;
    return total > 0 && expandedSpansIds.length >= total;
  }, [expandedSpansIds, filteredSpans]);

  const selectedSpan = useMemo(
    () => (selectedId ? findSpanInTree(filteredSpans, selectedId) : null),
    [filteredSpans, selectedId],
  );

  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpandedSpansIds([]);
    } else {
      setExpandedSpansIds(collectSpanIds(filteredSpans));
    }
  };

  if (spans.length === 0) {
    return (
      <div className={className}>
        <div className="flex h-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
          No events yet
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex min-h-0 flex-1 gap-3 font-mono">
        <div className="flex w-[62.5%] min-h-0 flex-col overflow-hidden rounded-[3px] border border-border bg-card">
          <div className="flex h-[72px] shrink-0 items-center gap-4 border-b border-border bg-muted/30 px-3">
            <TraceLevelSlider levels={TRACE_LEVELS} value={level} onChange={setLevel} />
            <button
              type="button"
              onClick={toggleExpandAll}
              className="ml-auto rounded-[2px] border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-status-success-border hover:text-status-success"
            >
              {allExpanded ? "Collapse All" : "Expand All"}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <TreeView
              spans={filteredSpans}
              selectedSpan={selectedSpan ?? undefined}
              onSpanSelect={(span) => setSelectedId(span.id)}
              expandedSpansIds={expandedSpansIds}
              onExpandSpansIdsChange={setExpandedSpansIds}
            />
          </div>
        </div>
        <div className="w-[37.5%] overflow-hidden rounded-[3px] border border-border bg-card">
          <TraceViewerApiContext.Provider value={API_CONTEXT_VALUE}>
            {selectedSpan ? (
              renderSpanDetail?.(selectedSpan) ?? (
                <SpanDetailPanel span={selectedSpan} usageContext={usageContext} />
              )
            ) : (
              detailOverride ?? <SpanDetailPanel span={null} />
            )}
          </TraceViewerApiContext.Provider>
        </div>
      </div>
    </div>
  );
}

/**
 * Discrete L0–L3 level slider — a verbatim local copy of viewer-shell's
 * TraceLevelSlider (which the package doesn't export on its own). Clickable
 * "L#" markers with hover tooltips over a notched track; an invisible native
 * range input drives drag / click / keyboard.
 */
function TraceLevelSlider({
  levels,
  value,
  onChange,
  className,
}: {
  levels: readonly TraceLevelInfo[];
  value: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  const max = Math.max(levels.length - 1, 0);

  const positionFor = (idx: number) => (max === 0 ? 50 : (idx / max) * 100);

  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      {/* Level markers + hover tooltips */}
      <div className="relative h-3.5 w-48">
        {levels.map((levelInfo, idx) => {
          const isActive = idx <= value;
          const isCurrent = idx === value;
          // Keep tooltips inside the slider bounds at the edges.
          const tooltipAlign =
            idx === 0
              ? "left-0"
              : idx === max
                ? "right-0"
                : "left-1/2 -translate-x-1/2";
          return (
            <div
              key={levelInfo.marker}
              className="group absolute top-0 -translate-x-1/2"
              style={{ left: `${positionFor(idx)}%` }}
            >
              <button
                type="button"
                onClick={() => onChange(idx)}
                aria-label={`${levelInfo.marker} — ${levelInfo.name}: ${levelInfo.description}`}
                aria-pressed={isCurrent}
                className={`flex h-3.5 items-center text-[10px] font-bold uppercase tabular-nums tracking-[0.14em] transition-colors hover:text-status-success ${
                  isCurrent
                    ? "text-status-success"
                    : isActive
                      ? "text-muted-foreground"
                      : "text-muted-foreground/45"
                }`}
              >
                {levelInfo.marker}
              </button>
              <div
                role="tooltip"
                className={`pointer-events-none absolute top-full z-40 mt-2 w-40 rounded-[3px] border border-border bg-card px-2.5 py-1.5 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 ${tooltipAlign}`}
              >
                <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-status-success">
                  {levelInfo.marker} · {levelInfo.name}
                </span>
                <span className="mt-0.5 block text-[10px] font-normal leading-snug text-muted-foreground">
                  {levelInfo.description}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Track + thumb */}
      <div className="relative h-3 w-48">
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="peer absolute inset-0 z-20 m-0 w-full cursor-pointer opacity-0 focus-visible:outline-none"
          aria-label="Trace level"
          aria-valuetext={levels[value]?.name}
        />
        {/* base track */}
        <div
          aria-hidden="true"
          className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-muted"
        />
        {/* filled track */}
        <div
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-status-success"
          style={{ width: `${positionFor(value)}%` }}
        />
        {/* tick marks at each level */}
        {levels.map((levelInfo, idx) => (
          <div
            key={levelInfo.marker}
            aria-hidden="true"
            className={`absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2 ${
              idx <= value ? "bg-status-success" : "bg-border"
            }`}
            style={{ left: `${positionFor(idx)}%` }}
          />
        ))}
        {/* thumb (purely visual; the invisible input drives interaction) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 z-10 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-status-success ring-2 ring-status-success/30 peer-focus-visible:ring-4 peer-focus-visible:ring-status-success/50"
          style={{ left: `${positionFor(value)}%` }}
        />
      </div>
    </div>
  );
}

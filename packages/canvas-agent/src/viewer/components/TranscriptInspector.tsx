import { useState, type ReactNode } from "react";
import { transcriptImagePath } from "../lib/kernel-api";
import type {
  SessionTranscript,
  TranscriptToolCallEntry,
} from "../hooks/use-transcript";

/**
 * The text surfaces of the transcript layer:
 *
 *   RunBrief — the initial user instruction + (collapsed by default) the
 *   agentContext block, pinned above the trace tree so "what was the agent
 *   asked to do" is visible without digging.
 *
 *   TranscriptToolCallDetail — the rich half of the inspector for a selected
 *   tool_call span: the turn's thinking, the tool params (propose_program's
 *   program string as scrollable monospace, everything else pretty-printed
 *   JSON), the full result text (error-styled when isError), the call's
 *   images at readable size, and the CONTEXT WINDOW button that opens the
 *   full reconstructed prompt for the turn (ContextWindowOverlay).
 *
 * TranscriptToolCallDetail renders below the upstream SpanDetailPanel inside
 * the same detail column, so it is styled as a continuation of that panel:
 * the same header treatment TabShell uses (chip + title on a border-b row),
 * the same section headers (`text-xs font-medium uppercase tracking-wider`)
 * and muted rounded pre blocks its tab renderers use. RunBrief lives in the
 * viewer's outer chrome and keeps the chrome's mono styling instead.
 */

const CHROME_LABEL =
  "font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground";

const CHROME_PRE_BLOCK =
  "overflow-auto rounded-[3px] border border-border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap";

/* Upstream detail-panel vocabulary (viewer-ui TabShell + tab renderers). */
const PANEL_SECTION_LABEL =
  "text-xs font-medium uppercase tracking-wider text-muted-foreground";

const PANEL_PRE_BLOCK =
  "overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-3 font-mono text-xs leading-relaxed";

const PANEL_CHIP =
  "inline-flex shrink-0 items-center justify-center rounded-md border border-border px-2 py-0.5 font-display text-xs font-medium uppercase tracking-wider text-foreground";

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h4 className={PANEL_SECTION_LABEL}>{label}</h4>
      {children}
    </section>
  );
}

export function RunBrief({
  transcript,
  className,
}: {
  transcript: SessionTranscript;
  className?: string;
}) {
  const [contextOpen, setContextOpen] = useState(false);

  const userMessages = transcript.pi_sessions.flatMap(
    (piSession) => piSession.userMessages ?? [],
  );
  const firstMessage = userMessages[0] ?? null;
  const followUps = userMessages.length - 1;
  const agentContext =
    transcript.pi_sessions.find((piSession) => piSession.agentContext)
      ?.agentContext ?? null;

  if (!firstMessage && !agentContext) return null;

  return (
    <div className={`border-b border-border/60 px-3 py-2 ${className ?? ""}`}>
      {firstMessage && (
        <div className="flex items-start gap-2">
          <span className={`${CHROME_LABEL} mt-0.5 shrink-0`}>User</span>
          <p className="max-h-24 min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap font-mono text-[12px] leading-5">
            {firstMessage.text}
          </p>
          {followUps > 0 && (
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              +{followUps} follow-up{followUps === 1 ? "" : "s"}
            </span>
          )}
        </div>
      )}
      {agentContext && (
        <div className={firstMessage ? "mt-1.5" : undefined}>
          <button
            type="button"
            onClick={() => setContextOpen((open) => !open)}
            aria-expanded={contextOpen}
            className="rounded-[2px] border border-border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-status-info-border hover:text-foreground"
          >
            {contextOpen ? "▾" : "▸"} Agent context
          </button>
          {contextOpen && (
            <pre className={`${CHROME_PRE_BLOCK} mt-1.5 max-h-56 text-muted-foreground`}>
              {agentContext}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function TranscriptToolCallDetail({
  entry,
  containerId,
  onOpenImage,
  onOpenContextWindow,
}: {
  entry: TranscriptToolCallEntry;
  containerId: string;
  /** Open the shared lightbox on this transcript image id. */
  onOpenImage: (imageId: string) => void;
  /** Open the reconstructed context window for this turn (when available). */
  onOpenContextWindow?: () => void;
}) {
  const { call, turn } = entry;

  // propose_program's payload is a program, not data — show it as code.
  const rawProgram = call.params?.program;
  const program =
    call.toolName === "propose_program" && typeof rawProgram === "string"
      ? rawProgram
      : null;
  const otherParams: Record<string, unknown> =
    program === null
      ? (call.params ?? {})
      : Object.fromEntries(
          Object.entries(call.params).filter(([key]) => key !== "program"),
        );
  const hasOtherParams = Object.keys(otherParams).length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b bg-background px-6 py-3">
        <span className={PANEL_CHIP}>transcript</span>
        <span className="truncate text-sm font-medium">{call.toolName}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          turn {turn.index}
        </span>
        {call.isError && (
          <span className="shrink-0 rounded-md border border-destructive/50 bg-destructive/10 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wider text-destructive">
            error
          </span>
        )}
        {onOpenContextWindow && (
          <button
            type="button"
            onClick={onOpenContextWindow}
            title={`Reconstruct the full prompt the model ran with for turn ${turn.index}`}
            className="ml-auto shrink-0 rounded-md border border-border px-2 py-0.5 font-display text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:border-status-info-border hover:text-foreground"
          >
            Context window
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
        {turn.thinking && (
          <Section label="Thinking">
            <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
              {turn.thinking}
            </p>
          </Section>
        )}
        {program !== null && (
          <Section label="Program">
            <pre className={`${PANEL_PRE_BLOCK} max-h-72`}>{program}</pre>
          </Section>
        )}
        {(program === null || hasOtherParams) && (
          <Section label="Params">
            <pre className={`${PANEL_PRE_BLOCK} max-h-56`}>
              {JSON.stringify(otherParams, null, 2)}
            </pre>
          </Section>
        )}
        <Section label="Result">
          {call.resultText !== null && call.resultText !== "" ? (
            <pre
              className={`max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md p-3 font-mono text-xs leading-relaxed ${
                call.isError
                  ? "border border-destructive/50 bg-destructive/10 text-destructive"
                  : "bg-muted/50"
              }`}
            >
              {call.resultText}
            </pre>
          ) : (
            <p className="font-mono text-xs text-muted-foreground/70">
              No result text.
            </p>
          )}
        </Section>
        {call.images.length > 0 && (
          <Section
            label={call.images.length === 1 ? "Image" : `Images · ${call.images.length}`}
          >
            <div className="flex flex-col gap-2">
              {call.images.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => onOpenImage(image.id)}
                  title="Click to enlarge"
                  className="focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-status-info-border"
                >
                  <img
                    src={transcriptImagePath(containerId, image.id)}
                    alt={`${call.toolName} render, turn ${turn.index}`}
                    loading="lazy"
                    className="w-full rounded-[2px] border border-border bg-black/20 object-contain transition-colors hover:border-status-info-border"
                  />
                </button>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

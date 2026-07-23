import { useEffect, useMemo, useState, type ReactNode } from "react";
import { transcriptImagePath } from "./kernel-api";
import type {
  TranscriptPiSession,
  TranscriptToolCall,
  TranscriptTurn,
  TranscriptUserMessage,
} from "./use-transcript";

/**
 * CONTEXT WINDOW overlay — "here is the full prompt the model ran with" for a
 * selected turn, reconstructed client-side from data the viewer already has:
 *
 *   - the full rendered system prompt (the trace's system_prompt_resolved
 *     event), collapsed by default because it is long
 *   - the pi session's agent context and user message(s)
 *   - every prior turn in conversation order: thinking, assistant text, tool
 *     calls (program as monospace code) and their results + rendered images
 *   - the actual input-token count for the turn when the trace's pi_turn_end
 *     usage aligns (see TraceDetailView's join); omitted otherwise
 *
 * Interaction family matches the lightbox: full-screen dark backdrop, esc /
 * backdrop click / CLOSE to dismiss. Thumbnails in here open the shared
 * TranscriptLightbox on top (z-50 over this overlay's z-40); while the
 * lightbox is open this overlay's esc handler is suspended so esc closes the
 * lightbox first.
 */

const SECTION_LABEL =
  "text-xs font-medium uppercase tracking-wider text-muted-foreground";

const SUB_LABEL =
  "text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60";

const PRE_BLOCK =
  "whitespace-pre-wrap break-words rounded-md bg-muted/50 p-3 font-mono text-xs leading-relaxed";

const CHIP =
  "inline-flex shrink-0 items-center justify-center rounded-md border border-border px-2 py-0.5 font-display text-xs font-medium uppercase tracking-wider text-foreground";

const GHOST_BUTTON =
  "rounded-md border border-border px-2 py-0.5 font-display text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:border-status-info-border hover:text-foreground";

function Section({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1">
      <h4 className={SECTION_LABEL}>{label}</h4>
      {children}
    </section>
  );
}

/**
 * A monospace block that collapses to a few lines when the text is long,
 * with an expand/collapse toggle. Short text renders as a plain block.
 */
function CollapsibleBlock({
  text,
  tone = "default",
}: {
  text: string;
  tone?: "default" | "error";
}) {
  const [open, setOpen] = useState(false);
  const isLong = text.length > 360 || text.split("\n").length > 6;
  const toneClass =
    tone === "error"
      ? "border border-destructive/50 bg-destructive/10 text-destructive"
      : "";
  const sizeClass = open
    ? "max-h-96 overflow-auto"
    : isLong
      ? "max-h-24 overflow-hidden"
      : "";
  return (
    <div>
      <pre className={`${PRE_BLOCK} ${toneClass} ${sizeClass}`}>{text}</pre>
      {isLong && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className={`${GHOST_BUTTON} mt-1`}
        >
          {open ? "Collapse" : "Expand"}
        </button>
      )}
    </div>
  );
}

/** One entry of the reconstructed conversation, in order. */
type ContextItem =
  | { kind: "user"; key: string; message: TranscriptUserMessage }
  | { kind: "turn"; key: string; turn: TranscriptTurn };

/**
 * Everything the model had in context before producing turn `turnIndex`:
 * user messages interleaved with turns 0..turnIndex-1 by timestamp (turn
 * timestamps are end-of-turn, so a message is placed before the first prior
 * turn that ended after it). Messages without timestamps sort first — the
 * initial instruction. Messages stamped after the selected turn began are
 * excluded; without timestamps to compare we keep them (over-inclusion beats
 * silently hiding context).
 */
function buildContextItems(
  piSession: TranscriptPiSession,
  turnIndex: number,
): ContextItem[] {
  const turns = piSession.turns ?? [];
  const priorTurns = turns
    .filter((turn) => turn.index < turnIndex)
    .sort((a, b) => a.index - b.index);
  const boundary =
    turns.find((turn) => turn.index === turnIndex)?.timestamp ?? null;

  const remaining = (piSession.userMessages ?? []).filter(
    (message) =>
      !message.timestamp || !boundary || message.timestamp < boundary,
  );

  const items: ContextItem[] = [];
  const takeMessagesBefore = (turnTimestamp: string | null) => {
    while (remaining.length > 0) {
      const message = remaining[0];
      if (
        !message.timestamp ||
        (turnTimestamp !== null && message.timestamp <= turnTimestamp)
      ) {
        items.push({ kind: "user", key: `user-${items.length}`, message });
        remaining.shift();
      } else {
        break;
      }
    }
  };

  for (const turn of priorTurns) {
    takeMessagesBefore(turn.timestamp);
    items.push({ kind: "turn", key: `turn-${turn.index}`, turn });
  }
  for (const message of remaining) {
    items.push({ kind: "user", key: `user-${items.length}`, message });
  }
  return items;
}

function ToolCallBlock({
  call,
  turnIndex,
  containerId,
  onOpenImage,
}: {
  call: TranscriptToolCall;
  turnIndex: number;
  containerId: string;
  onOpenImage: (imageId: string) => void;
}) {
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
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className={CHIP}>{call.toolName}</span>
        {call.isError && (
          <span className="rounded-md border border-destructive/50 bg-destructive/10 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wider text-destructive">
            error
          </span>
        )}
      </div>
      {program !== null && (
        <div className="space-y-0.5">
          <span className={SUB_LABEL}>Program</span>
          <CollapsibleBlock text={program} />
        </div>
      )}
      {hasOtherParams && (
        <div className="space-y-0.5">
          <span className={SUB_LABEL}>Params</span>
          <CollapsibleBlock text={JSON.stringify(otherParams, null, 2)} />
        </div>
      )}
      <div className="space-y-0.5">
        <span className={SUB_LABEL}>Result</span>
        {call.resultText !== null && call.resultText !== "" ? (
          <CollapsibleBlock
            text={call.resultText}
            tone={call.isError ? "error" : "default"}
          />
        ) : (
          <p className="font-mono text-xs text-muted-foreground/60">
            No result recorded.
          </p>
        )}
      </div>
      {(call.images ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {call.images.map((image) => (
            <button
              key={image.id}
              type="button"
              onClick={() => onOpenImage(image.id)}
              title="Click to enlarge"
              className="shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-status-info-border"
            >
              <img
                src={transcriptImagePath(containerId, image.id)}
                alt={`${call.toolName} render, turn ${turnIndex}`}
                loading="lazy"
                className="h-20 w-auto max-w-[200px] rounded-[2px] border border-border bg-black/20 object-contain transition-colors hover:border-status-info-border"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TurnBlock({
  turn,
  containerId,
  onOpenImage,
}: {
  turn: TranscriptTurn;
  containerId: string;
  onOpenImage: (imageId: string) => void;
}) {
  return (
    <section className="space-y-2 border-l-2 border-border/60 pl-3">
      <h4 className={SECTION_LABEL}>Turn {turn.index}</h4>
      {turn.thinking && (
        <div className="space-y-0.5">
          <span className={SUB_LABEL}>Thinking</span>
          <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
            {turn.thinking}
          </p>
        </div>
      )}
      {turn.text && (
        <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
          {turn.text}
        </p>
      )}
      {(turn.toolCalls ?? []).map((call, index) => (
        <ToolCallBlock
          key={call.toolUseId || `${turn.index}-${index}`}
          call={call}
          turnIndex={turn.index}
          containerId={containerId}
          onOpenImage={onOpenImage}
        />
      ))}
    </section>
  );
}

export function ContextWindowOverlay({
  piSession,
  turnIndex,
  systemPrompt,
  inputTokens,
  containerId,
  keysSuspended,
  onClose,
  onOpenImage,
}: {
  piSession: TranscriptPiSession;
  turnIndex: number;
  /** Full rendered system prompt (system_prompt_resolved), when traced. */
  systemPrompt: string | null;
  /** Actual input tokens for this turn (pi_turn_end usage), when aligned. */
  inputTokens: number | null;
  containerId: string;
  /** True while the lightbox is open on top — suspends this esc handler. */
  keysSuspended: boolean;
  onClose: () => void;
  /** Open the shared lightbox on this transcript image id. */
  onOpenImage: (imageId: string) => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (keysSuspended) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [keysSuspended, onClose]);

  const items = useMemo(
    () => buildContextItems(piSession, turnIndex),
    [piSession, turnIndex],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Context window for turn ${turnIndex}`}
      className="fixed inset-0 z-40 flex justify-center bg-black/85 p-6"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-[3px] border border-border bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-6 py-4">
          <span className={CHIP}>context window</span>
          <span className="text-sm font-medium">turn {turnIndex}</span>
          {inputTokens !== null && (
            <span className="text-xs text-muted-foreground">
              {inputTokens.toLocaleString("en-US")} tokens in
            </span>
          )}
          <button type="button" onClick={onClose} className={`${GHOST_BUTTON} ml-auto`}>
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
          {systemPrompt && (
            <Section label="System prompt">
              <CollapsibleBlock text={systemPrompt} />
            </Section>
          )}
          {piSession.agentContext && (
            <Section label="Agent context">
              <CollapsibleBlock text={piSession.agentContext} />
            </Section>
          )}
          {items.map((item) =>
            item.kind === "user" ? (
              <Section key={item.key} label="User">
                <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                  {item.message.text}
                </p>
              </Section>
            ) : (
              <TurnBlock
                key={item.key}
                turn={item.turn}
                containerId={containerId}
                onOpenImage={onOpenImage}
              />
            ),
          )}
          <div className="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <span aria-hidden="true">→</span>
            <span className="font-medium uppercase tracking-wider">
              model output for turn {turnIndex} follows
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

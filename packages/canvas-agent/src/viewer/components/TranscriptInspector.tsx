import { useState } from "react";
import { CLAMP, DocFigure } from "@agent-kernel/viewer-ui";
import type { SessionTranscript } from "../hooks/use-transcript";

/**
 * RunBrief surfaces the run's initial user instruction and collapsible agent
 * context above the shared trace viewer. Tool-call transcript additions now
 * use the kernel's data-only detail-block seam instead of a second inspector.
 */

const CHROME_LABEL =
  "font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground";

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
            <div className="mt-1.5">
              <DocFigure
                caption="Agent context"
                body={agentContext}
                language="text"
                clamp={CLAMP.tight}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

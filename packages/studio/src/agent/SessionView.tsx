import { useState, type FormEvent, type ReactNode } from "react";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas";
import type {
  AgentProposal,
  AgentSessionEvent,
} from "@codecaine-ai/canvas-agent/protocol";
import { Button } from "@codecaine-ai/canvas/ui/button";
import { ChevronDownIcon, ExpandIcon } from "@codecaine-ai/canvas/ui/icons";
import { Input } from "@codecaine-ai/canvas/ui/input";
import {
  AgentRenderViewer,
  agentOperationRenderUrl,
  type AgentRenderTarget,
  useAgentRenderViewer,
} from "./AgentRenderViewer";
import { DeltaCard } from "./DeltaCard";
import { describeEvent } from "./stream-copy";
import type {
  AgentAcceptConflict,
  AgentAcceptResult,
  AgentSessionAbandonment,
  AgentSessionAttemptState,
  AgentSessionUiStatus,
} from "./use-agent-session";

export type AgentSessionViewStatus = AgentSessionUiStatus;

export type AgentSessionViewAttempt = Pick<
  AgentSessionAttemptState,
  "instruction" | "events"
>;

export type AgentAbandonedState = AgentSessionAbandonment;

export type AgentAcceptedNotice = Pick<AgentAcceptResult, "summary" | "rebased">;

export interface SessionViewProps {
  status: AgentSessionViewStatus;
  canvasId: string;
  sessionId: string | null;
  attempts: readonly AgentSessionViewAttempt[];
  baselineDocument: InteractiveCanvasDocument;
  proposal: AgentProposal | null;
  lastGoodProposal: AgentProposal | null;
  abandoned?: AgentAbandonedState | null;
  error?: string | null;
  harnessUnavailable?: boolean;
  acceptConflict?: AgentAcceptConflict | null;
  onRefine(instruction: string): void | Promise<void>;
  onAccept(): void | Promise<unknown>;
  onReject(): void | Promise<void>;
  onRetry(): void | Promise<void>;
  onClose(): void;
  onDiscardConflict(): void | Promise<void>;
  onTryAgainOnCurrentBoard(): void | Promise<void>;
  onStartOver?: (instruction: string) => void | Promise<void>;
  /** AgentSidebar supplies this so its header and feed share one render viewer. */
  onOpenRender?: (target: AgentRenderTarget) => void;
}

function Banner({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-border/70 bg-muted/50 p-3 text-xs leading-relaxed">
      {children}
    </div>
  );
}

function BannerActions({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex flex-wrap gap-2">{children}</div>;
}

function ViewOperationRenderButton({
  canvasId,
  event,
  onOpenRender,
}: {
  canvasId: string;
  event: Extract<AgentSessionEvent, { type: "delta" }>;
  onOpenRender(target: AgentRenderTarget): void;
}) {
  const label = `View render after operation ${event.n}`;

  return (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      className="shrink-0 text-muted-foreground hover:text-foreground"
      aria-label={label}
      title={label}
      onClick={() =>
        onOpenRender({
          src: agentOperationRenderUrl(canvasId, event.sessionId, event.n),
          caption: `Board after operation ${event.n}`,
        })
      }
    >
      <ExpandIcon className="h-3 w-3" />
    </Button>
  );
}

function DeltaEventLine({
  canvasId,
  event,
  onOpenRender,
}: {
  canvasId: string;
  event: Extract<AgentSessionEvent, { type: "delta" }>;
  onOpenRender(target: AgentRenderTarget): void;
}) {
  const lines = event.delta
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = lines[0] ?? "Checked the proposed changes.";

  if (lines.length <= 1) {
    return (
      <div className="flex items-start gap-1.5">
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
          {firstLine}
        </p>
        <ViewOperationRenderButton
          canvasId={canvasId}
          event={event}
          onOpenRender={onOpenRender}
        />
      </div>
    );
  }

  return (
    <div className="flex items-start gap-1.5">
      <details className="group min-w-0 flex-1 text-xs text-muted-foreground">
        <summary className="flex cursor-pointer list-none items-start gap-1.5 leading-relaxed hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronDownIcon className="mt-0.5 h-3 w-3 shrink-0 transition-transform group-open:rotate-180" />
          <span>{firstLine}</span>
        </summary>
        <div className="mt-1 whitespace-pre-wrap pl-[18px] text-[11px] leading-relaxed">
          {lines.slice(1).join("\n")}
        </div>
      </details>
      <ViewOperationRenderButton
        canvasId={canvasId}
        event={event}
        onOpenRender={onOpenRender}
      />
    </div>
  );
}

function EventLine({
  canvasId,
  event,
  onOpenRender,
}: {
  canvasId: string;
  event: AgentSessionEvent;
  onOpenRender(target: AgentRenderTarget): void;
}) {
  if (event.type === "delta") {
    return (
      <DeltaEventLine
        canvasId={canvasId}
        event={event}
        onOpenRender={onOpenRender}
      />
    );
  }
  const description = describeEvent(event);
  return description ? (
    <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
  ) : null;
}

function AttemptGroup({
  attempt,
  canvasId,
  onOpenRender,
}: {
  attempt: AgentSessionViewAttempt;
  canvasId: string;
  onOpenRender(target: AgentRenderTarget): void;
}) {
  return (
    <section className="space-y-2.5">
      <div className="ml-8 rounded-xl rounded-tr-sm bg-primary px-3 py-2 text-xs leading-relaxed text-primary-foreground">
        <span className="sr-only">You asked: </span>
        {attempt.instruction}
      </div>
      <div className="space-y-2 border-l border-border/70 pl-3">
        {attempt.events.map((event, index) => (
          <EventLine
            key={`${event.type}-${index}`}
            canvasId={canvasId}
            event={event}
            onOpenRender={onOpenRender}
          />
        ))}
        {attempt.events.length === 0 ? (
          <p className="text-xs leading-relaxed text-muted-foreground">Getting started…</p>
        ) : null}
      </div>
    </section>
  );
}

export function SessionView({
  status,
  canvasId,
  attempts,
  baselineDocument,
  proposal,
  lastGoodProposal,
  abandoned = null,
  error = null,
  harnessUnavailable = false,
  acceptConflict = null,
  onRefine,
  onAccept,
  onReject,
  onRetry,
  onClose,
  onDiscardConflict,
  onTryAgainOnCurrentBoard,
  onStartOver,
  onOpenRender,
}: SessionViewProps) {
  const [refinement, setRefinement] = useState("");
  const localRenderViewer = useAgentRenderViewer();
  const openRender = onOpenRender ?? localRenderViewer.openRender;
  const fallbackProposal = abandoned ? lastGoodProposal : null;
  const visibleProposal = proposal ?? fallbackProposal;
  const isRunning = status === "running";
  const canReview = status === "proposal-ready" || Boolean(abandoned && fallbackProposal);
  const lastInstruction = attempts.at(-1)?.instruction ?? "";

  const submitRefinement = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const instruction = refinement.trim();
    if (!instruction || !canReview) return;
    setRefinement("");
    void onRefine(instruction);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3" aria-live="polite">
        {acceptConflict ? (
          <Banner>
            <p>
              The board changed while the agent was working, and the proposal no longer fits.
              Nothing was applied.
            </p>
            <BannerActions>
              <Button type="button" size="xs" variant="outline" onClick={() => void onDiscardConflict()}>
                Discard
              </Button>
              <Button type="button" size="xs" onClick={() => void onTryAgainOnCurrentBoard()}>
                Try again on the current board
              </Button>
            </BannerActions>
          </Banner>
        ) : harnessUnavailable ? (
          <Banner>
            <p>
              The agent service isn&rsquo;t running — start it with <code>make studio</code>.
            </p>
            <BannerActions>
              <Button type="button" size="xs" onClick={() => void onRetry()}>
                Retry
              </Button>
              <Button type="button" size="xs" variant="outline" onClick={onClose}>
                Close
              </Button>
            </BannerActions>
          </Banner>
        ) : abandoned ? (
          <Banner>
            {fallbackProposal ? (
              <p>
                Draft {abandoned.attemptNumber} was abandoned. Proposal {fallbackProposal.n} is still
                available.
              </p>
            ) : (
              <>
                {abandoned.reason ? <p className="mb-1">{abandoned.reason}</p> : null}
                <p>
                  The agent couldn&rsquo;t find an arrangement that fit. Try fewer notes or a smaller
                  ask.
                </p>
              </>
            )}
            {onStartOver && lastInstruction ? (
              <BannerActions>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => void onStartOver(lastInstruction)}
                >
                  Start over with this instruction
                </Button>
              </BannerActions>
            ) : null}
          </Banner>
        ) : error ? (
          <Banner>
            <p>Something failed: {error}</p>
            <BannerActions>
              <Button type="button" size="xs" onClick={() => void onRetry()}>
                Retry
              </Button>
              <Button type="button" size="xs" variant="outline" onClick={onClose}>
                Close
              </Button>
            </BannerActions>
          </Banner>
        ) : null}

        <div className="space-y-5">
          {attempts.map((attempt, index) => (
            <AttemptGroup
              key={`${index}-${attempt.instruction}`}
              attempt={attempt}
              canvasId={canvasId}
              onOpenRender={openRender}
            />
          ))}
        </div>

        {visibleProposal ? (
          <DeltaCard baselineDocument={baselineDocument} proposal={visibleProposal} />
        ) : null}
      </div>

      {!acceptConflict && !harnessUnavailable && !error ? (
        <div className="space-y-2 border-t border-border/70 p-3">
          <form className="flex gap-2" onSubmit={submitRefinement}>
            <Input
              value={refinement}
              aria-label="Refine the proposal"
              placeholder="Refine…"
              disabled={!canReview}
              onChange={(event) => setRefinement(event.target.value)}
            />
            <Button type="submit" size="sm" variant="outline" disabled={!canReview || !refinement.trim()}>
              Send
            </Button>
          </form>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm" disabled={!canReview || isRunning} onClick={() => void onAccept()}>
              Accept
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isRunning}
              onClick={() => void onReject()}
            >
              Reject
            </Button>
          </div>
        </div>
      ) : null}
      {onOpenRender ? null : (
        <AgentRenderViewer
          target={localRenderViewer.target}
          onClose={localRenderViewer.closeRender}
        />
      )}
    </div>
  );
}

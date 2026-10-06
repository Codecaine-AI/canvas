import { useState } from "react";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas";
import type { AgentProposal } from "@codecaine-ai/canvas-agent/protocol";
import { Button } from "@codecaine-ai/canvas/ui/button";
import {
  AgentRenderViewer,
  type AgentRenderTarget,
  useAgentRenderViewer,
} from "../AgentRenderViewer";
import { AttemptGroup } from "./_components/AttemptGroup";
import { DeltaCard } from "./_components/DeltaCard";
import { RefineForm } from "./_components/RefineForm";
import { SessionBanners } from "./_components/SessionBanners";
import type { AgentAcceptConflict } from "@/shared/agent";
import type {
  AgentAbandonedState,
  AgentSessionViewAttempt,
  AgentSessionViewStatus,
} from "./types";

export type {
  AgentAbandonedState,
  AgentAcceptedNotice,
  AgentSessionViewAttempt,
  AgentSessionViewStatus,
} from "./types";

export type SessionViewProps = {
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
};

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3" aria-live="polite">
        <SessionBanners
          acceptConflict={acceptConflict}
          harnessUnavailable={harnessUnavailable}
          abandoned={abandoned}
          error={error}
          fallbackProposal={fallbackProposal}
          lastInstruction={lastInstruction}
          onRetry={onRetry}
          onClose={onClose}
          onDiscardConflict={onDiscardConflict}
          onTryAgainOnCurrentBoard={onTryAgainOnCurrentBoard}
          onStartOver={onStartOver}
        />

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
          <RefineForm
            refinement={refinement}
            setRefinement={setRefinement}
            canReview={canReview}
            onRefine={onRefine}
          />
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

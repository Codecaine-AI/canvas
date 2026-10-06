import { Button } from "@codecaine-ai/canvas/ui/button";
import type { AgentProposal } from "@codecaine-ai/canvas-agent/protocol";
import type { AgentAcceptConflict } from "@/shared/agent";
import type { AgentAbandonedState } from "../../types";
import { Banner } from "./_components/Banner";
import { BannerActions } from "./_components/BannerActions";

export type SessionBannersProps = {
  acceptConflict: AgentAcceptConflict | null;
  harnessUnavailable: boolean;
  abandoned: AgentAbandonedState | null;
  error: string | null;
  fallbackProposal: AgentProposal | null;
  lastInstruction: string;
  onRetry(): void | Promise<void>;
  onClose(): void;
  onDiscardConflict(): void | Promise<void>;
  onTryAgainOnCurrentBoard(): void | Promise<void>;
  onStartOver?: (instruction: string) => void | Promise<void>;
};

export function SessionBanners({
  acceptConflict,
  harnessUnavailable,
  abandoned,
  error,
  fallbackProposal,
  lastInstruction,
  onRetry,
  onClose,
  onDiscardConflict,
  onTryAgainOnCurrentBoard,
  onStartOver,
}: SessionBannersProps) {
  return acceptConflict ? (
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
  ) : null;
}

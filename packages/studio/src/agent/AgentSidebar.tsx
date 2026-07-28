import { Button } from "@codecaine-ai/canvas/ui/button";
import { ExpandIcon, XIcon } from "@codecaine-ai/canvas/ui/icons";
import {
  AgentRenderViewer,
  agentBoardRenderUrl,
  useAgentRenderViewer,
} from "./AgentRenderViewer";
import { QueueView, type QueueViewProps } from "./QueueView";
import {
  SessionView,
  type AgentAcceptedNotice,
  type AgentSessionViewStatus,
  type SessionViewProps,
} from "./SessionView";

export interface AgentSidebarProps {
  status: AgentSessionViewStatus;
  onClose(): void;
  queue: Omit<QueueViewProps, "description" | "pinningTargetLabel">;
  session: Omit<SessionViewProps, "status" | "onOpenRender">;
  acceptedResult?: AgentAcceptedNotice | null;
  description?: string;
  pinningTargetLabel?: string | null;
}

const STATUS_LABELS: Record<AgentSessionViewStatus, string> = {
  idle: "idle",
  running: "working",
  "proposal-ready": "ready",
  accepted: "applied",
  rejected: "stopped",
  failed: "needs attention",
};

const STATUS_DOT_CLASSES: Record<AgentSessionViewStatus, string> = {
  idle: "bg-muted-foreground/50",
  running: "animate-pulse bg-amber-500",
  "proposal-ready": "bg-emerald-500",
  accepted: "bg-emerald-500",
  rejected: "bg-muted-foreground/50",
  failed: "bg-destructive",
};

function sentence(text: string): string {
  const trimmed = text.trim();
  return trimmed ? `${trimmed.replace(/[.!?]+$/, "")}.` : "Changes applied.";
}

export function AgentSidebar({
  status,
  onClose,
  queue,
  session,
  acceptedResult = null,
  description,
  pinningTargetLabel,
}: AgentSidebarProps) {
  const showQueue = status === "idle" || status === "accepted" || status === "rejected";
  const renderViewer = useAgentRenderViewer();
  const currentSessionId = session.sessionId;

  return (
    <aside
      aria-label="Agent"
      className="absolute bottom-24 right-4 top-20 z-20 flex w-[320px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-md border border-border/70 bg-background/95 shadow-xl backdrop-blur"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Agent
          </h1>
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_CLASSES[status]}`}
            aria-hidden="true"
          />
          <span className="truncate text-[11px] text-muted-foreground">
            {STATUS_LABELS[status]}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!showQueue && currentSessionId ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="text-muted-foreground"
              aria-label="View current board"
              title="View current board"
              onClick={() =>
                renderViewer.openRender({
                  src: agentBoardRenderUrl(session.canvasId, currentSessionId),
                  caption: "Current board",
                })
              }
            >
              <ExpandIcon className="h-3 w-3" />
              Current board
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Close Agent"
            title="Close Agent"
            onClick={onClose}
          >
            <XIcon className="h-3 w-3" />
          </Button>
        </div>
      </header>

      {showQueue ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {status === "accepted" && acceptedResult ? (
            <div className="mx-3 mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs leading-relaxed">
              <p>
                Applied: {sentence(acceptedResult.summary)} ⌘Z undoes.
              </p>
              {acceptedResult.rebased ? (
                <p className="mt-1 text-muted-foreground">
                  The board had changed, so the layout was refit onto the current arrangement.
                </p>
              ) : null}
            </div>
          ) : null}
          <QueueView
            {...queue}
            description={description}
            pinningTargetLabel={pinningTargetLabel}
          />
        </div>
      ) : (
        <SessionView
          {...session}
          status={status}
          onOpenRender={renderViewer.openRender}
        />
      )}
      <AgentRenderViewer
        target={renderViewer.target}
        onClose={renderViewer.closeRender}
      />
    </aside>
  );
}

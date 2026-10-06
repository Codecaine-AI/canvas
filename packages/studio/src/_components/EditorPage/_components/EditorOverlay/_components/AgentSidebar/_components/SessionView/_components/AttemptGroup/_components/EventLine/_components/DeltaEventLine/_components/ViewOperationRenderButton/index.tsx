import type { AgentSessionEvent } from "@codecaine-ai/canvas-agent/protocol";
import { Button } from "@codecaine-ai/canvas/ui/button";
import { ExpandIcon } from "@codecaine-ai/canvas/ui/icons";
import {
  agentOperationRenderUrl,
  type AgentRenderTarget,
} from "@/_components/EditorPage/_components/EditorOverlay/_components/AgentSidebar/_components/AgentRenderViewer";

export type ViewOperationRenderButtonProps = {
  canvasId: string;
  event: Extract<AgentSessionEvent, { type: "delta" }>;
  onOpenRender(target: AgentRenderTarget): void;
};

export function ViewOperationRenderButton({
  canvasId,
  event,
  onOpenRender,
}: ViewOperationRenderButtonProps) {
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

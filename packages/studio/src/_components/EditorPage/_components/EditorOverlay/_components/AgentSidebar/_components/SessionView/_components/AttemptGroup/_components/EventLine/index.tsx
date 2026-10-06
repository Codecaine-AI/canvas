import type { AgentSessionEvent } from "@codecaine-ai/canvas-agent/protocol";
import type { AgentRenderTarget } from "@/_components/EditorPage/_components/EditorOverlay/_components/AgentSidebar/_components/AgentRenderViewer";
import { DeltaEventLine } from "./_components/DeltaEventLine";
import { describeEvent } from "./stream-copy";

export type EventLineProps = {
  canvasId: string;
  event: AgentSessionEvent;
  onOpenRender(target: AgentRenderTarget): void;
};

export function EventLine({
  canvasId,
  event,
  onOpenRender,
}: EventLineProps) {
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
    <p className="text-ui-xs leading-ui text-muted-foreground">{description}</p>
  ) : null;
}

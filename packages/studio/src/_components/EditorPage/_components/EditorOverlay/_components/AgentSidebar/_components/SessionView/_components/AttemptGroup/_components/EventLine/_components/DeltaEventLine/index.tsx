import type { AgentSessionEvent } from "@codecaine-ai/canvas-agent/protocol";
import { ChevronDownIcon } from "@codecaine-ai/canvas/ui/icons";
import type { AgentRenderTarget } from "@/_components/EditorPage/_components/EditorOverlay/_components/AgentSidebar/_components/AgentRenderViewer";
import { ViewOperationRenderButton } from "./_components/ViewOperationRenderButton";

export type DeltaEventLineProps = {
  canvasId: string;
  event: Extract<AgentSessionEvent, { type: "delta" }>;
  onOpenRender(target: AgentRenderTarget): void;
};

export function DeltaEventLine({
  canvasId,
  event,
  onOpenRender,
}: DeltaEventLineProps) {
  const lines = event.delta
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = lines[0] ?? "Checked the proposed changes.";

  if (lines.length <= 1) {
    return (
      <div className="flex items-start gap-1.5">
        <p className="min-w-0 flex-1 text-ui-xs leading-ui text-muted-foreground">
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
      <details className="group min-w-0 flex-1 text-ui-xs text-muted-foreground">
        <summary className="flex cursor-pointer list-none items-start gap-1.5 leading-ui hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronDownIcon className="mt-0.5 h-3 w-3 shrink-0 transition-transform group-open:rotate-180" />
          <span>{firstLine}</span>
        </summary>
        <div className="mt-1 whitespace-pre-wrap pl-4.5 text-ui-2xs leading-ui">
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

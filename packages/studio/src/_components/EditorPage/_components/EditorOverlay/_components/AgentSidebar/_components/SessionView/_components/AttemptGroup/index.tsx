import type { AgentRenderTarget } from "@/_components/EditorPage/_components/EditorOverlay/_components/AgentSidebar/_components/AgentRenderViewer";
import type { AgentSessionViewAttempt } from "../../types";
import { EventLine } from "./_components/EventLine";

export type AttemptGroupProps = {
  attempt: AgentSessionViewAttempt;
  canvasId: string;
  onOpenRender(target: AgentRenderTarget): void;
};

export function AttemptGroup({
  attempt,
  canvasId,
  onOpenRender,
}: AttemptGroupProps) {
  return (
    <section className="space-y-2.5">
      <div className="ml-8 rounded bg-primary px-3 py-2 text-ui-xs leading-ui text-primary-foreground">
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
          <p className="text-ui-xs leading-ui text-muted-foreground">Getting started…</p>
        ) : null}
      </div>
    </section>
  );
}

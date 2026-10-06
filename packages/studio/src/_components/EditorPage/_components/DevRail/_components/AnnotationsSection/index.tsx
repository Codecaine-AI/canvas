import type { InteractiveCanvasAnnotation } from "@codecaine-ai/canvas";
import { Empty } from "../Empty";
import { MonoLine } from "../MonoLine";
import { Section } from "../Section";

export type AnnotationsSectionProps = {
  annotations: InteractiveCanvasAnnotation[];
};

export function AnnotationsSection({ annotations }: AnnotationsSectionProps) {
  return (
    <Section title="Annotations">
      {annotations.length > 0 ? (
        <div className="flex flex-col gap-1">
          {annotations.map((annotation) => (
            <div key={annotation.id} className="flex items-baseline gap-1.5">
              <MonoLine>
                {annotation.id} · {annotation.status} ·{" "}
                {annotation.body.length > 40
                  ? `${annotation.body.slice(0, 40)}…`
                  : annotation.body || "(empty)"}
              </MonoLine>
              {annotation.intent === "agent-request" ? (
                <span className="shrink-0 rounded bg-accent px-1 py-0.5 text-micro font-medium uppercase tracking-micro text-accent-foreground">
                  agent request
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <Empty>No annotations on this board.</Empty>
      )}
    </Section>
  );
}

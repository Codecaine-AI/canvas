"use client";

import type { CanvasAction, CanvasSelection } from "../../../../state/actions";
import type { InteractiveCanvasDocument } from "../../../../state/schema";

export interface AnnotationPinsProps {
  document: InteractiveCanvasDocument;
  selection: CanvasSelection;
  dispatch: (action: CanvasAction) => void;
  zoom?: number;
}

/** How many turns a thread carries, opening post included. */
function threadLength(replyCount: number): number {
  return replyCount + 1;
}

/**
 * Editor-only world-overlay chips for the open annotation threads. The stage
 * overlay parent is pointer-events:none, so each chip explicitly opts back in.
 *
 * Both directions of the conversation get a pin in the same language — same
 * size, shape, and placement. A thread the user opened is the dark request
 * chip; a thread the agent opened is a question back, so it reads amber with a
 * `?`, findable at a glance without a second visual vocabulary.
 */
export function AnnotationPins({
  document,
  selection,
  dispatch,
  zoom = 1,
}: AnnotationPinsProps) {
  const objectById = new Map(document.objects.map((object) => [object.id, object]));
  const annotations = (document.annotations ?? []).filter(
    (annotation) =>
      annotation.status === "open" &&
      annotation.intent === "agent-request" &&
      annotation.target.kind === "object" &&
      objectById.has(annotation.target.objectId),
  );
  const counterScale = 1 / Math.max(zoom, 0.01);

  return (
    <div
      data-annotation-pins=""
      aria-label="Annotation threads"
      style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
    >
      {annotations.map((annotation) => {
        if (annotation.target.kind !== "object") return null;
        const object = objectById.get(annotation.target.objectId)!;
        const selected =
          selection.kind === "annotation" && selection.annotationId === annotation.id;
        const askedByAgent = annotation.createdBy === "agent";
        const turns = threadLength(annotation.replies.length);
        // A single-turn thread is just its post; author labels earn their
        // place once there is a conversation to attribute.
        const transcript = turns === 1
          ? annotation.body
          : [
            `${askedByAgent ? "Agent" : "You"}: ${annotation.body}`,
            ...annotation.replies.map((reply) =>
              `${reply.author === "agent" ? "Agent" : "You"}: ${reply.body}`),
          ].join("\n");
        return (
          <button
            key={annotation.id}
            type="button"
            data-annotation-pin={annotation.id}
            data-annotation-author={annotation.createdBy}
            data-annotation-turns={turns}
            aria-label={
              askedByAgent
                ? `Agent question: ${annotation.body}`
                : `Agent note: ${annotation.body}`
            }
            aria-pressed={selected}
            title={transcript}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              dispatch({
                type: "canvas.select",
                selection: { kind: "annotation", annotationId: annotation.id },
              });
            }}
            style={{
              position: "absolute",
              left: object.geometry.x + object.geometry.width,
              top: object.geometry.y,
              width: 24,
              height: 24,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: selected ? "2px solid #0D99FF" : "2px solid #FFFFFF",
              borderRadius: 999,
              background: askedByAgent ? "#E8A33D" : "#1D1D1D",
              color: askedByAgent ? "#1D1D1D" : "#FFFFFF",
              boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
              padding: 0,
              pointerEvents: "auto",
              cursor: "pointer",
              font: "700 13px/1 ui-sans-serif, system-ui, sans-serif",
              transform: `translate(-50%, -50%) scale(${counterScale})`,
              transformOrigin: "center",
              boxSizing: "border-box",
            }}
          >
            {askedByAgent ? "?" : "◉"}
          </button>
        );
      })}
    </div>
  );
}

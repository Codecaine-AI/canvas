"use client";

import { flat } from "@codecaine-ai/design-system";
import type { CanvasAction, CanvasSelection } from "../../../../state/actions";
import type { InteractiveCanvasDocument } from "../../../../state/schema";
import { boardMarkTheme } from "../../../../theme/canvas-style";
import { useCanvasStyle } from "../../../../theme/canvas-style-context";

export interface AnnotationPinsProps {
  document: InteractiveCanvasDocument;
  selection: CanvasSelection;
  dispatch: (action: CanvasAction) => void;
  zoom?: number;
}

/** The pin's small lift: kept FigJam value (no small-lift token; shadow.glass is a panel lift). */
const PIN_SHADOW = "0 1px 4px rgba(0,0,0,0.3)";

/** The pin glyph's type: bold UI type on a one-line box, from the resolved base tokens (the stage never reads host CSS). */
const PIN_FONT = `${flat.base["font.weight.bold"]} ${flat.base["font.size.ui-sm"]}/1 ${flat.base["font.family.sans"]}`;

/** How many turns a thread carries, opening post included. */
function threadLength(replyCount: number): number {
  return replyCount + 1;
}

/**
 * Editor-only world-overlay chips for the open annotation threads. The stage
 * overlay parent is pointer-events:none, so each chip explicitly opts back in.
 *
 * Both directions of the conversation get a pin in the same language — same
 * size, shape, and placement. A thread the user opened is the ink request
 * chip; a thread the agent opened is a question back, so it reads amber with a
 * `?`, findable at a glance without a second visual vocabulary.
 *
 * Pins are marks over the board, so they take the board's colors (decision
 * 56): the design-system theme matching the board (boardMarkTheme), resolved.
 * Request chip: color.annotation.text body, color.annotation.surface glyph.
 * Question chip: color.status.warning.solid body, its on-solid glyph. Ring:
 * color.annotation.surface, color.accent when selected. Lift: the original
 * small shadow (no small-lift token).
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
  const tokens = flat[boardMarkTheme(useCanvasStyle())];

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
              border: `2px solid ${selected ? tokens["color.accent"] : tokens["color.annotation.surface"]}`,
              borderRadius: flat.base["radius.pill"],
              background: askedByAgent ? tokens["color.status.warning.solid"] : tokens["color.annotation.text"],
              color: askedByAgent ? tokens["color.status.warning.on-solid"] : tokens["color.annotation.surface"],
              // A small lift for a 24px chip: no design-system token fits (shadow.glass
              // is a panel lift), so the original value stays (allowlisted, token gap).
              boxShadow: PIN_SHADOW,
              padding: 0,
              pointerEvents: "auto",
              cursor: "pointer",
              font: PIN_FONT,
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

"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cssVar } from "@codecaine-ai/design-system";
import type { CanvasPoint } from "../../../../state/geometry";
import type {
  CanvasAnnotationAuthor,
  InteractiveCanvasAnnotation,
} from "../../../../state/schema";
import { EDITOR_STYLE } from "../../components/editor-style";

const POPUP_ENTER_ANIMATION =
  "canvas-selection-toolbar-enter 140ms cubic-bezier(0.22, 1, 0.36, 1) both";
const POPUP_ANIMATION_STYLES = `
@keyframes canvas-selection-toolbar-enter {
  from {
    opacity: 0;
    transform: translate3d(0, 6px, 0);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  [data-annotation-popup] {
    animation-duration: 1ms !important;
  }
}
`;

export interface AnnotationPopupProps {
  anchor: CanvasPoint;
  targetLabel: string;
  onSave: (body: string) => void;
  onCancel: () => void;
  /** The thread already open on this target, if there is one. */
  thread?: InteractiveCanvasAnnotation;
  /** Appends one human turn to `thread`. Required for the thread to accept replies. */
  onReply?: (body: string) => void;
}

/** Body copy: the note, its replies and the composer. */
const BODY_FONT = {
  fontFamily: cssVar("font.family.sans"),
  fontSize: cssVar("font.size.ui-sm"),
  fontWeight: cssVar("font.weight.medium"),
  lineHeight: cssVar("line-height.reading"),
} as const;

const AUTHOR_LABELS: Record<CanvasAnnotationAuthor, string> = {
  human: "You",
  agent: "Agent",
  system: "System",
};

interface Turn {
  id: string;
  author: CanvasAnnotationAuthor;
  body: string;
}

/** The thread as turns, oldest first: the opening post, then every reply. */
function threadTurns(thread: InteractiveCanvasAnnotation): Turn[] {
  return [
    { id: thread.id, author: thread.createdBy, body: thread.body },
    ...thread.replies.map((reply) => ({
      id: reply.id,
      author: reply.author,
      body: reply.body,
    })),
  ];
}

/**
 * Dark screen-space annotation popup mounted at the annotate click point. With
 * no thread on the target it composes the opening post; with one it shows the
 * conversation and its box posts the next reply. Dark in both app themes: the
 * root sets `data-theme="dark"` and takes the annotation tokens.
 */
export function AnnotationPopup({
  anchor,
  targetLabel,
  onSave,
  onCancel,
  thread,
  onReply,
}: AnnotationPopupProps) {
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const replying = thread !== undefined && onReply !== undefined;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const stopPointerPropagation = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  const submit = (value: string) => {
    if (replying) {
      onReply(value);
      setBody("");
      return;
    }
    onSave(value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    if (body.trim()) submit(body);
  };

  return (
    <>
      <style>{POPUP_ANIMATION_STYLES}</style>
      <div
        data-annotation-popup=""
        data-theme="dark"
        className="pointer-events-auto absolute z-popover"
        style={{
          left: anchor.x + 12,
          top: anchor.y + 12,
          width: 280,
          borderRadius: EDITOR_STYLE.selectionToolbarRadius,
          background: cssVar("color.annotation.surface"),
          padding: 10,
          boxSizing: "border-box",
          boxShadow: EDITOR_STYLE.selectionToolbarShadow,
          animation: POPUP_ENTER_ANIMATION,
          willChange: "transform, opacity",
        }}
        onPointerDown={stopPointerPropagation}
      >
        <div
          data-annotation-target-label=""
          style={{
            marginBottom: 7,
            overflow: "hidden",
            color: cssVar("color.annotation.muted"),
            fontFamily: cssVar("font.family.sans"),
            fontSize: cssVar("font.size.ui-2xs"),
            fontWeight: cssVar("font.weight.semibold"),
            lineHeight: 1.25,
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {targetLabel}
        </div>
        {thread ? (
          <ol
            data-annotation-thread={thread.id}
            aria-label="Annotation thread"
            style={{
              margin: `0 0 ${cssVar("space.2")}`,
              maxHeight: 168,
              overflowY: "auto",
              listStyle: "none",
              padding: 0,
            }}
          >
            {threadTurns(thread).map((turn) => (
              <li key={turn.id} data-annotation-turn={turn.id} style={{ marginBottom: 7 }}>
                <div
                  style={{
                    color: cssVar("color.annotation.muted"),
                    fontFamily: cssVar("font.family.sans"),
                    fontSize: cssVar("font.size.micro"),
                    fontWeight: cssVar("font.weight.semibold"),
                    lineHeight: 1.2,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {AUTHOR_LABELS[turn.author]}
                </div>
                <div
                  style={{
                    marginTop: cssVar("space.0-5"),
                    color: cssVar("color.annotation.text"),
                    ...BODY_FONT,
                    overflowWrap: "anywhere",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {turn.body}
                </div>
              </li>
            ))}
          </ol>
        ) : null}
        <textarea
          ref={textareaRef}
          aria-label={replying ? "Reply to the agent" : "Note for the agent"}
          placeholder={replying ? "Reply…" : "Note for the agent…"}
          rows={3}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            display: "block",
            width: "100%",
            minHeight: 72,
            resize: "none",
            border: `${cssVar("border.width.hairline")} solid ${cssVar("color.annotation.border")}`,
            borderRadius: cssVar("radius.base"),
            outline: "none",
            background: cssVar("color.fill.chip"),
            color: cssVar("color.annotation.text"),
            caretColor: cssVar("color.annotation.text"),
            padding: "9px 10px",
            boxSizing: "border-box",
            ...BODY_FONT,
          }}
        />
      </div>
    </>
  );
}

export interface AnnotationHintProps {
  anchor: CanvasPoint;
  message?: string;
}

/**
 * Quiet, non-interactive feedback for annotate clicks that miss every object.
 * Dark in both app themes, like the popup.
 */
export function AnnotationHint({
  anchor,
  message = "Click an object to pin a note",
}: AnnotationHintProps) {
  return (
    <div
      role="status"
      data-theme="dark"
      className="pointer-events-none absolute z-overlay"
      style={{
        left: anchor.x + 12,
        top: anchor.y + 12,
        borderRadius: cssVar("radius.base"),
        background: cssVar("color.annotation.surface"),
        color: cssVar("color.annotation.text"),
        padding: `${cssVar("space.1-5")} 9px`,
        boxShadow: EDITOR_STYLE.selectionToolbarShadow,
        fontFamily: cssVar("font.family.sans"),
        fontSize: cssVar("font.size.ui-xs"),
        fontWeight: cssVar("font.weight.medium"),
        lineHeight: 1.25,
        whiteSpace: "nowrap",
      }}
    >
      {message}
    </div>
  );
}

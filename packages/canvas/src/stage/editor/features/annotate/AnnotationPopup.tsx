"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { CanvasPoint } from "../../../../state/geometry";
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
}

/** Dark screen-space note composer mounted at the annotate click point. */
export function AnnotationPopup({ anchor, targetLabel, onSave, onCancel }: AnnotationPopupProps) {
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const stopPointerPropagation = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
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
    if (body.trim()) onSave(body);
  };

  return (
    <>
      <style>{POPUP_ANIMATION_STYLES}</style>
      <div
        data-annotation-popup=""
        className="pointer-events-auto absolute z-50"
        style={{
          left: anchor.x + 12,
          top: anchor.y + 12,
          width: 280,
          borderRadius: EDITOR_STYLE.selectionToolbarRadiusPx,
          background: EDITOR_STYLE.selectionToolbarBg,
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
            color: "rgba(255,255,255,0.72)",
            font: "600 11px/1.25 ui-sans-serif, system-ui, sans-serif",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {targetLabel}
        </div>
        <textarea
          ref={textareaRef}
          aria-label="Note for the agent"
          placeholder="Note for the agent…"
          rows={3}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            display: "block",
            width: "100%",
            minHeight: 72,
            resize: "none",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 8,
            outline: "none",
            background: "rgba(255,255,255,0.08)",
            color: "#FFFFFF",
            caretColor: "#FFFFFF",
            padding: "9px 10px",
            boxSizing: "border-box",
            font: "500 13px/1.45 ui-sans-serif, system-ui, sans-serif",
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

/** Quiet, non-interactive feedback for annotate clicks that miss every object. */
export function AnnotationHint({
  anchor,
  message = "Click an object to pin a note",
}: AnnotationHintProps) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-40"
      style={{
        left: anchor.x + 12,
        top: anchor.y + 12,
        borderRadius: 8,
        background: "rgba(29,29,29,0.86)",
        color: "rgba(255,255,255,0.86)",
        padding: "6px 9px",
        boxShadow: EDITOR_STYLE.selectionToolbarShadow,
        font: "500 12px/1.25 ui-sans-serif, system-ui, sans-serif",
        whiteSpace: "nowrap",
      }}
    >
      {message}
    </div>
  );
}

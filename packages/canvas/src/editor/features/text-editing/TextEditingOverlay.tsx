"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { objectDefFor } from "../../../objects/object-def";
import {
  resolveTextSlot,
  slotLineHeightPx,
  textPlacementName,
  TITLE_CHIP,
  type ResolvedTextSlot,
  type TextSlot,
} from "../../../objects/text-slots";
import { resolveSectionColors } from "../../../palette";
import { FIRST_USE_COLORS } from "../../../state/actions";
import type { InteractiveCanvasObject } from "../../../state/schema";
import { MarkdownSlotTextEditor } from "./MarkdownSlotTextEditor";
import type { TextEditingApi } from "./use-text-editing";

export interface TextEditingOverlayProps {
  textEditing: TextEditingApi;
  /** Current viewport zoom — the connector label input counter-scales by 1/zoom; the section chip editor chip-scales. */
  zoom: number;
}

const SLOT_JUSTIFY: Record<ResolvedTextSlot["verticalAlign"], CSSProperties["justifyContent"]> = {
  top: "flex-start",
  center: "center",
  bottom: "flex-end",
};

interface SectionTitleEditorProps {
  target: InteractiveCanvasObject;
  slot: TextSlot;
  value: string;
  setValue: TextEditingApi["setObjectTextEditValue"];
  commit: TextEditingApi["commitObjectText"];
  cancel: TextEditingApi["cancelObjectTextEdit"];
  zoom: number;
}

/**
 * Section title editor — chip-exact (the proven WYSIWYG case from §1.2): the
 * input takes its rect, typography, and counter-scale from the SAME
 * title-chip slot preset the at-rest chip renders with. The rect is resolved
 * against the CURRENT draft value so the input tracks the chip's
 * width-follows-text behavior while typing.
 */
function SectionTitleEditor({ target, slot, value, setValue, commit, cancel, zoom }: SectionTitleEditorProps) {
  const draftTitle = value || target.text;
  const resolved = resolveTextSlot(slot, { ...target, text: draftTitle }, zoom);
  const { rect, typography, scale } = resolved;

  return (
    <input
      autoFocus
      aria-label="Section title"
      placeholder="Add text"
      className="interactive-canvas-section-title-editor"
      data-canvas-section-title-editor={target.id}
      data-canvas-text-editor={target.id}
      data-canvas-text-slot="title-chip"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        left: `${target.geometry.x + rect.x}px`,
        top: `${target.geometry.y + rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        pointerEvents: "auto",
        border: `${TITLE_CHIP.borderWidthPx}px solid var(--primary)`,
        borderRadius: "6px",
        padding: `0 ${TITLE_CHIP.paddingXPx}px`,
        fontSize: `${typography.fontSizePx}px`,
        fontWeight: typography.fontWeight,
        lineHeight: `${rect.height}px`,
        background: resolveSectionColors(target.color ?? FIRST_USE_COLORS.section).chip.fill,
        color: typography.color,
        outline: "none",
        whiteSpace: "nowrap",
        boxSizing: "border-box",
        // The stage root is user-select: none — the active editor is the one
        // place in-text selection must work.
        userSelect: "text",
        WebkitUserSelect: "text",
        ...(scale !== 1 ? { transform: `scale(${scale})`, transformOrigin: "top left" } : {}),
      }}
    />
  );
}

interface SlotTextEditorProps {
  target: InteractiveCanvasObject;
  slot: TextSlot;
  value: string;
  setValue: TextEditingApi["setObjectTextEditValue"];
  commit: TextEditingApi["commitObjectText"];
  cancel: TextEditingApi["cancelObjectTextEdit"];
}

/**
 * The in-place slot editor (D14): a transparent, chrome-free textarea
 * positioned at the def's resolved text-slot rect with the slot's exact
 * typography — at rest and mid-edit the text is pixel-identical, caret
 * aside. Vertical anchoring mirrors the at-rest renderer: the wrapper
 * flex-aligns an auto-height textarea for center/bottom slots and below-
 * glyph bands, and stretches it for top-anchored area slots (sticky body —
 * which shows its RAW markdown source here — and code blocks).
 */
function SlotTextEditor({ target, slot, value, setValue, commit, cancel }: SlotTextEditorProps) {
  const resolved = resolveTextSlot(slot, target, 1, { draftText: value });
  const { rect, typography } = resolved;
  const placementName = textPlacementName(slot.placement);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Auto-size the textarea to its content so the flex wrapper can anchor the
  // text block exactly where the at-rest span sits (a textarea can't align
  // its own content vertically).
  const fitHeight = resolved.verticalAlign !== "top" || placementName === "below";
  useLayoutEffect(() => {
    if (!fitHeight) return;
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.max(element.scrollHeight, slotLineHeightPx(slot.typography))}px`;
  }, [value, fitHeight, slot]);

  return (
    <div
      data-canvas-text-editor={target.id}
      data-canvas-text-slot={placementName}
      style={{
        position: "absolute",
        left: `${target.geometry.x + rect.x}px`,
        top: `${target.geometry.y + rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: SLOT_JUSTIFY[resolved.verticalAlign],
        overflow: "hidden",
        // The worldOverlay container is pointer-events: none (inherited), so
        // mouse interaction must be re-enabled on the editor itself.
        pointerEvents: "auto",
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        autoFocus
        aria-label="Object text"
        placeholder="Add text"
        value={value}
        rows={1}
        onChange={(event) => setValue(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
        style={{
          display: "block",
          width: "100%",
          height: fitHeight ? undefined : "100%",
          // No border, no background, no padding — the object underneath is
          // the chrome (D14: no dimming, no visual jump).
          background: "transparent",
          border: "none",
          outline: "none",
          resize: "none",
          padding: 0,
          margin: 0,
          overflow: "hidden",
          whiteSpace: "pre-wrap",
          overflowWrap: "break-word",
          fontSize: `${typography.fontSizePx}px`,
          fontWeight: typography.fontWeight,
          lineHeight: typography.lineHeight,
          textAlign: typography.textAlign,
          color: typography.color,
          caretColor: typography.color,
          fontFamily: typography.fontFamily ?? "inherit",
          // The stage root is user-select: none — the active editor is the
          // one place in-text selection must work.
          userSelect: "text",
          WebkitUserSelect: "text",
        }}
      />
    </div>
  );
}

/**
 * World-positioned in-place text editors (section title chip input, slot
 * text editor, connector label input), rendered into CanvasStage's
 * worldOverlay slot. Object editors are positioned and typographically
 * styled from the SAME text-slot preset the at-rest renderer consumes
 * (objects/text-slots.ts) — the D14 invariant.
 */
export function TextEditingOverlay({ textEditing, zoom }: TextEditingOverlayProps) {
  const {
    labelEditConnectionId,
    labelEditValue,
    setLabelEditValue,
    labelEditPoint,
    commitConnectionLabel,
    cancelConnectionLabelEdit,
    objectTextEditValue,
    setObjectTextEditValue,
    objectTextEditTarget,
    commitObjectText,
    cancelObjectTextEdit,
  } = textEditing;
  const targetDef = objectTextEditTarget ? objectDefFor(objectTextEditTarget) : undefined;
  const targetSlot = targetDef?.textSlot;
  return (
    <>
      {objectTextEditTarget && targetSlot ? (
        objectTextEditTarget.type === "section" ? (
          <SectionTitleEditor
            target={objectTextEditTarget}
            slot={targetSlot}
            value={objectTextEditValue}
            setValue={setObjectTextEditValue}
            commit={commitObjectText}
            cancel={cancelObjectTextEdit}
            zoom={zoom}
          />
        ) : targetDef?.textEditing.markdown ? (
          <MarkdownSlotTextEditor
            target={objectTextEditTarget}
            slot={targetSlot}
            value={objectTextEditValue}
            setValue={setObjectTextEditValue}
            commit={commitObjectText}
            cancel={cancelObjectTextEdit}
          />
        ) : (
          <SlotTextEditor
            target={objectTextEditTarget}
            slot={targetSlot}
            value={objectTextEditValue}
            setValue={setObjectTextEditValue}
            commit={commitObjectText}
            cancel={cancelObjectTextEdit}
          />
        )
      ) : null}
      {labelEditConnectionId && labelEditPoint ? (
        <input
          autoFocus
          aria-label="Connector label"
          value={labelEditValue}
          onChange={(event) => setLabelEditValue(event.target.value)}
          onBlur={commitConnectionLabel}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitConnectionLabel();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancelConnectionLabelEdit();
            }
          }}
          onClick={(event) => event.stopPropagation()}
          style={{
            position: "absolute",
            left: `${labelEditPoint.x}px`,
            top: `${labelEditPoint.y}px`,
            transform: `translate(-50%, -50%) scale(${1 / zoom})`,
            // The worldOverlay container is pointer-events: none (inherited),
            // so mouse interaction must be re-enabled on the input itself.
            pointerEvents: "auto",
            minWidth: "80px",
            maxWidth: "220px",
            border: "1.5px solid var(--primary)",
            borderRadius: "999px",
            padding: "2px 8px",
            fontSize: "11px",
            fontWeight: 600,
            textAlign: "center",
            background: "var(--background)",
            color: "var(--foreground)",
            outline: "none",
            // The stage root is user-select: none — the active editor is the
            // one place in-text selection must work.
            userSelect: "text",
            WebkitUserSelect: "text",
          }}
        />
      ) : null}
    </>
  );
}

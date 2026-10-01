"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { objectDefFor } from "../../../../objects/object-def";
import { SlotDetailLine } from "../../../../objects/object-shell";
import {
  resolveTextSlot,
  slotLineHeightPx,
  textPlacementName,
  TITLE_CHIP,
  type ResolvedTextSlot,
  type TextSlot,
} from "../../../../objects/text-slots";
import { resolveSectionPaint } from "../../../../theme/palette";
import { FIRST_USE_COLORS } from "../../../../state/actions";
import { CANVAS_MONO_FONT_STACK } from "../../../../theme/fonts";
import { titleChipLayout } from "../../../../objects/section/title-chip-layout";
import { useSectionDepth } from "../../../../objects/section/section-depth-context";
import type { InteractiveCanvasObject } from "../../../../state/schema";
import { MarkdownSlotTextEditor } from "./MarkdownSlotTextEditor";
import { useCanvasStyle } from "../../../../theme/canvas-style-context";
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
 * input takes its box, edges, typography, and counter-scale from the SAME
 * title-chip layout the at-rest chip renders with (objects/section/
 * title-chip-layout.ts), floating or pinned, and its text starts exactly
 * where the chip's title starts (past the icon, when the section has one).
 * The layout is resolved against the CURRENT draft value so the input
 * tracks the chip's width-follows-text behavior while typing.
 */
function SectionTitleEditor({ target, slot, value, setValue, commit, cancel, zoom }: SectionTitleEditorProps) {
  const canvasStyle = useCanvasStyle();
  const depth = useSectionDepth(target.id);
  const draftTitle = value || target.text;
  const resolved = resolveTextSlot(slot, { ...target, text: draftTitle }, zoom, { canvasStyle });
  const { rect, scale } = resolved;
  const layout = titleChipLayout({ ...target, text: draftTitle }, canvasStyle, zoom);
  const { border, radius } = layout;
  const font = layout.title.font;
  const paint = resolveSectionPaint(target.color ?? FIRST_USE_COLORS.section, depth, canvasStyle);
  // The chip paints its title past its left edge + padding (+ icon); the
  // input's own left border takes the place of the chip's.
  const paddingLeft = layout.title.x - border.left;
  const edges =
    layout.placement === "pinned"
      ? {
          borderStyle: "solid",
          borderColor: "var(--primary)",
          borderWidth: `${border.top}px ${border.right}px ${border.bottom}px ${border.left}px`,
          borderRadius: `${radius.topLeft}px ${radius.topRight}px ${radius.bottomRight}px ${radius.bottomLeft}px`,
        }
      : {
          border: `${border.top}px solid var(--primary)`,
          borderRadius: `${radius.topLeft}px`,
        };

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
        ...edges,
        padding:
          paddingLeft === TITLE_CHIP.paddingXPx && layout.paddingRightPx === TITLE_CHIP.paddingXPx
            ? `0 ${TITLE_CHIP.paddingXPx}px`
            : `0 ${layout.paddingRightPx}px 0 ${paddingLeft}px`,
        fontSize: `${font.fontSizePx}px`,
        fontWeight: font.fontWeight,
        ...(font.font === "mono" ? { fontFamily: CANVAS_MONO_FONT_STACK } : null),
        ...(font.letterSpacingEm !== 0 ? { letterSpacing: `${font.letterSpacingEm}em` } : null),
        ...(font.uppercase ? { textTransform: "uppercase" as const } : null),
        // A pinned chip's content box is its height less the bottom edge.
        lineHeight: `${layout.placement === "pinned" ? rect.height - border.top - border.bottom : rect.height}px`,
        background: paint.chipFill,
        color: paint.headerText,
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
 * The in-place slot editor (D14): a transparent, trim-free textarea
 * positioned at the def's resolved text-slot rect with the slot's exact
 * typography — at rest and mid-edit the text is pixel-identical, caret
 * aside. Vertical anchoring mirrors the at-rest renderer: the wrapper
 * flex-aligns an auto-height textarea for center/bottom slots and below-
 * glyph bands, and stretches it for top-anchored area slots (sticky body —
 * which shows its RAW markdown source here — and code blocks).
 *
 * The object's detail line (not edited here — the Inspector edits it) renders
 * under the textarea exactly as it does at rest, so the name block + detail
 * center as one block and the textarea sits exactly over the at-rest name.
 */
function SlotTextEditor({ target, slot, value, setValue, commit, cancel }: SlotTextEditorProps) {
  const canvasStyle = useCanvasStyle();
  const resolved = resolveTextSlot(slot, target, 1, { draftText: value, canvasStyle });
  const { rect, typography } = resolved;
  const placementName = textPlacementName(slot.placement);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Auto-size the textarea to its content so the flex wrapper can anchor the
  // text block exactly where the at-rest span sits (a textarea can't align
  // its own content vertically).
  const fitHeight = resolved.verticalAlign !== "top" || placementName === "below";
  const minLineHeightPx = slotLineHeightPx(typography);
  useLayoutEffect(() => {
    if (!fitHeight) return;
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.max(element.scrollHeight, minLineHeightPx)}px`;
  }, [value, fitHeight, minLineHeightPx]);

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
          // the trim (D14: no dimming, no visual jump).
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
      {resolved.detail ? <SlotDetailLine detail={resolved.detail} textAlign={typography.textAlign} /> : null}
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

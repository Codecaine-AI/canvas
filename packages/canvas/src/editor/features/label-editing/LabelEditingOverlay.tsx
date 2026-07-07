"use client";

import {
  estimateSectionTitleChipWidthPx,
  SECTION_GEOMETRY,
  sectionTitleMaxWidthPx,
  sectionTitleScale,
} from "../../../objects/section/def";
import { resolveSectionColors } from "../../../theme";
import type { LabelEditingApi } from "./use-label-editing";

export interface LabelEditingOverlayProps {
  labelEditing: LabelEditingApi;
  /** Current viewport zoom — the connector label input counter-scales by 1/zoom. */
  zoom: number;
}

interface SectionTitleEditorProps {
  target: NonNullable<LabelEditingApi["objectLabelEditTarget"]>;
  value: string;
  setValue: LabelEditingApi["setObjectLabelEditValue"];
  commit: LabelEditingApi["commitObjectLabel"];
  cancel: LabelEditingApi["cancelObjectLabelEdit"];
  zoom: number;
}

function SectionTitleEditor({ target, value, setValue, commit, cancel, zoom }: SectionTitleEditorProps) {
  const sectionTitle = value || target.title || target.label;
  const sectionEditScale = sectionTitleScale(zoom);
  // Mirror the chip: while scaled, the input may span up to the section's
  // inner width but never spill past it.
  const inputWidthPx =
    sectionEditScale !== 1
      ? Math.min(
          estimateSectionTitleChipWidthPx(sectionTitle),
          sectionTitleMaxWidthPx(target.geometry.width, sectionEditScale),
        )
      : estimateSectionTitleChipWidthPx(sectionTitle);

  return (
    <input
      autoFocus
      aria-label="Section title"
      className="interactive-canvas-section-title-editor"
      data-canvas-section-title-editor={target.id}
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
        left: `${target.geometry.x + SECTION_GEOMETRY.titleChip.insetFromSectionCornerPx}px`,
        top: `${target.geometry.y + SECTION_GEOMETRY.titleChip.insetFromSectionCornerPx}px`,
        width: `${inputWidthPx}px`,
        height: `${SECTION_GEOMETRY.titleChip.heightPx}px`,
        pointerEvents: "auto",
        border: `${SECTION_GEOMETRY.titleChip.borderWidthPx}px solid var(--primary)`,
        borderRadius: "6px",
        padding: `0 ${SECTION_GEOMETRY.titleChip.paddingXPx}px`,
        fontSize: `${SECTION_GEOMETRY.titleChip.fontSizePx}px`,
        fontWeight: SECTION_GEOMETRY.titleChip.fontWeight,
        lineHeight: `${SECTION_GEOMETRY.titleChip.heightPx}px`,
        background: resolveSectionColors(target.tint).chipFill ?? "var(--background)",
        color: SECTION_GEOMETRY.titleChip.textColor,
        outline: "none",
        whiteSpace: "nowrap",
        boxSizing: "border-box",
        ...(sectionEditScale !== 1
          ? { transform: `scale(${sectionEditScale})`, transformOrigin: "top left" }
          : {}),
      }}
    />
  );
}

/**
 * World-positioned inline label editors (section title input, object label
 * textarea, connector label input), extracted verbatim from
 * InteractiveCanvasEditor.tsx. Rendered into CanvasStage's worldOverlay slot.
 */
export function LabelEditingOverlay({ labelEditing, zoom }: LabelEditingOverlayProps) {
  const {
    labelEditConnectionId,
    labelEditValue,
    setLabelEditValue,
    labelEditPoint,
    commitConnectionLabel,
    cancelConnectionLabelEdit,
    objectLabelEditValue,
    setObjectLabelEditValue,
    objectLabelEditTarget,
    commitObjectLabel,
    cancelObjectLabelEdit,
  } = labelEditing;
  return (
    <>
      {objectLabelEditTarget?.type === "section" ? (
        <SectionTitleEditor
          target={objectLabelEditTarget}
          value={objectLabelEditValue}
          setValue={setObjectLabelEditValue}
          commit={commitObjectLabel}
          cancel={cancelObjectLabelEdit}
          zoom={zoom}
        />
      ) : objectLabelEditTarget ? (
        <textarea
          autoFocus
          aria-label="Object label"
          value={objectLabelEditValue}
          onChange={(event) => setObjectLabelEditValue(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={commitObjectLabel}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              commitObjectLabel();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancelObjectLabelEdit();
            }
          }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          rows={1}
          style={{
            position: "absolute",
            left: `${objectLabelEditTarget.geometry.x}px`,
            top: `${objectLabelEditTarget.geometry.y}px`,
            width: `${objectLabelEditTarget.geometry.width}px`,
            height: `${objectLabelEditTarget.geometry.height}px`,
            // Unlike the connector label input above, this overlay is
            // rendered inside the transformed world layer WITHOUT a
            // counter-scale transform — it scales naturally with zoom so
            // the textarea always matches the object's on-screen size.
            pointerEvents: "auto",
            resize: "none",
            border: "1.5px solid var(--primary)",
            borderRadius: "8px",
            padding: "8px",
            fontSize: "13px",
            fontWeight: 600,
            textAlign: "center",
            background: "var(--background)",
            color: "var(--foreground)",
            outline: "none",
          }}
        />
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
          }}
        />
      ) : null}
    </>
  );
}

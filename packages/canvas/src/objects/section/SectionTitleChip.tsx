"use client";

import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { resolveSectionPaint, type SectionPaint } from "../../theme/palette";
import { FIRST_USE_COLORS } from "../../state/schema/object-defaults";
import type { CanvasBounds } from "../../state/geometry";
import type { InteractiveCanvasObject } from "../../state/schema";
import { CANVAS_MONO_FONT_STACK } from "../../theme/fonts";
import { useCanvasStyle } from "../../theme/canvas-style-context";
import type { IconGlyphElement } from "../shapes/icon/icon-glyphs";
import {
  TITLE_CHIP,
  TITLE_CHIP_DETAIL,
  TITLE_CHIP_ICON,
  titleChipIconDrawing,
  titleChipLayout,
  titleChipMaxWidthPx,
  type TitleChipIconDrawing,
  type TitleChipLayout,
} from "./title-chip-layout";

export interface SectionTitleChipProps {
  section: InteractiveCanvasObject;
  zoom: number;
  /** Nesting depth (1 = top-level; state/section-depth.ts) — a layer-cake chip deepens with its section. */
  depth?: number;
  bounds?: CanvasBounds;
  onObjectSelect?: (objectId: string) => void;
  onObjectContextMenu?: (
    event: ReactMouseEvent<HTMLElement>,
    object: InteractiveCanvasObject,
    bounds: CanvasBounds,
  ) => void;
}

/**
 * Inline overrides of the chip's static CSS (objects/section/def.tsx, written
 * with the figjam chip): only what the theme or the chip's content changes —
 * the pinned geometry, an icon's tighter lead padding, the header font —
 * so a figjam chip keeps exactly its original markup.
 */
function chipThemeStyle(layout: TitleChipLayout, headerText: string): CSSProperties {
  const style: CSSProperties = {};
  if (layout.placement === "pinned") {
    const { border, radius } = layout;
    style.height = `${layout.box.height}px`;
    style.borderWidth = `${border.top}px ${border.right}px ${border.bottom}px ${border.left}px`;
    style.borderRadius = `${radius.topLeft}px ${radius.topRight}px ${radius.bottomRight}px ${radius.bottomLeft}px`;
  }
  if (layout.placement === "pinned" || layout.paddingLeftPx !== TITLE_CHIP.paddingXPx) {
    style.padding = `0 ${layout.paddingRightPx}px 0 ${layout.paddingLeftPx}px`;
  }
  const font = layout.title.font;
  if (font.font === "mono") style.fontFamily = CANVAS_MONO_FONT_STACK;
  if (font.fontSizePx !== TITLE_CHIP.fontSizePx) style.fontSize = `${font.fontSizePx}px`;
  if (font.fontWeight !== TITLE_CHIP.fontWeight) style.fontWeight = font.fontWeight;
  if (headerText !== TITLE_CHIP.textColor) style.color = headerText;
  if (font.letterSpacingEm !== 0) style.letterSpacing = `${font.letterSpacingEm}em`;
  if (font.uppercase) style.textTransform = "uppercase";
  return style;
}

/** The detail run: the header font at regular weight, muted, never uppercased or tracked. */
function detailStyle(layout: TitleChipLayout, headerDetail: string): CSSProperties {
  const font = layout.title.font;
  return {
    marginLeft: `${TITLE_CHIP_DETAIL.gapPx}px`,
    color: headerDetail,
    fontWeight: TITLE_CHIP_DETAIL.fontWeight,
    ...(font.letterSpacingEm !== 0 ? { letterSpacing: "normal" } : null),
    ...(font.uppercase ? { textTransform: "none" as const } : null),
  };
}

function glyphElement(element: IconGlyphElement, key: number) {
  if (element.kind === "path") return <path key={key} d={element.d} />;
  if (element.kind === "circle") return <circle key={key} cx={element.cx} cy={element.cy} r={element.r} />;
  return <line key={key} x1={element.x1} y1={element.y1} x2={element.x2} y2={element.y2} />;
}

/** The header icon: a 16px tile (or bare glyph) leading the chip — same primitives the static renderer draws. */
export function TitleChipIcon({ id, drawing }: { id: string; drawing: TitleChipIconDrawing }) {
  const { tile, glyph } = drawing;
  const tileInset = tile?.border ? tile.borderWidthPx / 2 : 0;
  const stroked = glyph.paint === "stroke";
  return (
    <svg
      aria-hidden="true"
      data-canvas-section-icon={id}
      width={drawing.sizePx}
      height={drawing.sizePx}
      viewBox={`0 0 ${drawing.sizePx} ${drawing.sizePx}`}
      style={{ display: "block", flexShrink: 0, marginRight: `${TITLE_CHIP_ICON.gapPx}px`, overflow: "visible" }}
    >
      {tile ? (
        <rect
          x={tileInset}
          y={tileInset}
          width={drawing.sizePx - tileInset * 2}
          height={drawing.sizePx - tileInset * 2}
          rx={Math.max(0, tile.radiusPx - tileInset)}
          fill={tile.fill}
          stroke={tile.border ?? undefined}
          strokeWidth={tile.border ? tile.borderWidthPx : undefined}
        />
      ) : null}
      <g
        transform={`translate(${glyph.offsetPx} ${glyph.offsetPx}) scale(${glyph.sizePx / glyph.viewBoxSize})`}
        fill={stroked ? "none" : glyph.color}
        stroke={stroked ? glyph.color : "none"}
        strokeWidth={stroked ? glyph.strokeWidth : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {glyph.elements.map(glyphElement)}
      </g>
    </svg>
  );
}

/**
 * A section's title chip — `[icon] TITLE  detail` (objects/section/
 * title-chip-layout.ts): floating inset in the corner, or pinned flush into
 * it (the frame is its top and left edge); counter-scaled when zoomed out,
 * ellipsized at the section's inner width. Colors come from the section
 * paint at the section's depth.
 */
export function SectionTitleChip({
  section,
  zoom,
  depth = 1,
  bounds,
  onObjectSelect,
  onObjectContextMenu,
}: SectionTitleChipProps) {
  const canvasStyle = useCanvasStyle();
  const paint: SectionPaint = resolveSectionPaint(
    section.color ?? FIRST_USE_COLORS.section,
    depth,
    canvasStyle,
  );
  const layout = titleChipLayout(section, canvasStyle, zoom);
  const { box, scale } = layout;
  const icon = layout.icon ? titleChipIconDrawing(layout.icon.id, paint, canvasStyle) : null;

  return (
    <span
      className="interactive-canvas-section-title-chip"
      data-canvas-object-id={section.id}
      data-canvas-section-title-chip={section.id}
      style={{
        left: `${section.geometry.x + box.x}px`,
        top: `${section.geometry.y + box.y}px`,
        background: paint.chipFill,
        borderColor: paint.chipBorder,
        maxWidth: `${titleChipMaxWidthPx(section.geometry.width, scale)}px`,
        pointerEvents: "auto",
        ...(scale !== 1
          ? {
              transform: `scale(${scale})`,
            }
          : {}),
        ...chipThemeStyle(layout, paint.headerText),
      }}
      onClick={(event) => {
        event.stopPropagation();
        onObjectSelect?.(section.id);
      }}
      onContextMenu={(event) => {
        if (!onObjectContextMenu || !bounds) return;
        event.preventDefault();
        event.stopPropagation();
        onObjectContextMenu(event, section, bounds);
      }}
    >
      {icon && layout.icon ? <TitleChipIcon id={layout.icon.id} drawing={icon} /> : null}
      <span>
        {section.text}
        {layout.detail ? (
          <span data-canvas-section-detail="" style={detailStyle(layout, paint.headerDetail)}>
            {layout.detail.text}
          </span>
        ) : null}
      </span>
    </span>
  );
}

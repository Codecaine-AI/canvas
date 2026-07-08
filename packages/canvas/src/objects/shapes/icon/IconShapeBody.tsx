"use client";

import { ICON_GLYPHS, ICON_GLYPH_STROKE_WIDTH, type IconGlyphElement, type IconGlyphId } from "./icon-glyphs";
/** Approximate on-canvas icon-object size the glyph stroke is tuned for (moved from theme/tokens.ts in the theme dispersal). */
const ICON_APPROX_SIZE_PX = 130;
import type { InteractiveCanvasObject } from "../../../state/schema";

/**
 * Minimal structural shape this component needs from an interactive canvas
 * object. Originally a hand-rolled structural type (the `icon` object type /
 * `icon` field hadn't landed in state/schema.ts yet when this file was
 * written, owned by a different in-flight wave); now that the real schema
 * has both, this is just a `Pick` of the fields actually used so the type
 * stays in lockstep with schema.ts without pulling in the full object shape.
 */
export type IconShapeBodyObject = Pick<InteractiveCanvasObject, "icon"> & {
  geometry: Pick<InteractiveCanvasObject["geometry"], "width" | "height">;
};

export type IconShapeBodyColors = {
  /** Glyph stroke color (falls back to a sensible neutral if omitted). */
  stroke?: string;
  /** Optional fill behind the glyph's bounding square; glyph paths themselves stay fill="none". */
  fill?: string;
};

function renderGlyphElement(element: IconGlyphElement, key: number) {
  if (element.kind === "path") {
    return <path key={key} d={element.d} />;
  }
  if (element.kind === "circle") {
    return <circle key={key} cx={element.cx} cy={element.cy} r={element.r} />;
  }
  return <line key={key} x1={element.x1} y1={element.y1} x2={element.x2} y2={element.y2} />;
}

/**
 * Pure presentational body for the `icon` shape family: renders the resolved
 * glyph, centered. The object's text renders separately through the shared
 * "below" text slot (objects/text-slots.ts — bold black text in the band
 * under the glyph), so this component
 * is glyph-only since the P2 text unification.
 *
 * The caller (`objects/shapes/icon/def.tsx`) is responsible for the outer
 * button/positioning chrome, matching how other shape bodies are composed.
 */
export function IconShapeBody({
  object,
  colors,
}: {
  object: IconShapeBodyObject;
  colors?: IconShapeBodyColors;
}) {
  const glyphId = object.icon as IconGlyphId | undefined;
  const glyph = glyphId ? ICON_GLYPHS[glyphId] : undefined;
  const stroke = colors?.stroke ?? "#1D1D1D";
  const fill = colors?.fill;

  return (
    <div
      data-canvas-icon-shape-body=""
      data-canvas-icon-id={glyph?.id}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      <svg
        viewBox={glyph ? `0 0 ${glyph.viewBoxSize} ${glyph.viewBoxSize}` : "0 0 18 18"}
        width={ICON_APPROX_SIZE_PX * 0.55}
        height={ICON_APPROX_SIZE_PX * 0.55}
        fill="none"
        stroke={stroke}
        strokeWidth={ICON_GLYPH_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        data-canvas-icon-glyph={glyph?.id ?? "unknown"}
      >
        {fill ? (
          <rect
            x={0}
            y={0}
            width={glyph?.viewBoxSize ?? 18}
            height={glyph?.viewBoxSize ?? 18}
            fill={fill}
            stroke="none"
          />
        ) : null}
        {glyph?.elements.map((element, index) => renderGlyphElement(element, index))}
      </svg>
    </div>
  );
}

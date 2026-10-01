"use client";

import { resolveObjectStrokeWidth, resolveShapeCornerRadius } from "../../theme/tokens";
import { useCanvasStyle } from "../../theme/canvas-style-context";
import { objectTypeDefaults } from "../../state/schema/object-defaults";
import { BBOX_OUTLINE } from "../geometry";
import type { ObjectDef, ObjectRenderProps } from "../object-def";
import { ObjectShell, ObjectSlotText, resolveObjectRoleColors, type ResolvedShapeObjectColors } from "../object-shell";
import {
  CENTER_TEXT_SLOT,
  textPlacementName,
  type TextSlot,
} from "../text-slots";
import type { ShapeDef } from "./shape-def";
import { SHAPE_TOOLBAR } from "./toolbar";

/**
 * A rect-family shape's border as an SVG stroke (fractional widths outside
 * figjam — see ShapeObjectView): centered on a rect inset by half the stroke,
 * corner radius reduced by the same half, so its outer edge is exactly the
 * CSS border-box trim the button would paint — the static renderer's
 * bboxRoundedRect. The button keeps its fill; this layer paints only the line.
 */
function StrokedBorder({
  width,
  height,
  strokeWidth,
  cornerRadiusPx,
  color,
}: {
  width: number;
  height: number;
  strokeWidth: number;
  cornerRadiusPx: number;
  color: string;
}) {
  const inset = strokeWidth / 2;
  return (
    <svg
      aria-hidden="true"
      className="interactive-canvas-true-outline-silhouette"
      data-canvas-shape-silhouette="border"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
    >
      <rect
        x={inset}
        y={inset}
        width={Math.max(0, width - strokeWidth)}
        height={Math.max(0, height - strokeWidth)}
        rx={Math.max(0, cornerRadiusPx - inset)}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}

/**
 * Adapts any ShapeDef (tier-2 variant data) into an ObjectDef (tier-1
 * behavior contract) carrying the ONE shared shape behavior: standard shape
 * toolbar, full 8-handle set, in-place text editing, and
 * slot-driven text rendering (D3/D6: `object.text` renders at the def's
 * text-slot preset — objects/text-slots.ts — the same descriptor the in-place
 * editor consumes, D14). Per-shape files never mention toolbars or handles.
 */
export function shapeObjectDef(shape: ShapeDef): ObjectDef {
  const className = shape.silhouette.className
    ? `interactive-canvas-object ${shape.silhouette.className}`
    : "interactive-canvas-object";
  const buttonBorder = shape.buttonBorder ?? "painted";
  // Omitted = the "center" preset (the shape-family default); "none" = a pure
  // glyph with no visible text (also not text-editable).
  const textSlot: TextSlot | undefined =
    shape.text === "none" ? undefined : (shape.text ?? CENTER_TEXT_SLOT);

  function ShapeObjectView(props: ObjectRenderProps) {
    const { object, hideText } = props;
    // P1/D13 — every shape (silhouettes included) takes its resolved palette
    // fill plus ink border, in the canvas style's shape fill mode (tint/card).
    const canvasStyle = useCanvasStyle();
    const colors = resolveObjectRoleColors(object, "shape", canvasStyle) as ResolvedShapeObjectColors;
    const strokeWidth = resolveObjectStrokeWidth(object.style, canvasStyle);
    // A per-style trim swaps the button's border policy / paint (the slot
    // text offsets by the same border, so both read the effective policy).
    const trim = shape.silhouette.trim?.(canvasStyle);
    // Browsers snap a CSS border to whole px (Chromium paints a 1.5px border
    // 1px wide), which would thin the schematic themes' 1.5px trim next to
    // the SVG-stroked shapes and shift the slot text by the lost fraction.
    // Outside figjam (whose borders stay as they always painted), a
    // fractional border on a CSS-trimmed shape paints as an SVG stroke
    // instead — exact, and the same inset rect the static renderer draws.
    const strokedBorder =
      !trim && buttonBorder === "painted" && canvasStyle.theme !== "figjam" && !Number.isInteger(strokeWidth);
    const effectiveButtonBorder = trim?.buttonBorder ?? (strokedBorder ? "suppressed" : buttonBorder);
    // The base trim's CSS radius is `shapeCornerRadiusPx`; the rounded rect
    // (process / rectangle) takes `processCornerRadiusPx` as an inline trim —
    // only where the two differ, so the figjam DOM is untouched.
    const cornerRadiusPx = resolveShapeCornerRadius(shape.shape, canvasStyle);
    const radiusStyle =
      cornerRadiusPx !== canvasStyle.shapeCornerRadiusPx ? { borderRadius: `${cornerRadiusPx}px` } : null;
    const shellStyle = trim?.style || radiusStyle ? { ...radiusStyle, ...trim?.style } : undefined;
    const silhouette = shape.silhouette.silhouette?.({
      object,
      colors,
      strokeWidth,
      canvasStyle,
      strokedBorderPx: strokedBorder ? strokeWidth : 0,
    });
    return (
      <ObjectShell
        object={object}
        renderShape={shape.shape}
        className={className}
        selected={props.selected}
        changed={props.changed}
        dropTarget={props.dropTarget}
        editable={props.editable}
        bounds={props.bounds}
        buttonBorder={effectiveButtonBorder}
        onObjectSelect={props.onObjectSelect}
        onObjectContextMenu={props.onObjectContextMenu}
        {...(shellStyle ? { style: shellStyle } : null)}
      >
        {strokedBorder ? (
          <StrokedBorder
            width={object.geometry.width}
            height={object.geometry.height}
            strokeWidth={strokeWidth}
            cornerRadiusPx={cornerRadiusPx}
            color={colors.border}
          />
        ) : null}
        {silhouette}
        {textSlot && !hideText && (
          <ObjectSlotText
            object={object}
            slot={textSlot}
            buttonBorder={effectiveButtonBorder}
            className={
              textPlacementName(textSlot.placement) === "below"
                ? "interactive-canvas-label-below-icon"
                : undefined
            }
          />
        )}
      </ObjectShell>
    );
  }
  ShapeObjectView.displayName = `ShapeObjectView(${shape.shape})`;

  return {
    kind: shape.type,
    render: ShapeObjectView,
    css: shape.css ?? "",
    // Stamped from the schema-vocabulary defaults leaf (P4): the SAME row the
    // reducer's creation/swap paths read, so def-derived and reducer-derived
    // defaults can never drift (identity-locked by type-defaults.test.ts).
    defaults: objectTypeDefaults(shape.type),
    catalog: shape.catalog,
    colorRole: "shape",
    buttonBorder,
    // Geometric outline (D4): bbox unless the shape declares a true-outline
    // spec (which must be the same object the geometry dispatch tables use).
    outline: shape.outline ?? BBOX_OUTLINE,
    handles: "all",
    dragCapture: "none",
    textSlot,
    textEditing: { editable: Boolean(textSlot) },
    toolbar: SHAPE_TOOLBAR,
  };
}

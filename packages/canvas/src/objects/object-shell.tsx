"use client";

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { resolveSectionColors, resolveShapePaint, resolveStickyPaint } from "../theme/palette";
import { resolveObjectStrokeWidth } from "../theme/tokens";
import { DEFAULT_CANVAS_STYLE, type CanvasStyle } from "../theme/canvas-style";
import { useCanvasStyle } from "../theme/canvas-style-context";
import { FIRST_USE_COLORS } from "../state/schema/object-defaults";
import type { InteractiveCanvasObject } from "../state/schema";
import type {
  ObjectButtonBorderPolicy,
  ObjectColorRole,
  ObjectRenderProps,
  RenderObjectShape,
} from "./object-def";
import {
  OBJECT_TEXT_COLOR,
  resolveTextSlot,
  slotLineHeightPx,
  slotNameLineCapacity,
  textPlacementName,
  textSlotClampLineCount,
  type ResolvedSlotDetail,
  type SlotTypography,
  type TextSlot,
} from "./text-slots";

export { textSlotClampLineCount };

/**
 * Shared shell for registry-driven object renderers: the outer `<button>`,
 * style resolvers, and slot text helpers every object kind renders through.
 * Includes positioning style, docs-targeting/data attributes, select and
 * context-menu handlers. Extracted from
 * stage/ObjectShape's original generic branch so per-kind defs compose it
 * instead of re-deriving it; ObjectShape's own generic fallback (for render
 * shapes with no registered def) now composes this same shared code too —
 * there is no separate inline copy left to keep in sync.
 */

/**
 * An object's color pick resolved through its def's palette role table (P1,
 * OBJECT-DEF-OVERHAUL.md §3.2/§3.5): one fill, an optional role border
 * (stickies suppress the button border with null), and the text color —
 * the style's name color (D8: one text color, never derived per pick).
 * Shape-role colors always carry an ink border.
 */
export type ResolvedObjectColors = {
  fill: string;
  border: string | null;
  text: string;
};

export type ResolvedShapeObjectColors = ResolvedObjectColors & { border: string };

/**
 * Resolves `object.color` through the given role's palette cells (P1) under
 * the workspace canvas style. Absent color = the kind's first-use default
 * (D17) — visually identical to a freshly stamped default pick. Shapes take
 * theme/palette.ts resolveShapePaint (`tint`: the pastel fill + ink border;
 * `card`: the card fill + ink border) and stickies the sticky paint's fill.
 * Sections resolve the flat role table: fill = tint and border = chip fill
 * (per §3.2, the section border IS the title chip's fill color) — the
 * section def paints its own themed frame. Under the default style every
 * value is the figjam table's.
 */
export function resolveObjectRoleColors(
  object: Pick<InteractiveCanvasObject, "color">,
  role: ObjectColorRole,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): ResolvedObjectColors {
  if (role === "sticky") {
    return {
      fill: resolveStickyPaint(object.color ?? FIRST_USE_COLORS.sticky, canvasStyle).fill,
      border: null,
      text: canvasStyle.textColor,
    };
  }
  if (role === "section") {
    const section = resolveSectionColors(object.color ?? FIRST_USE_COLORS.section);
    return { fill: section.tint, border: section.chip.fill, text: OBJECT_TEXT_COLOR };
  }
  const shape = resolveShapePaint(object.color ?? FIRST_USE_COLORS.shape, canvasStyle);
  return { fill: shape.fill, border: shape.border, text: shape.text };
}

/**
 * The CSS border width an object's button paints (logical px): 0 when the
 * def suppresses the button border, the section frame width (per-object
 * `style.strokeWidth`, else `canvasStyle.sectionBorderWidthPx`; dashed/none
 * frames paint via SVG or not at all) for sections, and the shape stroke
 * (resolveObjectStrokeWidth) for bordered shape roles.
 */
export function resolveObjectBorderWidth(
  object: InteractiveCanvasObject,
  colorRole: ObjectColorRole = "shape",
  buttonBorder: ObjectButtonBorderPolicy = "painted",
  options?: { defaultSectionBorderWidthPx?: number },
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): number {
  if (buttonBorder === "suppressed") return 0;
  if (colorRole === "section") {
    const borderStyle = object.style?.strokeStyle ?? "solid";
    if (borderStyle === "none" || borderStyle === "dashed") return 0;
    return (
      object.style?.strokeWidth ??
      options?.defaultSectionBorderWidthPx ??
      canvasStyle.sectionBorderWidthPx
    );
  }
  const colors = resolveObjectRoleColors(object, colorRole, canvasStyle);
  return colors.border === null ? 0 : resolveObjectStrokeWidth(object.style, canvasStyle);
}

export function objectStyle(
  object: InteractiveCanvasObject,
  colorRole: ObjectColorRole = "shape",
  buttonBorder: ObjectButtonBorderPolicy = "painted",
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): CSSProperties {
  const colors = resolveObjectRoleColors(object, colorRole, canvasStyle);
  const borderWidth = resolveObjectBorderWidth(object, colorRole, buttonBorder, undefined, canvasStyle);
  return {
    left: `${object.geometry.x}px`,
    top: `${object.geometry.y}px`,
    width: `${object.geometry.width}px`,
    height: `${object.geometry.height}px`,
    background: colors.fill,
    borderColor: colors.border ?? "transparent",
    // Bordered picks carry the canvas style's shape border (or the object's
    // own strokeWidth); suppressed button borders render width 0.
    borderWidth: borderWidth === 0 ? 0 : `${borderWidth}px`,
    color: colors.text,
    // W4 z-layering (see the connector <svg> comment in CanvasStage): non-
    // section shapes paint above the connector layer (z 1); sections render
    // via their own def (explicit z 0) below it.
    zIndex: 2,
  };
}

/**
 * The generic object button: identical attribute set (and order) to the one
 * the original pre-registry ObjectShape rendered, so every kind keeps
 * byte-identical DOM. `renderShape` is the effective render shape stamped on
 * `data-canvas-object-shape`.
 */
export function ObjectShell({
  object,
  renderShape,
  className,
  colorRole = "shape",
  buttonBorder = "painted",
  selected,
  changed,
  dropTarget,
  editable,
  bounds,
  onObjectSelect,
  onObjectContextMenu,
  children,
  style,
}: Pick<
  ObjectRenderProps,
  | "object"
  | "selected"
  | "changed"
  | "dropTarget"
  | "editable"
  | "bounds"
  | "onObjectSelect"
  | "onObjectContextMenu"
> & {
  renderShape: RenderObjectShape;
  className: string;
  /** Palette role table the shell's fill/border resolve through (defaults to "shape"). */
  colorRole?: ObjectColorRole;
  /** Whether the outer button itself contributes a CSS border/padding-box inset. */
  buttonBorder?: ObjectButtonBorderPolicy;
  children?: ReactNode;
  /** A kind's own inline trim merged over the resolved object style (the card sticky's edges). */
  style?: CSSProperties;
}) {
  const canvasStyle = useCanvasStyle();
  return (
    <button
      type="button"
      className={className}
      data-docs-target="true"
      data-docs-target-type={`canvas-${object.type}`}
      data-source-id={object.id}
      data-docs-target-label={`canvas: ${object.text || object.type}`}
      data-canvas-object-id={object.id}
      data-canvas-object-type={object.type}
      data-canvas-object-shape={renderShape}
      data-selected={selected ? "true" : undefined}
      data-changed={changed ? "true" : undefined}
      data-drop-target={dropTarget ? "true" : undefined}
      data-editable={(editable ?? Boolean(onObjectSelect)) ? "true" : undefined}
      aria-label={object.text || object.type}
      style={
        style
          ? { ...objectStyle(object, colorRole, buttonBorder, canvasStyle), ...style }
          : objectStyle(object, colorRole, buttonBorder, canvasStyle)
      }
      onClick={(event) => {
        event.stopPropagation();
        onObjectSelect?.(object.id);
      }}
      onContextMenu={(event) => {
        if (!onObjectContextMenu) return;
        event.preventDefault();
        event.stopPropagation();
        onObjectContextMenu(event, object, bounds);
      }}
    >
      {children}
    </button>
  );
}

/** Maps a slot's vertical anchoring to the flex-column justification of the block. */
const SLOT_JUSTIFY: Record<TextSlot["verticalAlign"], CSSProperties["justifyContent"]> = {
  top: "flex-start",
  center: "center",
  bottom: "flex-end",
};

/**
 * The detail line's inline style (contract §4): one line in the detail
 * font, ellipsized at the slot width, `gapPx` under the name block (no gap
 * when there is no name above it).
 */
export function detailLineStyle(
  detail: ResolvedSlotDetail,
  textAlign: SlotTypography["textAlign"],
  gap = true,
): CSSProperties {
  const { typography } = detail;
  return {
    display: "block",
    width: "100%",
    flexShrink: 0,
    ...(gap ? { marginTop: `${detail.gapPx}px` } : null),
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    fontFamily: typography.fontFamily,
    fontSize: `${typography.fontSizePx}px`,
    fontWeight: typography.fontWeight,
    lineHeight: `${typography.lineHeightPx}px`,
    textAlign,
    color: typography.color,
  };
}

/**
 * The detail line under a slot's name. Rendered by the at-rest slot text and
 * by the in-place name editor (stage/editor/features/text-editing), so the
 * line holds still while the name above it is edited.
 */
export function SlotDetailLine({
  detail,
  textAlign,
  gap = true,
}: {
  detail: ResolvedSlotDetail;
  textAlign: SlotTypography["textAlign"];
  gap?: boolean;
}) {
  return (
    <span
      className="interactive-canvas-object-detail"
      data-canvas-text-detail=""
      style={detailLineStyle(detail, textAlign, gap)}
    >
      {detail.text}
    </span>
  );
}

/**
 * At-rest slot text (D3/D6): renders `object.text` absolutely positioned at
 * the def's resolved text-slot rect with the slot's typography. The in-place
 * editor (stage/editor/features/text-editing) positions and styles itself from the
 * SAME resolved slot, so editing is WYSIWYG for every kind that renders
 * through this component (D14).
 *
 * Plain slot text carries the object's detail line under the name when the
 * resolved slot has one: in a centered slot the name and the detail center
 * as one block, and the name's line clamp gives up lines to keep the detail
 * (slotNameLineCapacity); in the below band the detail follows the name.
 *
 * `children` overrides the default plain-text rendering (sticky passes its
 * markdown lines) while keeping the shared rect/typography plumbing; it
 * never carries a detail line.
 */
export function ObjectSlotText({
  object,
  slot,
  className,
  colorRole = "shape",
  buttonBorder = "painted",
  clampChildrenToSlot = false,
  children,
}: {
  object: InteractiveCanvasObject;
  slot: TextSlot;
  /** Extra class(es) for the inner text span (legacy hooks kept for tests/CSS). */
  className?: string;
  /** Palette role table the containing button resolves through (defaults to "shape"). */
  colorRole?: ObjectColorRole;
  /** Whether the containing button contributes a CSS border/padding-box inset. */
  buttonBorder?: ObjectButtonBorderPolicy;
  /** Opt-in clamp for child-rendered content such as sticky markdown. */
  clampChildrenToSlot?: boolean;
  children?: ReactNode;
}) {
  const canvasStyle = useCanvasStyle();
  const resolved = resolveTextSlot(slot, object, 1, { canvasStyle });
  const { rect, typography } = resolved;
  // Absolute children position from the button's padding edge, so the
  // border-box slot rect shifts back by the painted border width.
  const borderInset = resolveObjectBorderWidth(object, colorRole, buttonBorder, undefined, canvasStyle);
  const placementName = textPlacementName(slot.placement);
  const isBelowPlacement = placementName === "below";
  const plainText = children === undefined;
  const detail = plainText ? resolved.detail : null;
  const hasName = !plainText || object.text !== "";
  const clampLineHeightPx = slotLineHeightPx(typography);
  const clampLines = detail
    ? slotNameLineCapacity(resolved)
    : textSlotClampLineCount(rect.height, clampLineHeightPx);
  const shouldClampContent = !isBelowPlacement && (children === undefined || clampChildrenToSlot);
  const clampMaxHeightPx = clampLines * clampLineHeightPx;
  const labelRef = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    const element = labelRef.current;
    if (!element) return;
    if (!shouldClampContent) {
      element.style.removeProperty("-webkit-box-orient");
      element.style.removeProperty("-webkit-line-clamp");
      element.style.removeProperty("max-height");
      element.style.removeProperty("text-overflow");
      return;
    }
    element.style.display = "-webkit-box";
    element.style.setProperty("-webkit-box-orient", "vertical");
    element.style.setProperty("-webkit-line-clamp", String(clampLines));
    element.style.maxHeight = `${clampMaxHeightPx}px`;
    element.style.textOverflow = "ellipsis";
  }, [shouldClampContent, clampLines, clampMaxHeightPx]);

  if (resolved.hidden) return null;
  if (!hasName && !detail) return null;
  return (
    <span
      className="interactive-canvas-object-text-slot"
      data-canvas-text-slot={placementName}
      style={{
        position: "absolute",
        left: `${rect.x - borderInset}px`,
        top: `${rect.y - borderInset}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: SLOT_JUSTIFY[resolved.verticalAlign],
        overflow: isBelowPlacement ? "visible" : "hidden",
        pointerEvents: isBelowPlacement ? "auto" : "none",
        zIndex: 1,
      }}
    >
      {hasName ? (
        <span
          ref={labelRef}
          className={className ? `interactive-canvas-object-label ${className}` : "interactive-canvas-object-label"}
          style={{
            display: shouldClampContent ? "-webkit-box" : "block",
            width: "100%",
            whiteSpace: "pre-wrap",
            overflowWrap: "break-word",
            overflow: isBelowPlacement ? "visible" : "hidden",
            ...(shouldClampContent
              ? {
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: String(clampLines),
                  maxHeight: `${clampMaxHeightPx}px`,
                  textOverflow: "ellipsis",
                }
              : null),
            fontSize: `${typography.fontSizePx}px`,
            fontWeight: typography.fontWeight,
            lineHeight: typography.lineHeight,
            textAlign: typography.textAlign,
            color: typography.color,
            ...(typography.fontFamily ? { fontFamily: typography.fontFamily } : null),
          }}
        >
          {children ?? object.text}
        </span>
      ) : null}
      {detail ? <SlotDetailLine detail={detail} textAlign={typography.textAlign} gap={hasName} /> : null}
    </span>
  );
}

// (EdgePorts died in P3: connection affordances render as the screen-space
// AnchorDots overlay - connectors/AnchorDots.tsx - at the def-derived
// anchor positions, D5/D15.)

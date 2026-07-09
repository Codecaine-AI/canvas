"use client";

import { resolveObjectStrokeWidth } from "../../theme/tokens";
import { objectTypeDefaults } from "../../state/schema/object-defaults";
import { BBOX_OUTLINE } from "../geometry";
import type { ObjectDef, ObjectRenderProps } from "../object-def";
import { ObjectButtonChrome, ObjectSlotText, resolveObjectRoleColors, type ResolvedShapeObjectColors } from "../object-chrome";
import {
  CENTER_TEXT_SLOT,
  textPlacementName,
  type TextSlot,
} from "../text-slots";
import type { ShapeDef } from "./shape-def";
import { SHAPE_TOOLBAR } from "./toolbar";

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
    // fill plus ink border.
    const colors = resolveObjectRoleColors(object, "shape") as ResolvedShapeObjectColors;
    const strokeWidth = resolveObjectStrokeWidth(object.style);
    const silhouette = shape.silhouette.silhouette?.({ object, colors, strokeWidth });
    return (
      <ObjectButtonChrome
        object={object}
        renderShape={shape.shape}
        className={className}
        selected={props.selected}
        changed={props.changed}
        dropTarget={props.dropTarget}
        editable={props.editable}
        bounds={props.bounds}
        buttonBorder={buttonBorder}
        onObjectSelect={props.onObjectSelect}
        onObjectContextMenu={props.onObjectContextMenu}
      >
        {silhouette}
        {textSlot && !hideText && (
          <ObjectSlotText
            object={object}
            slot={textSlot}
            buttonBorder={buttonBorder}
            className={
              textPlacementName(textSlot.placement) === "below"
                ? "interactive-canvas-label-below-icon"
                : undefined
            }
          />
        )}
      </ObjectButtonChrome>
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

"use client";

import { resolveObjectColors, resolveObjectStrokeWidth } from "../../theme";
import type { ObjectDef, ObjectRenderProps } from "../object-def";
import { EdgePorts, ObjectButtonChrome } from "../object-chrome";
import type { ShapeDef } from "./shape-def";
import { SHAPE_TOOLBAR } from "./toolbar";

/**
 * Adapts any ShapeDef (tier-2 variant data) into an ObjectDef (tier-1
 * behavior contract) carrying the ONE shared shape behavior: standard shape
 * toolbar, full 8-handle set, solid hit-test, standard label editing, and
 * the generic button/label/body layout the original pre-registry ObjectShape
 * rendered. Per-shape files never mention toolbars or handles.
 */
export function shapeObjectDef(shape: ShapeDef): ObjectDef {
  const className = shape.outline.className
    ? `interactive-canvas-object ${shape.outline.className}`
    : "interactive-canvas-object";

  function ShapeObjectView(props: ObjectRenderProps) {
    const { object, compact, showPorts, zoom = 1, hideLabel } = props;
    const colors = resolveObjectColors(object.style);
    const hasExplicitColor = Boolean(
      object.style?.paletteToken || object.style?.tone || object.style?.fill || object.style?.stroke,
    );
    const strokeWidth = resolveObjectStrokeWidth(object.style);
    // Below the compact threshold the silhouette stays legible instead of
    // being overrun with text: label AND body are dropped (person < 100px).
    const compactGlyph =
      shape.text.compactBelowHeightPx !== undefined &&
      object.geometry.height < shape.text.compactBelowHeightPx;
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
        onObjectSelect={props.onObjectSelect}
        onObjectContextMenu={props.onObjectContextMenu}
      >
        {shape.outline.silhouette?.({ object, colors, hasExplicitColor, strokeWidth })}
        {shape.text.kind === "label" && !hideLabel && (
          <span className="interactive-canvas-object-label" style={shape.text.labelStyle?.(object)}>
            {object.label}
          </span>
        )}
        {object.body && !compact && !compactGlyph && shape.text.kind !== "none" && (
          <span className="interactive-canvas-object-body">{object.body}</span>
        )}
        {shape.text.kind === "label-below-icon" &&
          !hideLabel &&
          (!compactGlyph || shape.text.compactDrops === "body") && (
            <span className="interactive-canvas-object-label interactive-canvas-label-below-icon">
              {object.label}
            </span>
          )}
        {showPorts && <EdgePorts object={object} zoom={zoom} />}
      </ObjectButtonChrome>
    );
  }
  ShapeObjectView.displayName = `ShapeObjectView(${shape.shape})`;

  return {
    kind: shape.type,
    render: ShapeObjectView,
    css: shape.css ?? "",
    defaults: {
      // Shape-family placement default matches defaultGeometryFor's x/y.
      geometry: {
        x: shape.defaultPosition?.x ?? 160,
        y: shape.defaultPosition?.y ?? 160,
        width: shape.defaultSize.width,
        height: shape.defaultSize.height,
      },
      tone: shape.defaultTone ?? "neutral",
      shape: shape.shape,
      label: shape.catalog.label,
    },
    handles: "all",
    hitTest: "solid",
    dragCapture: "none",
    labelEditing: { target: "label" },
    toolbar: SHAPE_TOOLBAR,
  };
}

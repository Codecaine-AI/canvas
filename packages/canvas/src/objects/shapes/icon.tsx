"use client";

import { IconShapeBody } from "../../render/IconShapeBody";
import { resolveObjectColors } from "../../tokens/theme";
import { EdgePorts, ObjectButtonChrome } from "../object-chrome";
import type { ObjectDef, ObjectRenderProps } from "../object-def";
import { SHAPE_TOOLBAR } from "./toolbar";

/**
 * The `icon` shape (Advanced-tier glyph family) renders its own self-contained
 * glyph+label body via IconShapeBody (bbox outline tier, no silhouette/polygon
 * overlay) rather than the standard label/body span pair — mirrors legacy
 * ObjectShape's `isIconShape` branch byte-for-byte (RESTRUCTURE.md step 4).
 */
function IconObjectView(props: ObjectRenderProps) {
  const { object, showPorts, zoom = 1, hideLabel } = props;
  const colors = resolveObjectColors(object.style);
  const hasExplicitColor = Boolean(
    object.style?.paletteToken || object.style?.tone || object.style?.fill || object.style?.stroke,
  );

  return (
    <ObjectButtonChrome
      object={object}
      renderShape="icon"
      className="interactive-canvas-object interactive-canvas-object-icon"
      selected={props.selected}
      changed={props.changed}
      dropTarget={props.dropTarget}
      editable={props.editable}
      bounds={props.bounds}
      onObjectSelect={props.onObjectSelect}
      onObjectContextMenu={props.onObjectContextMenu}
    >
      {/* W5/Wave C — `icon` shape: glyph + label-below-glyph, entirely composed
          by IconShapeBody (mirrors chip-icon/person's label-below-icon layout
          but as a single self-contained body rather than a silhouette +
          separate label span). Colors: an explicit fill/stroke on the object
          wins (same `hasExplicitColor` precedent as chip-icon/person/chat);
          otherwise the glyph uses a neutral dark stroke with no fill, per the
          brief's "bbox" outline tier (no chip background behind the glyph). */}
      <IconShapeBody
        object={object}
        colors={hasExplicitColor ? { stroke: colors.border, fill: colors.fill } : undefined}
        hideLabel={hideLabel}
      />
      {showPorts && <EdgePorts object={object} zoom={zoom} />}
    </ObjectButtonChrome>
  );
}

export const iconDef: ObjectDef = {
  kind: "icon",
  render: IconObjectView,
  css: "",
  defaults: {
    geometry: { x: 160, y: 160, width: 120, height: 120 },
    tone: "neutral",
    shape: "icon",
    label: "Icon",
  },
  handles: "all",
  hitTest: "solid",
  dragCapture: "none",
  // Pre-migration, this type resolved to the "shape" toolbar variant.
  toolbar: SHAPE_TOOLBAR,
  labelEditing: { target: "label" },
};

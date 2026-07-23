"use client";

import { IconShapeBody } from "./IconShapeBody";
import { objectTypeDefaults } from "../../../state/schema/object-defaults";
import { BBOX_OUTLINE } from "../../geometry";
import { ObjectShell, ObjectSlotText, resolveObjectRoleColors, type ResolvedShapeObjectColors } from "../../object-shell";
import type { ObjectDef, ObjectRenderProps } from "../../object-def";
import { BELOW_TEXT_SLOT } from "../../text-slots";
import { SHAPE_TOOLBAR } from "../toolbar";

/**
 * The `icon` shape (Advanced-tier glyph family) renders its own self-contained
 * glyph+label body via IconShapeBody (bbox outline tier, no silhouette/polygon
 * overlay) rather than the standard label/body span pair — mirrors legacy
 * ObjectShape's `isIconShape` branch byte-for-byte (RESTRUCTURE.md step 4).
 */
function IconObjectView(props: ObjectRenderProps) {
  const { object, hideText } = props;
  // P1/D13 — no fixed/inert-default carve-outs: fill paints glyph interiors
  // and stroke is ink like every other shape.
  const colors = resolveObjectRoleColors(object, "shape") as ResolvedShapeObjectColors;

  return (
    <ObjectShell
      object={object}
      renderShape="icon"
      className="interactive-canvas-object interactive-canvas-object-icon"
      selected={props.selected}
      changed={props.changed}
      dropTarget={props.dropTarget}
      editable={props.editable}
      bounds={props.bounds}
      buttonBorder="suppressed"
      onObjectSelect={props.onObjectSelect}
      onObjectContextMenu={props.onObjectContextMenu}
    >
      {/* W5/Wave C — `icon` shape: IconShapeBody paints the glyph; the text
          renders through the shared "below" slot preset. Colors (P1/D13): resolved palette pick —
          fill paints glyph interiors; stroke is ink. */}
      <IconShapeBody
        object={object}
        colors={{
          stroke: colors.border,
          fill: colors.fill,
        }}
      />
      {!hideText && (
        <ObjectSlotText
          object={object}
          slot={BELOW_TEXT_SLOT}
          buttonBorder="suppressed"
          className="interactive-canvas-label-below-icon"
        />
      )}
    </ObjectShell>
  );
}

export const iconDef: ObjectDef = {
  kind: "icon",
  render: IconObjectView,
  /*
   * IconShapeBody paints the glyph itself and the brief's "bbox" tier means
   * NO chip/box behind it, so the button trim goes fully transparent —
   * `!important` beats objectStyle's inline `background: colors.fill`.
   * Hover/selection feedback comes back as the standard bounding-box outline.
   */
  css: `
        .interactive-canvas-object-icon {
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          overflow: visible;
          padding: 2px;
        }
`,
  // Stamped from the schema-vocabulary defaults leaf (P4) like every def.
  defaults: objectTypeDefaults("icon"),
  colorRole: "shape",
  buttonBorder: "suppressed",
  handles: "all",
  outline: BBOX_OUTLINE,
  dragCapture: "none",
  // Pre-migration, this type resolved to the "shape" toolbar variant.
  toolbar: SHAPE_TOOLBAR,
  textSlot: BELOW_TEXT_SLOT,
  textEditing: { editable: true },
};

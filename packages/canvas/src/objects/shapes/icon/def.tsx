"use client";

import { IconShapeBody, type IconShapeBodyColors } from "./IconShapeBody";
import { FIRST_USE_COLORS, objectTypeDefaults } from "../../../state/schema/object-defaults";
import { useCanvasStyle } from "../../../theme/canvas-style-context";
import { resolveIconTilePaint } from "../../../theme/palette";
import { BBOX_OUTLINE } from "../../geometry";
import { ObjectShell, ObjectSlotText } from "../../object-shell";
import type { ObjectDef, ObjectRenderProps } from "../../object-def";
import { BELOW_TEXT_SLOT, iconTileRectPx } from "../../text-slots";
import { SHAPE_TOOLBAR } from "../toolbar";

/**
 * The `icon` shape (Advanced-tier glyph family) renders its own self-contained
 * glyph+label body via IconShapeBody (bbox outline tier, no silhouette/polygon
 * overlay) rather than the standard label/body span pair — mirrors legacy
 * ObjectShape's `isIconShape` branch byte-for-byte (RESTRUCTURE.md step 4).
 */
function IconObjectView(props: ObjectRenderProps) {
  const { object, hideText } = props;
  // P1/D13 — no fixed/inert-default carve-outs. The canvas style picks the
  // glyph corpus (iconPack) and the icon style: `glyph` strokes the ink with
  // the shape fill in the glyph's interiors (figjam); `tile` sets the glyph
  // on a tile — solid ink, or a light ink tint for a large tile
  // (theme/palette.ts resolveIconTilePaint, sized by the capped tile side).
  const canvasStyle = useCanvasStyle();
  const paint = resolveIconTilePaint(
    object.color ?? FIRST_USE_COLORS.shape,
    canvasStyle,
    iconTileRectPx(object.geometry.width, object.geometry.height, canvasStyle.iconTileMaxPx).width,
  );
  const colors: IconShapeBodyColors =
    paint.tileFill === null
      ? { stroke: paint.glyph, fill: paint.glyphFill ?? undefined }
      : {
          stroke: paint.glyph,
          tileFill: paint.tileFill,
          tileBorder: paint.tileBorder ?? undefined,
          tileBorderWidthPx: paint.tileBorderWidthPx,
        };

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
          (name + detail line) renders through the shared "below" slot preset. */}
      <IconShapeBody
        object={object}
        colors={colors}
        iconPack={canvasStyle.iconPack}
        tileMaxPx={canvasStyle.iconTileMaxPx}
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

"use client";

import { resolveObjectColors, resolveObjectStrokeWidth } from "./theme";
import { IconShapeBody } from "./IconShapeBody";
import { ShapeSilhouette } from "./ShapeSilhouette";
import { objectDefFor, type ObjectRenderProps } from "../objects/object-def";
import { EdgePorts, objectStyle } from "../objects/object-chrome";
import type { InteractiveCanvasObject } from "../model/schema";

type LegacyObjectShapeVariant = NonNullable<NonNullable<InteractiveCanvasObject["style"]>["shape"]>;

function classNameForObjectShape(shape: LegacyObjectShapeVariant): string {
  const base = "interactive-canvas-object";
  switch (shape) {
    case "folder":
    case "document-stack":
    case "cylinder-horizontal":
    case "icon":
      return `${base} interactive-canvas-object-${shape}`;
    default:
      return base;
  }
}

export function ObjectShape(props: ObjectRenderProps) {
  // Two-tier registry dispatch (RESTRUCTURE.md step 4): converted kinds render
  // through ObjectDefs (section by type; everything else by effective render
  // shape). After batch 2 only four shapes still fall through to the legacy
  // branch below: folder, document-stack, cylinder-horizontal (ShapeSilhouette
  // trio) and icon (IconShapeBody) — batch 3 converts them and deletes it.
  const def = objectDefFor(props.object);
  if (def) {
    const DefRender = def.render;
    return <DefRender {...props} />;
  }
  return <LegacyObjectShape {...props} />;
}

function LegacyObjectShape({
  object,
  selected,
  changed,
  dropTarget,
  compact,
  bounds,
  editable,
  showPorts,
  zoom = 1,
  hideLabel,
  onObjectSelect,
  onObjectContextMenu,
}: ObjectRenderProps) {
  const shape = object.style?.shape ?? "rounded-rect";
  const className = classNameForObjectShape(shape);
  const colors = resolveObjectColors(object.style);
  const hasExplicitColor = Boolean(
    object.style?.paletteToken || object.style?.tone || object.style?.fill || object.style?.stroke,
  );
  const shapeStrokeWidth = resolveObjectStrokeWidth(object.style);
  const svgShape =
    shape === "folder" || shape === "document-stack" || shape === "cylinder-horizontal" ? shape : null;
  // W5/Wave C — the `icon` type (Advanced-tier glyph family) renders its own
  // self-contained glyph+label body via IconShapeBody (bbox outline tier, no
  // silhouette/polygon overlay) rather than composing through the svgShape
  // path above, since IconShapeBody already bundles the label-below-glyph
  // layout internally (see render/IconShapeBody.tsx).
  const isIconShape = shape === "icon";

  return (
    <button
      type="button"
      className={className}
      data-docs-target="true"
      data-docs-target-type={`canvas-${object.type}`}
      data-source-id={object.id}
      data-docs-target-label={`canvas: ${object.label}`}
      data-canvas-object-id={object.id}
      data-canvas-object-type={object.type}
      data-canvas-object-shape={shape}
      data-selected={selected ? "true" : undefined}
      data-changed={changed ? "true" : undefined}
      data-drop-target={dropTarget ? "true" : undefined}
      data-editable={(editable ?? Boolean(onObjectSelect)) ? "true" : undefined}
      aria-label={object.label}
      style={objectStyle(object)}
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
      {svgShape && <ShapeSilhouette shape={svgShape} colors={colors} strokeWidth={shapeStrokeWidth} />}
      {!hideLabel && !isIconShape && (
        <span className="interactive-canvas-object-label">{object.label}</span>
      )}
      {object.body && !compact && !isIconShape && (
        <span className="interactive-canvas-object-body">{object.body}</span>
      )}
      {/* W5/Wave C — `icon` shape: glyph + label-below-glyph, entirely composed
          by IconShapeBody (mirrors chip-icon/person's label-below-icon layout
          but as a single self-contained body rather than a silhouette +
          separate label span). Colors: an explicit fill/stroke on the object
          wins (same `hasExplicitColor` precedent as chip-icon/person/chat);
          otherwise the glyph uses a neutral dark stroke with no fill, per the
          brief's "bbox" outline tier (no chip background behind the glyph). */}
      {isIconShape && (
        <IconShapeBody
          object={object}
          colors={hasExplicitColor ? { stroke: colors.border, fill: colors.fill } : undefined}
          hideLabel={hideLabel}
        />
      )}
      {showPorts && <EdgePorts object={object} zoom={zoom} />}
    </button>
  );
}

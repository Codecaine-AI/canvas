"use client";

import type { CSSProperties } from "react";
import type { CanvasPoint } from "../model/geometry";
import {
  arrowShapePoints,
  chevronPoints,
  hexagonPoints,
  manualInputPoints,
  octagonPoints,
  offPageConnectorPoints,
  parallelogramPoints,
  pentagonPoints,
  plusPoints,
  starPoints,
  trapezoidPoints,
  trianglePoints,
} from "../routing/connection-overlay";
import { resolveObjectColors, resolveObjectStrokeWidth } from "./theme";
import { IconShapeBody } from "./IconShapeBody";
import { ShapeSilhouette } from "./ShapeSilhouette";
import {
  ARROW_SHAPE_GEOMETRY,
  CHEVRON_GEOMETRY,
  PREDEFINED_PROCESS_GEOMETRY,
} from "./figjam-tokens";
import { objectDefFor, type ObjectRenderProps } from "../objects/object-def";
import { EdgePorts, objectStyle } from "../objects/object-chrome";
import type { InteractiveCanvasObject } from "../model/schema";

function pointsAttribute(points: CanvasPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

type LegacyObjectShapeVariant = NonNullable<NonNullable<InteractiveCanvasObject["style"]>["shape"]>;

function classNameForObjectShape(shape: LegacyObjectShapeVariant): string {
  const base = "interactive-canvas-object";
  switch (shape) {
    case "diamond":
    case "marker":
    case "document":
    case "database":
    case "chat":
    case "chip-icon":
    case "pill":
    case "arrow-shape":
    case "predefined-process":
    case "triangle":
    case "parallelogram":
    case "pentagon":
    case "octagon":
    case "star":
    case "plus":
    case "chevron":
    case "folder":
    case "document-stack":
    case "off-page-connector":
    case "trapezoid":
    case "manual-input":
    case "hexagon":
    case "internal-storage":
    case "or-junction":
    case "summing-junction":
    case "cylinder-horizontal":
    case "page-corner":
    case "icon":
      return `${base} interactive-canvas-object-${shape}`;
    default:
      return base;
  }
}

export function ObjectShape(props: ObjectRenderProps) {
  // Two-tier registry dispatch (RESTRUCTURE.md step 4): converted kinds render
  // through ObjectDefs (specials by type: section/container; specials/shapes
  // by render shape: text/"label", sticky/"note", code-block, process/
  // "rounded-rect", ellipse, person). Everything else falls through to the
  // legacy branches below until the mass conversion completes.
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
  // chat/chip-icon lean on the SVG silhouette for the shape itself, so body
  // copy (and, below a compact height, even the label) is dropped to keep
  // the silhouette legible rather than overrun with text. Their label
  // renders BELOW the icon (bold black), not overlaid on it (W2 restyle).
  // (person, the third member of this family, now renders via its def.)
  const isCompactSilhouette = shape === "chat" && object.geometry.height < 100;
  const svgShape =
    shape === "database" ||
    shape === "chat" ||
    shape === "chip-icon" ||
    shape === "document" ||
    shape === "folder" ||
    shape === "document-stack" ||
    shape === "cylinder-horizontal"
      ? shape
      : null;
  const labelBelowIcon = shape === "chat" || shape === "chip-icon";
  // W5/Wave C — the `icon` type (Advanced-tier glyph family) renders its own
  // self-contained glyph+label body via IconShapeBody (bbox outline tier, no
  // silhouette/polygon overlay) rather than composing through the
  // svgShape/labelBelowIcon paths above, since IconShapeBody already bundles
  // the label-below-glyph layout internally (see render/IconShapeBody.tsx).
  const isIconShape = shape === "icon";
  const hidesVisibleText = shape === "plus" || shape === "or-junction" || shape === "summing-junction";
  const localShapeBounds = { x: 0, y: 0, width: object.geometry.width, height: object.geometry.height };

  // W2/W4 — arrow-shape (fat chevron): a single SVG polygon tracing the full
  // 7-point silhouette (body + head + notch) — the same outline connector
  // attachment uses (connection-overlay.ts arrowShapePoints) — so an explicit
  // stroke traces the whole chevron, not just a body rect.
  const arrowDirection: "left" | "right" = object.direction === "left" ? "left" : "right";
  const arrowSilhouettePoints =
    shape === "arrow-shape"
      ? pointsAttribute(arrowShapePoints(localShapeBounds, arrowDirection))
      : null;
  const horizontalDirection: "left" | "right" = object.direction === "left" ? "left" : "right";
  const triangleDirection: "up" | "down" = object.direction === "down" ? "down" : "up";
  const trueOutlinePolygonPoints =
    shape === "triangle"
      ? pointsAttribute(trianglePoints(localShapeBounds, triangleDirection))
      : shape === "parallelogram"
        ? pointsAttribute(parallelogramPoints(localShapeBounds, horizontalDirection))
        : shape === "pentagon"
          ? pointsAttribute(pentagonPoints(localShapeBounds))
          : shape === "octagon"
            ? pointsAttribute(octagonPoints(localShapeBounds))
            : shape === "star"
              ? pointsAttribute(starPoints(localShapeBounds))
              : shape === "plus"
                ? pointsAttribute(plusPoints(localShapeBounds))
                : shape === "chevron"
                  ? pointsAttribute(chevronPoints(localShapeBounds, horizontalDirection))
                  : shape === "off-page-connector"
                    ? pointsAttribute(offPageConnectorPoints(localShapeBounds))
                    : shape === "trapezoid"
                      ? pointsAttribute(trapezoidPoints(localShapeBounds))
                      : shape === "manual-input"
                        ? pointsAttribute(manualInputPoints(localShapeBounds))
                        : shape === "hexagon"
                          ? pointsAttribute(hexagonPoints(localShapeBounds))
                          : null;
  // (plain `ellipse` now renders via its def; the junction variants keep the
  // shared ellipse silhouette below for their inscribed cross/X strokes.)
  const ellipseSilhouette = shape === "or-junction" || shape === "summing-junction";
  const labelStyle: CSSProperties | undefined =
    shape === "arrow-shape"
      ? {
          // Center the label within the chevron BODY (the head side carries no
          // text in FigJam), not the full bounding box.
          [arrowDirection === "left" ? "marginLeft" : "marginRight"]: `${
            ARROW_SHAPE_GEOMETRY.headWidthRatio * 100
          }%`,
        }
      : shape === "chevron"
        ? {
            [horizontalDirection === "left" ? "marginLeft" : "marginRight"]: `${
              CHEVRON_GEOMETRY.notchWidthRatio * 100
            }%`,
          }
        : undefined;

  // W2 — predefined-process: rect with two inner vertical bars inset from
  // each edge (PREDEFINED_PROCESS_GEOMETRY.barInsetRatio of total width).
  const barInsetPct = PREDEFINED_PROCESS_GEOMETRY.barInsetRatio * 100;

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
      {svgShape && (
        <ShapeSilhouette
          shape={svgShape}
          colors={colors}
          hasExplicitColor={hasExplicitColor}
          strokeWidth={
            shape === "document" ||
            shape === "folder" ||
            shape === "document-stack" ||
            shape === "cylinder-horizontal"
              ? shapeStrokeWidth
              : undefined
          }
        />
      )}
      {ellipseSilhouette && (
        <svg
          aria-hidden="true"
          className="interactive-canvas-true-outline-silhouette"
          data-canvas-shape-silhouette={shape}
          viewBox={`0 0 ${object.geometry.width} ${object.geometry.height}`}
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
        >
          <ellipse
            cx="50%"
            cy="50%"
            rx="50%"
            ry="50%"
            fill={colors.fill}
            stroke={colors.border}
            strokeWidth={shapeStrokeWidth}
          />
          {/* FigJam or-junction carries an inscribed "+" and summing-junction an
              inscribed "x" — endpoints sit on the ellipse outline (cardinals for
              the cross; the 45deg parametric points, cos45 ~= 0.3536, for the X). */}
          {shape === "or-junction" && (
            <>
              <line x1="50%" y1="0%" x2="50%" y2="100%" stroke={colors.border} strokeWidth={shapeStrokeWidth} />
              <line x1="0%" y1="50%" x2="100%" y2="50%" stroke={colors.border} strokeWidth={shapeStrokeWidth} />
            </>
          )}
          {shape === "summing-junction" && (
            <>
              <line x1="14.64%" y1="14.64%" x2="85.36%" y2="85.36%" stroke={colors.border} strokeWidth={shapeStrokeWidth} />
              <line x1="14.64%" y1="85.36%" x2="85.36%" y2="14.64%" stroke={colors.border} strokeWidth={shapeStrokeWidth} />
            </>
          )}
        </svg>
      )}
      {trueOutlinePolygonPoints && (
        <svg
          aria-hidden="true"
          className="interactive-canvas-true-outline-silhouette"
          data-canvas-shape-silhouette={shape}
          viewBox={`0 0 ${object.geometry.width} ${object.geometry.height}`}
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
        >
          <polygon
            points={trueOutlinePolygonPoints}
            fill={colors.fill}
            stroke={colors.border}
            strokeWidth={shapeStrokeWidth}
            strokeLinejoin="round"
          />
        </svg>
      )}
      {shape === "arrow-shape" && arrowSilhouettePoints && (
        <svg
          aria-hidden="true"
          className="interactive-canvas-arrow-shape-silhouette"
          data-canvas-arrow-direction={arrowDirection}
          viewBox={`0 0 ${object.geometry.width} ${object.geometry.height}`}
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
        >
          <polygon
            points={arrowSilhouettePoints}
            fill={colors.fill}
            stroke={colors.border}
            strokeWidth={shapeStrokeWidth}
            strokeLinejoin="round"
          />
        </svg>
      )}
      {shape === "predefined-process" && (
        <>
          <span
            aria-hidden="true"
            className="interactive-canvas-predefined-process-bar"
            style={{ left: `${barInsetPct}%` }}
          />
          <span
            aria-hidden="true"
            className="interactive-canvas-predefined-process-bar"
            style={{ right: `${barInsetPct}%`, left: "auto" }}
          />
        </>
      )}
      {shape === "internal-storage" && (
        <>
          <span
            aria-hidden="true"
            className="interactive-canvas-internal-storage-rule interactive-canvas-internal-storage-rule-vertical"
          />
          <span
            aria-hidden="true"
            className="interactive-canvas-internal-storage-rule interactive-canvas-internal-storage-rule-horizontal"
          />
        </>
      )}
      {!hideLabel && !labelBelowIcon && !isIconShape && !hidesVisibleText && (
        <span className="interactive-canvas-object-label" style={labelStyle}>
          {object.label}
        </span>
      )}
      {object.body && !compact && !isCompactSilhouette && !isIconShape && !hidesVisibleText && (
        <span className="interactive-canvas-object-body">{object.body}</span>
      )}
      {labelBelowIcon && !hideLabel && (
        <span className="interactive-canvas-object-label interactive-canvas-label-below-icon">
          {object.label}
        </span>
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

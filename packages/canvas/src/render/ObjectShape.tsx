"use client";

import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import type { CanvasBounds, CanvasPoint } from "../model/geometry";
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
import type { Anchor } from "../routing/routing";
import { resolveObjectColors, resolveObjectStrokeWidth } from "./theme";
import { tokenizeCodeBlock } from "./code-tokenizer";
import { IconShapeBody } from "./IconShapeBody";
import { ShapeSilhouette } from "./ShapeSilhouette";
import { SectionShape } from "./SectionShape";
import {
  ARROW_SHAPE_GEOMETRY,
  CHEVRON_GEOMETRY,
  PREDEFINED_PROCESS_GEOMETRY,
} from "./figjam-tokens";
import type { InteractiveCanvasObject } from "../model/schema";

const EDGE_PORT_ANCHORS: Anchor[] = ["top", "right", "bottom", "left"];

function objectStyle(object: InteractiveCanvasObject): CSSProperties {
  const colors = resolveObjectColors(object.style);
  const style: CSSProperties = {
    left: `${object.geometry.x}px`,
    top: `${object.geometry.y}px`,
    width: `${object.geometry.width}px`,
    height: `${object.geometry.height}px`,
    background: colors.fill,
    borderColor: colors.border,
    color: colors.text,
    // W4 z-layering (see the connector <svg> comment in CanvasStage): non-
    // section shapes paint above the connector layer (z 1); sections render
    // via SectionShape (explicit z 0) below it.
    zIndex: 2,
  };
  // W4 — explicit stroke gets FigJam's universal 4px chrome (or the object's
  // own strokeWidth); tone/token-only objects keep the legacy 2px CSS border.
  if (object.style?.stroke || object.style?.strokeWidth) {
    style.borderWidth = `${resolveObjectStrokeWidth(object.style)}px`;
  }
  return style;
}

function pointsAttribute(points: CanvasPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

type RenderObjectShape = NonNullable<InteractiveCanvasObject["style"]>["shape"] | "label";

function classNameForObjectShape(shape: RenderObjectShape): string {
  const base = "interactive-canvas-object";
  switch (shape) {
    case "diamond":
    case "marker":
    case "note":
    case "document":
    case "person":
    case "database":
    case "chat":
    case "chip-icon":
    case "pill":
    case "arrow-shape":
    case "predefined-process":
    case "code-block":
    case "ellipse":
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
    case "label":
      return `${base} interactive-canvas-object-text-shape`;
    default:
      return base;
  }
}

export function ObjectShape({
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
}: {
  object: InteractiveCanvasObject;
  selected: boolean;
  changed: boolean;
  dropTarget?: boolean;
  compact?: boolean;
  bounds: CanvasBounds;
  /** Shows the grab-cursor affordance; defaults to true when any select/pointer handler is wired. */
  editable?: boolean;
  /** Renders quick-connect edge ports — only true in the interactive editor. */
  showPorts?: boolean;
  /** Current viewport zoom — used to counter-scale edge ports to a constant screen size. */
  zoom?: number;
  /** True while this object's label is being edited inline (4.2.1) — hides the static label span. */
  hideLabel?: boolean;
  onObjectSelect?: (objectId: string) => void;
  onObjectContextMenu?: (
    event: ReactMouseEvent<HTMLElement>,
    object: InteractiveCanvasObject,
    bounds: CanvasBounds,
  ) => void;
}) {
  if (object.type === "section") {
    return (
      <SectionShape
        object={object}
        selected={selected}
        dropTarget={dropTarget}
        bounds={bounds}
        editable={editable}
        hideTitle={hideLabel}
        onObjectSelect={onObjectSelect}
        onObjectContextMenu={onObjectContextMenu}
      />
    );
  }
  // W2 — standalone text objects render as a bold, borderless FigJam label
  // rather than the generic rounded-rect chrome (no explicit style.shape
  // value existed for "text" before this wave; it silently fell through to
  // rounded-rect, which is what the W2 brief asked to restyle).
  const shape = object.style?.shape ?? (object.type === "text" ? "label" : "rounded-rect");
  const className = classNameForObjectShape(shape);
  const colors = resolveObjectColors(object.style);
  const hasExplicitColor = Boolean(
    object.style?.paletteToken || object.style?.tone || object.style?.fill || object.style?.stroke,
  );
  const shapeStrokeWidth = resolveObjectStrokeWidth(object.style);
  // person/chat/chip-icon lean on the SVG silhouette for the shape itself, so
  // body copy (and, below a compact height, even the label) is dropped to
  // keep the silhouette legible rather than overrun with text. Their label
  // renders BELOW the icon (bold black), not overlaid on it (W2 restyle).
  const isCompactSilhouette = (shape === "person" || shape === "chat") && object.geometry.height < 100;
  const svgShape =
    shape === "person" ||
    shape === "database" ||
    shape === "chat" ||
    shape === "chip-icon" ||
    shape === "document" ||
    shape === "folder" ||
    shape === "document-stack" ||
    shape === "cylinder-horizontal"
      ? shape
      : null;
  const labelBelowIcon = shape === "person" || shape === "chat" || shape === "chip-icon";
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
  const ellipseSilhouette = shape === "ellipse" || shape === "or-junction" || shape === "summing-junction";
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

  // W2 — code-block: tokenized per-line rendering with an optional
  // right-aligned line-number gutter.
  const codeLines = shape === "code-block" ? tokenizeCodeBlock(object.body ?? "", object.language) : null;

  // W2 — sticky upgrade: author chip + "- " bullet rendering in the body text.
  const isSticky = shape === "note";
  const bodyLines = isSticky ? (object.body ?? "").split("\n") : null;

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
      {shape === "code-block" && codeLines && (
        <div className="interactive-canvas-code-block-body">
          {codeLines.map((line, lineIndex) => (
            // eslint-disable-next-line react/no-array-index-key -- lines are position-stable within a single render
            <div key={lineIndex} className="interactive-canvas-code-block-line">
              <span className="interactive-canvas-code-block-line-number">{lineIndex + 1}</span>
              <span className="interactive-canvas-code-block-line-code">
                {line.map((token, tokenIndex) => (
                  // eslint-disable-next-line react/no-array-index-key -- tokens are position-stable within a single render
                  <span key={tokenIndex} style={{ color: token.color }}>
                    {token.text}
                  </span>
                ))}
                {line.length === 0 && " "}
              </span>
            </div>
          ))}
        </div>
      )}
      {/* W4 — code-blocks render body-only (FigJam code blocks carry no label chrome). */}
      {!hideLabel &&
        !(isCompactSilhouette && shape === "person") &&
        !labelBelowIcon &&
        shape !== "code-block" &&
        !isIconShape &&
        !hidesVisibleText && (
        <span className="interactive-canvas-object-label" style={labelStyle}>
          {object.label}
        </span>
      )}
      {isSticky && bodyLines && (
        <span className="interactive-canvas-object-body interactive-canvas-sticky-body">
          {bodyLines.map((line, index) => {
            const isBullet = line.startsWith("- ");
            return (
              // eslint-disable-next-line react/no-array-index-key -- lines are position-stable within a single render
              <span key={index} className="interactive-canvas-sticky-line" data-bullet={isBullet ? "true" : undefined}>
                {isBullet ? line.slice(2) : line}
              </span>
            );
          })}
        </span>
      )}
      {object.body &&
        !compact &&
        !isCompactSilhouette &&
        shape !== "code-block" &&
        !isIconShape &&
        !isSticky &&
        !hidesVisibleText && (
        <span className="interactive-canvas-object-body">{object.body}</span>
      )}
      {isSticky && object.author && (
        <span className="interactive-canvas-sticky-author">{object.author}</span>
      )}
      {labelBelowIcon && !hideLabel && !(isCompactSilhouette && shape === "person") && (
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
      {showPorts &&
        EDGE_PORT_ANCHORS.map((anchor) => {
          const { fx, fy } = PORT_POSITIONS[anchor];
          return (
            <span
              key={anchor}
              className="interactive-canvas-edge-port"
              data-canvas-port={anchor}
              data-canvas-object-id={object.id}
              style={{
                position: "absolute",
                left: `${fx * 100}%`,
                top: `${fy * 100}%`,
                // Counter-scale against the world layer's zoom transform so the
                // port dot stays a constant screen size regardless of zoom.
                transform: `translate(-50%, -50%) scale(${1 / zoom})`,
              }}
              onClick={(event) => event.stopPropagation()}
            />
          );
        })}
    </button>
  );
}

/** Edge-port fractional offsets within an object's box, matching HANDLE_POSITIONS' side midpoints. */
const PORT_POSITIONS: Record<Anchor, { fx: number; fy: number }> = {
  top: { fx: 0.5, fy: 0 },
  right: { fx: 1, fy: 0.5 },
  bottom: { fx: 0.5, fy: 1 },
  left: { fx: 0, fy: 0.5 },
};

import { useId, useMemo, type ReactNode } from "react";
import { inhabit, type InhabitedShape } from "../inhabit";
import type { Point, Region } from "../types";

type StructureCanvasProps = {
  regions: readonly Region[];
  width: number;
  height: number;
  gutter?: number;
  depthTint?: boolean;
  inhabited?: boolean;
  seed?: number;
  className?: string;
};

const FRAME_PADDING = 48;

function signedArea(points: readonly Point[]): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function cross(left: Point, right: Point): number {
  return left.x * right.y - left.y * right.x;
}

/** Offset every polygon edge inward, intersecting adjacent shifted lines. */
function insetPolygon(points: readonly Point[], amount: number): Point[] {
  if (amount <= 0 || points.length < 3) return [...points];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const span = Math.max(1, Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)));
  const inset = Math.min(amount, span * 0.42);
  const orientation = signedArea(points) >= 0 ? 1 : -1;

  return points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const incoming = { x: point.x - previous.x, y: point.y - previous.y };
    const outgoing = { x: next.x - point.x, y: next.y - point.y };
    const incomingLength = Math.max(1e-9, Math.hypot(incoming.x, incoming.y));
    const outgoingLength = Math.max(1e-9, Math.hypot(outgoing.x, outgoing.y));
    const incomingUnit = { x: incoming.x / incomingLength, y: incoming.y / incomingLength };
    const outgoingUnit = { x: outgoing.x / outgoingLength, y: outgoing.y / outgoingLength };
    const incomingNormal = {
      x: -incomingUnit.y * orientation,
      y: incomingUnit.x * orientation,
    };
    const outgoingNormal = {
      x: -outgoingUnit.y * orientation,
      y: outgoingUnit.x * orientation,
    };
    const firstLinePoint = {
      x: point.x + incomingNormal.x * inset,
      y: point.y + incomingNormal.y * inset,
    };
    const secondLinePoint = {
      x: point.x + outgoingNormal.x * inset,
      y: point.y + outgoingNormal.y * inset,
    };
    const denominator = cross(incomingUnit, outgoingUnit);

    if (Math.abs(denominator) > 1e-7) {
      const delta = {
        x: secondLinePoint.x - firstLinePoint.x,
        y: secondLinePoint.y - firstLinePoint.y,
      };
      const distance = cross(delta, outgoingUnit) / denominator;
      const intersection = {
        x: firstLinePoint.x + incomingUnit.x * distance,
        y: firstLinePoint.y + incomingUnit.y * distance,
      };
      if (Math.hypot(intersection.x - point.x, intersection.y - point.y) <= inset * 8) {
        return intersection;
      }
    }

    const averageNormal = {
      x: incomingNormal.x + outgoingNormal.x,
      y: incomingNormal.y + outgoingNormal.y,
    };
    const averageLength = Math.max(1e-9, Math.hypot(averageNormal.x, averageNormal.y));
    return {
      x: point.x + averageNormal.x / averageLength * inset,
      y: point.y + averageNormal.y / averageLength * inset,
    };
  });
}

function pointsAttribute(points: readonly Point[]): string {
  return points.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(" ");
}

function roundedPolygonPath(points: readonly Point[], radius: number): string {
  if (points.length < 3) return "";
  const corners = points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const previousLength = Math.hypot(previous.x - point.x, previous.y - point.y);
    const nextLength = Math.hypot(next.x - point.x, next.y - point.y);
    const cornerRadius = Math.min(radius, previousLength / 2, nextLength / 2);
    return {
      point,
      before: {
        x: point.x + (previous.x - point.x) / Math.max(1e-9, previousLength) * cornerRadius,
        y: point.y + (previous.y - point.y) / Math.max(1e-9, previousLength) * cornerRadius,
      },
      after: {
        x: point.x + (next.x - point.x) / Math.max(1e-9, nextLength) * cornerRadius,
        y: point.y + (next.y - point.y) / Math.max(1e-9, nextLength) * cornerRadius,
      },
    };
  });
  let path = `M ${corners[0].before.x} ${corners[0].before.y}`;
  for (let index = 0; index < corners.length; index += 1) {
    const corner = corners[index];
    path += ` Q ${corner.point.x} ${corner.point.y} ${corner.after.x} ${corner.after.y}`;
    const nextCorner = corners[(index + 1) % corners.length];
    path += ` L ${nextCorner.before.x} ${nextCorner.before.y}`;
  }
  return `${path} Z`;
}

function tintForDepth(depth: number): string {
  return Math.abs(Math.round(depth)) % 2 === 0 ? "var(--structure-warm)" : "var(--structure-cool)";
}

function roundedLinePath(points: readonly Point[], radius = 7): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const incoming = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outgoing = Math.hypot(next.x - current.x, next.y - current.y);
    const curveRadius = Math.min(radius, incoming / 2, outgoing / 2);
    const before = {
      x: current.x + (previous.x - current.x) / Math.max(1e-9, incoming) * curveRadius,
      y: current.y + (previous.y - current.y) / Math.max(1e-9, incoming) * curveRadius,
    };
    const after = {
      x: current.x + (next.x - current.x) / Math.max(1e-9, outgoing) * curveRadius,
      y: current.y + (next.y - current.y) / Math.max(1e-9, outgoing) * curveRadius,
    };
    path += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`;
  }
  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}

function InhabitedShapeNode({ shape }: { shape: InhabitedShape }) {
  const radius = Math.min(9, shape.w / 4, shape.h / 4);
  let body: ReactNode;

  if (shape.appearance === "decision") {
    const centerX = shape.x + shape.w / 2;
    const centerY = shape.y + shape.h / 2;
    body = (
      <path
        className="inhabit-shape inhabit-decision"
        d={`M ${centerX} ${shape.y} L ${shape.x + shape.w} ${centerY} L ${centerX} ${shape.y + shape.h} L ${shape.x} ${centerY} Z`}
      />
    );
  } else {
    const shapeClass = `inhabit-shape inhabit-${shape.appearance}`;
    body = (
      <>
        {shape.appearance === "sticky" ? (
          <rect
            className="inhabit-sticky-shadow"
            x={shape.x + Math.min(4, shape.w * 0.035)}
            y={shape.y + Math.min(5, shape.h * 0.05)}
            width={shape.w}
            height={shape.h}
            rx={radius}
          />
        ) : null}
        <rect
          className={shapeClass}
          x={shape.x}
          y={shape.y}
          width={shape.w}
          height={shape.h}
          rx={shape.appearance === "pill" ? shape.h / 2 : radius}
        />
      </>
    );
  }

  return (
    <g data-content={shape.appearance}>
      {body}
      {shape.lines.map((line, index) => (
        <line
          className="inhabit-fake-text"
          key={`${shape.id}-line-${index}`}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
        />
      ))}
    </g>
  );
}

function edgeInset(depth: number | undefined, gutter: number): number {
  return depth === undefined ? 0 : gutter * Math.max(0.2, 0.6 ** depth) / 2;
}

export function StructureCanvas({
  regions,
  width,
  height,
  gutter = 0,
  depthTint = true,
  inhabited = false,
  seed = 1,
  className,
}: StructureCanvasProps) {
  const clipId = useId().replace(/:/g, "");
  const markerId = `${clipId}-arrow`;
  const inset = gutter / 2;
  const scene = useMemo(
    () => inhabited ? inhabit(regions, seed, { gutter }) : null,
    [gutter, inhabited, regions, seed],
  );

  return (
    <svg
      className={className ? `structure-canvas ${className}` : "structure-canvas"}
      viewBox={`${-FRAME_PADDING} ${-FRAME_PADDING} ${width + FRAME_PADDING * 2} ${height + FRAME_PADDING * 2}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${inhabited ? "Inhabited" : "Empty"} mathematical partition with ${regions.length} cells`}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={width} height={height} rx={1} />
        </clipPath>
        <marker
          id={markerId}
          markerWidth={8}
          markerHeight={8}
          refX={7}
          refY={4}
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path className="inhabit-arrow" d="M 0 0 L 8 4 L 0 8 Z" />
        </marker>
        {scene ? regions.map((region, index) => (
          <clipPath id={`${clipId}-cell-${index}`} key={`clip-${index}`}>
            {region.kind === "rect" ? (
              <rect x={region.x} y={region.y} width={region.w} height={region.h} />
            ) : (
              <polygon points={pointsAttribute(region.points)} />
            )}
          </clipPath>
        )) : null}
      </defs>
      <rect
        className="structure-paper"
        x={-FRAME_PADDING}
        y={-FRAME_PADDING}
        width={width + FRAME_PADDING * 2}
        height={height + FRAME_PADDING * 2}
      />
      <g clipPath={`url(#${clipId})`}>
        <rect className="structure-frame-ground" x={0} y={0} width={width} height={height} />
        {regions.map((region, index) => {
          const fill = depthTint ? tintForDepth(region.depth) : "transparent";
          if (region.kind === "rect") {
            const hierarchical = region.gutterDepth !== undefined;
            const leftInset = hierarchical ? edgeInset(region.gutterDepth?.left, gutter) : inset;
            const rightInset = hierarchical ? edgeInset(region.gutterDepth?.right, gutter) : inset;
            const topInset = hierarchical ? edgeInset(region.gutterDepth?.top, gutter) : inset;
            const bottomInset = hierarchical ? edgeInset(region.gutterDepth?.bottom, gutter) : inset;
            const x = region.x + leftInset;
            const y = region.y + topInset;
            const rectWidth = Math.max(0, region.w - leftInset - rightInset);
            const rectHeight = Math.max(0, region.h - topInset - bottomInset);
            return (
              <rect
                key={index}
                className="structure-region"
                x={x}
                y={y}
                width={rectWidth}
                height={rectHeight}
                rx={gutter > 0 ? Math.min(4, rectWidth / 2, rectHeight / 2) : 0}
                fill={fill}
              />
            );
          }
          const points = insetPolygon(region.points, inset);
          return gutter > 0 ? (
            <path
              key={index}
              className="structure-region"
              d={roundedPolygonPath(points, 4)}
              fill={fill}
              strokeLinejoin="round"
            />
          ) : (
            <polygon
              key={index}
              className="structure-region"
              points={pointsAttribute(points)}
              fill={fill}
            />
          );
        })}
        {scene ? (
          <g className="inhabited-scene">
            {scene.cells.map((cell) => (
              <g
                key={`cell-section-${cell.regionIndex}`}
                clipPath={`url(#${clipId}-cell-${cell.regionIndex})`}
              >
                {cell.shapes
                  .filter((shape) => shape.appearance === "section")
                  .map((shape) => <InhabitedShapeNode key={shape.id} shape={shape} />)}
              </g>
            ))}
            <g className="inhabit-connectors" pointerEvents="none">
              {scene.connectors.map((connector) => (
                <path
                  key={connector.id}
                  className={`inhabit-connector ${connector.crossCell ? "cross-cell" : "within-cell"}`}
                  d={roundedLinePath(connector.points)}
                  markerEnd={`url(#${markerId})`}
                />
              ))}
            </g>
            {scene.cells.map((cell) => (
              <g
                key={`cell-content-${cell.regionIndex}`}
                className={`inhabit-cell role-${cell.role}`}
                clipPath={`url(#${clipId}-cell-${cell.regionIndex})`}
              >
                {cell.shapes
                  .filter((shape) => shape.appearance !== "section")
                  .map((shape) => <InhabitedShapeNode key={shape.id} shape={shape} />)}
              </g>
            ))}
          </g>
        ) : null}
      </g>
      <rect className="structure-frame-line" x={0} y={0} width={width} height={height} />
    </svg>
  );
}

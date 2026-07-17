import { useId, type ReactNode } from "react";
import type {
  CompileResult,
  CompiledConnector,
  CompiledObject,
  CompiledPoint,
} from "../agent/types";

export type BoardOverlays = {
  regions: boolean;
  gutters: boolean;
  grid: boolean;
  occupancy: boolean;
};

type BoardProps = {
  result: CompileResult | null;
  overlays: BoardOverlays;
};

function roundedPath(points: readonly CompiledPoint[], radius = 6): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const incoming = Math.abs(current.x - previous.x) + Math.abs(current.y - previous.y);
    const outgoing = Math.abs(next.x - current.x) + Math.abs(next.y - current.y);
    const curveRadius = Math.min(radius, incoming / 2, outgoing / 2);
    const before = {
      x: current.x + Math.sign(previous.x - current.x) * curveRadius,
      y: current.y + Math.sign(previous.y - current.y) * curveRadius,
    };
    const after = {
      x: current.x + Math.sign(next.x - current.x) * curveRadius,
      y: current.y + Math.sign(next.y - current.y) * curveRadius,
    };
    path += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`;
  }
  const end = points[points.length - 1];
  return `${path} L ${end.x} ${end.y}`;
}

function Section({ object }: { object: CompiledObject }) {
  const chipWidth = Math.min(object.width - 24, Math.max(74, object.label.length * 7.4 + 22));
  return (
    <g data-id={object.id}>
      <rect
        x={object.x}
        y={object.y}
        width={object.width}
        height={object.height}
        rx={12}
        fill="#f3f4f6"
        stroke="#d1d5db"
      />
      <rect
        x={object.x + 12}
        y={object.y + 12}
        width={chipWidth}
        height={25}
        rx={7}
        fill="#fff"
        stroke="#e5e7eb"
      />
      <text
        x={object.x + 22}
        y={object.y + 29}
        fill="#374151"
        fontSize={14}
        fontWeight={650}
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
      >
        {object.label}
      </text>
    </g>
  );
}

function NodeShape({ object }: { object: CompiledObject }) {
  let shape: ReactNode;
  if (object.type === "sticky") {
    shape = (
      <>
        <rect
          x={object.x + 3}
          y={object.y + 5}
          width={object.width}
          height={object.height}
          rx={8}
          fill="#92400e"
          opacity={0.11}
        />
        <rect
          x={object.x}
          y={object.y}
          width={object.width}
          height={object.height}
          rx={8}
          fill="#fde68a"
          stroke="#fcd34d"
          strokeWidth={1.25}
        />
      </>
    );
  } else if (object.type === "diamond") {
    const centerX = object.x + object.width / 2;
    const centerY = object.y + object.height / 2;
    shape = (
      <path
        d={`M ${centerX} ${object.y} L ${object.x + object.width} ${centerY} L ${centerX} ${object.y + object.height} L ${object.x} ${centerY} Z`}
        fill="#fff"
        stroke="#9ca3af"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    );
  } else {
    shape = (
      <rect
        x={object.x}
        y={object.y}
        width={object.width}
        height={object.height}
        rx={8}
        fill="#fff"
        stroke="#9ca3af"
        strokeWidth={1.5}
      />
    );
  }

  const maximumCharacters = Math.max(8, Math.floor(object.width / 8));
  const label =
    object.label.length > maximumCharacters
      ? `${object.label.slice(0, maximumCharacters - 1)}…`
      : object.label;
  return (
    <g data-id={object.id}>
      {shape}
      <text
        x={object.x + object.width / 2}
        y={object.y + object.height / 2 + 5}
        fill="#1f2937"
        fontSize={13}
        fontWeight={550}
        textAnchor="middle"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
      >
        {label}
      </text>
    </g>
  );
}

function Connector({ connector, markerId }: { connector: CompiledConnector; markerId: string }) {
  const labelWidth = Math.max(34, connector.label.length * 6.2 + 12);
  return (
    <g data-connector={connector.id} pointerEvents="none">
      <path
        d={roundedPath(connector.points)}
        fill="none"
        stroke="#9ca3af"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd={`url(#${markerId})`}
      />
      {connector.label ? (
        <>
          <rect
            x={connector.labelPoint.x - labelWidth / 2}
            y={connector.labelPoint.y - 11}
            width={labelWidth}
            height={20}
            rx={6}
            fill="#fff"
            stroke="#e5e7eb"
            opacity={0.96}
          />
          <text
            x={connector.labelPoint.x}
            y={connector.labelPoint.y + 3}
            fill="#6b7280"
            fontSize={10}
            fontWeight={600}
            textAnchor="middle"
            fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
          >
            {connector.label}
          </text>
        </>
      ) : null}
    </g>
  );
}

export function Board({ result, overlays }: BoardProps) {
  const uniqueId = useId().replaceAll(":", "");
  const dotPatternId = `dot-grid-${uniqueId}`;
  const reservePatternId = `reserve-hatch-${uniqueId}`;
  const markerId = `arrow-${uniqueId}`;

  if (!result?.canvas) {
    return <div className="board-empty">No valid compile yet.</div>;
  }

  const sections = result.objects.filter((object) => object.type === "section");
  const nodes = result.objects.filter((object) => object.type !== "section");
  return (
    <svg
      className="board"
      viewBox={`0 0 ${result.canvas.width} ${result.canvas.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Compiled FigJam-style layout board"
    >
      <defs>
        <pattern
          id={dotPatternId}
          width={result.canvas.effectiveGrid}
          height={result.canvas.effectiveGrid}
          patternUnits="userSpaceOnUse"
        >
          <circle cx={1} cy={1} r={1} fill="#d7dee8" />
        </pattern>
        <pattern
          id={reservePatternId}
          width={12}
          height={12}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1={0} y1={0} x2={0} y2={12} stroke="#bfdbfe" strokeWidth={3} opacity={0.45} />
        </pattern>
        <marker
          id={markerId}
          markerWidth={8}
          markerHeight={8}
          refX={7}
          refY={4}
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 0 L 8 4 L 0 8 Z" fill="#9ca3af" />
        </marker>
      </defs>

      <rect
        x={0}
        y={0}
        width={result.canvas.width}
        height={result.canvas.height}
        fill={overlays.grid ? `url(#${dotPatternId})` : "#fcfdff"}
      />

      {sections.map((object) => <Section key={object.id} object={object} />)}
      {result.connectors.map((connector) => (
        <Connector key={connector.id} connector={connector} markerId={markerId} />
      ))}
      {nodes.map((object) => <NodeShape key={object.id} object={object} />)}

      {overlays.gutters ? (
        <g pointerEvents="none">
          {result.gutters.map((gutter) => {
            const vertical = gutter.orientation === "vertical";
            return (
              <g key={gutter.id}>
                {gutter.width > 0 && gutter.height > 0 ? (
                  <rect
                    x={gutter.x}
                    y={gutter.y}
                    width={gutter.width}
                    height={gutter.height}
                    fill="#3b82f6"
                    opacity={0.08}
                  />
                ) : null}
                <line
                  x1={vertical ? gutter.x + gutter.width / 2 : gutter.x}
                  y1={vertical ? gutter.y : gutter.y + gutter.height / 2}
                  x2={vertical ? gutter.x + gutter.width / 2 : gutter.x + gutter.width}
                  y2={vertical ? gutter.y + gutter.height : gutter.y + gutter.height / 2}
                  stroke="#60a5fa"
                  opacity={0.5}
                  strokeDasharray="5 5"
                />
              </g>
            );
          })}
        </g>
      ) : null}

      {overlays.regions ? (
        <g pointerEvents="none">
          {result.regions.map((region) => {
            const chipWidth = Math.max(25, region.address.length * 7 + 10);
            return (
              <g key={region.address}>
                {region.reserved ? (
                  <rect
                    x={region.x}
                    y={region.y}
                    width={region.width}
                    height={region.height}
                    fill={`url(#${reservePatternId})`}
                  />
                ) : null}
                <rect
                  x={region.x + 0.5}
                  y={region.y + 0.5}
                  width={Math.max(0, region.width - 1)}
                  height={Math.max(0, region.height - 1)}
                  fill="none"
                  stroke="#93c5fd"
                  strokeDasharray="7 5"
                />
                <rect
                  x={region.x + 4}
                  y={region.y + 4}
                  width={chipWidth}
                  height={18}
                  rx={4}
                  fill="#eff6ff"
                  stroke="#bfdbfe"
                />
                <text
                  x={region.x + 9}
                  y={region.y + 17}
                  fill="#2563eb"
                  fontSize={10}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {region.address}
                </text>
              </g>
            );
          })}
        </g>
      ) : null}
    </svg>
  );
}

import { useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObjectType,
} from "@codecaine-ai/canvas/schema";
import { roundedPath } from "../agent/router";
import { expandSketch } from "./expand";
import { fitSketch } from "./fit";
import { calculateSketchMetrics } from "./metrics";
import {
  countPathBoxViolations,
  directElbowEdges,
  routeSketchEdges,
  type RoutedSketchEdge,
  type RoutingMode,
} from "./route";
import { parseSketch, serializeSketch } from "./serialize";
import { DslCode } from "../guide/dsl";
import { STRUCTURE_COLORS, StructureOverlay, structureFeatures } from "./StructureOverlay";
import type { ExpandedSketch, Sketch, SketchRect } from "./types";
import "./sketch-view.css";

const canvasModules = import.meta.glob("../../../../canvases/*.canvas.json", {
  eager: true,
  import: "default",
}) as Record<string, InteractiveCanvasDocument>;

type CanvasOption = {
  filename: string;
  path: string;
  document: InteractiveCanvasDocument;
};

const CANVASES: readonly CanvasOption[] = Object.entries(canvasModules)
  .map(([path, document]) => ({
    filename: path.slice(path.lastIndexOf("/") + 1),
    path,
    document,
  }))
  .sort((left, right) => left.filename.localeCompare(right.filename));

const DEFAULT_CANVAS_PATH =
  CANVASES.find(({ filename }) => filename === "v2-flow.canvas.json")?.path
  ?? CANVASES[0]?.path
  ?? "";

if (import.meta.env.DEV) {
  for (const { filename, document } of CANVASES) {
    const fitted = fitSketch(document);
    const roundTripped = parseSketch(serializeSketch(fitted));
    if (JSON.stringify(roundTripped) !== JSON.stringify(fitted)) {
      throw new Error(`Sketch DSL round-trip assertion failed for ${filename}.`);
    }
    // Corridor routing must never send a connector through a box.
    const expanded = expandSketch(roundTripped, dimensionFor(document));
    const routed = routeSketchEdges(expanded, "corridors");
    const violations = countPathBoxViolations(routed, expanded.objects);
    if (violations > 0) {
      throw new Error(
        `Corridor routing sends ${violations} connector(s) through a box in ${filename}.`,
      );
    }
  }
}

type ViewMode = "diagrams" | "structure" | "code";

const VIEW_MODES: readonly { id: ViewMode; label: string }[] = [
  { id: "diagrams", label: "Diagrams" },
  { id: "structure", label: "Structure" },
  { id: "code", label: "Code" },
];

export type RenderObject = {
  id: string;
  type: InteractiveCanvasObjectType;
  geometry: SketchRect;
  text?: string;
  label?: string;
};

export type SpatialCanvasProps = {
  objects: readonly RenderObject[];
  connections: readonly RoutedSketchEdge[];
  title: string;
  /** Extra SVG layer painted above the content, in canvas coordinates. */
  overlay?: (unit: number) => ReactNode;
  /** Structure mode dims the content so the overlay reads at a glance. */
  structure?: boolean;
};

function contentBounds(objects: readonly RenderObject[]): SketchRect {
  if (objects.length === 0) return { x: 0, y: 0, width: 1280, height: 800 };

  const left = Math.min(...objects.map(({ geometry }) => geometry.x));
  const top = Math.min(...objects.map(({ geometry }) => geometry.y));
  const right = Math.max(...objects.map(({ geometry }) => geometry.x + geometry.width));
  const bottom = Math.max(...objects.map(({ geometry }) => geometry.y + geometry.height));
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function typeClass(type: InteractiveCanvasObjectType): string {
  if (type === "section") return "section";
  if (type === "sticky") return "sticky";
  if (type === "decision") return "decision";
  if (type === "pill" || type === "ellipse") return "pill";
  if (type === "predefined-process") return "predefined";
  if (type === "annotation-marker") return "annotation";
  return "surface";
}

function SpatialShape({ object }: { object: RenderObject }) {
  const { x, y, width, height } = object.geometry;
  const className = `sketch-object sketch-object-${typeClass(object.type)}`;

  if (object.type === "decision") {
    return (
      <path
        className={className}
        d={`M ${x + width / 2} ${y} L ${x + width} ${y + height / 2} L ${x + width / 2} ${y + height} L ${x} ${y + height / 2} Z`}
      />
    );
  }

  return (
    <rect
      className={className}
      x={x}
      y={y}
      width={width}
      height={height}
      rx={object.type === "pill" || object.type === "ellipse" ? Math.min(width, height) / 2 : Math.min(12, width / 8, height / 8)}
    />
  );
}

function SectionChip({ object, unit }: { object: RenderObject; unit: number }) {
  const label = object.label ?? object.text ?? object.id;
  const fontSize = 13 * unit;
  const chipHeight = 24 * unit;
  const inset = 10 * unit;
  const chipWidth = Math.min(
    Math.max(8, object.geometry.width - inset * 2),
    label.length * fontSize * 0.58 + fontSize * 1.4,
  );
  return (
    <g>
      <rect
        className="sketch-section-chip"
        x={object.geometry.x + inset}
        y={object.geometry.y + inset}
        width={chipWidth}
        height={chipHeight}
        rx={6 * unit}
      />
      <text
        className="sketch-section-label"
        x={object.geometry.x + inset + fontSize * 0.7}
        y={object.geometry.y + inset + chipHeight / 2 + fontSize * 0.34}
        fontSize={fontSize}
      >
        {label}
      </text>
    </g>
  );
}

export function SpatialCanvas({ objects, connections, title, overlay, structure }: SpatialCanvasProps) {
  const markerId = `sketch-arrow-${useId().replaceAll(":", "")}`;
  const bounds = useMemo(() => contentBounds(objects), [objects]);
  const padding = Math.max(20, Math.max(bounds.width, bounds.height) * 0.025);
  const viewBox = [
    bounds.x - padding,
    bounds.y - padding,
    bounds.width + padding * 2,
    bounds.height + padding * 2,
  ].join(" ");
  // Scale chrome (labels, connector strokes, arrowheads) with the canvas so
  // every fixture reads at the same visual weight inside the pane.
  const unit = Math.min(3, Math.max(0.8, Math.max(bounds.width, bounds.height) / 1400));
  const sections = useMemo(
    () => objects
      .filter((object) => object.type === "section")
      .sort((left, right) => (
        right.geometry.width * right.geometry.height - left.geometry.width * left.geometry.height
      )),
    [objects],
  );
  const items = useMemo(() => objects.filter((object) => object.type !== "section"), [objects]);

  return (
    <svg
      className={`sketch-spatial-canvas${structure ? " sketch-spatial-canvas--structure" : ""}`}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={title}
    >
      <defs>
        <marker
          id={markerId}
          markerWidth={8 * unit}
          markerHeight={8 * unit}
          refX={7 * unit}
          refY={4 * unit}
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d={`M 0 0 L ${8 * unit} ${4 * unit} L 0 ${8 * unit} Z`} fill="#9ca3af" />
        </marker>
      </defs>

      <rect
        className="sketch-canvas-paper"
        x={bounds.x - padding}
        y={bounds.y - padding}
        width={bounds.width + padding * 2}
        height={bounds.height + padding * 2}
      />

      <g className="sketch-sections">
        {sections.map((object) => (
          <g key={object.id} data-object-id={object.id}>
            <SpatialShape object={object} />
            <SectionChip object={object} unit={unit} />
          </g>
        ))}
      </g>

      <g className="sketch-connections" aria-hidden="true">
        {connections.map((edge, index) => (
          <path
            key={`${edge.from}-${edge.to}-${index}`}
            d={roundedPath(edge.points, 6 * unit)}
            fill="none"
            stroke="#9ca3af"
            strokeWidth={2 * unit}
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd={`url(#${markerId})`}
          />
        ))}
      </g>

      <g className="sketch-items">
        {items.map((object) => (
          <g key={object.id} data-object-id={object.id}>
            <SpatialShape object={object} />
            {object.label ? (
              <text
                className="sketch-item-label"
                x={object.geometry.x + object.geometry.width / 2}
                y={object.geometry.y + object.geometry.height / 2 + 4 * unit}
                textAnchor="middle"
                fontSize={11.5 * unit}
              >
                {object.label}
              </text>
            ) : null}
          </g>
        ))}
      </g>

      {overlay?.(unit)}
    </svg>
  );
}

function dimensionFor(document: InteractiveCanvasDocument): { width: number; height: number } {
  const bounds = contentBounds(document.objects);
  return {
    width: Math.max(720, Math.round(bounds.width)),
    height: Math.max(480, Math.round(bounds.height)),
  };
}

function percentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function compressionLabel(ratio: number): string {
  if (!Number.isFinite(ratio)) return "—";
  return `${percentage(ratio)} size`;
}

function StripMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="sketch-strip-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

type LegendChipSpec = {
  key: string;
  label: string;
  color: string;
  swatch: "line" | "dashed" | "tint";
  count: number;
};

function StructureLegend({ sketch, reconstruction }: { sketch: Sketch; reconstruction: ExpandedSketch }) {
  const features = structureFeatures(sketch, reconstruction);
  const chips: LegendChipSpec[] = [
    { key: "regions", label: "Split bands", color: STRUCTURE_COLORS.region, swatch: "dashed", count: features.regions },
    { key: "gutters", label: "Gutter corridors", color: STRUCTURE_COLORS.gutter, swatch: "tint", count: features.gutters },
    { key: "grids", label: "Grid lattices", color: STRUCTURE_COLORS.grid, swatch: "line", count: features.grids },
    { key: "tiers", label: "Tier registers", color: STRUCTURE_COLORS.tier, swatch: "line", count: features.tiers },
    { key: "fans", label: "Fans", color: STRUCTURE_COLORS.fan, swatch: "line", count: features.fans },
    { key: "hugs", label: "Lane hugs", color: STRUCTURE_COLORS.hug, swatch: "dashed", count: features.hugs },
  ];
  const present = chips.filter((chip) => chip.count > 0);
  return (
    <footer className="sketch-legend" aria-label="Structure overlay legend">
      {present.length === 0
        ? <span className="sketch-legend-chip">No structural declarations in this sketch</span>
        : present.map((chip) => (
          <span
            key={chip.key}
            className="sketch-legend-chip"
            data-swatch={chip.swatch}
            style={{ "--chip-color": chip.color } as CSSProperties}
          >
            <i aria-hidden="true" />
            {chip.label}
            <em>{chip.count}</em>
          </span>
        ))}
    </footer>
  );
}

export function SketchView() {
  const [selectedPath, setSelectedPath] = useState(DEFAULT_CANVAS_PATH);
  const [corridorThreshold, setCorridorThreshold] = useState(24);
  const [routingMode, setRoutingMode] = useState<RoutingMode>("corridors");
  const [viewMode, setViewMode] = useState<ViewMode>("diagrams");
  const selected = CANVASES.find(({ path }) => path === selectedPath) ?? CANVASES[0];

  const result = useMemo(() => {
    if (!selected) return null;
    const sketch = fitSketch(selected.document, { corridorThreshold });
    const text = serializeSketch(sketch);
    const parsed = parseSketch(text);
    const dimensions = dimensionFor(selected.document);
    const reconstruction = expandSketch(parsed, dimensions);
    const metrics = calculateSketchMetrics(selected.document, reconstruction, text, parsed);
    return { sketch, text, parsed, reconstruction, metrics };
  }, [corridorThreshold, selected]);

  // The original pane's geometry is fixed, so its connections always render
  // as clean orthogonal elbows with basic box avoidance.
  const originalConnections = useMemo(() => {
    if (!selected) return [];
    return directElbowEdges(
      selected.document.objects,
      selected.document.connections.map((connection) => ({
        from: connection.from.objectId,
        to: connection.to.objectId,
      })),
    );
  }, [selected]);

  const reconstructionConnections = useMemo(() => {
    if (!result) return [];
    return routeSketchEdges(result.reconstruction, routingMode);
  }, [result, routingMode]);

  if (!selected || !result) {
    return <div className="sketch-empty">No canvas documents were found.</div>;
  }

  const originalObjects: RenderObject[] = selected.document.objects;
  const reconstruction: ExpandedSketch = result.reconstruction;
  const structureMode = viewMode === "structure";

  const originalPane = (
    <article className="sketch-pane sketch-geometry-pane">
      <header>
        <div>
          <span className="sketch-pane-index">01</span>
          <h2>Original</h2>
        </div>
        <small>{selected.document.objects.length} objects · {selected.document.connections.length} edges</small>
      </header>
      <div className="sketch-canvas-wrap">
        <SpatialCanvas
          objects={originalObjects}
          connections={originalConnections}
          title={`Original geometry for ${selected.filename}`}
        />
      </div>
    </article>
  );

  const codePane = (
    <article className="sketch-pane sketch-code-pane">
      <header>
        <div>
          <span className="sketch-pane-index">01</span>
          <h2>Sketch DSL</h2>
        </div>
        <small>{result.text.split("\n").length} lines</small>
      </header>
      <div className="sketch-code" aria-label="Serialized spatial sketch">
        <DslCode code={result.text} />
      </div>
    </article>
  );

  const reconstructionPane = (
    <article className="sketch-pane sketch-geometry-pane">
      <header>
        <div>
          <span className="sketch-pane-index">02</span>
          <h2>{structureMode ? "Structure" : "Reconstruction"}</h2>
        </div>
        <small>
          {structureMode
            ? `${reconstruction.regions.length} bands · ${reconstruction.gutters.length} corridors · ${result.parsed.tiers.length} tiers · ${result.parsed.fans.length} fans`
            : `${reconstruction.objects.length} objects · ${reconstruction.edges.length} edges`}
        </small>
      </header>
      <div className="sketch-canvas-wrap">
        <SpatialCanvas
          objects={reconstruction.objects}
          connections={reconstructionConnections}
          title={structureMode
            ? `Spatial program structure for ${selected.filename}`
            : `Reconstructed geometry for ${selected.filename}`}
          structure={structureMode}
          overlay={structureMode
            ? (unit) => (
              <StructureOverlay
                sketch={result.parsed}
                reconstruction={reconstruction}
                unit={unit}
              />
            )
            : undefined}
        />
      </div>
      {structureMode
        ? <StructureLegend sketch={result.parsed} reconstruction={reconstruction} />
        : null}
    </article>
  );

  return (
    <main className="sketch-shell">
      <header className="sketch-toolbar">
        <nav className="sketch-mode-switch" aria-label="Display mode">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              aria-pressed={viewMode === mode.id}
              onClick={() => setViewMode(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </nav>

        <div className="sketch-toolbar-controls">
          <label className="sketch-picker">
            <span>Canvas</span>
            <select value={selected.path} onChange={(event) => setSelectedPath(event.target.value)}>
              {CANVASES.map((canvas) => (
                <option key={canvas.path} value={canvas.path}>{canvas.filename}</option>
              ))}
            </select>
          </label>

          <label className="sketch-picker">
            <span>Routing</span>
            <select
              value={routingMode}
              onChange={(event) => setRoutingMode(event.target.value as RoutingMode)}
            >
              <option value="corridors">corridors</option>
              <option value="direct">direct</option>
            </select>
          </label>

          <label className="sketch-threshold">
            <span>
              Corridor threshold
              <output>{corridorThreshold}px</output>
            </span>
            <input
              type="range"
              min={24}
              max={96}
              step={4}
              value={corridorThreshold}
              onChange={(event) => setCorridorThreshold(Number(event.target.value))}
            />
          </label>
        </div>
      </header>

      <section
        className="sketch-stage"
        aria-label="Spatial sketch round trip"
      >
        <div className={`sketch-duo${viewMode === "code" ? " sketch-duo--code" : ""}`}>
          {viewMode === "code" ? codePane : originalPane}
          {reconstructionPane}
        </div>

        <footer className="sketch-metrics-strip" aria-label="Round-trip metrics">
          <StripMetric
            label="Compression"
            value={compressionLabel(result.metrics.compressionRatio)}
            detail={`${result.metrics.serializedChars.toLocaleString()} / ${result.metrics.geometryChars.toLocaleString()} chars`}
          />
          <StripMetric label="Relations" value={percentage(result.metrics.relationPreservation)} />
          <StripMetric label="Adjacency" value={percentage(result.metrics.adjacencyPreservation)} />
          <StripMetric
            label="Decisions"
            value={percentage(result.metrics.decisionRatio)}
            detail={`${result.metrics.dslDecisions.toLocaleString()} DSL / ${result.metrics.rawDecisions.toLocaleString()} raw`}
          />
          <StripMetric label="DSL" value={`${result.text.split("\n").length} lines`} />
        </footer>
      </section>
    </main>
  );
}

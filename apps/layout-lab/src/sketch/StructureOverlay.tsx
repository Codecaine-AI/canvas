import { Fragment, useMemo } from "react";
import type {
  Compass,
  ExpandedSketch,
  ExpandedSketchObject,
  Sketch,
  SketchNode,
  SketchRect,
} from "./types";

/**
 * The structure overlay draws the spatial program the fitter actually
 * committed to — split bands, gutter corridors, grid lattices, tier
 * registers, fan pitch, and lane hugs — on top of the reconstruction.
 * Everything here is read directly off the fitted `Sketch` and the
 * `ExpandedSketch` it produced; nothing is re-derived or approximated.
 */

export const STRUCTURE_COLORS = {
  region: "#4f46e5",
  gutter: "#b45309",
  grid: "#0d9488",
  tier: "#e11d48",
  fan: "#7c3aed",
  hug: "#15803d",
} as const;

export interface GridLattice {
  rows: number;
  columns: number;
  gap: number;
  ids: string[];
}

/** Collect every repeated-cell grid declared in the sketch tree. */
export function collectGridLattices(node: SketchNode, into: GridLattice[] = []): GridLattice[] {
  if (node.kind === "grid") {
    into.push({
      rows: node.rows,
      columns: node.columns,
      gap: node.gap,
      ids: node.items.map((item) => item.id),
    });
  } else if (node.kind === "split") {
    for (const child of node.children) collectGridLattices(child, into);
  } else if (node.kind === "section") {
    collectGridLattices(node.child, into);
  }
  return into;
}

export interface StructureFeatures {
  regions: number;
  gutters: number;
  grids: number;
  tiers: number;
  fans: number;
  hugs: number;
}

export function structureFeatures(sketch: Sketch, reconstruction: ExpandedSketch): StructureFeatures {
  return {
    regions: reconstruction.regions.length,
    gutters: reconstruction.gutters.length,
    grids: collectGridLattices(sketch.root).length,
    tiers: sketch.tiers.length,
    fans: sketch.fans.length,
    hugs: reconstruction.regions.filter((region) => region.hug !== null).length,
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function centerOf(geometry: SketchRect, axis: "x" | "y"): number {
  return axis === "x" ? geometry.x + geometry.width / 2 : geometry.y + geometry.height / 2;
}

const COMPASS_CELL: Readonly<Record<Compass, readonly [number, number]>> = {
  NW: [0, 0],
  N: [1, 0],
  NE: [2, 0],
  W: [0, 1],
  C: [1, 1],
  E: [2, 1],
  SW: [0, 2],
  S: [1, 2],
  SE: [2, 2],
};

type StructureOverlayProps = {
  sketch: Sketch;
  reconstruction: ExpandedSketch;
  /** The canvas chrome unit computed by the host SVG (scales strokes/text). */
  unit: number;
};

export function StructureOverlay({ sketch, reconstruction, unit }: StructureOverlayProps) {
  const byId = useMemo(
    () => new Map(reconstruction.objects.map((object) => [object.id, object])),
    [reconstruction],
  );
  const lattices = useMemo(() => collectGridLattices(sketch.root), [sketch]);

  // Strokes are px-based and non-scaling so the overlay stays crisp no
  // matter how far the canvas is scaled down inside the pane; geometric
  // extents (ticks, dashes, brackets) still scale with the canvas unit.
  const hairline = 1;
  const line = 1.5;
  const tick = 9 * unit;
  const fontSize = 13 * unit;

  const membersOf = (ids: readonly string[]): ExpandedSketchObject[] => ids
    .map((id) => byId.get(id))
    .filter((object): object is ExpandedSketchObject => object !== undefined);

  return (
    <g className="sketch-structure-overlay" aria-hidden="true">
      {/* Gutter corridors: the reserved routing space between sibling bands. */}
      <g fill={STRUCTURE_COLORS.gutter} fillOpacity={0.16}>
        {reconstruction.gutters.map((gutter) => (
          <rect
            key={gutter.id}
            x={gutter.x}
            y={gutter.y}
            width={gutter.width}
            height={gutter.height}
          />
        ))}
      </g>

      {/* Split bands: the weighted region every split child received. */}
      <g fill="none" stroke={STRUCTURE_COLORS.region}>
        {reconstruction.regions.map((region) => (
          <rect
            key={region.id}
            x={region.rect.x}
            y={region.rect.y}
            width={region.rect.width}
            height={region.rect.height}
            strokeWidth={hairline}
            strokeOpacity={Math.max(0.22, 0.62 - region.depth * 0.14)}
            strokeDasharray={`${6 * unit} ${4.5 * unit}`}
          />
        ))}
      </g>

      {/* Grid lattices: exact repeated-cell outlines. */}
      <g fill="none" stroke={STRUCTURE_COLORS.grid} strokeOpacity={0.75}>
        {lattices.map((lattice, latticeIndex) => (
          <Fragment key={`lattice-${latticeIndex}`}>
            {membersOf(lattice.ids).map((cell) => (
              <rect
                key={cell.id}
                x={cell.geometry.x - 3 * unit}
                y={cell.geometry.y - 3 * unit}
                width={cell.geometry.width + 6 * unit}
                height={cell.geometry.height + 6 * unit}
                strokeWidth={hairline}
              />
            ))}
          </Fragment>
        ))}
      </g>

      {/* Lane hugs: the intrinsic rect a hugged child kept, with a corner
          bracket at its registration corner. */}
      <g fill="none" stroke={STRUCTURE_COLORS.hug}>
        {reconstruction.regions
          .filter((region) => region.hug !== null && region.hugRect !== null)
          .map((region) => {
            const rect = region.hugRect!;
            const [cellX, cellY] = COMPASS_CELL[region.hug!];
            const cornerX = cellX === 0 ? rect.x : cellX === 2 ? rect.x + rect.width : rect.x + rect.width / 2;
            const cornerY = cellY === 0 ? rect.y : cellY === 2 ? rect.y + rect.height : rect.y + rect.height / 2;
            const armX = (cellX === 2 ? -1 : 1) * Math.min(26 * unit, rect.width / 2);
            const armY = (cellY === 2 ? -1 : 1) * Math.min(26 * unit, rect.height / 2);
            return (
              <Fragment key={`hug-${region.id}`}>
                <rect
                  x={rect.x}
                  y={rect.y}
                  width={rect.width}
                  height={rect.height}
                  strokeWidth={hairline}
                  strokeOpacity={0.45}
                  strokeDasharray={`${3 * unit} ${3 * unit}`}
                />
                <path
                  d={cellX === 1
                    ? `M ${cornerX - tick} ${cornerY} L ${cornerX + tick} ${cornerY} M ${cornerX} ${cornerY} l 0 ${armY}`
                    : cellY === 1
                      ? `M ${cornerX} ${cornerY - tick} L ${cornerX} ${cornerY + tick} M ${cornerX} ${cornerY} l ${armX} 0`
                      : `M ${cornerX + armX} ${cornerY} L ${cornerX} ${cornerY} L ${cornerX} ${cornerY + armY}`}
                  strokeWidth={line * 1.25}
                  strokeLinecap="round"
                />
              </Fragment>
            );
          })}
      </g>

      {/* Tier registers: one shared cross-axis center line per declaration. */}
      <g stroke={STRUCTURE_COLORS.tier} fill={STRUCTURE_COLORS.tier}>
        {sketch.tiers.map((tier) => {
          const members = membersOf(tier.members);
          if (members.length < 2) return null;
          const register = median(members.map((member) => centerOf(member.geometry, tier.axis)));
          const alongAxis = tier.axis === "y" ? "x" : "y";
          const starts = members.map((member) => member.geometry[alongAxis]);
          const ends = members.map((member) => (
            member.geometry[alongAxis]
            + (alongAxis === "x" ? member.geometry.width : member.geometry.height)
          ));
          const from = Math.min(...starts) - 12 * unit;
          const to = Math.max(...ends) + 12 * unit;
          return (
            <Fragment key={`tier-${tier.name}`}>
              <path
                d={tier.axis === "y"
                  ? `M ${from} ${register} L ${to} ${register}`
                  : `M ${register} ${from} L ${register} ${to}`}
                fill="none"
                strokeWidth={line}
                strokeOpacity={0.65}
              />
              {members.map((member) => {
                const along = centerOf(member.geometry, alongAxis);
                return (
                  <path
                    key={`tier-${tier.name}-${member.id}`}
                    d={tier.axis === "y"
                      ? `M ${along} ${register - tick} L ${along} ${register + tick}`
                      : `M ${register - tick} ${along} L ${register + tick} ${along}`}
                    fill="none"
                    strokeWidth={line}
                    strokeLinecap="round"
                  />
                );
              })}
              <text
                x={tier.axis === "y" ? from : register + 5 * unit}
                y={tier.axis === "y" ? register - 5 * unit : from}
                className="sketch-structure-tag"
                fontSize={fontSize}
                stroke="none"
              >
                {tier.name} · {tier.axis}
              </text>
            </Fragment>
          );
        })}
      </g>

      {/* Fans: hub-to-children register with even pitch marks. */}
      <g stroke={STRUCTURE_COLORS.fan} fill={STRUCTURE_COLORS.fan}>
        {sketch.fans.map((fan, fanIndex) => {
          const hub = byId.get(fan.hub);
          const children = membersOf(fan.children);
          if (!hub || children.length < 2) return null;
          const vertical = fan.dir === "S" || fan.dir === "N";
          const mainAxis: "x" | "y" = vertical ? "x" : "y";
          const crossAxis: "x" | "y" = vertical ? "y" : "x";
          const register = median(children.map((child) => centerOf(child.geometry, crossAxis)));
          const centers = children
            .map((child) => centerOf(child.geometry, mainAxis))
            .sort((left, right) => left - right);
          const from = centers[0]! - 10 * unit;
          const to = centers[centers.length - 1]! + 10 * unit;
          const midpoint = (centers[0]! + centers[centers.length - 1]!) / 2;
          const hubMain = centerOf(hub.geometry, mainAxis);
          const hubCross = centerOf(hub.geometry, crossAxis);
          const point = (main: number, cross: number): string => (
            vertical ? `${main} ${cross}` : `${cross} ${main}`
          );
          return (
            <Fragment key={`fan-${fanIndex}`}>
              <circle
                cx={vertical ? hubMain : hubCross}
                cy={vertical ? hubCross : hubMain}
                r={3.2 * unit}
                stroke="none"
              />
              <path
                d={`M ${point(hubMain, hubCross)} L ${point(midpoint, register)}`}
                fill="none"
                strokeWidth={hairline}
                strokeOpacity={0.55}
                strokeDasharray={`${2.5 * unit} ${3 * unit}`}
              />
              <path
                d={`M ${point(from, register)} L ${point(to, register)}`}
                fill="none"
                strokeWidth={line}
                strokeOpacity={0.6}
              />
              {children.map((child) => {
                const main = centerOf(child.geometry, mainAxis);
                return (
                  <path
                    key={`fan-${fanIndex}-${child.id}`}
                    d={`M ${point(main - tick * 0.66, register + tick)} L ${point(main, register)} L ${point(main + tick * 0.66, register + tick)}`}
                    fill="none"
                    strokeWidth={line}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })}
            </Fragment>
          );
        })}
      </g>
    </g>
  );
}

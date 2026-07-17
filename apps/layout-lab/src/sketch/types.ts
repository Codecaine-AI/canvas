import type { InteractiveCanvasObjectType } from "@codecaine-ai/canvas/schema";

export type Compass = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | "C";

export type SizeClass = "S" | "M" | "L";

export interface PlacedItem {
  id: string;
  type: InteractiveCanvasObjectType;
  size: SizeClass;
  at: Compass;
}

/** A cell of a repeated-cell grid; its position is implied by row-major order. */
export interface GridItem {
  id: string;
  type: InteractiveCanvasObjectType;
  size: SizeClass;
}

export interface SplitNode {
  kind: "split";
  axis: "row" | "column";
  weights: number[];
  /**
   * Optional per-child lane attribute. A hugged child keeps its intrinsic
   * content extent, registered at the given corner of its weighted band,
   * instead of stretching to fill the band. Present only when at least one
   * child is hugged; entries align with {@link children}.
   */
  hugs?: (Compass | null)[];
  children: SketchNode[];
}

export interface LeafNode {
  kind: "leaf";
  items: PlacedItem[];
}

/** A repeated-cell table: `rows * columns` identical cells, row-major. */
export interface GridNode {
  kind: "grid";
  rows: number;
  columns: number;
  /** Cell gap from the spacing ladder: 0 (flush), 32, 64, or 96. */
  gap: number;
  items: GridItem[];
}

export interface SectionNode {
  kind: "section";
  id: string;
  label?: string;
  child: SketchNode;
}

export type SketchNode = SplitNode | LeafNode | GridNode | SectionNode;

/** Axis of the shared center register: "y" pins y-centers (a horizontal row). */
export type TierAxis = "x" | "y";

/**
 * A cross-branch register: members' cross-axis centers are pinned to one
 * shared register even across section boundaries.
 */
export interface TierDeclaration {
  name: string;
  axis: TierAxis;
  members: string[];
}

export type FanDirection = "N" | "S" | "E" | "W";

/**
 * A hub-over-children idiom: children share a register on the `dir` side of
 * the hub, evenly pitched, with the hub centered over their midpoint.
 */
export interface FanDeclaration {
  hub: string;
  children: string[];
  dir: FanDirection;
}

export interface SketchEdge {
  from: string;
  to: string;
}

export interface Sketch {
  root: SketchNode;
  tiers: TierDeclaration[];
  fans: FanDeclaration[];
  edges: SketchEdge[];
}

export interface FitSketchOptions {
  corridorThreshold?: number;
}

export interface SketchRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExpandedSketchObject {
  id: string;
  type: InteractiveCanvasObjectType;
  label?: string;
  geometry: SketchRect;
}

/** A corridor reserved between sibling regions during expansion. */
export interface ExpandedGutter extends SketchRect {
  id: string;
  orientation: "vertical" | "horizontal";
}

/**
 * The weighted band a split allocated to one child during expansion, recorded
 * verbatim for presentation (the structure overlay). Purely observational:
 * nothing in expansion reads these back.
 */
export interface ExpandedRegion {
  id: string;
  /** Depth of the parent split in the sketch tree (root split = 0). */
  depth: number;
  /** Axis of the parent split that allocated this band. */
  axis: "row" | "column";
  /** The full weighted band. */
  rect: SketchRect;
  /** Lane-hug corner, when this child hugs instead of stretching. */
  hug: Compass | null;
  /** The intrinsic-extent rect the hugged child actually received. */
  hugRect: SketchRect | null;
}

export interface ExpandedSketch {
  objects: ExpandedSketchObject[];
  edges: SketchEdge[];
  bounds: SketchRect;
  gutters: ExpandedGutter[];
  regions: ExpandedRegion[];
}

export interface ExpandSketchOptions {
  width?: number;
  height?: number;
  gutter?: number;
  padding?: number;
}

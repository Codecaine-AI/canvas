/** A path into the compiler's region tree. The root is always `r`. */
export type RegionAddress = "r" | `r.${string}`;

export type SplitAxis = "row" | "column";
export type PackMode = "grid" | "row" | "column" | "center";
export type LayoutObjectType = "section" | "sticky" | "rect" | "diamond";

export interface SplitLayoutOp {
  op: "split";
  region: RegionAddress;
  axis: SplitAxis;
  weights: number[];
}

export interface PlaceLayoutOp {
  op: "place";
  region: RegionAddress;
  type: LayoutObjectType;
  id?: string;
  label?: string;
  count?: number;
  pack?: PackMode;
}

export interface ConnectLayoutOp {
  op: "connect";
  from: string;
  to: string;
  label?: string;
}

export interface ReserveLayoutOp {
  op: "reserve";
  region: RegionAddress;
}

/**
 * Coordinate-free instructions authored by the agent. Pixel geometry only
 * appears after compilation.
 */
export type LayoutOp = SplitLayoutOp | PlaceLayoutOp | ConnectLayoutOp | ReserveLayoutOp;

export interface CompileSettings {
  grid: number;
  gutter: number;
  gap: number;
  width: number;
  height: number;
}

export type CompileSettingsInput = Partial<CompileSettings>;

export interface Point {
  x: number;
  y: number;
}

/** Explicit alias used by board/rendering components. */
export type CompiledPoint = Point;

export interface Rect extends Point {
  width: number;
  height: number;
}

export interface CompiledObject extends Rect {
  id: string;
  type: LayoutObjectType;
  label: string;
  region: RegionAddress;
  opIndex: number;
}

export interface CompiledConnector {
  id: string;
  opIndex: number;
  from: string;
  to: string;
  label: string;
  points: Point[];
  labelPoint: Point;
}

export interface CompiledRegion extends Rect {
  address: RegionAddress;
  leaf: boolean;
  reserved: boolean;
  minWidth: number;
  minHeight: number;
}

export interface CompiledGutter extends Rect {
  id: string;
  parent: RegionAddress;
  orientation: "vertical" | "horizontal";
}

export interface CompileError {
  opIndex: number | null;
  message: string;
}

export interface CompiledCanvas {
  requestedWidth: number;
  requestedHeight: number;
  width: number;
  height: number;
  grew: boolean;
  effectiveGrid: number;
  effectiveGutter: number;
  effectiveGap: number;
}

export interface CompileResult {
  objects: CompiledObject[];
  connectors: CompiledConnector[];
  regions: CompiledRegion[];
  gutters: CompiledGutter[];
  errors: CompileError[];
  canvas: CompiledCanvas;
}

export interface RuntimeMetrics {
  margin: number;
  padX: number;
  padTop: number;
  padBottom: number;
  gap: number;
  gutter: number;
}

export interface RoutedConnectionInput {
  from: string;
  to: string;
  label: string;
  opIndex: number;
}

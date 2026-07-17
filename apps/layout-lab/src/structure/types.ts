export const DEFAULT_FRAME = { width: 1280, height: 800 } as const;

export type Point = {
  x: number;
  y: number;
};

export type RectEdge = "top" | "right" | "bottom" | "left";

export type RectRegion = {
  kind: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  /**
   * Depth of the guillotine cut that created an internal edge. Algorithms
   * without hierarchical gutters leave this unset; an empty object marks a
   * hierarchy cell whose exposed edges are all part of the outer frame.
   */
  gutterDepth?: Partial<Record<RectEdge, number>>;
};

export type PolygonRegion = {
  kind: "polygon";
  points: Point[];
  depth: number;
};

export type Region = RectRegion | PolygonRegion;

export type AlgorithmValue = number | string | boolean;
export type AlgorithmParams = Record<string, AlgorithmValue>;

export type AlgorithmParam = {
  key: string;
  label: string;
  type: "range" | "number" | "select";
  default: AlgorithmValue;
  min?: number;
  max?: number;
  step?: number;
  options?: ReadonlyArray<{ label: string; value: AlgorithmValue }>;
};

export type AlgorithmDef = {
  id: string;
  name: string;
  description: string;
  params: readonly AlgorithmParam[];
  run: (params: AlgorithmParams, seed: number) => Region[];
};

export function frameFromParams(params: AlgorithmParams): { width: number; height: number } {
  const width = typeof params.width === "number" && params.width > 0
    ? params.width
    : DEFAULT_FRAME.width;
  const height = typeof params.height === "number" && params.height > 0
    ? params.height
    : DEFAULT_FRAME.height;
  return { width, height };
}

export function numberParam(
  params: AlgorithmParams,
  key: string,
  fallback: number,
  minimum = -Infinity,
  maximum = Infinity,
): number {
  const raw = params[key];
  const value = typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

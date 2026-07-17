import {
  frameFromParams,
  numberParam,
  type AlgorithmDef,
  type Point,
  type PolygonRegion,
} from "../types";

const TAU = Math.PI * 2;
const PHI = (1 + Math.sqrt(5)) / 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const ANGLE_EPSILON = 1e-10;

function normalizeAngle(angle: number): number {
  return ((angle % TAU) + TAU) % TAU;
}

function uniqueSorted(values: readonly number[]): number[] {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.filter((value, index) => index === 0 || value - sorted[index - 1] > ANGLE_EPSILON);
}

function anglesInInterval(mesh: readonly number[], start: number, end: number): number[] {
  const result = [start, end];
  const firstTurn = Math.floor(start / TAU) - 1;
  const lastTurn = Math.ceil(end / TAU) + 1;
  for (let turn = firstTurn; turn <= lastTurn; turn += 1) {
    for (const angle of mesh) {
      const lifted = angle + turn * TAU;
      if (lifted > start + ANGLE_EPSILON && lifted < end - ANGLE_EPSILON) result.push(lifted);
    }
  }
  return uniqueSorted(result);
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function contourPoint(
  t: number,
  angle: number,
  width: number,
  height: number,
  circularUntil: number,
): Point {
  const centerX = width / 2;
  const centerY = height / 2;
  if (t <= 0) return { x: centerX, y: centerY };

  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const radiusX = width / 2;
  const radiusY = height / 2;
  const circleRadius = Math.min(radiusX, radiusY);
  const frameRadius = Math.min(
    Math.abs(cosine) < 1e-12 ? Infinity : radiusX / Math.abs(cosine),
    Math.abs(sine) < 1e-12 ? Infinity : radiusY / Math.abs(sine),
  );
  const morphProgress = t <= circularUntil
    ? 0
    : smoothstep((t - circularUntil) / (1 - circularUntil));
  const radius = t * (circleRadius + (frameRadius - circleRadius) * morphProgress);

  return {
    x: centerX + cosine * radius,
    y: centerY + sine * radius,
  };
}

function sectorPolygon(
  inner: number,
  outer: number,
  start: number,
  end: number,
  mesh: readonly number[],
  width: number,
  height: number,
  circularUntil: number,
): Point[] {
  const angles = anglesInInterval(mesh, start, end);
  const outerPoints = angles.map((angle) => contourPoint(
    outer,
    angle,
    width,
    height,
    circularUntil,
  ));
  const innerPoints = inner <= 0
    ? [{ x: width / 2, y: height / 2 }]
    : [...angles].reverse().map((angle) => contourPoint(
      inner,
      angle,
      width,
      height,
      circularUntil,
    ));
  return [...outerPoints, ...innerPoints];
}

export function runRadialRings(
  rawParams: Parameters<AlgorithmDef["run"]>[0],
  _seed: number,
): PolygonRegion[] {
  const { width, height } = frameFromParams(rawParams);
  const ringCount = Math.round(numberParam(rawParams, "rings", 4, 1, 8));
  const baseSlots = Math.round(numberParam(rawParams, "baseSlots", 5, 2, 12));
  const centerSize = numberParam(rawParams, "centerSize", 0.14, 0.03, 0.35);
  const slotCounts = Array.from(
    { length: ringCount },
    (_, ring) => Math.max(1, Math.round(baseSlots * PHI ** ring)),
  );

  // Every ring shares this angular mesh. Besides producing smooth curves, this
  // makes both sides of a boundary use precisely the same polyline even though
  // adjacent rings have different slot counts.
  const mesh: number[] = [];
  const smoothSegments = Math.max(144, Math.max(...slotCounts) * 8);
  for (let index = 0; index < smoothSegments; index += 1) mesh.push(index / smoothSegments * TAU);
  for (let ring = 0; ring < ringCount; ring += 1) {
    const offset = normalizeAngle(GOLDEN_ANGLE * ring);
    const slots = slotCounts[ring];
    for (let slot = 0; slot < slots; slot += 1) mesh.push(normalizeAngle(offset + slot / slots * TAU));
  }
  // Corner rays guarantee that the final polygon contour follows all four
  // corners of the rectangular frame exactly rather than clipping them.
  for (const [x, y] of [[0, 0], [width, 0], [width, height], [0, height]] as const) {
    mesh.push(normalizeAngle(Math.atan2(y - height / 2, x - width / 2)));
  }
  const sharedMesh = uniqueSorted(mesh.map(normalizeAngle));

  const regions: PolygonRegion[] = [{
    kind: "polygon",
    points: sharedMesh.map((angle) => contourPoint(
      centerSize,
      angle,
      width,
      height,
      centerSize,
    )),
    depth: 0,
  }];

  for (let ring = 0; ring < ringCount; ring += 1) {
    const inner = centerSize + (1 - centerSize) * ring / ringCount;
    const outer = centerSize + (1 - centerSize) * (ring + 1) / ringCount;
    const slots = slotCounts[ring];
    const offset = GOLDEN_ANGLE * ring;
    for (let slot = 0; slot < slots; slot += 1) {
      const start = offset + slot / slots * TAU;
      const end = offset + (slot + 1) / slots * TAU;
      regions.push({
        kind: "polygon",
        points: sectorPolygon(
          inner,
          outer,
          start,
          end,
          sharedMesh,
          width,
          height,
          centerSize,
        ),
        depth: ring + 1,
      });
    }
  }

  return regions;
}

export const radialRingsAlgorithm: AlgorithmDef = {
  id: "radial-rings",
  name: "Radial Rings",
  description: "Golden-angle annular sectors bloom from a circular center into the frame.",
  params: [
    { key: "rings", label: "Rings", type: "range", default: 4, min: 1, max: 6, step: 1 },
    { key: "baseSlots", label: "Base slots", type: "range", default: 5, min: 3, max: 8, step: 1 },
    { key: "centerSize", label: "Center size", type: "range", default: 0.14, min: 0.06, max: 0.3, step: 0.01 },
  ],
  run: runRadialRings,
};

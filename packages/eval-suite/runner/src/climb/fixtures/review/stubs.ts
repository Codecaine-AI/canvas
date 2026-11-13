/** Hand-made boards for the review tests: an object by its box, a wire by its corners. */
import type { BoardObject } from "../../review-inputs.ts";
import type { WireFact } from "../../wires.ts";

export const box = (id: string, type: string, parentId: string | null, x = 0, y = 0, width = 100, height = 100, extra: Partial<BoardObject> = {}): BoardObject =>
  ({ id, type, parentId, geometry: { x, y, width, height }, ...extra });

export function wire(id: string, from: string, to: string, corners: Array<[number, number]>, extra: Partial<WireFact> = {}): WireFact {
  const points = corners.map(([x, y]) => ({ x, y }));
  const length = Math.round(points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y), 0));
  return {
    id, from, to, ports: { from: "right", to: "left" }, points, length, bends: Math.max(0, points.length - 2), byHand: false, style: "solid", colour: "default", arrow: "forward",
    label: "", labelAt: null, chip: null, route: "", through: [], crosses: [], trunks: [], ...extra,
  };
}

/** A wire with a label, its chip at `x`, `y` (60×20). */
export const labelled = (id: string, from: string, to: string, corners: Array<[number, number]>, label: string, x: number, y: number): WireFact =>
  wire(id, from, to, corners, { label, labelAt: { x: x + 30, y: y + 10 }, chip: { x, y, width: 60, height: 20 } });

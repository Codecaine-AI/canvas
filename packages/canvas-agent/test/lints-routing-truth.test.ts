import { describe, expect, test } from "bun:test";

import { rule as brokenEdges } from "../src/board/lints/rules/broken-edges";
import { routeConnection } from "../../canvas/src/connectors/routing.ts";
import { box, connect, makeDocument } from "./synthetic";
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";

type Point = { x: number; y: number };
type Rect = Point & { width: number; height: number };

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width
    && b.x < a.x + a.width
    && a.y < b.y + b.height
    && b.y < a.y + a.height;
}

/**
 * Test-only renderer oracle. This deliberately does not import lint geometry:
 * it routes through the canvas package and independently mirrors the stable
 * through-box sampling contract.
 */
function rendererPathHitsBox(
  points: readonly Point[],
  connection: InteractiveCanvasConnection,
  objects: readonly InteractiveCanvasObject[],
): boolean {
  const boxes = objects.filter((object) => object.type !== "section");
  const byId = new Map(boxes.map((object) => [object.id, object]));
  const endpointRects = [
    byId.get(connection.from.objectId),
    byId.get(connection.to.objectId),
  ]
    .filter((object): object is InteractiveCanvasObject => object !== undefined)
    .map((object) => object.geometry);
  const obstacles = boxes
    .filter(
      (object) =>
        object.id !== connection.from.objectId
        && object.id !== connection.to.objectId,
    )
    .filter(
      (object) =>
        !endpointRects.some((endpoint) => overlaps(endpoint, object.geometry)),
    );

  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    const steps = Math.max(1, Math.ceil(length / 4));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (obstacles.some((object) => {
        const rect = object.geometry;
        return x > rect.x + 0.5
          && x < rect.x + rect.width - 0.5
          && y > rect.y + 0.5
          && y < rect.y + rect.height - 0.5;
      })) {
        return true;
      }
    }
  }
  return false;
}

function rendererViolationIds(document: InteractiveCanvasDocument): string[] {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  return document.connections.flatMap((connection) => {
    if (connection.from.objectId === connection.to.objectId) return [];
    const from = byId.get(connection.from.objectId);
    const to = byId.get(connection.to.objectId);
    if (!from || !to) return [];
    const routed = routeConnection(from, to, connection, document.objects);
    const points = routed.points ?? [routed.start, routed.end];
    return rendererPathHitsBox(points, connection, document.objects)
      ? [connection.id]
      : [];
  }).sort();
}

describe("broken-edges renderer-path alignment", () => {
  test("through-box findings stay identical to independently routed renderer truth", () => {
    const baseObjects = () => [
      box("source", 0, 0, 100, 100),
      box("blocker", 200, 0, 100, 100),
      box("target", 400, 0, 100, 100),
    ];
    const fixtures: Array<{
      name: string;
      document: InteractiveCanvasDocument;
      expected: string[];
    }> = [
      {
        name: "plain auto-route detours around a blocker",
        document: makeDocument(
          baseObjects(),
          [connect("plain-clean", "source", "target")],
        ),
        expected: [],
      },
      {
        name: "orthogonal waypoints can deliberately drive through a blocker",
        document: makeDocument(
          baseObjects(),
          [{
            ...connect("waypoint-hit", "source", "target"),
            waypoints: [[100, 50], [400, 50]],
          }],
        ),
        expected: ["waypoint-hit"],
      },
      {
        name: "orthogonal waypoints can deliberately clear a blocker",
        document: makeDocument(
          baseObjects(),
          [{
            ...connect("waypoint-clean", "source", "target"),
            waypoints: [[100, -100], [400, -100]],
          }],
        ),
        expected: [],
      },
      {
        name: "anchored path ignores sections and endpoint-overlap boxes",
        document: makeDocument(
          [
            box("source", 0, 0, 100, 100),
            box("stacked", 25, 25, 100, 100),
            box("section", 100, -100, 300, 300, "section"),
            box("target", 500, 0, 100, 100),
          ],
          [{
            ...connect("excluded-clean", "source", "target"),
            from: { objectId: "source", anchor: "right" },
            to: { objectId: "target", anchor: "left" },
            waypoints: [[100, 50], [500, 50]],
          }],
        ),
        expected: [],
      },
      {
        name: "closed obstacle ring leaves the renderer fallback broken",
        document: makeDocument(
          [
            box("inside", 300, 300, 100, 100),
            box("wall-n", 0, 0, 700, 80),
            box("wall-s", 0, 620, 700, 80),
            box("wall-w", 0, 0, 80, 700),
            box("wall-e", 620, 0, 80, 700),
            box("outside", 900, 300, 100, 100),
          ],
          [connect("ring-hit", "inside", "outside")],
        ),
        expected: ["ring-hit"],
      },
    ];

    for (const fixture of fixtures) {
      const rendererIds = rendererViolationIds(fixture.document);
      const lintIds = brokenEdges.check(fixture.document)
        .filter((finding) => finding.message.includes("passes through a box"))
        .map((finding) => finding.at[0]!)
        .sort();
      expect(rendererIds, fixture.name).toEqual(fixture.expected);
      expect(lintIds, fixture.name).toEqual(rendererIds);
    }
  });
});

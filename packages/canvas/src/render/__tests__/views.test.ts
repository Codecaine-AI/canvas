import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderBoardView, renderSectionView } from "../views";
import {
  connectionPaintedBounds,
  objectPaintedBounds,
  paintedBounds,
  type Rect,
} from "../painted-bounds";
import { routeConnection } from "../../connectors/routing";
import { sectionTitleChipWorldRect } from "../../objects/section/title-chip-geometry";
import { sectionDescendantIds } from "../../state/geometry";
import type { InteractiveCanvasDocument } from "../../state/schema";
// The production rasterizer (resvg): the views' safety contract is "no SVG a
// view emits can abort it", so the tests drive the real thing.
import { rasterizeSvgToPng } from "../../../../canvas-agent/src/service/render";

const FIXTURE_PATH = join(
  import.meta.dir,
  "../../../../canvas-agent/test/fixtures/gc-decomp-harness.canvas.json",
);

function fixtureDocument(): InteractiveCanvasDocument {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as InteractiveCanvasDocument;
}

function expectContains(outer: Rect, inner: Rect, tolerance = 0.001): void {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - tolerance);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - tolerance);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + tolerance);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + tolerance);
}

function viewBoxOf(svg: string): Rect {
  const match = /viewBox="([^"]+)"/.exec(svg);
  expect(match).not.toBeNull();
  const [x, y, width, height] = match![1]!.split(" ").map(Number);
  return { x: x!, y: y!, width: width!, height: height! };
}

function count(haystack: string, needle: string): number {
  let total = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    total += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return total;
}

/** Off-viewport-endpoint fixture: a section plus far-away sticky and icon endpoints. */
function farEndpointDocument(): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "far-endpoints",
    mode: "diagram",
    objects: [
      {
        id: "zone",
        type: "section",
        text: "Zone",
        geometry: { x: 0, y: 0, width: 600, height: 400 },
        style: { shape: "section" },
      },
      {
        id: "inner",
        type: "process",
        text: "Inner",
        parentId: "zone",
        geometry: { x: 200, y: 160, width: 160, height: 80 },
        style: { shape: "rounded-rect" },
      },
      {
        id: "far-sticky",
        type: "sticky",
        text: "Far note",
        color: "yellow",
        geometry: { x: 4000, y: 0, width: 176, height: 128 },
        style: { shape: "note" },
      },
      {
        id: "far-icon",
        type: "icon",
        icon: "event",
        text: "Bolt",
        geometry: { x: 4000, y: 600, width: 120, height: 120 },
        style: { shape: "icon" },
      },
    ],
    connections: [
      { id: "cs", from: { objectId: "far-sticky" }, to: { objectId: "inner" }, arrow: "forward" },
      { id: "ci", from: { objectId: "far-icon" }, to: { objectId: "inner" }, arrow: "forward" },
    ],
  };
}

describe("renderBoardView", () => {
  it("returns the contract shape and a viewBox equal to the camera", () => {
    const document = fixtureDocument();
    const view = renderBoardView(document, { width: 1200 });
    expect(view.width).toBe(1200);
    expect(view.height).toBe(Math.round((1200 * view.camera.height) / view.camera.width));
    const viewBox = viewBoxOf(view.svg);
    expect(viewBox.x).toBeCloseTo(view.camera.x, 1);
    expect(viewBox.y).toBeCloseTo(view.camera.y, 1);
    expect(viewBox.width).toBeCloseTo(view.camera.width, 1);
    expect(viewBox.height).toBeCloseTo(view.camera.height, 1);
  });

  it("frames every painted extent: objects, routed edges, chips, captions", () => {
    const document = fixtureDocument();
    const view = renderBoardView(document, { width: 1200 });

    expectContains(view.camera, paintedBounds(document));
    for (const object of document.objects) {
      expectContains(view.camera, objectPaintedBounds(object));
    }
    for (const connection of document.connections) {
      const painted = connectionPaintedBounds(document, connection);
      expect(painted).not.toBeNull();
      expectContains(view.camera, painted!);
    }
  });

  it("keeps a known obstacle detour fully in frame", () => {
    const document = fixtureDocument();
    const objectsById = new Map(document.objects.map((object) => [object.id, object]));
    const connection = document.connections.find(
      (candidate) => candidate.id === "conn-knowledge-to-worker",
    )!;
    const routed = routeConnection(
      objectsById.get(connection.from.objectId)!,
      objectsById.get(connection.to.objectId)!,
      connection,
      document.objects,
    );
    // The fixture's route detours around section-score-gate: at least one
    // vertex lies outside both endpoint rects.
    const outsideBoth = (routed.points ?? []).some((point) => {
      const inside = (id: string) => {
        const rect = objectsById.get(id)!.geometry;
        return (
          point.x >= rect.x &&
          point.x <= rect.x + rect.width &&
          point.y >= rect.y &&
          point.y <= rect.y + rect.height
        );
      };
      return !inside(connection.from.objectId) && !inside(connection.to.objectId);
    });
    expect(outsideBoth).toBe(true);

    const view = renderBoardView(document, { width: 1200 });
    expectContains(view.camera, connectionPaintedBounds(document, connection)!);
  });

  it("counter-scales section title chips at the view's effective zoom and keeps them in frame", () => {
    const document = fixtureDocument();
    const view = renderBoardView(document, { width: 1200 });
    const zoom = 1200 / view.camera.width;
    expect(zoom).toBeLessThan(1);
    // The stage grows title chips when zoomed out — the view mirrors it.
    expect(view.svg).toContain("scale(");
    for (const section of document.objects) {
      if (section.type !== "section" || section.text === "") continue;
      expectContains(view.camera, sectionTitleChipWorldRect(section, zoom), 1);
    }
    expect(view.svg).toContain("Score gate");
  });

  it("is deterministic and rasterizes through resvg", () => {
    const document = fixtureDocument();
    const first = renderBoardView(document, { width: 1200 });
    const second = renderBoardView(document, { width: 1200 });
    expect(second.svg).toBe(first.svg);
    expect(second.camera).toEqual(first.camera);
    const png = rasterizeSvgToPng(first.svg);
    expect(png.width).toBe(first.width);
    expect(png.height).toBe(first.height);
  });
});

describe("renderSectionView", () => {
  it("frames the section: frame, descendants' painted extents, internal edges", () => {
    const document = fixtureDocument();
    const view = renderSectionView(document, "section-hero", { width: 1200 });

    const section = document.objects.find((object) => object.id === "section-hero")!;
    expectContains(view.camera, section.geometry);

    const descendantIds = sectionDescendantIds(document, "section-hero");
    for (const object of document.objects) {
      if (!descendantIds.has(object.id)) continue;
      expectContains(view.camera, objectPaintedBounds(object));
    }
    const memberIds = new Set(["section-hero", ...descendantIds]);
    for (const connection of document.connections) {
      if (!memberIds.has(connection.from.objectId) || !memberIds.has(connection.to.objectId)) {
        continue;
      }
      expectContains(view.camera, connectionPaintedBounds(document, connection)!);
    }
  });

  it("retains boundary-crossing connections and their outside endpoints", () => {
    const document = fixtureDocument();
    const view = renderSectionView(document, "section-hero", { width: 1200 });
    // conn-knowledge-to-worker enters from section-knowledge (outside the
    // camera): its label chip renders, and the outside endpoint section comes
    // along so the edge aims at the true object — both clipped by the
    // viewBox, never dropped.
    expect(view.svg).toContain("context packs");
    expect(view.svg).toContain("Knowledge");
    // conn-operator-to-cli enters from the operator icon above the frame.
    expect(view.svg).toContain("run goals");
  });

  it("throws for an id that is not a section", () => {
    const document = fixtureDocument();
    expect(() => renderSectionView(document, "node-worker-pool", { width: 800 })).toThrow();
    expect(() => renderSectionView(document, "nope", { width: 800 })).toThrow();
  });

  it("is deterministic and rasterizes through resvg", () => {
    const document = fixtureDocument();
    const first = renderSectionView(document, "section-hero", { width: 1200 });
    const second = renderSectionView(document, "section-hero", { width: 1200 });
    expect(second.svg).toBe(first.svg);
    expect(second.camera).toEqual(first.camera);
    const png = rasterizeSvgToPng(first.svg);
    expect(png.width).toBe(first.width);
    expect(png.height).toBe(first.height);
  });

  it("emits rasterizer-safe markup for retained off-viewport endpoints", () => {
    const document = farEndpointDocument();
    const view = renderSectionView(document, "zone", { width: 800 });

    // Both boundary edges are retained (drawn clipped at the camera edge)…
    expect(count(view.svg, "<path ")).toBe(2);
    // …but the far sticky endpoint draws WITHOUT its shadow filter and the
    // far icon endpoint as its fallback rect (no nested <svg>): filtered or
    // nested-svg elements wholly outside the viewport abort resvg.
    expect(view.svg).not.toContain("url(#");
    expect(count(view.svg, "<svg")).toBe(1);

    const png = rasterizeSvgToPng(view.svg);
    expect(png.width).toBe(view.width);
    expect(png.height).toBe(view.height);

    // Control: the board view has everything in frame, so the sticky keeps
    // its shadow and the icon its real glyph — and still rasterizes.
    const board = renderBoardView(document, { width: 1200 });
    expect(board.svg).toContain("url(#");
    expect(count(board.svg, "<svg")).toBe(2);
    const boardPng = rasterizeSvgToPng(board.svg);
    expect(boardPng.width).toBe(board.width);
  });
});

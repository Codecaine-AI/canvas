import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderDocumentToSvg } from "../static-svg";
import {
  ICON_GLYPHS,
  iconGlyphStrokeWidthForSize,
} from "../../objects/shapes/icon/icon-glyphs";
import type { InteractiveCanvasDocument } from "../../state/schema";

/** Occurrences of a literal substring. */
function count(haystack: string, needle: string): number {
  let total = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    total += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return total;
}

/**
 * Inline fixture: one section holding a process + decision (connected by a
 * dashed, labeled connector), plus a hostile-text sticky and a free-floating
 * process outside the section (connected across the section boundary — the
 * cross-boundary connection must drop out of a section crop).
 */
function fixtureDocument(): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "render-fixture",
    mode: "diagram",
    objects: [
      {
        id: "sec-1",
        type: "section",
        text: "Zone <A>",
        color: "blue",
        geometry: { x: 0, y: 0, width: 480, height: 360 },
        style: { shape: "section" },
      },
      {
        id: "p1",
        type: "process",
        text: "Start",
        parentId: "sec-1",
        geometry: { x: 40, y: 60, width: 160, height: 80 },
        style: { shape: "rounded-rect" },
      },
      {
        id: "d1",
        type: "decision",
        text: "OK?",
        parentId: "sec-1",
        geometry: { x: 260, y: 200, width: 160, height: 112 },
        style: { shape: "diamond" },
      },
      {
        id: "s1",
        type: "sticky",
        text: '<script>alert("sticky")</script>',
        color: "yellow",
        geometry: { x: 600, y: 40, width: 176, height: 128 },
        style: { shape: "note" },
      },
      {
        id: "p2",
        type: "process",
        text: "Outside",
        geometry: { x: 600, y: 240, width: 160, height: 80 },
        style: { shape: "rounded-rect" },
      },
    ],
    connections: [
      {
        id: "c1",
        from: { objectId: "p1" },
        to: { objectId: "d1" },
        style: "dashed",
        arrow: "forward",
        label: "<script>",
      },
      {
        id: "c2",
        from: { objectId: "d1" },
        to: { objectId: "p2" },
        arrow: "forward",
      },
    ],
  };
}

describe("renderDocumentToSvg", () => {
  it("produces a well-formed standalone root <svg>", () => {
    const result = renderDocumentToSvg(fixtureDocument());
    expect(result.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(result.svg.endsWith("</svg>")).toBe(true);
    expect(result.svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(result.svg).toContain(`width="${result.width}"`);
    expect(result.svg).toContain(`height="${result.height}"`);
    expect(result.svg).toContain('viewBox="');
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    // Self-contained: no CSS classes, no foreignObject, no external refs.
    expect(result.svg).not.toContain("class=");
    expect(result.svg).not.toContain("<foreignObject");
    // No external references: the only URL in the file is the xmlns itself.
    expect(count(result.svg, "http://")).toBe(1);
    expect(result.svg).not.toContain("https://");
  });

  it("renders the expected element inventory for the fixture", () => {
    const { svg } = renderDocumentToSvg(fixtureDocument());
    // Two connector paths.
    expect(count(svg, "<path ")).toBe(2);
    // Dashed connector carries the FigJam dash pattern.
    expect(count(svg, 'stroke-dasharray="19 7"')).toBe(1);
    // Polygons: decision diamond + one arrowhead per connection.
    expect(count(svg, "<polygon ")).toBe(3);
    // Section backdrop radius (8.5) once; connection label chip radius (15) once;
    // rx=6 appears for the two base rounded rects (8px radius, inset by half
    // the 4px stroke) plus the section title chip.
    expect(count(svg, 'rx="8.5"')).toBe(1);
    expect(count(svg, 'rx="15"')).toBe(1);
    expect(count(svg, 'rx="6"')).toBe(3);
    // Sticky drop-shadow filter is defined once and referenced once.
    expect(count(svg, "<feDropShadow ")).toBe(1);
    expect(count(svg, "url(#render-fixture-sticky-shadow)")).toBe(1);
    // Section tint + chip colors from the palette's blue section cells.
    expect(svg).toContain('fill="#F5FBFF"');
    expect(svg).toContain('fill="#C2E5FF"');
    // Object text renders.
    expect(svg).toContain(">Start</tspan>");
    expect(svg).toContain(">OK?</tspan>");
  });

  it("XML-escapes hostile user text everywhere", () => {
    const { svg } = renderDocumentToSvg(fixtureDocument());
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    // Section title with an angle bracket, escaped.
    expect(svg).toContain("Zone &lt;A&gt;");
  });

  it("is deterministic", () => {
    const a = renderDocumentToSvg(fixtureDocument());
    const b = renderDocumentToSvg(fixtureDocument());
    expect(a.svg).toBe(b.svg);
    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
  });

  it("crops to a section and filters to its members + internal connectors", () => {
    const { svg } = renderDocumentToSvg(fixtureDocument(), { sectionId: "sec-1" });
    expect(svg).toContain(">Start</tspan>");
    expect(svg).toContain(">OK?</tspan>");
    // The sticky and the outside process are gone.
    expect(svg).not.toContain("alert");
    expect(svg).not.toContain(">Outside</tspan>");
    expect(svg).not.toContain("feDropShadow");
    // Only the intra-section connection remains (c2 crosses the boundary).
    expect(count(svg, "<path ")).toBe(1);
  });

  it("fit: 'content' crops to the members' bounds and omits the section frame", () => {
    const { svg } = renderDocumentToSvg(fixtureDocument(), {
      sectionId: "sec-1",
      fit: "content",
    });
    // Members and their internal connector survive.
    expect(svg).toContain(">Start</tspan>");
    expect(svg).toContain(">OK?</tspan>");
    expect(count(svg, "<path ")).toBe(1);
    // The section frame backdrop + title chip are gone.
    expect(svg).not.toContain("Zone &lt;A&gt;");
    // Bounds fit the members (min 40,60 / max 420,312) + default 16px padding.
    expect(svg).toContain('viewBox="24 44 412 284"');
  });

  it("fit: 'content' on an empty section falls back to the frame crop", () => {
    const document = fixtureDocument();
    document.objects = document.objects.map((object) =>
      object.parentId === "sec-1" ? { ...object, parentId: undefined } : object,
    );
    const frame = renderDocumentToSvg(document, { sectionId: "sec-1" });
    const content = renderDocumentToSvg(document, { sectionId: "sec-1", fit: "content" });
    expect(content.svg).toBe(frame.svg);
  });

  it("falls back to whole-document bounds for an unknown sectionId", () => {
    const whole = renderDocumentToSvg(fixtureDocument());
    const fallback = renderDocumentToSvg(fixtureDocument(), { sectionId: "nope" });
    expect(fallback.svg).toBe(whole.svg);
    expect(fallback.width).toBe(whole.width);
    expect(fallback.height).toBe(whole.height);
  });

  it("derives the missing dimension from the content aspect ratio", () => {
    const doc = fixtureDocument();
    const natural = renderDocumentToSvg(doc);
    const sized = renderDocumentToSvg(doc, { width: 400 });
    expect(sized.width).toBe(400);
    expect(sized.height).toBe(Math.round((400 * natural.height) / natural.width));
    const both = renderDocumentToSvg(doc, { width: 300, height: 100 });
    expect(both.width).toBe(300);
    expect(both.height).toBe(100);
  });

  it("paints the board background by default and omits it when transparent", () => {
    const doc: InteractiveCanvasDocument = {
      schemaVersion: 1,
      id: "bg-fixture",
      mode: "diagram",
      objects: [
        {
          id: "p1",
          type: "process",
          text: "",
          geometry: { x: 0, y: 0, width: 100, height: 60 },
          style: { shape: "rounded-rect" },
        },
      ],
      connections: [],
    };
    const board = renderDocumentToSvg(doc, { background: "board" });
    expect(board.svg).toContain('fill="#F5F5F5"');
    const transparent = renderDocumentToSvg(doc, { background: "transparent" });
    expect(transparent.svg).not.toContain('fill="#F5F5F5"');
    // Empty text renders no text node at all.
    expect(transparent.svg).not.toContain("<text");
  });

  it("respects the padding option", () => {
    const doc = fixtureDocument();
    const tight = renderDocumentToSvg(doc, { padding: 0 });
    const padded = renderDocumentToSvg(doc, { padding: 50 });
    expect(padded.width).toBe(tight.width + 100);
    expect(padded.height).toBe(tight.height + 100);
  });

  it("mirrors the stage's layer order: sections < connectors < objects < title chips", () => {
    const { svg } = renderDocumentToSvg(fixtureDocument(), { background: "transparent" });
    const sectionTint = svg.indexOf('fill="#F5FBFF"'); // section backdrop
    const connectorPath = svg.indexOf("<path ");
    const objectText = svg.indexOf(">Start</tspan>");
    const titleChip = svg.indexOf("Zone &lt;A&gt;");
    expect(sectionTint).toBeGreaterThan(-1);
    expect(connectorPath).toBeGreaterThan(sectionTint);
    expect(objectText).toBeGreaterThan(connectorPath);
    expect(titleChip).toBeGreaterThan(objectText);
  });

  it("renders real icon glyphs from the pure registry", () => {
    const doc: InteractiveCanvasDocument = {
      schemaVersion: 1,
      id: "icon-fixture",
      mode: "diagram",
      objects: [
        {
          id: "i1",
          type: "icon",
          icon: "bolt",
          text: "Bolt",
          geometry: { x: 0, y: 0, width: 120, height: 120 },
          style: { shape: "icon" },
        },
      ],
      connections: [],
    };
    const { svg } = renderDocumentToSvg(doc, { background: "transparent" });
    const glyph = ICON_GLYPHS.bolt;
    // Nested glyph svg with the registry's viewBox and stroke semantics.
    expect(svg).toContain(`<svg x="0" y="0" width="120" height="120" viewBox="0 0 ${glyph.viewBoxSize} ${glyph.viewBoxSize}"`);
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toContain(
      `stroke-width="${String(Math.round(iconGlyphStrokeWidthForSize(120) * 100) / 100)}"`,
    );
    // Every registry element for the glyph appears in the ink layer.
    for (const element of glyph.elements) {
      if (element.kind === "path") {
        expect(svg).toContain(`d="${element.d}"`);
      }
    }
    // Fill layer gating mirrors IconShapeBody: only when a closed interior exists.
    const hasClosedInterior = glyph.elements.some(
      (element) =>
        element.kind === "circle" || (element.kind === "path" && /[zZ]/.test(element.d)),
    );
    // Default gray shape fill (#E6E6E6) paints glyph interiors when gated in.
    expect(svg.includes('<g fill="#E6E6E6" stroke="none">')).toBe(hasClosedInterior);
    // The below-slot label still renders.
    expect(svg).toContain(">Bolt</tspan>");
    // No neutral-rect fallback body for a known glyph.
    expect(svg).not.toContain('rx="6"');
  });

  it("falls back to the neutral rect for an unknown icon glyph id", () => {
    const doc: InteractiveCanvasDocument = {
      schemaVersion: 1,
      id: "icon-fallback-fixture",
      mode: "diagram",
      objects: [
        {
          id: "i1",
          type: "icon",
          icon: "not-a-real-glyph" as InteractiveCanvasDocument["objects"][number]["icon"],
          text: "",
          geometry: { x: 0, y: 0, width: 120, height: 120 },
          style: { shape: "icon" },
        },
      ],
      connections: [],
    };
    const { svg } = renderDocumentToSvg(doc, { background: "transparent" });
    expect(count(svg, "<svg")).toBe(1); // no nested glyph svg
    expect(svg).toContain('rx="6"'); // the neutral rounded rect body
  });

  it("smoke-renders a real canvas file when present", () => {
    const fixturePath = join(import.meta.dir, "../../../../../canvases/v2-flow.canvas.json");
    if (!existsSync(fixturePath)) return;
    const doc = JSON.parse(readFileSync(fixturePath, "utf8")) as InteractiveCanvasDocument;
    const result = renderDocumentToSvg(doc);
    expect(result.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(result.svg.endsWith("</svg>")).toBe(true);
    expect(result.svg.length).toBeGreaterThan(1000);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    // Deterministic on real content too.
    expect(renderDocumentToSvg(doc).svg).toBe(result.svg);
  });
});

import { describe, expect, test } from "bun:test";

import { chipFor, CHIP_HEIGHT, chipWidth } from "../src/board/lints/geometry";
import { renderDocumentToSvg } from "../../canvas/src/render/static-svg.ts";
import { box, connect, makeDocument } from "./synthetic";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

/**
 * Lint chips ARE the renderer's chips. The CONNECTION_LABEL_* constants are
 * module-private in the read-only canvas package (Connector.tsx, mirrored by
 * render/static-svg.ts), so lints/geometry.ts restates them — and this test
 * pins that restatement to the static SVG renderer's ACTUAL output: the
 * chip rect the lint reasons about must equal the chip rect the headless
 * preview export draws, for every labeled edge, byte-for-byte up to the
 * renderer's own 2-decimal attribute formatting.
 */

interface Rect { x: number; y: number; width: number; height: number }

/** Connection-label chip <rect>s from a static render — rx=15 is chip-only
 * (base shapes use rx 8, section title chips rx 6). */
function svgChipRects(svg: string): Rect[] {
  const rects: Rect[] = [];
  for (const match of svg.matchAll(/<rect ([^>]*?)\/>/g)) {
    const attributes = Object.fromEntries(
      [...match[1]!.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)].map((pair) => [pair[1], pair[2]]),
    );
    if (attributes["rx"] !== "15") continue;
    rects.push({
      x: Number(attributes["x"]),
      y: Number(attributes["y"]),
      width: Number(attributes["width"]),
      height: Number(attributes["height"]),
    });
  }
  return rects;
}

function expectRendererParity(document: InteractiveCanvasDocument): void {
  const lintChips = document.connections.flatMap((edge) => {
    const chip = chipFor(edge, document);
    return chip ? [chip] : [];
  });
  const rendererChips = svgChipRects(renderDocumentToSvg(document).svg);
  expect(rendererChips).toHaveLength(lintChips.length);
  for (let index = 0; index < lintChips.length; index += 1) {
    const lint = lintChips[index]!.rect;
    const renderer = rendererChips[index]!;
    // The SVG serializer rounds attributes to 2 decimals (fmt); match to that.
    expect(renderer.x).toBeCloseTo(lint.x, 2);
    expect(renderer.y).toBeCloseTo(lint.y, 2);
    expect(renderer.width).toBeCloseTo(lint.width, 2);
    expect(renderer.height).toBeCloseTo(lint.height, 2);
  }
}

describe("lint chip / static renderer parity", () => {
  test("short label: the renderer's 41px minimum width, 30px height", () => {
    const document = makeDocument(
      [box("a", 0, 0), box("b", 600, 0)],
      [{ ...connect("e", "a", "b"), label: "X" }],
    );
    const chip = chipFor(document.connections[0]!, document)!;
    expect(chip.rect.width).toBe(41);        // min width beats 1×9.6 + 24
    expect(chip.rect.height).toBe(CHIP_HEIGHT);
    expectRendererParity(document);
  });

  test("mid and long labels: 9.6px per character plus 12px padding a side", () => {
    expect(chipWidth("go live")).toBeCloseTo(7 * 9.6 + 24, 10);
    expect(chipWidth("connect-to-database")).toBeCloseTo(19 * 9.6 + 24, 10);
    const document = makeDocument(
      [
        box("a", 0, 0), box("b", 600, 0),
        box("c", 0, 300), box("d", 600, 300),
      ],
      [
        { ...connect("mid", "a", "b"), label: "go live" },
        { ...connect("long", "c", "d"), label: "connect-to-database" },
      ],
    );
    expectRendererParity(document);
  });

  test("empty-adjacent: empty and whitespace labels draw no chip on either side", () => {
    const document = makeDocument(
      [
        box("a", 0, 0), box("b", 600, 0),
        box("c", 0, 300), box("d", 600, 300),
        box("e1", 0, 600), box("e2", 600, 600),
      ],
      [
        { ...connect("labeled", "a", "b"), label: "X" },
        { ...connect("empty", "c", "d"), label: "" },
        { ...connect("blank", "e1", "e2"), label: "   " },
      ],
    );
    expect(chipFor(document.connections[1]!, document)).toBeUndefined();
    expect(chipFor(document.connections[2]!, document)).toBeUndefined();
    // Exactly one chip renders, and it matches the lint's.
    expectRendererParity(document);
    expect(svgChipRects(renderDocumentToSvg(document).svg)).toHaveLength(1);
  });

  test("elbowed route: chip parity holds at the router's own labelPoint", () => {
    const document = makeDocument(
      [box("a", 0, 0), box("w", 400, 252), box("b", 800, 0)],
      [{
        ...connect("e", "a", "b"),
        label: "detour",
        waypoints: [[160, 300], [800, 300]],
      }],
    );
    expectRendererParity(document);
  });
});

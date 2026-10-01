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

function attributesOf(source: string): Record<string, string> {
  return Object.fromEntries(
    [...source.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)].map((pair) => [pair[1], pair[2]]),
  );
}

/**
 * Connection-label chip <rect>s from a static render, located by structure
 * rather than by a corner radius (the radius is a workspace style setting,
 * so it cannot tell a chip from a shape): a chip is the <rect> painted
 * immediately before the <text> carrying one of the document's labels, and
 * that text sits at the rect's exact center (the label point).
 */
function svgChipRects(svg: string, labels: readonly string[]): Rect[] {
  const wanted = new Set(labels);
  const rects: Rect[] = [];
  for (const match of svg.matchAll(/<rect ([^>]*?)\/><text ([^>]*)>([^<]*)<\/text>/g)) {
    if (!wanted.has(match[3]!)) continue;
    const rect = attributesOf(match[1]!);
    const text = attributesOf(match[2]!);
    const chip = {
      x: Number(rect["x"]),
      y: Number(rect["y"]),
      width: Number(rect["width"]),
      height: Number(rect["height"]),
    };
    // 2-decimal attribute rounding on both sides: allow one rounding step.
    if (Math.abs(chip.x + chip.width / 2 - Number(text["x"])) > 0.02) continue;
    if (Math.abs(chip.y + chip.height / 2 - Number(text["y"])) > 0.02) continue;
    rects.push(chip);
  }
  return rects;
}

function labelsOf(document: InteractiveCanvasDocument): string[] {
  return document.connections.flatMap((edge) => (edge.label ? [edge.label] : []));
}

function expectRendererParity(document: InteractiveCanvasDocument): void {
  const lintChips = document.connections.flatMap((edge) => {
    const chip = chipFor(edge, document);
    return chip ? [chip] : [];
  });
  const rendererChips = svgChipRects(renderDocumentToSvg(document).svg, labelsOf(document));
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
    expect(svgChipRects(renderDocumentToSvg(document).svg, labelsOf(document))).toHaveLength(1);
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

  /**
   * S1.1 — a `labelPosition` pin moves the DRAWN chip, so it must move the
   * LINTED chip by the same amount. Without this the lints would keep judging
   * the midpoint and `move_label` could never clear a finding.
   */
  test("pinned label: the lint chip tracks the pin, exactly as the renderer does", () => {
    const pinned = makeDocument(
      [box("a", 0, 0), box("b", 600, 0)],
      [{ ...connect("e", "a", "b"), label: "handoff", labelPosition: { along: 0.2, offset: -40 } }],
    );
    expectRendererParity(pinned);

    const unpinned = makeDocument(
      [box("a", 0, 0), box("b", 600, 0)],
      [{ ...connect("e", "a", "b"), label: "handoff" }],
    );
    const pinnedRect = chipFor(pinned.connections[0]!, pinned)!.rect;
    const unpinnedRect = chipFor(unpinned.connections[0]!, unpinned)!.rect;
    // Same route, same label — only the pin differs, so the chip must have moved.
    expect(pinnedRect).not.toEqual(unpinnedRect);
    expect(pinnedRect.width).toBe(unpinnedRect.width);
  });

  test("an along-only pin at 0.5 is the midpoint the unpinned chip already used", () => {
    const pinned = makeDocument(
      [box("a", 0, 0), box("b", 600, 0)],
      [{ ...connect("e", "a", "b"), label: "handoff", labelPosition: { along: 0.5 } }],
    );
    const unpinned = makeDocument(
      [box("a", 0, 0), box("b", 600, 0)],
      [{ ...connect("e", "a", "b"), label: "handoff" }],
    );
    const a = chipFor(pinned.connections[0]!, pinned)!.rect;
    const b = chipFor(unpinned.connections[0]!, unpinned)!.rect;
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
  });
});

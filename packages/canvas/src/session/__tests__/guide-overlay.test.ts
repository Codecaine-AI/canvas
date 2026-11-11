/**
 * The guide overlay: what a reviewer agent sees drawn over a board render.
 */
import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasObject } from "../../state/schema";
import { canvasThemePreset, stageMarkColors } from "../../theme/canvas-style";
import { renderGuideOverlay, renderGuideOverlaySvg } from "../perception/guide-overlay";
import { box, connect, makeDocument } from "./synthetic";

const style = canvasThemePreset("schematic-light");
const pink = stageMarkColors(style).distribution;

const page = (): InteractiveCanvasObject => ({ ...box("page", 0, 0, 1400, 900, "section"), color: "white" });
const node = (id: string, x: number, y: number) => box(id, x, y, 280, 100);
/** `b` sits one grid step below the center line of `a`, which its wire runs to. `c` sits under `a`, on its lines. */
const board = makeDocument([page(), node("a", 200, 200), node("b", 800, 220), node("c", 200, 600)], [connect("w", "a", "b")]);

const linesIn = (svg: string, group: RegExp) => [...(group.exec(svg)?.[1] ?? "").matchAll(/<line [^>]*\/>/g)].map((match) => match[0]);
/** The guides drawn at full strength, and the faint ones. */
const strong = (svg: string) => linesIn(svg, /<g stroke-width="2">(.*?)<\/g>/);
const faint = (svg: string) => linesIn(svg, /<g stroke-width="1" stroke-opacity="[^"]+">(.*?)<\/g>/);

describe("guide overlay", () => {
  test("a near-miss draws its guide in the Studio pink, with a number the legend explains", () => {
    const { svg, legend } = renderGuideOverlaySvg(board, { canvasStyle: style });
    expect(legend).toEqual(["G1 b is 20px off a's center line, so w bends (move b by dy -20)"]);
    // The line b belongs on: a's center line, from a's left edge to b's right.
    expect(strong(svg)).toEqual([`<line x1="200" y1="250" x2="1080" y2="250"/>`]);
    expect(svg).toContain(`stroke="${pink}"`);
    expect(svg).toContain(">G1</text>");
  });

  test("a line the board already sits on draws faint, with no number", () => {
    const { svg } = renderGuideOverlaySvg(board, { canvasStyle: style });
    // a and c share a line down the board.
    expect(faint(svg)).toContainEqual(`<line x1="200" y1="200" x2="200" y2="700"/>`);
    const onLine = renderGuideOverlaySvg(makeDocument([page(), node("a", 200, 200), node("c", 200, 600)]), { canvasStyle: style });
    expect(strong(onLine.svg)).toEqual([]);
    expect(onLine.legend).toEqual([]);
    expect(faint(onLine.svg).length).toBeGreaterThan(0);
  });

  test("a crop is the region at 1:1, and shows and names only the guides inside it", () => {
    const around = (x: number, y: number) => renderGuideOverlay(board, { canvasStyle: style, region: { x, y, width: 400, height: 300 } });
    const atB = around(760, 120);
    expect([atB.width, atB.height]).toEqual([400, 300]);
    expect(atB.legend).toEqual(["G1 b is 20px off a's center line, so w bends (move b by dy -20)"]);
    expect(around(160, 520).legend).toEqual([]);
    // Cut at the crop's edge, the guide still runs along the same line.
    const cut = renderGuideOverlaySvg(board, { canvasStyle: style, region: { x: 760, y: 120, width: 400, height: 300 } });
    expect(strong(cut.svg)).toEqual([`<line x1="760" y1="250" x2="1080" y2="250"/>`]);
  });
});

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { loadReviewCanvas } from "./critic.ts";
import { renderCropPng } from "./crop.ts";
import { HIGHLIGHT_MAX_EDGE, highlightFrame, highlightSvg, renderHighlights, type HighlightUnit } from "./highlights.ts";
import { bounds, touches, type Board, type Mark } from "./review-inputs.ts";

const BOARD = resolve(import.meta.dir, "fixtures/review/b05.canvas.json");

describe("climb highlight images", () => {
  const area: Mark = { box: { x: 100, y: 200, width: 50, height: 40 } };
  const stretch: Mark = { path: [[10, 20], [110, 20], [110, 90]] };
  /** The tags of an SVG: the box and the id of each. */
  const tags = (svg: string) => [...svg.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)" rx="[\d.]+" fill="#d92d20"\/><text [^>]*>([^<]+)<\/text>/g)]
    .map((match) => ({ id: match[5]!, box: { x: Number(match[1]), y: Number(match[2]), width: Number(match[3]), height: Number(match[4]) } }));

  test("a box mark is a red frame and a path mark a red band along the wire, each tagged with its finding's id", () => {
    const svg = highlightSvg([{ id: "F4", marks: [area] }, { id: "F12", marks: [stretch] }], 1);
    expect(svg).toContain(`<rect x="100" y="200" width="50" height="40" fill="#d92d20" fill-opacity="0.08" stroke="#d92d20" stroke-width="3"/>`);
    expect(svg).toContain(`<polyline points="10,20 110,20 110,90" fill="none" stroke="#d92d20" stroke-opacity="0.45" stroke-width="10"`);
    expect(tags(svg)).toEqual([{ id: "F4", box: { x: 100, y: 178, width: 30, height: 20 } }, { id: "F12", box: { x: 18, y: -6, width: 39, height: 20 } }]);
  });

  test("a tag keeps its size on an image that is scaled down", () => {
    const svg = highlightSvg([{ id: "F4", marks: [area] }], 0.5);
    expect(svg).toContain(`stroke-width="6"`);
    expect(tags(svg)).toEqual([{ id: "F4", box: { x: 100, y: 156, width: 60, height: 40 } }]);
  });

  test("the tags of findings on one place do not hide each other", () => {
    const found = tags(highlightSvg([{ id: "F1", marks: [area] }, { id: "F2", marks: [area] }, { id: "F3", marks: [area, area] }], 1));
    expect(found.map((tag) => tag.id)).toEqual(["F1", "F2", "F3", "F3"]);
    for (const [index, tag] of found.entries()) for (const other of found.slice(index + 1)) expect(touches(tag.box, other.box)).toBe(false);
  });

  const unit = (overrides: Partial<HighlightUnit>): HighlightUnit => ({ id: "sec", kind: "section", rect: { x: 100, y: 100, width: 400, height: 300 }, crops: [], ...overrides });
  const limit = { x: 0, y: 0, width: 2000, height: 1000 };

  test("a reviewer's image shows its part of the board and its marks, and stays on the board", () => {
    expect(highlightFrame(unit({}), [{ box: { x: 450, y: 350, width: 200, height: 100 } }], limit)).toEqual({ x: 60, y: 60, width: 630, height: 430 });
    // A mark that runs off the board does not stretch the image past it.
    expect(highlightFrame(unit({}), [{ path: [[-500, 200], [300, 200]] }], limit)).toEqual({ x: 0, y: 60, width: 540, height: 380 });
    expect(highlightFrame(unit({ rect: { x: 5000, y: 5000, width: 10, height: 10 } }), [], limit)).toBeNull();
  });

  test("a gap reviewer's image shows the crops that hold a mark, at their own size", () => {
    const crops = [{ x: 0, y: 0, width: 480, height: 360 }, { x: 1000, y: 0, width: 480, height: 360 }];
    const gap = unit({ id: "gap-1", kind: "gap", rect: bounds(crops), crops });
    expect(highlightFrame(gap, [{ box: { x: 1100, y: 100, width: 50, height: 50 } }], limit)).toEqual(crops[1]!);
    expect(highlightFrame(gap, [{ box: { x: 100, y: 100, width: 50, height: 50 } }, { box: { x: 1100, y: 100, width: 50, height: 50 } }], limit)).toEqual(bounds(crops));
    // A mark in none of its crops is shown with the board round it.
    expect(highlightFrame(gap, [{ box: { x: 600, y: 500, width: 50, height: 50 } }], limit)).toEqual({ x: 400, y: 300, width: 450, height: 450 });
  });

  test("board 05: one image for each reviewer with a marked finding, in the reviewers' order, 1568 px on its long edge at most", async () => {
    const canvas = await loadReviewCanvas();
    const file = canvas.toolkit.openCanvasFile(BOARD);
    const whole = bounds((file.persisted as Board).objects.map((object) => object.geometry));
    const units: HighlightUnit[] = [
      { id: "wires", kind: "wire", rect: whole, crops: [] },
      { id: "sec_contract", kind: "section", rect: { x: 660, y: 80, width: 1380, height: 648 }, crops: [] },
      { id: "sec_ford", kind: "section", rect: { x: 660, y: 800, width: 400, height: 300 }, crops: [] },
    ];
    const outDir = resolve(mkdtempSync(resolve(tmpdir(), "climb-highlights-")), "round-1");
    const images = renderHighlights({
      canvas, file, limit: whole, units, outDir,
      findings: [
        { id: "F1", marks: [{ unit: "sec_contract", marks: [{ box: { x: 780, y: 160, width: 200, height: 120 } }] }, { unit: "wires", marks: [{ path: [[370, 612], [370, 220], [852, 220]] }] }] },
        // A reviewer that gave no mark for a finding has no image for it.
        { id: "F2", marks: [{ unit: "sec_contract", marks: [{ box: { x: 1200, y: 400, width: 100, height: 60 } }] }, { unit: "sec_ford", marks: [] }] },
        { id: "F3", marks: [] },
      ],
    });
    expect(images).toEqual([
      { unit: "wires", path: resolve(outDir, "wires.png"), findings: ["F1"] },
      { unit: "sec_contract", path: resolve(outDir, "sec_contract.png"), findings: ["F1", "F2"] },
    ]);
    const size = (path: string) => { const png = readFileSync(path); return [png.readUInt32BE(16), png.readUInt32BE(20)]; };
    expect(Math.max(...size(images[0]!.path))).toBeLessThanOrEqual(HIGHLIGHT_MAX_EDGE);
    // The section's image is its frame with 40 px round it, at full size, with the marks painted on it.
    const frame = { x: 620, y: 40, width: 1460, height: 728 };
    expect(size(images[1]!.path)).toEqual([1460, 728]);
    expect(readFileSync(images[1]!.path).equals(renderCropPng(canvas, file, frame).png)).toBe(false);
  });
});

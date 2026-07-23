import { describe, expect, test } from "bun:test";

import { documentToOccupancyAscii } from "../src/pipeline";
import { loadCanvasBoards } from "./helpers";
import { box, makeDocument } from "./synthetic";

describe("documentToOccupancyAscii", () => {
  test("maps a small document with a coordinate frame and legend", () => {
    const document = makeDocument([
      box("alpha", 0, 0, 128, 64),
      box("beta", 256, 0, 128, 64),
    ]);
    const result = documentToOccupancyAscii(document, { cellSize: 64 });

    expect(result.grid.columns).toBe(6);
    expect(result.grid.rows).toBe(1);
    expect(result.map).toBe("AA..BB");
    expect(result.legend).toEqual([
      expect.objectContaining({ character: "A", id: "alpha", type: "rectangle" }),
      expect.objectContaining({ character: "B", id: "beta", type: "rectangle" }),
    ]);
    // Coordinate frame: header, digit ruler, y-labeled row, legend lines.
    expect(result.text).toContain("64px cells · origin (0, 0) · 6×1");
    expect(result.text).toContain("0 AA..BB");
    expect(result.text).toContain('A rectangle "alpha" 128×64 at (0, 0)');
  });

  test("sections render as outlines, boxes fill over them", () => {
    const document = makeDocument([
      { ...box("wrap", 0, 0, 320, 320, "section") },
      box("inner", 128, 128, 64, 64),
    ]);
    const result = documentToOccupancyAscii(document, { cellSize: 64 });
    const rows = result.map.split("\n");
    expect(rows).toHaveLength(5);
    // Section perimeter marked, interior left empty except the filled box.
    expect(rows[0]).toBe("AAAAA");
    expect(rows[2]).toBe("A.B.A");
  });

  test("scope crops to the given rect and filters non-intersecting objects", () => {
    const document = makeDocument([
      box("near", 0, 0, 64, 64),
      box("far", 10_000, 0, 64, 64),
    ]);
    const result = documentToOccupancyAscii(document, {
      cellSize: 64,
      scope: { x: 0, y: 0, width: 128, height: 64 },
    });
    expect(result.legend.map((entry) => entry.id)).toEqual(["near"]);
    expect(result.map).toBe("A.");
  });

  test("is deterministic on a real board", () => {
    const board = loadCanvasBoards()[0]!;
    const first = documentToOccupancyAscii(board.document);
    const second = documentToOccupancyAscii(board.document);
    expect(first.text).toBe(second.text);
    expect(first.legend.length).toBe(board.document.objects.length);
  });
});

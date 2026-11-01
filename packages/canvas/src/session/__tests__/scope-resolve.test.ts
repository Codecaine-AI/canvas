import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import {
  resolveScope,
  type ScopeResolution,
} from "../src/board/scope";
import { FIXTURES_DIR } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

function consumed(result: ScopeResolution): {
  frame: ScopeResolution["frame"];
  scopeObjectIds: string[];
  boundaryArrowCount: number;
} {
  return {
    frame: result.frame,
    scopeObjectIds: result.scopeObjectIds,
    boundaryArrowCount: result.boundaryArrowCount,
  };
}

const section = {
  ...box("section", 0, 0, 600, 400, "section"),
  text: "Work",
};
const first = {
  ...box("first", 48, 80, 128, 96),
  parentId: section.id,
};
const second = {
  ...box("second", 240, 80, 160, 96),
  parentId: section.id,
};
const east = box("east", 760, 96, 128, 96);
const north = box("north", 240, -176, 160, 96);
const synthetic = makeDocument(
  [section, first, second, east, north],
  [
    connect("inside", "first", "second"),
    connect("outbound", "second", "east"),
    connect("inbound", "north", "first"),
    connect("outside", "east", "north"),
  ],
);

describe("scope resolution characterization", () => {
  test("resolves a scoped subset in document order", () => {
    expect(consumed(resolveScope(synthetic, ["second", "first"]))).toMatchInlineSnapshot(`
      {
        "boundaryArrowCount": 2,
        "frame": {
          "height": 96,
          "width": 352,
          "x": 48,
          "y": 80,
        },
        "scopeObjectIds": [
          "first",
          "second",
        ],
      }
    `);
  });

  test("resolves the whole board", () => {
    expect(
      consumed(resolveScope(synthetic, synthetic.objects.map((object) => object.id))),
    ).toMatchInlineSnapshot(`
      {
        "boundaryArrowCount": 0,
        "frame": {
          "height": 576,
          "width": 888,
          "x": 0,
          "y": -176,
        },
        "scopeObjectIds": [
          "section",
          "first",
          "second",
          "east",
          "north",
        ],
      }
    `);
  });

  test("keeps a child-only scope inside its section", () => {
    expect(consumed(resolveScope(synthetic, ["first"]))).toMatchInlineSnapshot(`
      {
        "boundaryArrowCount": 2,
        "frame": {
          "height": 96,
          "width": 128,
          "x": 48,
          "y": 80,
        },
        "scopeObjectIds": [
          "first",
        ],
      }
    `);
  });

  test("expands a selected section to its geometric descendants", () => {
    expect(consumed(resolveScope(synthetic, ["section"]))).toMatchInlineSnapshot(`
      {
        "boundaryArrowCount": 2,
        "frame": {
          "height": 400,
          "width": 600,
          "x": 0,
          "y": 0,
        },
        "scopeObjectIds": [
          "section",
          "first",
          "second",
        ],
      }
    `);
  });

  test("counts connections crossing in and out of scope", () => {
    expect(consumed(resolveScope(synthetic, ["first", "second"]))).toMatchInlineSnapshot(`
      {
        "boundaryArrowCount": 2,
        "frame": {
          "height": 96,
          "width": 352,
          "x": 48,
          "y": 80,
        },
        "scopeObjectIds": [
          "first",
          "second",
        ],
      }
    `);
  });

  test("resolves a nested section on an existing page-frame board", () => {
    const document = JSON.parse(
      readFileSync(join(FIXTURES_DIR, "bubba-voice.canvas.json"), "utf8"),
    ) as InteractiveCanvasDocument;
    expect(consumed(resolveScope(document, ["section-ml-pending"]))).toMatchInlineSnapshot(`
      {
        "boundaryArrowCount": 0,
        "frame": {
          "height": 160,
          "width": 608,
          "x": 912,
          "y": 480,
        },
        "scopeObjectIds": [
          "section-ml-pending",
          "task-ml-a",
        ],
      }
    `);
  });
});

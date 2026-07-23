import { describe, expect, test } from "bun:test";

import { buildBoardModel, formatBoardDigest } from "../src/digest/board-model";
import { box, connect, makeDocument } from "./synthetic";

describe("buildBoardModel", () => {
  test("discriminates kinds and reads membership as stored", () => {
    const section = box("section", 0, 0, 480, 320, "section");
    const child = { ...box("child", 64, 96), parentId: "section" };
    const sticky = { ...box("note", 64, 400, 160, 160, "sticky"), parentId: null };
    const marker = box("marker", 300, 400, 32, 32, "annotation-marker");
    const model = buildBoardModel(makeDocument([section, child, sticky, marker]));

    expect(model.nodes.map((node) => node.kind)).toEqual([
      "section",
      "node",
      "sticky",
      "annotationish",
    ]);
    expect(model.byId("child")).toMatchObject({
      parentId: "section",
      x: 64,
      y: 96,
      width: 160,
      height: 96,
      text: "child",
    });
    expect(model.byId("missing")).toBeUndefined();
  });

  test("frame is the locked background section rect, preferring the root", () => {
    const nested = {
      ...box("nested-frame", 32, 32, 320, 240, "section"),
      locked: "background" as const,
      parentId: "page",
    };
    const page = {
      ...box("page", 0, 0, 640, 480, "section"),
      locked: "background" as const,
    };
    const model = buildBoardModel(makeDocument([nested, page]));
    expect(model.frame).toEqual({ x: 0, y: 0, width: 640, height: 480 });

    const frameless = buildBoardModel(makeDocument([box("plain", 0, 0, 480, 320, "section")]));
    expect(frameless.frame).toBeNull();
  });

  test("childrenOf and siblingsOf follow stored membership; siblings exclude stickies", () => {
    const section = box("section", 0, 0, 640, 480, "section");
    const a = { ...box("a", 32, 96), parentId: "section" };
    const b = { ...box("b", 240, 96), parentId: "section" };
    const sticky = { ...box("note", 448, 96, 160, 160, "sticky"), parentId: "section" };
    const outside = box("outside", 900, 0);
    const model = buildBoardModel(makeDocument([section, a, b, sticky, outside]));

    expect(model.childrenOf("section").map((node) => node.id)).toEqual(["a", "b", "note"]);
    expect(model.siblingsOf("a").map((node) => node.id)).toEqual(["b"]);
    expect(model.siblingsOf("outside").map((node) => node.id)).toEqual(["section"]);
    expect(model.siblingsOf("missing")).toEqual([]);
  });

  test("edges carry channels as stored", () => {
    const edge = {
      ...connect("alpha-beta", "alpha", "beta"),
      label: "next",
      style: "dashed" as const,
      color: "red" as const,
      waypoints: [[10, 20]] as Array<[number, number]>,
    };
    const model = buildBoardModel(makeDocument([box("alpha", 0, 0), box("beta", 320, 0)], [edge]));
    expect(model.edges).toEqual([{
      id: "alpha-beta",
      fromId: "alpha",
      toId: "beta",
      label: "next",
      style: "dashed",
      color: "red",
      waypoints: [[10, 20]],
    }]);
  });
});

describe("formatBoardDigest", () => {
  test("renders the BOARD block: frame header, section tree, nodes, edges, stickies", () => {
    const page = {
      ...box("page", 0, 0, 640, 480, "section"),
      text: "Page frame",
      locked: "background" as const,
    };
    const inner = {
      ...box("inner", 32, 64, 320, 240, "section"),
      text: "Inner",
      color: "blue" as const,
      parentId: "page",
    };
    const task = {
      ...box("task", 64, 128, 184, 96, "process"),
      text: "Do the thing",
      color: "teal" as const,
      parentId: "inner",
    };
    const sticky = {
      ...box("note", 400, 64, 160, 160, "sticky"),
      text: "Remember this",
      parentId: "page",
    };
    const edge = { ...connect("task-note", "task", "note"), label: "see", style: "dashed" as const };
    const digest = formatBoardDigest(buildBoardModel(makeDocument([page, inner, task, sticky], [edge])));

    expect(digest).toContain("BOARD · frame 0,0 640×480 (locked)");
    expect(digest).toContain('  page "Page frame" (gray) 0,0 640×480 locked=background');
    expect(digest).toContain('    inner "Inner" (blue) 32,64 320×240');
    expect(digest).toContain('  task  process  teal  "Do the thing"  64,128 184×96  in=inner');
    expect(digest).toContain('  task-note  task→note  "see"  dashed gray');
    expect(digest).toContain('  note  sticky  yellow  "Remember this"  400,64 160×160  in=page');
  });

  test("renders placeholders for an empty, frameless board", () => {
    const digest = formatBoardDigest(buildBoardModel(makeDocument([box("only", 0, 0)])));
    expect(digest).toContain("BOARD · no locked frame");
    expect(digest).toContain("SECTIONS\n  (none)");
    expect(digest).toContain("EDGES");
    expect(digest).toContain("STICKIES / ANNOTATIONS\n  (none)");
  });

  test("marks a root section without subsections", () => {
    const digest = formatBoardDigest(buildBoardModel(makeDocument([
      { ...box("solo", 0, 0, 480, 320, "section"), text: "Solo" },
    ])));
    expect(digest).toContain("└─ (no subsections)");
  });

  test("clips long text to one bounded line", () => {
    const digest = formatBoardDigest(buildBoardModel(makeDocument([
      { ...box("wordy", 0, 0), text: `multi\nline ${"x".repeat(200)}` },
    ])));
    expect(digest).toContain("multi line");
    expect(digest).toContain("…");
    expect(digest).not.toContain("x".repeat(100));
  });
});

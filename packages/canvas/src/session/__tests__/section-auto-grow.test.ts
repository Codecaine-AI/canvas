/**
 * Section auto-grow: after any edit, a section a child overflows grows
 * outward to hold it plus the fit_section air, through its ancestors, with no
 * fit_section call. It never shrinks, never changes membership, and never
 * touches a locked section.
 */
import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";
import { rule as containment } from "../../board/lints/rules/containment";

import { growSectionsToChildren } from "../apply-ops";
import { makeTestSession, runOp } from "./helpers";
import { box, makeDocument } from "./synthetic";

function section(id: string, x: number, y: number, width: number, height: number, parentId: string | null = null) {
  return { ...box(id, x, y, width, height, "section"), parentId } as InteractiveCanvasObject;
}

function child(id: string, x: number, y: number, parentId: string, width = 160, height = 100) {
  return { ...box(id, x, y, width, height), parentId };
}

function geometryOf(document: InteractiveCanvasDocument, id: string) {
  return document.objects.find((object) => object.id === id)!.geometry;
}

describe("section auto-grow", () => {
  test("a child moved across its section's edge grows only that side, with no fit_section", () => {
    const baseline = makeDocument([
      section("page", 0, 0, 1200, 900),
      section("outer", 40, 40, 800, 600, "page"),
      child("kid", 100, 120, "outer"),
    ]);
    const session = makeTestSession(baseline, ["outer"]);

    // kid lands at 700..860: 20px past outer's right edge, still its child.
    const result = runOp(session, "move_by", { id: "kid", dx: 600, dy: 0 });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("grew outer to hold its children");
    // Right edge = child right + 40 of fit air; left, top and bottom stay put.
    expect(geometryOf(session.draft, "outer")).toEqual({ x: 40, y: 40, width: 860, height: 600 });
    expect(geometryOf(session.draft, "page")).toEqual(baseline.objects[0]!.geometry);
    expect(containment.check(session.draft)).toHaveLength(0);
  });

  test("a nested section's growth carries out through its parent in the same edit", () => {
    const baseline = makeDocument([
      section("page", 0, 0, 1400, 1000),
      section("outer", 40, 40, 900, 700, "page"),
      section("inner", 80, 80, 800, 400, "outer"),
      child("kid", 120, 160, "inner"),
    ]);
    const session = makeTestSession(baseline, ["outer"]);

    // kid lands at 760..920, past inner (880); inner then crosses outer (940).
    runOp(session, "move_by", { id: "kid", dx: 640, dy: 0 });

    expect(geometryOf(session.draft, "inner")).toEqual({ x: 80, y: 80, width: 880, height: 400 });
    expect(geometryOf(session.draft, "outer")).toEqual({ x: 40, y: 40, width: 960, height: 700 });
    expect(session.draft.objects.find((object) => object.id === "kid")!.parentId).toBe("inner");
    expect(session.draft.objects.find((object) => object.id === "inner")!.parentId).toBe("outer");
    expect(containment.check(session.draft)).toHaveLength(0);
  });

  test("the page frame grows like any section, so no containment finding names it", () => {
    const baseline = makeDocument([
      section("page-frame", 0, 0, 1000, 700),
      section("lane", 40, 80, 600, 400, "page-frame"),
      child("kid", 80, 160, "lane"),
    ]);
    const session = makeTestSession(baseline, ["lane"]);

    // lane lands at 440..1040, 40px past the frame's right edge.
    runOp(session, "move_by", { id: "lane", dx: 400, dy: 0 });

    expect(geometryOf(session.draft, "page-frame")).toEqual({ x: 0, y: 0, width: 1080, height: 700 });
    expect(containment.check(session.draft).filter((finding) => finding.at.includes("page-frame")))
      .toHaveLength(0);
  });

  test("a section never shrinks on its own", () => {
    const baseline = makeDocument([
      section("page", 0, 0, 1200, 900),
      section("roomy", 40, 40, 1000, 800, "page"),
      child("kid", 100, 120, "roomy"),
    ]);
    const session = makeTestSession(baseline, ["roomy"]);

    runOp(session, "resize", { id: "kid", width: 120, height: 60 });

    expect(geometryOf(session.draft, "roomy")).toEqual({ x: 40, y: 40, width: 1000, height: 800 });
  });

  test("a locked section keeps its geometry", () => {
    const document = makeDocument([
      { ...section("held", 0, 0, 400, 300), locked: "background" },
      child("kid", 300, 100, "held"),
    ]);

    const { document: grown, grown: ids } = growSectionsToChildren(document);

    expect(ids).toEqual([]);
    expect(geometryOf(grown, "held")).toEqual({ x: 0, y: 0, width: 400, height: 300 });
  });

  test("a grow that would capture a neighbor is skipped, so membership never changes", () => {
    const document = makeDocument([
      section("a", 0, 0, 400, 300),
      child("kid", 300, 100, "a"),
      // Growing a to the right (to 500) would swallow 90% of this box.
      box("neighbor", 410, 100, 100, 100),
    ]);

    const { document: grown, grown: ids } = growSectionsToChildren(document);

    expect(ids).toEqual([]);
    expect(grown).toBe(document);
  });
});

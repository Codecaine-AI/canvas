/**
 * A nested section never shares its parent section's color, so the hierarchy
 * reads (board/section-colors.ts). The tools prevent the break — place_section
 * picks a hue its parent does not paint, and every edit that would nest a
 * section in its own color is refused — and the integrity lint reports one a
 * Studio edit or an older file left behind. The page (the page frame, or a
 * board's one root section) is exempt.
 */
import { describe, expect, test } from "bun:test";

import { FINISHING_RULES } from "../../board/lints";
import { runDiagnostics } from "../../board/lints/run";
import { sectionHue } from "../../board/section-colors";
import { PAGE_FRAME_ID } from "../../board/page-frame";
import type { CanvasColor } from "../../state/schema/colors";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";
import { canvasThemePreset } from "../../theme/canvas-style";
import { makeTestSession, runOp } from "./helpers";
import { box, makeDocument } from "./synthetic";

function section(
  id: string,
  geometry: [number, number, number, number],
  color: CanvasColor,
  parentId: string | null,
): InteractiveCanvasObject {
  const [x, y, width, height] = geometry;
  return { ...box(id, x, y, width, height, "section"), color, parentId };
}

/** A white page holding a gray pack, which holds a blue rounds frame. */
function board(): InteractiveCanvasDocument {
  return makeDocument([
    section("page", [0, 0, 2400, 1600], "white", null),
    section("pack", [40, 40, 1500, 1400], "gray", "page"),
    section("rounds", [80, 120, 1000, 700], "blue", "pack"),
    section("outside", [1600, 40, 600, 400], "gray", "page"),
  ]);
}

function colorOf(session: ReturnType<typeof makeTestSession>, id: string): CanvasColor | undefined {
  return session.draft.objects.find((object) => object.id === id)?.color;
}

function integrity(document: InteractiveCanvasDocument, style = canvasThemePreset("schematic-light")) {
  return runDiagnostics(document, FINISHING_RULES, { canvasStyle: style })
    .filter((finding) => finding.rule === "integrity");
}

describe("place_section picks a color when the call names none", () => {
  test("a section placed in a gray parent never takes gray", () => {
    const session = makeTestSession(board(), ["page"]);
    const result = runOp(session, "place_section", { id: "lenses", text: "Lenses", at: [100, 880], size: { width: 400, height: 120 } });
    expect(result.isError).toBeUndefined();
    expect(session.draft.objects.find((object) => object.id === "lenses")?.parentId).toBe("pack");
    expect(colorOf(session, "lenses")).not.toBe("gray");
    expect(result.text).toContain(`place_section lenses 100,880 400×120 ${colorOf(session, "lenses")}`);
  });

  test("a section placed in a blue parent may be gray again", () => {
    const session = makeTestSession(board(), ["page"]);
    runOp(session, "place_section", { id: "reviewers", text: "Reviewers", at: [120, 200], size: { width: 400, height: 200 } });
    expect(session.draft.objects.find((object) => object.id === "reviewers")?.parentId).toBe("rounds");
    expect(colorOf(session, "reviewers")).toBe("gray");
  });

  test("a top-level section takes a hue its sibling sections do not use", () => {
    const session = makeTestSession(board(), ["page"]);
    runOp(session, "place_section", { id: "first", text: "First", at: [1600, 600], size: { width: 300, height: 200 } });
    runOp(session, "place_section", { id: "second", text: "Second", at: [1600, 1000], size: { width: 300, height: 200 } });
    // Siblings on the page: pack and outside are gray.
    expect(colorOf(session, "first")).toBe("blue");
    expect(colorOf(session, "second")).toBe("teal");
  });

  test("a frame drawn around a section never takes that section's color", () => {
    const session = makeTestSession(board(), ["page"]);
    runOp(session, "place_section", { id: "wrap", text: "Wrap", at: [1580, 20], size: { width: 640, height: 460 } });
    expect(session.draft.objects.find((object) => object.id === "outside")?.parentId).toBe("wrap");
    // Not gray (outside, inside it), and not blue (its parent page is white, so blue is just the next free hue).
    expect(colorOf(session, "wrap")).not.toBe("gray");
  });
});

describe("an edit that nests a section in its own color is refused", () => {
  test("a recolor into the parent's color names that color, and nothing changes", () => {
    const session = makeTestSession(board(), ["page"]);
    const before = session.draft;
    const result = runOp(session, "change_color", { id: "rounds", color: "gray" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("rounds would share gray with its parent section pack");
    expect(session.draft).toBe(before);
  });

  test("recoloring the parent into its child's color is refused too", () => {
    const session = makeTestSession(board(), ["page"]);
    const result = runOp(session, "change_color", { id: "pack", color: "blue" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("rounds would share blue with its parent section pack");
  });

  test("a move that reparents a section into a parent of its color is refused", () => {
    const session = makeTestSession(board(), ["page"]);
    const before = session.draft;
    // outside (gray, 600×400) dropped inside pack (gray) clear of rounds.
    const result = runOp(session, "move_to", { id: "outside", x: 120, y: 900 });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("outside would share gray with its parent section pack");
    expect(session.draft).toBe(before);
  });

  test("a section placed in its parent's color by name is refused", () => {
    const session = makeTestSession(board(), ["page"]);
    const result = runOp(session, "place_section", { id: "x", text: "X", at: [120, 200], size: { width: 300, height: 200 }, color: "blue" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("x would share blue with its parent section rounds");
  });

  test("the page frame is exempt as a parent", () => {
    const doc = makeDocument([
      section(PAGE_FRAME_ID, [0, 0, 2000, 1200], "white", null),
      section("a", [40, 40, 400, 300], "gray", PAGE_FRAME_ID),
    ]);
    const session = makeTestSession(doc, [PAGE_FRAME_ID]);
    const result = runOp(session, "change_color", { id: "a", color: "white" });
    expect(result.isError).toBeUndefined();
    expect(colorOf(session, "a")).toBe("white");
  });

  test("a nest the board already had does not block an unrelated edit", () => {
    const doc = board();
    doc.objects[2] = { ...doc.objects[2]!, color: "gray" };
    const session = makeTestSession(doc, ["page"]);
    const result = runOp(session, "update_text", { id: "outside", text: "Outside reviewers" });
    expect(result.isError).toBeUndefined();
  });
});

describe("integrity reports a stored same-color nest", () => {
  test("one error per section painted in its parent section's color", () => {
    expect(integrity(board())).toEqual([]);
    const stored = board();
    stored.objects[2] = { ...stored.objects[2]!, color: "gray" };
    const findings = integrity(stored);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "error", at: ["rounds", "pack"] });
    expect(findings[0]!.message).toBe("rounds shares gray with its parent section pack: nested levels must differ in color");
    expect(findings[0]!.suggestion).toBe("change_color rounds to another color, such as blue");
  });

  test("a section with no stored color is gray, the default it paints", () => {
    const stored = board();
    stored.objects[2] = { ...stored.objects[2]!, color: undefined };
    expect(integrity(stored).map((finding) => finding.at)).toEqual([["rounds", "pack"]]);
  });

  test("the page is exempt as a parent: the page frame, or a board's one root section", () => {
    const doc = makeDocument([
      section(PAGE_FRAME_ID, [0, 0, 2000, 1200], "white", null),
      section("a", [40, 40, 400, 300], "white", PAGE_FRAME_ID),
    ]);
    expect(integrity(doc)).toEqual([]);
    const stored = board();
    stored.objects[0] = { ...stored.objects[0]!, color: "gray" };
    expect(integrity(stored)).toEqual([]);
    // Two roots: neither is the page, so a nest under either counts.
    stored.objects.push(section("other", [3000, 0, 400, 400], "gray", null));
    expect(integrity(stored).map((finding) => finding.at)).toEqual([["pack", "page"], ["outside", "page"]]);
  });

  test("on a dark layer-cake board white paints as gray, so white in gray is a nest, while the page stays exempt", () => {
    const dark = canvasThemePreset("schematic-dark");
    expect(sectionHue({ color: "white" }, dark)).toBe("gray");
    expect(sectionHue({ color: "white" }, canvasThemePreset("schematic-light"))).toBe("white");
    const doc = board();
    doc.objects[2] = { ...doc.objects[2]!, color: "white" };
    expect(integrity(doc, canvasThemePreset("schematic-light"))).toEqual([]);
    expect(integrity(doc, dark).map((finding) => finding.at)).toEqual([["rounds", "pack"]]);
  });
});

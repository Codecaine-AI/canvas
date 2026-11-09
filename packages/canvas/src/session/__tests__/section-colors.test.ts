/**
 * A section never shares its parent section's color, nor a sibling's, so the
 * hierarchy and the group edges read (board/section-colors.ts). The tools prevent the break — place_section
 * picks a hue its parent does not paint, and every edit that would nest a
 * section in its own color is refused — and the integrity lint reports one a
 * Studio edit or an older file left behind. Two sections look alike when
 * they paint the same ink or the same fill. The page (the page frame, or a
 * parentless section stored white) is exempt, and nothing else is.
 */
import { describe, expect, test } from "bun:test";

import { FINISHING_RULES } from "../../board/lints";
import { runDiagnostics } from "../../board/lints/run";
import { pickSectionColor, sameHueNests, sectionHue, siblingClashes, withPlacedSectionColor } from "../../board/section-colors";
import { PAGE_FRAME_ID } from "../../board/page-frame";
import type { CanvasColor } from "../../state/schema/colors";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";
import { canvasThemePreset } from "../../theme/canvas-style";
import { resolveSectionPaint } from "../../theme/palette";
import { createOpContext } from "../tools/operations/op-context";
import { findOperationTool } from "../tools/operations";
import { emitSessionEvent } from "..";
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

/** A white page holding a gray pack (which holds a blue rounds frame) and a teal outside frame. */
function board(): InteractiveCanvasDocument {
  return makeDocument([
    section("page", [0, 0, 2400, 1600], "white", null),
    section("pack", [40, 40, 1500, 1400], "gray", "page"),
    section("rounds", [80, 120, 1000, 700], "blue", "pack"),
    section("outside", [1600, 40, 600, 400], "teal", "page"),
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
    // Siblings on the page: pack is gray and outside teal.
    expect(colorOf(session, "first")).toBe("blue");
    expect(colorOf(session, "second")).toBe("violet");
  });

  test("a frame drawn around a section never takes that section's color", () => {
    const session = makeTestSession(board(), ["page"]);
    runOp(session, "place_section", { id: "wrap", text: "Wrap", at: [1580, 20], size: { width: 640, height: 460 } });
    expect(session.draft.objects.find((object) => object.id === "outside")?.parentId).toBe("wrap");
    // Not teal (outside, inside it), and not gray (pack, its sibling on the page).
    expect(colorOf(session, "wrap")).toBe("blue");
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
    const doc = board();
    doc.objects[3] = { ...doc.objects[3]!, color: "gray" };
    const session = makeTestSession(doc, ["page"]);
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

  test("the page is exempt as a parent: the page frame, or a parentless white section", () => {
    const doc = makeDocument([
      section(PAGE_FRAME_ID, [0, 0, 2000, 1200], "white", null),
      section("a", [40, 40, 400, 300], "white", PAGE_FRAME_ID),
    ]);
    expect(integrity(doc)).toEqual([]);
    // board()'s page is a parentless white section: its gray children are groups on a page.
    expect(integrity(board())).toEqual([]);
  });

  test("an ordinary gray root is not the page, even as the board's only root", () => {
    const doc = makeDocument([
      section("ordinary", [0, 0, 1000, 800], "gray", null),
      section("child", [80, 160, 400, 300], "gray", "ordinary"),
    ]);
    expect(integrity(doc).map((finding) => finding.at)).toEqual([["child", "ordinary"]]);
  });

  test("a second root never changes which nests count", () => {
    const stored = board();
    stored.objects[0] = { ...stored.objects[0]!, color: "gray" };
    stored.objects[3] = { ...stored.objects[3]!, color: "gray" };
    // pack and outside also share gray as siblings: one sibling finding beside the two nests.
    const nests = [["pack", "page"], ["outside", "page"], ["outside", "pack"]];
    expect(integrity(stored).map((finding) => finding.at)).toEqual(nests);
    stored.objects.push(section("other", [3000, 0, 400, 400], "white", null));
    expect(integrity(stored).map((finding) => finding.at)).toEqual(nests);
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

describe("the page identity is stable", () => {
  test("a recolor that nests gray in an ordinary gray root is refused, even when it is the only root", () => {
    const doc = makeDocument([
      section("ordinary", [0, 0, 1000, 800], "gray", null),
      section("child", [80, 160, 400, 300], "blue", "ordinary"),
    ]);
    const session = makeTestSession(doc, ["ordinary"]);
    const result = runOp(session, "change_color", { id: "child", color: "gray" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("child would share gray with its parent section ordinary");
  });

  test("placing a second root does not turn an untouched nest into a refusal", () => {
    const doc = makeDocument([
      section("ordinary", [0, 0, 1000, 800], "gray", null),
      section("child", [80, 160, 400, 300], "gray", "ordinary"),
    ]);
    const session = makeTestSession(doc, ["ordinary"]);
    const result = runOp(session, "place_section", { id: "elsewhere", text: "Elsewhere", at: [1400, 0], size: { width: 400, height: 300 }, color: "green" });
    expect(result.isError).toBeUndefined();
  });
});

describe("sections that paint one fill look alike, whatever their names", () => {
  /** schematic-light with no tint: every hue paints the same near-white fill. */
  const flatTint = { ...canvasThemePreset("schematic-light"), sectionTintMax: 0 };

  test("blue in gray is a nest when both paint one fill, and the report names the fill", () => {
    expect(integrity(board())).toEqual([]);
    const findings = integrity(board(), flatTint);
    // pack (gray) and outside (teal) paint one fill too, and they face each other across the page.
    expect(findings.map((finding) => finding.at)).toEqual([["rounds", "pack"], ["outside", "pack"]]);
    expect(findings[0]!.message).toBe("rounds shares one fill (blue in gray) with its parent section pack: nested levels must differ in color");
    // The suggestion paints apart: white is the one fill left at zero tint.
    expect(findings[0]!.suggestion).toBe("change_color rounds to another color, such as white");
  });

  test("place_section with no color picks one whose fill differs from its parent's", () => {
    const doc = board();
    doc.objects[2] = { ...doc.objects[2]!, color: "white" };
    const session = makeTestSession(doc, ["page"]);
    const result = findOperationTool("place_section")!.execute(
      // Clear of rounds' row and column: white repeats rounds' fill, the one left, so it must not face it.
      { id: "lenses", text: "Lenses", at: [1120, 880], size: { width: 360, height: 120 } },
      { currentSession: () => session, context: (draft) => createOpContext(draft, flatTint), emit: emitSessionEvent },
    );
    expect(result.isError).toBeUndefined();
    expect(session.draft.objects.find((object) => object.id === "lenses")?.parentId).toBe("pack");
    // Every hue paints the parent's fill at zero tint; only white paints apart.
    expect(colorOf(session, "lenses")).toBe("white");
    expect(resolveSectionPaint("white", 3, flatTint).fill).not.toBe(resolveSectionPaint("gray", 2, flatTint).fill);
    expect(sameHueNests(session.draft, flatTint)).toEqual([]);
  });

  test("on the default theme a gray child of a gray parent is still a nest, though one tint step deeper", () => {
    const stored = board();
    stored.objects[2] = { ...stored.objects[2]!, color: "gray" };
    expect(integrity(stored, canvasThemePreset("schematic-light")).map((finding) => finding.at)).toEqual([["rounds", "pack"]]);
  });
});

describe("sibling sections never share a look", () => {
  test("a nested section placed with no color avoids its parent's and its siblings' colors", () => {
    const session = makeTestSession(board(), ["page"]);
    runOp(session, "place_section", { id: "lenses", text: "Lenses", at: [100, 880], size: { width: 400, height: 120 } });
    expect(session.draft.objects.find((object) => object.id === "lenses")?.parentId).toBe("pack");
    // Not gray (pack, its parent) and not blue (rounds, its sibling).
    expect(colorOf(session, "lenses")).toBe("teal");
  });

  test("a recolor into a sibling's color is refused, naming the sibling", () => {
    const session = makeTestSession(board(), ["page"]);
    const before = session.draft;
    const result = runOp(session, "change_color", { id: "outside", color: "gray" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("refused: sibling sections never share a color");
    expect(result.text).toContain("outside would share gray with its sibling section pack — give outside another color, such as blue");
    expect(session.draft).toBe(before);
  });

  test("integrity reports a stored sibling clash on the later section, with a color that reads apart", () => {
    const stored = board();
    stored.objects[3] = { ...stored.objects[3]!, color: "gray" };
    const findings = integrity(stored);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "error", at: ["outside", "pack"] });
    expect(findings[0]!.message).toBe("outside shares gray with its sibling section pack: adjacent sibling sections must differ in color");
    expect(findings[0]!.suggestion).toBe("change_color outside to another color, such as blue");
  });

  test("top-level sections are siblings under the page frame and under a parentless white page alike", () => {
    const framed = makeDocument([
      section(PAGE_FRAME_ID, [0, 0, 2000, 1200], "white", null),
      section("a", [40, 40, 400, 300], "violet", PAGE_FRAME_ID),
      section("b", [1200, 800, 400, 300], "violet", PAGE_FRAME_ID),
    ]);
    // Far apart and diagonal, but a free color exists, so the repeat is a clash.
    expect(integrity(framed).map((finding) => finding.at)).toEqual([["b", "a"]]);
  });

  test("a section copy beside its source takes another color and says so", () => {
    const session = makeTestSession(board(), ["page"]);
    const result = runOp(session, "clone", { sourceId: "outside", id: "outside-2", at: [1600, 600] });
    expect(result.isError).toBeUndefined();
    // Siblings on the page: pack gray, outside teal.
    expect(colorOf(session, "outside-2")).toBe("blue");
    expect(result.text).toContain("the copy takes blue: teal would match its parent or a sibling section");
  });

  test("Studio's last-picked color loses to a sibling that paints it", () => {
    const style = canvasThemePreset("schematic-light");
    const action = { type: "canvas.addObject", objectType: "section", geometry: { x: 1600, y: 600, width: 400, height: 300 } } as const;
    const placed = withPlacedSectionColor(board(), action as never, style, "teal");
    expect((placed as { color?: CanvasColor }).color).toBe("blue");
  });
});

describe("when the palette runs out, a sibling repeat never faces its twin", () => {
  /** Nine top-level sections in a row, one per hue the chooser picks from. */
  const HUES: CanvasColor[] = ["gray", "blue", "teal", "violet", "green", "orange", "yellow", "pink", "red"];
  function fullRow(): InteractiveCanvasDocument {
    return makeDocument([
      section("page", [0, 0, 3200, 2600], "white", null),
      ...HUES.map((hue, index) => section(`s${index}`, [40 + index * 340, 40, 280, 200], hue, "page")),
    ]);
  }

  test("place_section repeats the color of the farthest sibling, one it does not face", () => {
    const session = makeTestSession(fullRow(), ["page"]);
    // Directly under s0 (gray): gray would face its twin; red (s8) sits farthest.
    const result = runOp(session, "place_section", { id: "extra", text: "Extra", at: [40, 2000], size: { width: 280, height: 200 } });
    expect(result.isError).toBeUndefined();
    expect(colorOf(session, "extra")).toBe("red");
    expect(siblingClashes(session.draft, canvasThemePreset("schematic-light"))).toEqual([]);
  });

  test("a repeat that faces its twin across a column is reported and refused", () => {
    const doc = fullRow();
    doc.objects.push(section("extra", [40, 2000, 280, 200], "gray", "page"));
    const findings = integrity(doc);
    expect(findings.map((finding) => finding.at)).toEqual([["extra", "s0"]]);
    expect(findings[0]!.message).toContain("adjacent sibling sections must differ in color");
    expect(findings[0]!.suggestion).toBe("change_color extra to another color, such as red");
    // A sibling between them breaks the adjacency: the repeat is allowed.
    doc.objects.push(section("between", [40, 1000, 280, 200], "blue", "page"));
    expect(pickSectionColor(doc, "extra", canvasThemePreset("schematic-light"))).not.toBe("gray");
  });

  test("recoloring a far repeat into a facing one is refused", () => {
    const doc = fullRow();
    doc.objects.push(section("extra", [40, 2000, 280, 200], "red", "page"));
    expect(integrity(doc)).toEqual([]);
    const session = makeTestSession(doc, ["page"]);
    const result = runOp(session, "change_color", { id: "extra", color: "gray" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("extra would share gray with its sibling section s0");
  });
});

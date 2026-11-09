/**
 * A section never shares its parent section's color, nor a touching
 * sibling's, nor, holding nodes of several hues, one of theirs (a category
 * section, whose colored nodes share one hue, may take it), so the
 * hierarchy, the group edges and the nodes read (board/section-colors.ts). The tools prevent the
 * break — place_section picks a color that keeps the rules, and every edit
 * that would make a new break is refused — and the integrity lint reports one
 * a Studio edit or an older file left behind. Two sections look alike when
 * they paint the same ink or the same fill. The page (the page frame, or a
 * parentless section stored white) is exempt, and nothing else is. The
 * chooser keeps the board's meaning: node and wire hues and warm hues stay
 * off its list, and a board carries at most three chromatic section hues.
 */
import { describe, expect, test } from "bun:test";

import { FINISHING_RULES } from "../../board/lints";
import { runDiagnostics } from "../../board/lints/run";
import {
  pickSectionColor,
  sameHueNests,
  sectionHue,
  siblingClashes,
  withCopiedSectionColors,
  withPlacedSectionColor,
} from "../../board/section-colors";
import { buildPastePayload, copySelection } from "../../interaction/clipboard";
import { createInteractiveCanvasState, reduceInteractiveCanvasState } from "../../state/actions";
import type { CanvasAction } from "../../state/actions/types";
import { PAGE_FRAME_ID } from "../../board/page-frame";
import type { CanvasColor } from "../../state/schema/colors";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";
import { canvasThemePreset } from "../../theme/canvas-style";
import { resolveSectionPaint } from "../../theme/palette";
import { createOpContext } from "../tools/operations/op-context";
import { findOperationTool } from "../tools/operations";
import { emitSessionEvent } from "..";
import { makeTestSession, runOp } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

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

  test("a top-level section with whitespace around it stays gray, like its siblings", () => {
    const session = makeTestSession(board(), ["page"]);
    // 60px from pack and 160px under outside: the gap separates them.
    runOp(session, "place_section", { id: "first", text: "First", at: [1600, 600], size: { width: 300, height: 200 } });
    expect(colorOf(session, "first")).toBe("gray");
  });

  test("a top-level section that touches a gray sibling takes the first free cool hue", () => {
    const session = makeTestSession(board(), ["page"]);
    // 40px right of pack (gray): closer than one gutter, so they touch.
    runOp(session, "place_section", { id: "first", text: "First", at: [1580, 600], size: { width: 300, height: 200 } });
    expect(colorOf(session, "first")).toBe("blue");
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
    // pack and outside also share gray as siblings, but 60px of page separates them.
    const nests = [["pack", "page"], ["outside", "page"]];
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
    // pack (gray) and outside (teal) paint one fill too, but 60px of page separates them.
    expect(findings.map((finding) => finding.at)).toEqual([["rounds", "pack"]]);
    expect(findings[0]!.message).toBe("rounds shares one fill (blue in gray) with its parent section pack: nested levels must differ in color");
    // The suggestion paints apart: white is the one fill left at zero tint.
    expect(findings[0]!.suggestion).toBe("change_color rounds to another color, such as white");
  });

  test("place_section with no color picks one whose fill differs from its parent's", () => {
    const doc = board();
    doc.objects[2] = { ...doc.objects[2]!, color: "white" };
    const session = makeTestSession(doc, ["page"]);
    const result = findOperationTool("place_section")!.execute(
      // Clear of rounds: white repeats rounds' fill, the one left, so it must not touch it.
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

/** board() with outside moved 30px right of pack, so the two touch. */
function touchingBoard(outsideColor: CanvasColor = "teal"): InteractiveCanvasDocument {
  const doc = board();
  doc.objects[3] = { ...doc.objects[3]!, color: outsideColor, geometry: { ...doc.objects[3]!.geometry, x: 1570 } };
  return doc;
}

function node(id: string, geometry: [number, number, number, number], color: CanvasColor, parentId: string): InteractiveCanvasObject {
  const [x, y, width, height] = geometry;
  return { ...box(id, x, y, width, height), color, parentId };
}

describe("touching sibling sections never share a look", () => {
  test("a nested section placed with no color avoids its parent's and a touching sibling's colors", () => {
    const session = makeTestSession(board(), ["page"]);
    // 30px under rounds (blue): they touch.
    runOp(session, "place_section", { id: "lenses", text: "Lenses", at: [100, 850], size: { width: 400, height: 120 } });
    expect(session.draft.objects.find((object) => object.id === "lenses")?.parentId).toBe("pack");
    // Not gray (pack, its parent), not blue (rounds, touching).
    expect(colorOf(session, "lenses")).toBe("violet");
  });

  test("a nested section with whitespace around its sibling may take the sibling's hue", () => {
    const session = makeTestSession(board(), ["page"]);
    // 60px under rounds (blue): the gap separates them.
    runOp(session, "place_section", { id: "lenses", text: "Lenses", at: [100, 880], size: { width: 400, height: 120 } });
    expect(colorOf(session, "lenses")).toBe("blue");
  });

  test("a recolor into a touching sibling's color is refused, naming the sibling", () => {
    const session = makeTestSession(touchingBoard(), ["page"]);
    const before = session.draft;
    const result = runOp(session, "change_color", { id: "outside", color: "gray" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("refused: touching sibling sections never share a color");
    expect(result.text).toContain("outside would share gray with its touching sibling section pack — give outside another color, such as blue");
    expect(session.draft).toBe(before);
  });

  test("a recolor into a separated sibling's color applies: the whitespace is the separator", () => {
    const session = makeTestSession(board(), ["page"]);
    const result = runOp(session, "change_color", { id: "outside", color: "gray" });
    expect(result.isError).toBeUndefined();
    expect(integrity(session.draft)).toEqual([]);
  });

  test("integrity reports a touching sibling clash on the later section, with a color that reads apart", () => {
    const findings = integrity(touchingBoard("gray"));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "error", at: ["outside", "pack"] });
    expect(findings[0]!.message).toBe("outside shares gray with its sibling section pack: touching sibling sections must differ in color");
    expect(findings[0]!.suggestion).toBe("change_color outside to another color, such as blue");
  });

  test("top-level sections are siblings under the page frame and under a parentless white page alike", () => {
    const framed = makeDocument([
      section(PAGE_FRAME_ID, [0, 0, 2000, 1200], "white", null),
      section("a", [40, 40, 400, 300], "violet", PAGE_FRAME_ID),
      section("b", [1200, 800, 400, 300], "violet", PAGE_FRAME_ID),
    ]);
    // Far apart: same-role sections keep one color.
    expect(integrity(framed)).toEqual([]);
    framed.objects[2] = { ...framed.objects[2]!, geometry: { x: 470, y: 40, width: 400, height: 300 } };
    expect(integrity(framed).map((finding) => finding.at)).toEqual([["b", "a"]]);
  });

  test("a near corner touches; a corner one gutter away does not", () => {
    const doc = (gap: number) => makeDocument([
      section("page", [0, 0, 2000, 1200], "white", null),
      section("a", [40, 40, 400, 300], "gray", "page"),
      section("b", [440 + gap, 340 + gap, 400, 300], "gray", "page"),
    ]);
    expect(integrity(doc(30)).map((finding) => finding.at)).toEqual([["b", "a"]]);
    expect(integrity(doc(40))).toEqual([]);
  });

  test("a sibling that blocks part of the gap leaves the rest facing", () => {
    const doc = makeDocument([
      section("page", [0, 0, 2000, 1200], "white", null),
      section("a", [40, 40, 400, 400], "gray", "page"),
      section("b", [480, 40, 400, 400], "gray", "page"),
    ]);
    expect(integrity(doc).map((finding) => finding.at)).toEqual([["b", "a"]]);
    // A 20px sliver in the 40px gap covers 96px of the 400px shared span.
    doc.objects.push(section("sliver", [450, 40, 20, 96], "blue", "page"));
    expect(integrity(doc).map((finding) => finding.at)).toEqual([["b", "a"]]);
    // A blocker as tall as the span hides the two from each other.
    doc.objects[3] = { ...doc.objects[3]!, geometry: { x: 450, y: 40, width: 20, height: 400 } };
    expect(integrity(doc)).toEqual([]);
  });

  test("a section copy that touches its source takes another color and says so", () => {
    const session = makeTestSession(board(), ["page"]);
    // 30px under outside (teal): they touch.
    const result = runOp(session, "clone", { sourceId: "outside", id: "outside-2", at: [1600, 470] });
    expect(result.isError).toBeUndefined();
    expect(colorOf(session, "outside-2")).toBe("gray");
    expect(result.text).toContain("the copy takes gray: teal would match its parent, a touching sibling or a node it holds");
  });

  test("a section copy set apart from its source keeps the source's color", () => {
    const session = makeTestSession(board(), ["page"]);
    runOp(session, "clone", { sourceId: "outside", id: "outside-2", at: [1600, 600] });
    expect(colorOf(session, "outside-2")).toBe("teal");
  });

  test("Studio's last-picked color loses to a touching sibling that paints it", () => {
    const style = canvasThemePreset("schematic-light");
    const action = { type: "canvas.addObject", objectType: "section", geometry: { x: 1600, y: 470, width: 400, height: 300 } } as const;
    expect((withPlacedSectionColor(board(), action as never, style, "teal") as { color?: CanvasColor }).color).toBe("gray");
    const apart = { ...action, geometry: { ...action.geometry, y: 600 } };
    expect((withPlacedSectionColor(board(), apart as never, style, "teal") as { color?: CanvasColor }).color).toBe("teal");
  });
});

describe("a repair is judged on every conflicting pair, before and after", () => {
  /** Three gray siblings that all touch: a and b side by side, c under both. */
  function triple(): InteractiveCanvasDocument {
    return makeDocument([
      section("page", [0, 0, 2000, 1400], "white", null),
      section("a", [40, 40, 400, 300], "gray", "page"),
      section("b", [480, 40, 400, 300], "gray", "page"),
      section("c", [40, 380, 840, 300], "gray", "page"),
    ]);
  }

  test("recoloring one of three touching gray siblings applies, though b and c still clash", () => {
    const session = makeTestSession(triple(), ["page"]);
    const result = runOp(session, "change_color", { id: "a", color: "blue" });
    expect(result.isError).toBeUndefined();
    expect(integrity(session.draft).map((finding) => finding.at)).toEqual([["c", "b"]]);
  });

  test("deleting one of three touching gray siblings applies", () => {
    const session = makeTestSession(triple(), ["page"]);
    expect(runOp(session, "delete", { id: "a" }).isError).toBeUndefined();
  });
});

describe("the chooser keeps the board's meaning", () => {
  const style = canvasThemePreset("schematic-light");

  test("a hue the board's nodes or wires use is its key, so the chooser skips it", () => {
    const doc = board();
    doc.objects.push(node("store", [120, 200, 200, 100], "blue", "rounds"));
    doc.objects.push(section("first", [1580, 600, 300, 200], "gray", "page"));
    // Touches pack (gray); blue is the store's hue: violet is next.
    expect(pickSectionColor(doc, "first", style)).toBe("violet");
    // A violet wire takes violet off the list too.
    doc.connections.push({ ...connect("w", "store", "outside"), color: "violet" });
    expect(pickSectionColor(doc, "first", style)).toBe("green");
  });

  test("a section holding nodes of several hues never takes one of them, and integrity reports one that does", () => {
    const doc = touchingBoard();
    doc.objects.push(node("agent", [1620, 100, 200, 100], "teal", "outside"));
    doc.objects.push(node("store", [1620, 250, 200, 100], "violet", "outside"));
    const findings = integrity(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ at: ["outside", "agent"] });
    expect(findings[0]!.message).toBe(
      "outside paints teal, the color of agent it holds among nodes of other colors"
        + ": a section must differ from its nodes unless they all share one color",
    );
    // Not gray (touches pack), not teal or violet (its nodes): blue.
    expect(findings[0]!.suggestion).toBe("change_color outside to another color, such as blue");
  });

  test("a recolor into one hue of a section's mixed nodes is refused; into a category's one hue it applies", () => {
    const category = board();
    category.objects.push(node("agent", [120, 200, 200, 100], "violet", "rounds"));
    const allowed = makeTestSession(category, ["page"]);
    expect(runOp(allowed, "change_color", { id: "rounds", color: "violet" }).isError).toBeUndefined();

    const mixed = board();
    mixed.objects.push(node("agent", [120, 200, 200, 100], "violet", "rounds"));
    mixed.objects.push(node("store", [400, 200, 200, 100], "green", "rounds"));
    const session = makeTestSession(mixed, ["page"]);
    const result = runOp(session, "change_color", { id: "rounds", color: "violet" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("rounds would paint violet, the color of agent it holds among nodes of other colors");
  });

  test("a node edit is never refused for a section's color: it applies, and integrity names the section with a color", () => {
    /** A blue category section holding blue nodes. */
    const category = () => makeDocument([
      section("page", [0, 0, 4000, 3200], "white", null),
      section("cat", [40, 40, 1200, 800], "blue", "page"),
      node("blue-node", [100, 150, 120, 80], "blue", "cat"),
      node("second-blue", [700, 150, 120, 80], "blue", "cat"),
    ]);
    const edits: [string, Record<string, unknown>][] = [
      ["place_shape", { id: "green-node", type: "process", text: "Green role", color: "green", at: [400, 300] }],
      ["change_color", { id: "blue-node", color: "green" }],
    ];
    for (const [name, params] of edits) {
      const session = makeTestSession(category(), ["page"]);
      expect(runOp(session, name, params).isError).toBeUndefined();
      // The section keeps its color; the lint reports the clash and a color to use.
      expect(colorOf(session, "cat")).toBe("blue");
      const findings = integrity(session.draft);
      expect(findings.map((finding) => finding.at?.[0])).toEqual(["cat"]);
      expect(findings[0]!.suggestion).toBe("change_color cat to another color, such as gray");
    }
  });

  test("a category section takes the one hue its colored nodes share, past the hue cap, with no finding", () => {
    const doc = makeDocument([
      section("page", [0, 0, 2600, 1400], "white", null),
      section("a", [40, 40, 400, 300], "blue", "page"),
      section("b", [40, 800, 400, 300], "green", "page"),
      section("c", [1000, 40, 400, 300], "teal", "page"),
      section("pause", [1800, 800, 600, 400], "gray", "page"),
      node("wait", [1840, 880, 120, 80], "orange", "pause"),
      node("approve", [2000, 880, 120, 80], "orange", "pause"),
      // Gray nodes and stickies do not make it mixed.
      node("label", [2160, 880, 120, 80], "gray", "pause"),
      { ...box("note", 1840, 1000, 160, 96, "sticky"), color: "yellow", parentId: "pause" },
    ]);
    // Blue, green and teal fill the three-hue cap; the Pause category still gets its orange.
    expect(pickSectionColor(doc, "pause", style)).toBe("orange");
    doc.objects[4] = { ...doc.objects[4]!, color: "orange" };
    expect(integrity(doc)).toEqual([]);
  });

  test("two touching category sections in one hue still clash", () => {
    const doc = makeDocument([
      section("page", [0, 0, 1400, 800], "white", null),
      section("a", [40, 40, 400, 300], "violet", "page"),
      section("b", [470, 40, 400, 300], "violet", "page"),
      node("a1", [80, 120, 120, 80], "violet", "a"),
      node("b1", [510, 120, 120, 80], "violet", "b"),
    ]);
    expect(integrity(doc).map((finding) => finding.at)).toEqual([["b", "a"]]);
  });

  test("warm hues are left for the drawer: the chooser reaches them only when no cool hue keeps the rules", () => {
    const doc = makeDocument([
      section("page", [0, 0, 2000, 1400], "white", null),
      section("parent", [40, 40, 1600, 1200], "gray", "page"),
      section("a", [80, 120, 400, 300], "blue", "parent"),
      section("x", [520, 120, 400, 300], "gray", "parent"),
      section("b", [960, 120, 400, 300], "violet", "parent"),
      section("c", [520, 460, 400, 300], "green", "parent"),
      node("t", [560, 200, 200, 100], "teal", "x"),
      node("p", [560, 320, 200, 60], "pink", "x"),
    ]);
    // x sits in gray, touches blue, violet and green, and holds teal and pink nodes.
    expect(pickSectionColor(doc, "x", style)).toBe("orange");
    doc.objects.splice(5, 1);
    expect(pickSectionColor(doc, "x", style)).toBe("green");
  });

  test("a board carries at most three chromatic section hues; past that, the farthest sibling's hue", () => {
    const doc = makeDocument([
      section("page", [0, 0, 2600, 1400], "white", null),
      section("parent", [40, 40, 2400, 1200], "gray", "page"),
      section("a", [80, 120, 400, 300], "blue", "parent"),
      section("x", [520, 120, 400, 300], "gray", "parent"),
      section("b", [960, 120, 400, 300], "violet", "parent"),
      section("c", [520, 460, 400, 300], "green", "parent"),
      section("d", [1900, 700, 400, 300], "yellow", "parent"),
    ]);
    // x sits in gray and touches blue, violet and green: teal would be a fifth hue, so x repeats d's.
    expect(pickSectionColor(doc, "x", style)).toBe("yellow");
    // With no far sibling left to repeat, teal is the one cool hue that keeps the rules.
    doc.objects[6] = { ...doc.objects[6]!, color: "gray" };
    expect(pickSectionColor(doc, "x", style)).toBe("teal");
  });

  test("teal never sits beside a touching blue or green while another hue fits", () => {
    const doc = makeDocument([
      section("page", [0, 0, 2000, 1400], "white", null),
      section("g", [40, 40, 400, 300], "gray", "page"),
      section("t", [40, 380, 400, 300], "teal", "page"),
      section("x", [480, 40, 400, 640], "gray", "page"),
    ]);
    // x touches gray g and teal t: blue is first but sits beside teal, so violet.
    expect(pickSectionColor(doc, "x", style)).toBe("violet");
  });
});

describe("Studio duplicate and paste give copied sections a color that keeps the rules", () => {
  const style = canvasThemePreset("schematic-light");
  function simple(): InteractiveCanvasDocument {
    return makeDocument([
      section("page", [0, 0, 4000, 3200], "white", null),
      section("a", [40, 40, 400, 300], "gray", "page"),
      section("b", [600, 40, 400, 300], "blue", "page"),
    ]);
  }
  function studio(document: InteractiveCanvasDocument, actions: CanvasAction[]) {
    let state = createInteractiveCanvasState(document);
    for (const action of actions) {
      const next = reduceInteractiveCanvasState(state, withPlacedSectionColor(state.document, action, style, state.lastPickedColor.section));
      state = { ...next, document: withCopiedSectionColors(state.document, next.document, action, style) };
    }
    return state.document;
  }

  test("a duplicate that lands on its source takes another color", () => {
    const document = studio(simple(), [
      { type: "canvas.select", selection: { kind: "objects", objectIds: ["a"] } },
      { type: "canvas.duplicateSelection" },
    ]);
    const copy = document.objects.find((object) => !simple().objects.some((source) => source.id === object.id))!;
    expect(copy.color).not.toBe("gray");
    expect(siblingClashes(document, style)).toEqual([]);
    expect(integrity(document)).toEqual([]);
  });

  test("a paste set apart keeps its color; a paste that touches its source changes it", () => {
    const copied = copySelection(simple(), { kind: "objects", objectIds: ["a"] })!;
    const paste = (x: number, y: number): CanvasAction => {
      const payload = buildPastePayload(copied, { x, y });
      return { type: "canvas.addObjects", objects: payload.objects, connections: payload.connections };
    };
    const colorOfCopy = (document: InteractiveCanvasDocument) =>
      document.objects.find((object) => object.type === "section" && !["page", "a", "b"].includes(object.id))?.color;
    expect(colorOfCopy(studio(simple(), [paste(1400, 700)]))).toBe("gray");
    const near = studio(simple(), [paste(240, 530)]);
    expect(colorOfCopy(near)).not.toBe("gray");
    expect(integrity(near)).toEqual([]);
  });
});

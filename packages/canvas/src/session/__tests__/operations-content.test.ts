/**
 * The Content & appearance gestures (S3.2) — `update_text`, `change_color`,
 * `change_shape`.
 *
 * What these pin, in order of how easy each is to break:
 *  - kind-agnosticism: one tool reaches a sticky's body, a section's title, a
 *    shape's label AND an edge's label, and one tool recolors all four;
 *  - the fit warning: unfitting text still APPLIES, carrying the note;
 *  - the folded-type swap, including both icon transitions, and the direction
 *    field that only four types carry.
 */
import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasObject } from "@codecaine-ai/canvas/schema";

import { makeTestSession, runOp } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

function objectOf(
  session: ReturnType<typeof makeTestSession>,
  id: string,
): InteractiveCanvasObject {
  const found = session.draft.objects.find((object) => object.id === id);
  if (!found) throw new Error(`no object ${id} on the draft`);
  return found;
}

/** A board with one of every text-carrying kind, plus a labeled edge. */
function contentBoard() {
  const section = { ...box("frame", 0, 0, 640, 480, "section"), text: "Frame" };
  const sticky = { ...box("note", 40, 80, 200, 200, "sticky"), text: "Note", parentId: "frame" };
  const shape = { ...box("step", 300, 80, 200, 120, "process"), text: "Step", parentId: "frame" };
  const other = { ...box("next", 300, 300, 200, 120, "process"), text: "Next", parentId: "frame" };
  const edge = { ...connect("step-next", "step", "next"), label: "then" };
  return makeDocument([section, sticky, shape, other], [edge]);
}

describe("update_text", () => {
  test("writes every kind's text field through one tool", () => {
    const session = makeTestSession(contentBoard(), ["frame"]);

    for (const [id, text] of [
      ["frame", "Renamed frame"],
      ["note", "Rewritten note"],
      ["step", "Relabeled"],
    ] as const) {
      const result = runOp(session, "update_text", { id, text });
      expect(result.isError).toBeUndefined();
      // The ledger speaks the gesture, not the CRUD verb underneath it.
      expect(result.text).toContain(`APPLIED · update_text ${id}`);
      expect(objectOf(session, id).text).toBe(text);
    }
  });

  test("an edge's label is text like any other, and lands on `label`", () => {
    const session = makeTestSession(contentBoard(), ["frame"]);

    const result = runOp(session, "update_text", { id: "step-next", text: "on success" });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · update_text step-next");
    expect(session.draft.connections[0]!.label).toBe("on success");
    // The connection kept its identity — this is a label write, not a repoint.
    expect(session.draft.connections[0]!.from.objectId).toBe("step");
  });

  test("empty text on an edge clears the label rather than leaving an empty chip", () => {
    const session = makeTestSession(contentBoard(), ["frame"]);

    const result = runOp(session, "update_text", { id: "step-next", text: "" });

    expect(result.isError).toBeUndefined();
    expect(session.draft.connections[0]!.label).toBeUndefined();
  });

  test("text that no longer fits its box still APPLIES, carrying the warning", () => {
    const session = makeTestSession(contentBoard(), ["frame"]);
    const overflowing = "This label is far too long to survive inside a box this small, "
      + "and every extra clause anyone adds only makes the overflow worse and more obvious.";

    const result = runOp(session, "update_text", { id: "step", text: overflowing });

    // Report-only, same philosophy as the lints: the write lands.
    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · update_text step");
    expect(objectOf(session, "step").text).toBe(overflowing);
    // The note rides under the headline as an indented line.
    expect(result.text).toMatch(/\n\s+label clips at 200×120/);
    expect(result.text).toContain("needs");
  });

  test("text that fits carries no note", () => {
    const session = makeTestSession(contentBoard(), ["frame"]);

    const result = runOp(session, "update_text", { id: "step", text: "Ok" });

    expect(result.isError).toBeUndefined();
    expect(result.text).not.toContain("clips at");
  });

  test("an id on neither roster is rejected without touching the draft", () => {
    const session = makeTestSession(contentBoard(), ["frame"]);
    const before = session.draft;

    const result = runOp(session, "update_text", { id: "ghost", text: "x" });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("neither an object nor an edge");
    expect(session.draft).toBe(before);
  });
});

describe("change_color", () => {
  test("recolors objects and edges through the same tool", () => {
    const session = makeTestSession(contentBoard(), ["frame"]);

    const shape = runOp(session, "change_color", { id: "step", color: "teal" });
    expect(shape.isError).toBeUndefined();
    expect(shape.text).toContain("APPLIED · change_color step");
    expect(objectOf(session, "step").color).toBe("teal");

    const edge = runOp(session, "change_color", { id: "step-next", color: "red" });
    expect(edge.isError).toBeUndefined();
    expect(edge.text).toContain("APPLIED · change_color step-next");
    expect(session.draft.connections[0]!.color).toBe("red");
    // Recoloring an edge is not restyling it: nothing else on it moved.
    expect(session.draft.connections[0]!.label).toBe("then");
  });

  test("sections and stickies are colorable kinds too", () => {
    const session = makeTestSession(contentBoard(), ["frame"]);

    expect(runOp(session, "change_color", { id: "frame", color: "blue" }).isError)
      .toBeUndefined();
    expect(runOp(session, "change_color", { id: "note", color: "yellow" }).isError)
      .toBeUndefined();
    expect(objectOf(session, "frame").color).toBe("blue");
    expect(objectOf(session, "note").color).toBe("yellow");
  });
});

describe("change_shape", () => {
  test("swaps a folded shape type", () => {
    const session = makeTestSession(contentBoard(), ["frame"]);

    const result = runOp(session, "change_shape", { id: "step", patch: { type: "ellipse" } });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · change_shape step");
    expect(objectOf(session, "step").type).toBe("ellipse");
    expect(objectOf(session, "step").icon).toBeUndefined();
  });

  test("shape → icon lowers the glyph onto the carrier type and sets `icon`", () => {
    const session = makeTestSession(contentBoard(), ["frame"]);

    const result = runOp(session, "change_shape", { id: "step", patch: { type: "memory" } });

    expect(result.isError).toBeUndefined();
    const swapped = objectOf(session, "step");
    // The document's {type: "icon", icon} split never reached the tool surface.
    expect(swapped.type).toBe("icon");
    expect(swapped.icon).toBe("memory");
  });

  test("icon → shape clears the glyph, so no icon ghost survives the swap", () => {
    const document = contentBoard();
    document.objects.push({
      ...box("glyph", 300, 300, 120, 120, "icon"),
      text: "Store",
      icon: "memory",
    } as InteractiveCanvasObject);
    const session = makeTestSession(document, ["frame"]);

    const result = runOp(session, "change_shape", { id: "glyph", patch: { type: "rectangle" } });

    expect(result.isError).toBeUndefined();
    const swapped = objectOf(session, "glyph");
    expect(swapped.type).toBe("rectangle");
    expect(swapped.icon).toBeUndefined();
  });

  test("icon → icon swaps the glyph and keeps the carrier type", () => {
    const document = contentBoard();
    document.objects.push({
      ...box("glyph", 300, 300, 120, 120, "icon"),
      text: "Store",
      icon: "memory",
    } as InteractiveCanvasObject);
    const session = makeTestSession(document, ["frame"]);

    expect(runOp(session, "change_shape", { id: "glyph", patch: { type: "key" } }).isError)
      .toBeUndefined();
    expect(objectOf(session, "glyph").type).toBe("icon");
    expect(objectOf(session, "glyph").icon).toBe("key");
  });

  test("a facing type takes the validator's default when none is asked for", () => {
    const session = makeTestSession(contentBoard(), ["frame"]);

    runOp(session, "change_shape", { id: "step", patch: { type: "triangle" } });
    expect(objectOf(session, "step").direction).toBe("up");

    runOp(session, "change_shape", { id: "step", patch: { type: "arrow-shape" } });
    // "up" is not an arrow-shape facing, so the swap falls to that type's own
    // default rather than carrying an illegal value across.
    expect(objectOf(session, "step").direction).toBe("right");
  });

  test("direction alone re-points a facing shape", () => {
    const session = makeTestSession(contentBoard(), ["frame"]);
    runOp(session, "change_shape", { id: "step", patch: { type: "arrow-shape" } });

    const result = runOp(session, "change_shape", { id: "step", patch: { direction: "left" } });

    expect(result.isError).toBeUndefined();
    expect(objectOf(session, "step").type).toBe("arrow-shape");
    expect(objectOf(session, "step").direction).toBe("left");
  });

  test("a direction the new type cannot hold is dropped, with a note", () => {
    const session = makeTestSession(contentBoard(), ["frame"]);

    const result = runOp(session, "change_shape", {
      id: "step",
      patch: { type: "rectangle", direction: "left" },
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · change_shape step");
    expect(result.text).toContain('direction "left" dropped');
    expect(result.text).toContain("has no facing");
    expect(objectOf(session, "step").direction).toBeUndefined();
  });

  test("a direction off the new type's own axis is dropped for that type's facing", () => {
    const session = makeTestSession(contentBoard(), ["frame"]);

    const result = runOp(session, "change_shape", {
      id: "step",
      patch: { type: "triangle", direction: "left" },
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain('direction "left" dropped');
    expect(result.text).toContain("points up or down");
    expect(objectOf(session, "step").direction).toBe("up");
  });

  test("swapping away from a facing type clears the stale facing", () => {
    const session = makeTestSession(contentBoard(), ["frame"]);
    runOp(session, "change_shape", { id: "step", patch: { type: "arrow-shape" } });
    expect(objectOf(session, "step").direction).toBe("right");

    const result = runOp(session, "change_shape", { id: "step", patch: { type: "rectangle" } });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain('direction "right" cleared');
    expect(objectOf(session, "step").direction).toBeUndefined();
  });

  test("sections, stickies, and edges are not shapes", () => {
    const session = makeTestSession(contentBoard(), ["frame"]);
    const before = session.draft;

    for (const id of ["frame", "note", "step-next"]) {
      const result = runOp(session, "change_shape", { id, patch: { type: "ellipse" } });
      expect(result.isError).toBe(true);
    }
    expect(session.draft).toBe(before);
  });
});

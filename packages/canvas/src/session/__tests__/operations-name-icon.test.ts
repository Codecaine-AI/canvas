/**
 * Names and the section header glyph, through the gestures that write them:
 * `place_section` / `place_shape` (name, header icon at creation),
 * `update_text` (the name), `clone` (the glyph travels with the copy), and
 * `change_shape` (a section's header glyph; an icon's glyph stays its type).
 *
 * What these pin, in order of how easy each is to break:
 *  - a node shows its name only: place_shape and clone take no detail, and
 *    update_text drops one with a note for every kind instead of refusing
 *    the rest of the call, leaving a detail an older file stored untouched;
 *  - a glyph sent as a free string is refused with the names it was reaching
 *    for, and a section's glyph never leaks into the folded type vocabulary.
 */
import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasObject } from "../../state/schema";

import { diffDocuments } from "../../board/doc-diff";
import { NAME_TARGET_WORDS } from "../../board/text-rules";
import { findOperationTool } from "../tools/operations";
import { DETAIL_DROPPED_NOTE } from "../tools/operations/content";
import { boardDiffBlock, documentDelta } from "../perception/perception";
import { makeTestSession, runOp } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

function objectOf(session: ReturnType<typeof makeTestSession>, id: string): InteractiveCanvasObject {
  const found = session.draft.objects.find((object) => object.id === id);
  if (!found) throw new Error(`no object ${id} on the draft`);
  return found;
}

/** A frame holding a shape, an icon, a sticky, and an edge between the two nodes. */
function board() {
  const frame = { ...box("frame", 0, 0, 960, 640, "section"), text: "Frame" };
  const step = { ...box("step", 40, 80, 280, 120, "process"), text: "Step", parentId: "frame" };
  const brain = {
    ...box("brain", 400, 80, 120, 120, "icon"),
    text: "Model",
    icon: "model" as const,
    parentId: "frame",
  };
  const note = { ...box("note", 40, 400, 200, 200, "sticky"), text: "Note", parentId: "frame" };
  const edge = { ...connect("step-brain", "step", "brain"), label: "asks" };
  return makeDocument([frame, step, brain, note], [edge]);
}

describe("place_section — title and header glyph in one gesture", () => {
  test("stores a known glyph on the frame, and has no detail field", () => {
    const session = makeTestSession(board(), ["frame"]);

    const result = runOp(session, "place_section", {
      id: "services",
      text: "Bun services",
      at: [1000, 0],
      icon: "agent",
    });

    expect(result.isError).toBeUndefined();
    expect(objectOf(session, "services")).toMatchObject({ type: "section", text: "Bun services", icon: "agent" });
    expect("detail" in objectOf(session, "services")).toBe(false);
    // The DELTA line carries the glyph, in the digest's own spelling.
    expect(result.text).toContain("icon=agent");
    expect(findOperationTool("place_section")!.parameters.properties).not.toHaveProperty("detail");
  });

  test("takes a color in the same call, and picks one without", () => {
    const session = makeTestSession(board(), ["frame"]);

    const colored = runOp(session, "place_section", { id: "data", text: "Data", at: [1000, 0], color: "teal" });
    const plain = runOp(session, "place_section", { id: "plain", text: "Plain", at: [1000, 400] });

    expect(colored.isError).toBeUndefined();
    expect(colored.text).toContain("APPLIED · place_section data 1000,0");
    expect(colored.text).toContain(" teal");
    expect(objectOf(session, "data").color).toBe("teal");
    // It touches gray (frame) and teal (data): blue would sit beside teal, so violet, named in the summary.
    expect(objectOf(session, "plain").color).toBe("violet");
    expect(plain.text).toContain("APPLIED · place_section plain 1000,400 480×360 violet");
  });

  test("the color field is the board's closed roster", () => {
    const color = findOperationTool("place_section")!.parameters.properties.color;
    expect(color.enum).toContain("teal");
    expect(color.enum).not.toContain("magenta");
  });

  test("an empty or \"none\" icon means none", () => {
    const session = makeTestSession(board(), ["frame"]);

    runOp(session, "place_section", { id: "plain", text: "Plain", at: [1000, 0], icon: "" });
    const none = runOp(session, "place_section", { id: "bare", text: "Bare", at: [1000, 400], icon: "none" });

    expect(none.isError).toBeUndefined();
    for (const id of ["plain", "bare"]) {
      expect("detail" in objectOf(session, id), id).toBe(false);
      expect("icon" in objectOf(session, id), id).toBe(false);
    }
  });

  test("an unknown glyph is refused with the near misses, and nothing lands", () => {
    const session = makeTestSession(board(), ["frame"]);
    const before = session.draft;

    for (const [icon, answer] of [
      // A swapped pair and the wrong case still find the glyph…
      ["Agnet", 'did you mean "agent"'],
      // …a bare product name finds its brand logo…
      ["postgres", 'did you mean "brand-postgres"'],
      // …and nothing close says so rather than guessing.
      ["zzqx", "no glyph is close to it"],
    ] as const) {
      const result = runOp(session, "place_section", { id: "x", text: "X", at: [1000, 0], icon });
      expect(result.isError, icon).toBe(true);
      expect(result.text).toContain(`icon "${icon}" is not a glyph name — ${answer}`);
    }
    expect(session.draft).toBe(before);
  });
});

describe("place_shape, clone and update_text — a node shows its name only", () => {
  test("place_shape and clone have no detail field, and a placed node carries none", () => {
    for (const name of ["place_shape", "clone"]) {
      expect(findOperationTool(name)!.parameters.properties).not.toHaveProperty("detail");
    }
    const session = makeTestSession(board(), ["frame"]);
    runOp(session, "place_shape", { id: "db", type: "memory", at: [600, 80], text: "Orders" });
    expect(objectOf(session, "db")).toMatchObject({ type: "icon", icon: "memory", text: "Orders" });
    expect("detail" in objectOf(session, "db")).toBe(false);
  });

  test("update_text drops a detail sent to a node with a note, and the name still lands", () => {
    const session = makeTestSession(board(), ["frame"]);

    const both = runOp(session, "update_text", { id: "step", text: "Postgres", detail: "16 · :5432" });
    expect(both.isError).toBeUndefined();
    expect(both.text).toContain("APPLIED · update_text step");
    expect(both.text).toContain(DETAIL_DROPPED_NOTE);
    expect(objectOf(session, "step").text).toBe("Postgres");
    expect("detail" in objectOf(session, "step")).toBe(false);

    const alone = runOp(session, "update_text", { id: "brain", detail: "claude-opus" });
    expect(alone.isError).toBeUndefined();
    expect(alone.text).toMatch(/^NO-OP · update_text brain — detail dropped/);
    expect("detail" in objectOf(session, "brain")).toBe(false);
  });

  test("a stored detail is left as stored: update_text never rewrites or clears it", () => {
    const stored = board();
    stored.objects[1] = { ...stored.objects[1]!, detail: ":5432" };
    const session = makeTestSession(stored, ["frame"]);

    runOp(session, "update_text", { id: "step", text: "Postgres", detail: "" });

    expect(objectOf(session, "step")).toMatchObject({ text: "Postgres", detail: ":5432" });
  });

  test("a detail sent to a section, a sticky or an edge drops the same way", () => {
    const session = makeTestSession(board(), ["frame"]);
    for (const [id, text] of [["frame", "Services"], ["note", "Rewritten"], ["step-brain", "calls"]] as const) {
      const result = runOp(session, "update_text", { id, text, detail: "x" });
      expect(result.isError).toBeUndefined();
      expect(result.text).toContain(DETAIL_DROPPED_NOTE);
    }
    expect(objectOf(session, "frame").text).toBe("Services");
    expect(objectOf(session, "note").text).toBe("Rewritten");
    expect(session.draft.connections[0]!.label).toBe("calls");
    expect(session.draft.objects.some((object) => "detail" in object)).toBe(false);
  });

  test("the name field quotes the name limit, and asking for no text is refused", () => {
    const fields = (findOperationTool("update_text")!.parameters as unknown as {
      properties: Record<string, { description: string }>;
    }).properties;
    expect(fields.text!.description).toContain(`≤ ~${NAME_TARGET_WORDS}`);

    const result = runOp(makeTestSession(board(), ["frame"]), "update_text", { id: "step" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("send text");
  });

  test("a clone never carries its source's stored detail; a section copy keeps its header glyph", () => {
    const stored = board();
    stored.objects[0] = { ...stored.objects[0]!, detail: "127.0.0.1", icon: "agent" };
    stored.objects[1] = { ...stored.objects[1]!, detail: ":5432" };
    const session = makeTestSession(stored, ["frame"]);

    runOp(session, "clone", { sourceId: "frame", id: "frame-2", at: [1100, 0] });
    runOp(session, "clone", { sourceId: "step", id: "redis", text: "Redis", by: [0, 160] });

    expect(objectOf(session, "frame-2")).toMatchObject({ icon: "agent" });
    expect("detail" in objectOf(session, "frame-2")).toBe(false);
    expect(objectOf(session, "redis").text).toBe("Redis");
    expect("detail" in objectOf(session, "redis")).toBe(false);
  });
});

describe("change_shape — a section's header glyph", () => {
  test("sets, swaps, and removes the frame's glyph", () => {
    const session = makeTestSession(board(), ["frame"]);

    const set = runOp(session, "change_shape", { id: "frame", patch: { icon: "memory" } });
    expect(set.isError).toBeUndefined();
    expect(set.text).toContain("frame  icon — → memory");
    expect(objectOf(session, "frame").icon).toBe("memory");
    // The frame is still a frame: the glyph is not folded into its type.
    expect(objectOf(session, "frame").type).toBe("section");

    runOp(session, "change_shape", { id: "frame", patch: { icon: "agent" } });
    expect(objectOf(session, "frame").icon).toBe("agent");

    const removed = runOp(session, "change_shape", { id: "frame", patch: { icon: "none" } });
    expect(removed.isError).toBeUndefined();
    expect(objectOf(session, "frame").icon).toBeUndefined();
  });

  test("removing a glyph the frame does not have is a no-op", () => {
    const session = makeTestSession(board(), ["frame"]);

    const result = runOp(session, "change_shape", { id: "frame", patch: { icon: "none" } });

    expect(result.text).toMatch(/^NO-OP · change_shape frame/);
  });

  test("an unknown glyph is refused with the near misses", () => {
    const session = makeTestSession(board(), ["frame"]);

    const result = runOp(session, "change_shape", { id: "frame", patch: { icon: "memroy" } });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('patch.icon "memroy" is not a glyph name — did you mean "memory"');
  });

  test("a section refuses type and direction — it is not a shape", () => {
    const session = makeTestSession(board(), ["frame"]);

    for (const patch of [{ type: "ellipse" }, { direction: "left" }, { type: "memory", icon: "memory" }]) {
      const result = runOp(session, "change_shape", { id: "frame", patch });
      expect(result.isError, JSON.stringify(patch)).toBe(true);
      expect(result.text).toContain("a frame is not a shape");
    }
  });

  test("a shape's glyph is its type: patch.icon on a shape names the call to send instead", () => {
    const session = makeTestSession(board(), ["frame"]);

    const result = runOp(session, "change_shape", { id: "brain", patch: { icon: "agent" } });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('send change_shape {"id":"brain","patch":{"type":"agent"}} instead');
    // …and that call swaps the glyph.
    runOp(session, "change_shape", { id: "brain", patch: { type: "agent" } });
    expect(objectOf(session, "brain")).toMatchObject({ type: "icon", icon: "agent" });
  });
});

describe("the diff carries a stored detail and the header glyph", () => {
  test("diffDocuments still replays the stored detail channel, including an explicit clear", () => {
    const baseline = board();
    baseline.objects[1] = { ...baseline.objects[1]!, detail: ":5432" };
    const draft = {
      ...baseline,
      objects: baseline.objects.map((object) => object.id === "step"
        ? { ...object, detail: undefined }
        : object.id === "frame" ? { ...object, detail: "127.0.0.1", icon: "agent" as const } : object),
    };

    const operations = diffDocuments(baseline, draft);

    // The clear is a `null`, which survives the JSON trip to the reducer (an
    // own undefined would be dropped there) and which the reducer reads as
    // "remove it". toEqual tells null from a missing key.
    expect(operations).toContainEqual({ type: "updateObject", objectId: "step", patch: { detail: null } });
    expect(operations).toContainEqual({
      type: "updateObject",
      objectId: "frame",
      patch: { detail: "127.0.0.1", icon: "agent" },
    });
  });

  test("BOARD DIFF says reiconed for a section's glyph", () => {
    const session = makeTestSession(board(), ["frame"]);
    runOp(session, "change_shape", { id: "frame", patch: { icon: "agent" } });

    expect(boardDiffBlock(session)).toContain("updateSection frame  reiconed");
  });

  test("DELTA reports a removed glyph as → —, and never a stored detail, which does not render", () => {
    const before = board();
    before.objects[0] = { ...before.objects[0]!, icon: "agent" };
    before.objects[1] = { ...before.objects[1]!, detail: ":5432" };
    const after = {
      ...before,
      objects: before.objects.map((object) => {
        if (object.id === "frame") return { ...object, icon: undefined };
        if (object.id === "step") return { ...object, detail: undefined };
        return object;
      }),
    };

    const { lines } = documentDelta(before, after);

    expect(lines).toContain("frame  icon agent → —");
    expect(lines.some((line) => line.includes("detail"))).toBe(false);
  });
});

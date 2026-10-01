/**
 * The name + detail line and the section header glyph, through the gestures
 * that write them: `place_section` / `place_shape` (detail, header icon at
 * creation), `update_text` (name and detail in one call, either alone),
 * `clone` (both travel with the copy), and `change_shape` (a section's header
 * glyph; an icon's glyph stays its type).
 *
 * What these pin, in order of how easy each is to break:
 *  - the stored form: a detail is trimmed and an empty one is no detail, so a
 *    draft and the file it saves to never disagree;
 *  - the kinds without a detail line (stickies, edges) drop it with a note
 *    instead of refusing the rest of the call;
 *  - a glyph sent as a free string is refused with the names it was reaching
 *    for, and a section's glyph never leaks into the folded type vocabulary.
 */
import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasObject } from "@codecaine-ai/canvas/schema";

import { diffDocuments } from "../src/board/doc-diff";
import { DETAIL_MAX_CHARS, NAME_TARGET_WORDS } from "../src/board/text-rules";
import { findOperationTool } from "../src/service/session/tools/operations";
import { boardDiffBlock, documentDelta } from "../src/service/session/perception/perception";
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

describe("place_section — title, detail, and header glyph in one gesture", () => {
  test("stores a trimmed detail and a known glyph on the frame", () => {
    const session = makeTestSession(board(), ["frame"]);

    const result = runOp(session, "place_section", {
      id: "services",
      text: "Bun services",
      at: [1000, 0],
      detail: "  127.0.0.1 ",
      icon: "agent",
    });

    expect(result.isError).toBeUndefined();
    expect(objectOf(session, "services")).toMatchObject({
      type: "section",
      text: "Bun services",
      detail: "127.0.0.1",
      icon: "agent",
    });
    // The DELTA line carries both, in the digest's own spelling.
    expect(result.text).toContain('icon=agent detail="127.0.0.1"');
  });

  test("an empty detail, and an empty or \"none\" icon, mean none", () => {
    const session = makeTestSession(board(), ["frame"]);

    runOp(session, "place_section", { id: "plain", text: "Plain", at: [1000, 0], detail: "  ", icon: "" });
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

describe("place_shape — the pick, the click, and the optional detail", () => {
  test("lands untitled with the detail under it", () => {
    const session = makeTestSession(board(), ["frame"]);

    const result = runOp(session, "place_shape", { id: "db", type: "memory", at: [600, 80], detail: ":5432" });

    expect(result.isError).toBeUndefined();
    expect(objectOf(session, "db")).toMatchObject({ type: "icon", icon: "memory", text: "", detail: ":5432" });
  });

  test("without a detail the object carries no detail key", () => {
    const session = makeTestSession(board(), ["frame"]);

    runOp(session, "place_shape", { id: "db", type: "process", at: [600, 80] });

    expect("detail" in objectOf(session, "db")).toBe(false);
  });
});

describe("update_text — the name and its detail, together or apart", () => {
  test("the field descriptions quote the limits the text lints measure", () => {
    const fields = (findOperationTool("update_text")!.parameters as unknown as {
      properties: Record<string, { description: string }>;
    }).properties;

    expect(fields.text!.description).toContain(`≤ ~${NAME_TARGET_WORDS}`);
    expect(fields.detail!.description).toContain(`≤ ${DETAIL_MAX_CHARS} chars`);
  });

  test("writes the name and the detail in one call", () => {
    const session = makeTestSession(board(), ["frame"]);

    const result = runOp(session, "update_text", { id: "step", text: "Postgres", detail: "16 · :5432" });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · update_text step");
    expect(objectOf(session, "step")).toMatchObject({ text: "Postgres", detail: "16 · :5432" });
    expect(result.text).toContain('step  detail — → "16 · :5432"');
  });

  test("writes the detail alone and leaves the name", () => {
    const session = makeTestSession(board(), ["frame"]);

    runOp(session, "update_text", { id: "frame", detail: "127.0.0.1" });

    expect(objectOf(session, "frame")).toMatchObject({ text: "Frame", detail: "127.0.0.1" });
  });

  test("an empty detail clears it", () => {
    const session = makeTestSession(board(), ["frame"]);
    runOp(session, "update_text", { id: "brain", detail: "claude-opus" });

    const result = runOp(session, "update_text", { id: "brain", detail: "" });

    expect(result.isError).toBeUndefined();
    expect(objectOf(session, "brain").detail).toBeUndefined();
  });

  test("asking for neither field is refused", () => {
    const session = makeTestSession(board(), ["frame"]);

    const result = runOp(session, "update_text", { id: "step" });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("text, detail, or both");
  });

  test("a sticky has no detail line: the text still lands and the detail is dropped with a note", () => {
    const session = makeTestSession(board(), ["frame"]);

    const both = runOp(session, "update_text", { id: "note", text: "Rewritten", detail: "x" });
    expect(both.isError).toBeUndefined();
    expect(both.text).toContain("detail dropped — a sticky has no detail line");
    expect(objectOf(session, "note").text).toBe("Rewritten");
    expect("detail" in objectOf(session, "note")).toBe(false);

    const alone = runOp(session, "update_text", { id: "note", detail: "x" });
    expect(alone.isError).toBeUndefined();
    expect(alone.text).toMatch(/^NO-OP · update_text note — detail dropped/);
  });

  test("an edge has no detail line either", () => {
    const session = makeTestSession(board(), ["frame"]);

    const both = runOp(session, "update_text", { id: "step-brain", text: "calls", detail: "x" });
    expect(both.isError).toBeUndefined();
    expect(both.text).toContain("detail dropped — an edge has no detail line");
    expect(session.draft.connections[0]!.label).toBe("calls");

    const alone = runOp(session, "update_text", { id: "step-brain", detail: "x" });
    expect(alone.text).toMatch(/^NO-OP · update_text step-brain — detail dropped/);
  });

  test("a detail write is lock-gated like any other edit", () => {
    const locked = board();
    locked.objects[0] = { ...locked.objects[0]!, locked: "all" };
    const session = makeTestSession(locked, ["frame"]);

    const result = runOp(session, "update_text", { id: "step", detail: "x" });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("locked all");
  });
});

describe("clone — the detail and the glyph travel with the copy", () => {
  test("a section copy keeps its detail and header glyph", () => {
    const withIcon = board();
    withIcon.objects[0] = { ...withIcon.objects[0]!, detail: "127.0.0.1", icon: "agent" };
    const session = makeTestSession(withIcon, ["frame"]);

    runOp(session, "clone", { sourceId: "frame", id: "frame-2", at: [1100, 0] });

    expect(objectOf(session, "frame-2")).toMatchObject({ detail: "127.0.0.1", icon: "agent" });
  });

  test("a detail override replaces the source's, and an empty one clears it", () => {
    const withDetail = board();
    withDetail.objects[1] = { ...withDetail.objects[1]!, detail: ":5432" };
    const session = makeTestSession(withDetail, ["frame"]);

    runOp(session, "clone", { sourceId: "step", id: "redis", text: "Redis", detail: ":6379", by: [0, 160] });
    runOp(session, "clone", { sourceId: "step", id: "bare", detail: "", by: [0, 320] });

    expect(objectOf(session, "redis")).toMatchObject({ text: "Redis", detail: ":6379" });
    expect("detail" in objectOf(session, "bare")).toBe(false);
  });

  test("a sticky copy drops a requested detail with a note", () => {
    const session = makeTestSession(board(), ["frame"]);

    const result = runOp(session, "clone", { sourceId: "note", id: "note-2", detail: "x", by: [240, 0] });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("detail dropped — a sticky has no detail line");
    expect("detail" in objectOf(session, "note-2")).toBe(false);
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

describe("the diff carries the detail and the header glyph", () => {
  test("diffDocuments emits the detail channel, including an explicit clear", () => {
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

  test("BOARD DIFF says redetailed, and reiconed for a section's glyph", () => {
    const session = makeTestSession(board(), ["frame"]);
    runOp(session, "update_text", { id: "step", detail: ":5432" });
    runOp(session, "change_shape", { id: "frame", patch: { icon: "agent" } });

    const block = boardDiffBlock(session);

    expect(block).toContain("updateObject step  redetailed");
    expect(block).toContain("updateSection frame  reiconed");
  });

  test("DELTA reports a removed detail and a removed glyph as → —", () => {
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
    expect(lines).toContain('step  detail ":5432" → —');
  });
});

/**
 * The folded type vocabulary as the MODEL experiences it, end to end: what a
 * name places, what the digest calls it back, and what the delta says about a
 * swap. The unit-level mapping lives in placeable-types.test.ts; this file
 * pins the boundary — no formatter the model reads may show the document's
 * `{ type: "icon", icon }` split, and `memory` must mean the same drawing
 * going in as coming out
 * (docs/30-agent-layout/50-tool-surface/10-gestures §Place).
 */
import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasObject } from "@codecaine-ai/canvas/schema";

import { formatBoardDigest } from "../src/board/digest";
import { findOperationTool } from "../src/service/session/tools/operations";
import { documentDelta } from "../src/service/session/perception/perception";
import { makeTestSession, runOp } from "./helpers";
import { box, makeDocument } from "./synthetic";

function objectOf(
  session: ReturnType<typeof makeTestSession>,
  id: string,
): InteractiveCanvasObject {
  const found = session.draft.objects.find((object) => object.id === id);
  if (!found) throw new Error(`no object ${id}`);
  return found;
}

function boardWithFrame(): ReturnType<typeof makeDocument> {
  return makeDocument([
    { ...box("frame", 0, 0, 960, 640, "section"), text: "Frame" },
  ]);
}

describe("placing a folded name", () => {
  test("memory places the ICON, wearing its registry-preferred color", () => {
    const session = makeTestSession(boardWithFrame(), ["frame"]);

    const result = runOp(session, "place_shape", {
      id: "store",
      type: "memory",
      at: [200, 200],
    });

    expect(result.isError).toBeUndefined();
    // Internally the carrier type plus the glyph; on the wire, one name.
    expect(objectOf(session, "store").type).toBe("icon");
    expect(objectOf(session, "store").icon).toBe("memory");
    // The registry's preferred color lands with no caller involvement.
    expect(objectOf(session, "store").color).toBe("blue");
    expect(result.text).toContain("place_shape store memory");
  });

  test("neither gesture offers the carrier type on the wire", () => {
    // The published enum is the gate (the tool runtime validates the schema
    // before execute), so the check belongs on the schema both gestures declare.
    for (const tool of ["place_shape", "change_shape"] as const) {
      const wire = JSON.stringify(findOperationTool(tool)!.parameters);
      expect(wire, tool).toContain('"memory"');
      expect(wire, tool).not.toContain('"icon","');
    }
  });

  test("the DELTA names the glyph, never the carrier type", () => {
    const session = makeTestSession(boardWithFrame(), ["frame"]);

    const result = runOp(session, "place_shape", { id: "store", type: "memory", at: [200, 200] });

    expect(result.text).toContain("+ store  memory ");
    expect(result.text).not.toContain(" icon ");
    expect(result.text).not.toContain("icon=");
  });
});

describe("reading a board back", () => {
  test("the digest prints the folded name and no icon= extra", () => {
    const digest = formatBoardDigest(makeDocument([
      { ...box("store", 0, 0, 120, 120, "icon"), text: "Long-term", icon: "memory" },
    ]));

    expect(digest).toContain('  store memory "Long-term" 0,0 120×120');
    expect(digest).not.toContain("icon=");
  });

  test("a swap reports one folded channel on both sides", () => {
    const before = makeDocument([box("step", 0, 0, 160, 96, "rectangle")]);
    const after = makeDocument([
      { ...box("step", 0, 0, 160, 96, "icon"), icon: "memory" },
    ]);

    const delta = documentDelta(before, after);

    expect(delta.lines).toContain("step  type rectangle → memory");
    expect(delta.lines.join("\n")).not.toContain("icon");
  });
});

describe("change_shape speaks the same names", () => {
  test("swapping to memory yields the icon, not a shape", () => {
    const document = boardWithFrame();
    document.objects.push({
      ...box("step", 200, 200, 160, 96, "rectangle"),
      text: "Step",
    } as InteractiveCanvasObject);
    const session = makeTestSession(document, ["frame"]);

    const result = runOp(session, "change_shape", { id: "step", patch: { type: "memory" } });

    expect(result.isError).toBeUndefined();
    expect(objectOf(session, "step").type).toBe("icon");
    expect(objectOf(session, "step").icon).toBe("memory");
    expect(result.text).toContain("step  type rectangle → memory");
  });

  test("swapping a glyph back to a shape clears the glyph field", () => {
    const document = boardWithFrame();
    document.objects.push({
      ...box("store", 200, 200, 120, 120, "icon"),
      text: "Store",
      icon: "memory",
    } as InteractiveCanvasObject);
    const session = makeTestSession(document, ["frame"]);

    const result = runOp(session, "change_shape", { id: "store", patch: { type: "ellipse" } });

    expect(result.isError).toBeUndefined();
    expect(objectOf(session, "store").type).toBe("ellipse");
    expect(objectOf(session, "store").icon).toBeUndefined();
    expect(result.text).toContain("store  type memory → ellipse");
  });
});

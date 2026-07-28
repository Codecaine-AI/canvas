/**
 * The folded type vocabulary as the MODEL experiences it, end to end: what a
 * name places, what the digest calls it back, and what the delta says about a
 * swap. The unit-level mapping lives in placeable-types.test.ts; this file
 * pins the boundary — no formatter the model reads may show the document's
 * `{ type: "icon", icon }` split, and `database` must mean the same drawing
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
  test("database places the ICON — the spec's own example", () => {
    const session = makeTestSession(boardWithFrame(), ["frame"]);

    const result = runOp(session, "place_shape", {
      id: "store",
      type: "database",
      at: [200, 200],
    });

    expect(result.isError).toBeUndefined();
    // Internally the carrier type plus the glyph; on the wire, one name.
    expect(objectOf(session, "store").type).toBe("icon");
    expect(objectOf(session, "store").icon).toBe("database");
    expect(result.text).toContain("place_shape store database");
  });

  test("neither gesture offers the read-only shape name on the wire", () => {
    // The published enum is the gate (the tool runtime validates the schema
    // before execute), so the check belongs on the schema both gestures declare.
    for (const tool of ["place_shape", "change_shape"] as const) {
      const parameters = findOperationTool(tool)!.parameters;
      const wire = JSON.stringify(parameters);
      expect(wire, tool).toContain('"database"');
      expect(wire, tool).not.toContain("database-shape");
      expect(wire, tool).not.toContain("database-icon");
    }
  });

  test("the DELTA names the glyph, never the carrier type", () => {
    const session = makeTestSession(boardWithFrame(), ["frame"]);

    const result = runOp(session, "place_shape", { id: "sky", type: "cloud", at: [200, 200] });

    expect(result.text).toContain("+ sky  cloud ");
    expect(result.text).not.toContain(" icon ");
    expect(result.text).not.toContain("icon=");
  });
});

describe("reading a board back", () => {
  test("the digest prints the folded name and no icon= extra", () => {
    const digest = formatBoardDigest(makeDocument([
      { ...box("sky", 0, 0, 120, 120, "icon"), text: "Cloudy", icon: "cloud" },
    ]));

    expect(digest).toContain('  sky cloud "Cloudy" 0,0 120×120');
    expect(digest).not.toContain("icon=");
  });

  test("a flowchart database already on the board digests as database-shape", () => {
    const digest = formatBoardDigest(makeDocument([
      { ...box("legacy", 0, 0, 160, 96, "database"), text: "Orders" },
      { ...box("glyph", 320, 0, 120, 120, "icon"), text: "Store", icon: "database" },
    ]));

    // The two are different drawings, so they read as different names — and the
    // bare one is the glyph's, matching what place_shape("database") makes.
    expect(digest).toContain('  legacy database-shape "Orders"');
    expect(digest).toContain('  glyph database "Store"');
  });

  test("a swap reports one folded channel on both sides", () => {
    const before = makeDocument([box("step", 0, 0, 160, 96, "rectangle")]);
    const after = makeDocument([
      { ...box("step", 0, 0, 160, 96, "icon"), icon: "cloud" },
    ]);

    const delta = documentDelta(before, after);

    expect(delta.lines).toContain("step  type rectangle → cloud");
    expect(delta.lines.join("\n")).not.toContain("icon");
  });
});

describe("change_shape speaks the same names", () => {
  test("swapping to database yields the icon, not the flowchart shape", () => {
    const document = boardWithFrame();
    document.objects.push({
      ...box("step", 200, 200, 160, 96, "rectangle"),
      text: "Step",
    } as InteractiveCanvasObject);
    const session = makeTestSession(document, ["frame"]);

    const result = runOp(session, "change_shape", { id: "step", patch: { type: "database" } });

    expect(result.isError).toBeUndefined();
    expect(objectOf(session, "step").type).toBe("icon");
    expect(objectOf(session, "step").icon).toBe("database");
    expect(result.text).toContain("step  type rectangle → database");
  });

  test("swapping AWAY from a legacy database shape still works", () => {
    const document = boardWithFrame();
    document.objects.push({
      ...box("legacy", 200, 200, 160, 96, "database"),
      text: "Orders",
    } as InteractiveCanvasObject);
    const session = makeTestSession(document, ["frame"]);

    const result = runOp(session, "change_shape", { id: "legacy", patch: { type: "ellipse" } });

    expect(result.isError).toBeUndefined();
    expect(objectOf(session, "legacy").type).toBe("ellipse");
    expect(result.text).toContain("legacy  type database-shape → ellipse");
  });
});

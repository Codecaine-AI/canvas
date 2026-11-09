import { describe, expect, test } from "bun:test";

import { FINISHING_RULES } from "../../board/lints";
import { runDiagnostics } from "../../board/lints/run";
import { createInteractiveCanvasState, reduceInteractiveCanvasState } from "../../state/actions";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";
import { box, connect, makeDocument } from "./synthetic";

/** The blocking integrity findings the finalize gate would see. */
function integrity(document: InteractiveCanvasDocument) {
  return runDiagnostics(document, FINISHING_RULES).filter((finding) => finding.rule === "integrity");
}

const LONG = "Validate the signed webhook payload against the tenant's rotating secret, then hand the verified event to the ledger writer queue";

describe("integrity lint: what bypassed the automatic fixes", () => {
  test("a Studio text edit that overflows a box is one error naming the size to resize to", () => {
    const base = makeDocument([box("a", 0, 0, 160, 80, "process"), box("b", 400, 0, 160, 80, "process")], [connect("ab", "a", "b")]);
    expect(integrity(base)).toEqual([]);
    const edited = reduceInteractiveCanvasState(createInteractiveCanvasState(base), {
      type: "canvas.updateObject", objectId: "a", patch: { text: LONG },
    }).document;
    const findings = integrity(edited);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "error", at: ["a"] });
    expect(findings[0]!.message).toContain("a's text overflows its box");
    expect(findings[0]!.suggestion).toMatch(/^resize a to ≥\d+×\d+$/);
  });

  test("a Studio move whose section grow is blocked leaves one error for the child outside", () => {
    const section = (id: string, x: number, y: number, w: number, h: number, parentId: string | null): InteractiveCanvasObject =>
      ({ ...box(id, x, y, w, h), type: "section", parentId });
    const base = makeDocument([
      { ...section("page", -200, -200, 1600, 1000, null), color: "white" },
      section("a", 0, 0, 400, 300, "page"),
      { ...box("kid", 200, 100, 160, 96, "process"), parentId: "a" },
      // A grow to hold kid would swallow neighbor, so the section refuses it.
      { ...box("neighbor", 420, 220, 100, 60, "process"), text: "n", parentId: "page" },
    ]);
    expect(integrity(base)).toEqual([]);
    const moved = reduceInteractiveCanvasState(createInteractiveCanvasState(base), {
      type: "canvas.updateObject", objectId: "kid", patch: { geometry: { x: 300, y: 100, width: 160, height: 96 } },
    }).document;
    const findings = integrity(moved);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ at: ["kid", "a"], message: "kid extends 60px outside its section a" });
    expect(findings[0]!.suggestion).toContain("move_to kid back inside a");
  });

  test("a Studio move of a sticky onto its other end is one zero-length wire error", () => {
    let state = createInteractiveCanvasState(makeDocument(
      [box("a", 0, 0, 160, 80, "process"), box("note", 400, 0, 160, 80, "sticky")],
      [connect("wire", "a", "note")],
    ));
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObjectGeometries", geometries: { note: { x: 0, y: 0, width: 160, height: 80 } }, snap: false,
    });
    state = reduceInteractiveCanvasState(state, { type: "canvas.reconcileSectionMembership", recordHistory: false });
    const findings = integrity(state.document);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ at: ["wire", "a", "note"], message: "wire has zero length: a and note share one center" });
    expect(findings[0]!.suggestion).toContain("delete wire");
  });

  test("a wire walled in by touching boxes is drawn through one, and that is one error", () => {
    const ring = makeDocument([
      box("inside", 100, 100, 160, 80, "process"),
      box("outside", 600, 100, 160, 80, "process"),
      box("top", 0, 0, 400, 40, "process"),
      box("bottom", 0, 300, 400, 40, "process"),
      box("left", 0, 40, 40, 260, "process"),
      box("right", 360, 40, 40, 260, "process"),
    ].map((object) => ({ ...object, text: "" })), [connect("escape", "inside", "outside")]);
    const findings = integrity(ring);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ at: ["escape", "right"] });
    expect(findings[0]!.message).toBe("wire escape (inside→outside) is drawn through right: no clear route exists");
  });
});

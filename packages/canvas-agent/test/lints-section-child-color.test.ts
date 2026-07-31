import { describe, expect, test } from "bun:test";

import { runDiagnostics } from "../src/board/lints/run";
import { rule as sectionChildColor } from "../src/board/lints/rules/section-child-color";
import { box, makeDocument } from "./synthetic";

/**
 * A chromatic section renders as a wash of its hue, so a direct child stored
 * in the same hue sinks into its own container — a red section must not hold
 * red children. Neutral gray/white pairs are the board's default dress and
 * never fire; the suggestion quotes the object-preference registry when the
 * child has a preferred color to return to.
 */

describe("section-child-color lint", () => {
  test("declares its report-only warning face and quotes the rule in guidance", () => {
    expect(sectionChildColor.id).toBe("section-child-color");
    expect(sectionChildColor.title).toBe("Section-colored children");
    expect(sectionChildColor.tier).toBe("warning");
    expect(sectionChildColor.guidance).toContain("red section must not hold red children");
  });

  test("a red child directly inside a red section warns and quotes the registry", () => {
    const section = { ...box("frame", 0, 0, 480, 360, "section"), color: "red" as const };
    const child = {
      ...box("agent-1", 40, 60, 160, 96, "icon"),
      icon: "agent" as const,
      color: "red" as const,
      parentId: "frame",
    };
    const findings = sectionChildColor.check(makeDocument([section, child]));

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "section-child-color",
      severity: "warning",
      at: ["agent-1", "frame"],
      where: child.geometry,
    });
    expect(findings[0]!.message).toBe(
      "agent-1 is red inside the red section frame — a red section must not hold red children",
    );
    // The registry's preferred color for `agent` is teal, and the suggestion says so.
    expect(findings[0]!.suggestion).toBe("change_color agent-1 — agent's preferred color is teal");
  });

  test("a child of a different hue in the same section is clean", () => {
    const section = { ...box("frame", 0, 0, 480, 360, "section"), color: "red" as const };
    const child = { ...box("node", 40, 60, 160, 96), color: "blue" as const, parentId: "frame" };
    expect(sectionChildColor.check(makeDocument([section, child]))).toEqual([]);
  });

  test("same-neutral pairs never fire — gray on gray is the default dress", () => {
    const gray = { ...box("frame", 0, 0, 480, 360, "section"), color: "gray" as const };
    const grayChild = { ...box("node", 40, 60, 160, 96), color: "gray" as const, parentId: "frame" };
    const white = {
      ...box("frame-2", 600, 0, 480, 360, "section"),
      color: "white" as const,
    };
    const whiteChild = {
      ...box("doc", 640, 60, 160, 96),
      color: "white" as const,
      parentId: "frame-2",
    };
    expect(sectionChildColor.check(makeDocument([gray, grayChild, white, whiteChild]))).toEqual([]);
  });

  test("only DIRECT children are scanned — a matching grandchild belongs to its own frame", () => {
    const outer = { ...box("outer", 0, 0, 640, 480, "section"), color: "teal" as const };
    const inner = {
      ...box("inner", 40, 60, 480, 360, "section"),
      color: "blue" as const,
      parentId: "outer",
    };
    const grandchild = {
      ...box("node", 80, 120, 160, 96),
      color: "teal" as const,
      parentId: "inner",
    };
    expect(sectionChildColor.check(makeDocument([outer, inner, grandchild]))).toEqual([]);
  });

  test("a nested section wearing its parent's hue is itself a finding", () => {
    const outer = { ...box("outer", 0, 0, 640, 480, "section"), color: "teal" as const };
    const inner = {
      ...box("inner", 40, 60, 480, 360, "section"),
      color: "teal" as const,
      parentId: "outer",
    };
    const findings = sectionChildColor.check(makeDocument([outer, inner]));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.at).toEqual(["inner", "outer"]);
  });

  test("the default diagnostics roster carries the rule", () => {
    const section = { ...box("frame", 0, 0, 480, 360, "section"), color: "green" as const };
    const child = { ...box("node", 40, 60, 160, 96), color: "green" as const, parentId: "frame" };
    const findings = runDiagnostics(makeDocument([section, child]));

    expect(findings).toContainEqual(expect.objectContaining({
      rule: "section-child-color",
      at: ["node", "frame"],
    }));
  });
});

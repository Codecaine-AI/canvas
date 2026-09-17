import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FINISHING_RULES, LAYOUT_RULES } from "../src/board/lints";

const promptDir = join(import.meta.dir, "../src/catalog/layout-editor/prompt");
const prompt = JSON.parse(readFileSync(join(promptDir, "prompt.json"), "utf8"));
const rendered = readFileSync(join(promptDir, "system.md"), "utf8");
const nodes: any[] = [];
function walk(value: any): void {
  if (Array.isArray(value)) value.forEach(walk);
  else if (value && typeof value === "object") {
    if (value.type) nodes.push(value);
    Object.values(value).forEach(walk);
  }
}
walk(prompt);
const content = (id: string): string => nodes.find(node => node.id === id)?.content?.join("") ?? "";

describe("layout-editor prompt contract", () => {
  test("keeps workflow and tool cap separate from injected grammar and style", () => {
    expect(prompt.nodes.map((node: any) => node.tag)).toEqual(["purpose", "state_structure", "workflow", "rules"]);
    expect(nodes.filter(node => node.type === "contextUsage")).toEqual([]);
    expect(nodes.filter(node => node.tag === "phase").map(node => node.attrs.name)).toEqual(["orientate", "plan", "build", "verify_diagram", "finalize"]);
    expect(nodes.filter(node => node.type === "variable").map(node => node.name)).toContain("toolCallCap");
  });

  test("names the actual state fields without inlining their grammar", () => {
    const fields = nodes.filter(node => node.type === "listItem" && /^<\w+>$/.test(node.content?.join(""))).map(node => node.content[0]);
    expect(fields).toEqual(["<instruction>", "<board>", "<diff>", "<lints>", "<recent_ops>", "<requests>", "<views>", "<recent_conversation>"]);
  });

  test("plans relationships before provisional outlines and local detail", () => {
    expect(content("node-phase-plan-step-skeleton")).toMatch(/actors.*ownership.*main flow.*branches.*shared stores.*loops/);
    expect(content("node-phase-build-step-sections-first")).toContain("initial region outlines before filling details");
    expect(content("node-phase-build-step-sections-first")).toContain("without requiring every final section");
    expect(content("node-phase-build-step-connections")).toContain("As endpoints appear");
    expect(content("node-phase-build-step-sections-first-detail-2")).toContain("page-level");
  });

  test("makes semantic color and geometry actionable before route steering", () => {
    expect(content("node-phase-plan-step-vocabulary-detail-2")).toContain("consistent roles or functions");
    expect(content("node-phase-build-step-sections-first-detail-1")).toContain("change_color");
    expect(content("node-phase-plan-step-reading-flow-detail-1")).toContain("align directly connected endpoints");
    expect(content("node-phase-build-step-connections")).toContain("connect the actual participants");
    expect(content("node-phase-qa-step-wires-detail-2")).toContain("before steering the wire");
    expect(content("node-phase-qa-step-wires-detail-3")).toContain("Keep bends");
  });

  test("keeps explanatory depth while requiring drawable structure", () => {
    expect(content("node-build-constraint-labels")).toMatch(/rationale.*constraints.*examples.*operational detail/);
    expect(content("node-build-constraint-labels")).toContain("without replacing drawable structure");
    expect(content("node-phase-build-step-fill-sections-detail-1")).toMatch(/parallel work.*decisions.*stores.*handoffs.*failure or recovery/);
    expect(content("node-phase-qa-step-wires")).toContain("without relying on explanatory notes");
  });

  test("recomposes the main graph before final crop and repeats QA from state", () => {
    const steps = nodes.find(node => node.id === "node-phase-build-steps-list").items.map((node: any) => node.id);
    expect(steps.indexOf("node-phase-build-step-recompose")).toBeGreaterThan(steps.indexOf("node-phase-build-step-connections"));
    expect(content("node-phase-build-step-recompose-detail-1")).toContain("page aspect ratio");
    expect(content("node-build-constraint-style")).toContain("without scaling labels down");
    expect(content("node-phase-qa-step-final-crop")).toContain("only after the paths and labels are readable");
    expect(content("node-phase-qa-step-fix-and-look-detail-1")).toMatch(/Loop to step 1 until.*<views>.*<board>.*<instruction>/);
  });

  test("chooses semantic peers and exposes causal handoffs", () => {
    expect(content("node-phase-plan-step-vocabulary")).toMatch(/participants.*actions.*decisions.*stores.*artifacts/);
    expect(content("node-phase-build-step-fill-sections-detail-2")).toContain("clone only semantic peers");
    expect(content("node-phase-build-step-connections-detail-1")).toMatch(/producer.*recipient.*payload or trigger.*direction/);
    expect(content("node-phase-build-step-connections-detail-2")).toContain("explicit store and control relationships");
    expect(content("node-phase-qa-step-wires")).toContain("normal, failure, and feedback paths separately");
  });

  test("does not mandate a panel grid or node quota", () => {
    for (const retired of ["around twenty sections", "place every section the diagram needs before any content", "Distribute content evenly", "2–3 nodes", "15% ink"]) {
      expect(JSON.stringify(prompt)).not.toContain(retired);
    }
    expect(content("node-phase-qa-step-sections-detail-2")).toContain("real peers");
  });

  test("generated snapshot contains every authored plain content node", () => {
    for (const node of nodes.filter(node => Array.isArray(node.content) && node.content.every((part: unknown) => typeof part === "string"))) {
      expect(rendered, node.id).toContain(node.content.join("").replaceAll("<", "&lt;").replaceAll(">", "&gt;"));
    }
  });

  test("physical diagnostics block both stages; categorical hue does not", () => {
    for (const rules of [LAYOUT_RULES, FINISHING_RULES]) {
      const ids = rules.map(rule => rule.id);
      for (const physical of ["covered-content", "containment", "broken-edges", "unreadable-labels", "clipped-text", "crowding"]) expect(ids).toContain(physical);
      expect(ids).not.toContain("section-child-color");
    }
    expect(FINISHING_RULES.map(rule => rule.id)).toContain("frame-slack");
    expect(content("node-finalize-constraint-lints")).toContain("edited scope");
  });
});

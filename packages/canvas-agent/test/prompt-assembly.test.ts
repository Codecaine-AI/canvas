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
const content = (id: string): string => {
  const root = nodes.find(node => node.id === id);
  const collect = (value: any): string => {
    if (!value || typeof value !== "object") return "";
    const own = Array.isArray(value.content)
      ? value.content.map((part: any) => typeof part === "string" ? part : part?.name ?? "").join("")
      : "";
    const children = Array.isArray(value.children) ? value.children.map(collect).join("") : "";
    const items = Array.isArray(value.items) ? value.items.map(collect).join("") : "";
    return own + children + items;
  };
  return collect(root);
};

describe("layout-editor prompt contract", () => {
  test("keeps workflow separate from injected grammar and style", () => {
    expect(prompt.nodes.filter((node: any) => node.type === "section").map((node: any) => node.tag)).toEqual(["purpose", "state_structure", "core_philosophy", "workflow", "success_criteria", "quality_checklist"]);
    expect(nodes.filter(node => node.type === "contextUsage")).toEqual([]);
  });

  test("behavior is split into explicit workflow phases", () => {
    expect(nodes.filter(node => node.tag === "phase").map(node => node.attrs.name)).toEqual(["orient_and_assess", "design_and_plan", "adaptively_build", "review_and_finalize"]);
    const firstPhase = nodes.find(node => node.tag === "phase" && node.attrs.name === "orient_and_assess");
    expect(firstPhase.children.filter((node: any) => node.tag === "sub_phase").map((node: any) => node.attrs.name)).toEqual(["orient", "assess_depth"]);
    expect(content("node-phase-assess-depth-objective-text")).toBe("Before designing, determine what level of detail this diagram needs:");
    expect(content("node-depth-evidence-intro")).toBe("For technical diagrams, you MUST include evidence artifacts (see below).");
    expect(content("node-subphase-understand-deeply")).toContain("What does this concept DO");
    expect(content("node-subphase-map-concepts-to-patterns")).toContain("Visual Pattern Library");
    const research = nodes.find(node => node.tag === "sub_phase" && node.attrs.name === "technical_research");
    expect(research.children.some((node: any) => node.tag === "condition")).toBe(true);
    expect(content(research.id)).toContain("protocol, API, framework");
  });

  test("build is incremental and adapts the plan after inspection", () => {
    const build = content("node-subphase-build-section");
    expect(build).toContain("Perform the next Canvas action, respecting the tool-call limit");
    expect(build).toContain("Read the result and inspect the refreshed board state");
    expect(build).toContain("cross-section connections as their endpoint objects become available");
    expect(content("node-subphase-adapt-the-plan")).toContain("Recheck earlier sections and connections affected by the change");
  });

  test("render validation combines visual review and lint evidence", () => {
    const verify = content("node-subphase-render-and-validate-section");
    expect(verify).toContain("compare the rendered result to what you designed");
    expect(verify).toContain("Inspect <lints> for findings");
    expect(verify).toContain("A clean lint report does not replace visual inspection");
    expect(verify).toContain("Fix what you found and repeat the visual and lint checks");
    expect(verify).toContain("If a current render is unavailable, do not mark the section visually verified");
  });

  test("final review requires quality checks and truthful request outcomes", () => {
    expect(content("node-phase-review-and-finalize")).toContain("Proceed to finalize only when the final quality pass is complete");
    expect(content("node-subphase-finalize")).toContain("Confirm the description and request outcomes match the result");
    expect(content("node-section-success-criteria")).toContain("every user-authored request is resolved with a truthful completion or decline note");
  });

  test("separates completion requirements from Canvas quality checks", () => {
    const checklist = prompt.nodes.find((node: any) => node.id === "node-section-quality-checklist");
    const success = prompt.nodes.find((node: any) => node.id === "node-section-success-criteria");
    expect(checklist?.tag).toBe("quality_checklist");
    expect(success?.tag).toBe("success_criteria");
    const serialized = JSON.stringify(checklist);
    expect(serialized).toContain("Visual defects and lint evidence");
    expect(serialized).toContain("A clean lint report is not proof of a good explanation");
    expect(serialized).toContain("Markdown stickies");
    for (const unsupported of ["fontFamily", "roughness", "opacity", "free-floating text"]) expect(serialized).not.toContain(unsupported);
    expect(JSON.stringify(success)).toContain("No error or warning remains in the edited scope");
    expect(content("node-apply-quality-checklist-steps-list")).toContain("<quality_checklist>");
  });

  test("does not mandate a panel grid or node quota", () => {
    for (const retired of ["around twenty sections", "place every section the diagram needs before any content", "Distribute content evenly", "2–3 nodes", "15% ink"]) {
      expect(JSON.stringify(prompt)).not.toContain(retired);
    }
  });

  test("generated snapshot contains every authored plain content node", () => {
    for (const node of nodes.filter(node => Array.isArray(node.content) && node.content.every((part: unknown) => typeof part === "string"))) {
      expect(rendered, node.id).toContain(node.content.join("").trim().replaceAll("<", "&lt;").replaceAll(">", "&gt;"));
    }
  });

  test("physical diagnostics block both stages; categorical hue does not", () => {
    for (const rules of [LAYOUT_RULES, FINISHING_RULES]) {
      const ids = rules.map(rule => rule.id);
      for (const physical of ["covered-content", "containment", "broken-edges", "unreadable-labels", "clipped-text", "crowding"]) expect(ids).toContain(physical);
      expect(ids).not.toContain("section-child-color");
    }
    expect(FINISHING_RULES.map(rule => rule.id)).toContain("frame-slack");
    expect(content("node-section-success-criteria")).toContain("edited scope");
  });
});

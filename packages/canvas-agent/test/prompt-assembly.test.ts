/**
 * Prompt shape gate: the static prompt contains only the editor identity,
 * board taxonomy/composition doctrine, compact taste, real working loop, and
 * native editing channels. Craft detail arrives through <style_guide> and
 * live perception through the four context blocks.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { LAYOUT_RULES } from "../src/board/lints";

const CATALOG_DIR = join(
  import.meta.dir,
  "..",
  "src",
  "agent",
  "catalog",
  "layout-editor",
);
const PROMPT_FILE = join(CATALOG_DIR, "prompt.json");

interface PromptNode {
  type: string;
  tag?: string;
  contextId?: string;
  [key: string]: unknown;
}

function readPrompt(): { raw: string; nodes: PromptNode[]; text: string } {
  const raw = readFileSync(PROMPT_FILE, "utf8");
  const document = JSON.parse(raw) as { nodes: PromptNode[] };
  const strings: string[] = [];
  const collect = (value: unknown, key?: string): void => {
    if (typeof value === "string") {
      if (key === "content") strings.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) collect(item, key);
      return;
    }
    if (value && typeof value === "object") {
      for (const [childKey, child] of Object.entries(value)) collect(child, childKey);
    }
  };
  collect(document);
  return { raw, nodes: document.nodes, text: strings.join("\n") };
}

describe("layout-editor prompt", () => {
  test("the always-on registry is the four graph lints", () => {
    expect(LAYOUT_RULES.map((rule) => rule.id)).toEqual([
      "covered-content",
      "containment",
      "broken-edges",
      "unreadable-labels",
    ]);
  });

  test("ships exactly the five static prompt sections", () => {
    const { nodes } = readPrompt();
    expect(
      nodes
        .filter((node) => node.type === "section")
        .map((node) => node.tag),
    ).toEqual([
      "purpose",
      "board_model",
      "core_taste",
      "working_loop",
      "channels",
    ]);
  });

  test("contains none of the deleted prompt machinery", () => {
    const { raw } = readPrompt();
    for (const term of [
      "layout_guidance",
      "legacy_tools",
      "fit_scope",
      "solve_layout",
      "propose_program",
      "addAnnotation",
      "removeAnnotation",
      "fitSectionToChildren",
    ]) {
      expect(raw.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });

  test("pins the taxonomy and sections-first composition doctrine", () => {
    const { text } = readPrompt();
    expect(text).toContain("Sections are the only containers");
    expect(text).toContain("SECTIONS FIRST");
    expect(text).toContain("nothing is ever section-less");
    expect(text).toContain("root section locked as background");
    expect(text).toContain("Stickies are ordinary board objects");
    expect(text).toContain("Annotations are user comments and requests addressed to you");
    expect(text).toContain("you cannot create, update, or delete annotations");
    expect(text).toContain("annotation-marker is a placeable object type");
    expect(text).toContain("Chips and labels are not standalone objects");
  });

  test("pins the direct-edit loop and automatic section fit", () => {
    const { text } = readPrompt();
    expect(text).toContain("section skeleton first");
    expect(text).toContain("Section sizes follow changed children automatically");
    expect(text).toContain("DELTA, lint delta, and any returned close-up crop");
    expect(text).toContain("board whenever you need the current full digest");
    expect(text).toContain("Fix every E* error");
  });

  test("pins the six apply_ops operations", () => {
    const { text } = readPrompt();
    expect(text).toContain(
      "addObject, updateObject, removeObject, addConnection, updateConnection, and removeConnection",
    );
  });

  test("teaches true connection routing and steering", () => {
    const { text } = readPrompt();
    expect(text).toContain("Connectors route automatically");
    expect(text).toContain("steer them with from/to.anchor and waypoints");
    expect(text).toContain(
      "inspect a connection before and after adjusting to see its actual routed path",
    );
  });

  test("declares all four context policies in loader order", () => {
    const { nodes, text } = readPrompt();
    expect(
      nodes
        .filter((node) => node.type === "contextUsage")
        .map((node) => node.contextId),
    ).toEqual([
      "layoutEditorContext",
      "userRequestsContext",
      "styleGuideContext",
      "boardStateContext",
    ]);
    expect(text).toContain("queue of user comments and requests");
    expect(text).toContain("concatenates every registered craft topic in order");
    expect(text).toContain("full board digest plus the lint report captured at spawn");
  });

  test("describes the nested lossless digest and routes annotations to user_requests", () => {
    const { text } = readPrompt();
    expect(text).toContain("indentation is containment");
    expect(text).toContain("appearing only when present");
    expect(text).toContain("Read them in the user_requests block");
    expect(text).toContain("they never appear in the board digest");
    expect(text).not.toContain("USER ANNOTATIONS (READ-ONLY)");
    expect(text).not.toContain("invoke-time annotations");
  });
});

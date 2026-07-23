/**
 * Prompt gate — v5 Phase-B form.
 *
 * Phase B deleted the generated <layout_guidance> wall from the committed
 * prompt (v5-plan §1 Tier C): style craft now arrives through the
 * styleGuideContext loader, the spawn board snapshot through
 * boardStateContext, and the prompt keeps only identity + core taste +
 * loop. This gate pins that shape:
 *  - the always-on registry is the five Tier-A graph lints;
 *  - prompt.json has NO layout_guidance section and a core_taste section;
 *  - all three contextUsage nodes are present;
 *  - prompt.json is canonical and prompt.rendered.md is its exact
 *    kernel-renderer snapshot (drift gate).
 * scripts/assemble-prompt.ts is orphaned (its guidance section no longer
 * exists) and is Phase D's to delete.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { canonicalizePrompt, renderXmlMarkdown } from "@codecaine-ai/prompt-kit";
import type { PromptDocument } from "@codecaine-ai/prompt-kit";

import { LAYOUT_RULES } from "../src/rules/index";

const CATALOG_DIR = join(
  import.meta.dir,
  "..",
  "src",
  "harness",
  "agent-catalog",
  "layout-editor",
);
const PROMPT_FILE = join(CATALOG_DIR, "prompt.json");
const RENDERED_FILE = join(CATALOG_DIR, "prompt.rendered.md");

const RENDERED_SNAPSHOT_HEADER =
  "<!-- derived from prompt.json — do not edit. regenerate: bun run scripts/render-prompts-to-json.ts -->\n\n";

interface PromptNode {
  type: string;
  tag?: string;
  contextId?: string;
}

function readPrompt(): { raw: string; nodes: PromptNode[]; document: PromptDocument } {
  const raw = readFileSync(PROMPT_FILE, "utf8");
  const document = JSON.parse(raw) as PromptDocument & { nodes: PromptNode[] };
  return { raw, nodes: document.nodes, document };
}

describe("layout-editor prompt (v5 Phase B)", () => {
  test("the always-on registry is the five Tier-A graph lints", () => {
    expect(LAYOUT_RULES.map((rule) => rule.id)).toEqual([
      "covered-content",
      "containment",
      "broken-edges",
      "unreadable-labels",
      "frame-balance",
    ]);
  });

  test("the layout_guidance wall is gone", () => {
    const { raw, nodes } = readPrompt();
    expect(
      nodes.some((node) => node.type === "section" && node.tag === "layout_guidance"),
    ).toBe(false);
    expect(raw).not.toContain("layout_guidance");
    expect(readFileSync(RENDERED_FILE, "utf8")).not.toContain("<layout_guidance>");
  });

  test("a core_taste section replaces it", () => {
    const { nodes } = readPrompt();
    expect(
      nodes.some((node) => node.type === "section" && node.tag === "core_taste"),
    ).toBe(true);
    const rendered = readFileSync(RENDERED_FILE, "utf8");
    expect(rendered).toContain("<core_taste>");
    expect(rendered).toContain("consult its style_guide topic");
  });

  test("board_model names the spawn board_state block and the style_guide home", () => {
    const rendered = readFileSync(RENDERED_FILE, "utf8");
    expect(rendered).toContain("board_state block");
    expect(rendered).toContain("style_guide block");
  });

  test("all three contextUsage nodes are declared", () => {
    const { nodes } = readPrompt();
    const usageIds = nodes
      .filter((node) => node.type === "contextUsage")
      .map((node) => node.contextId);
    expect(usageIds).toEqual([
      "layoutEditorContext",
      "styleGuideContext",
      "boardStateContext",
    ]);
    const rendered = readFileSync(RENDERED_FILE, "utf8");
    for (const id of usageIds) {
      expect(rendered).toContain(`context_id="${id}"`);
    }
  });

  test("prompt.json is canonical and prompt.rendered.md is its exact snapshot", () => {
    const { raw, document } = readPrompt();
    expect(canonicalizePrompt(document)).toBe(raw);

    const body = renderXmlMarkdown(document);
    const snapshot = `${RENDERED_SNAPSHOT_HEADER}${body.endsWith("\n") ? body : `${body}\n`}`;
    expect(readFileSync(RENDERED_FILE, "utf8")).toBe(snapshot);
  });
});

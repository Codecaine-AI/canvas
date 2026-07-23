/**
 * Layout-editor prompt assembly (v4 diagnostic layout, design §3b).
 *
 * Regenerates the `<layout_guidance>` section of
 * src/harness/agent-catalog/layout-editor/prompt.json from the live rules
 * registry (src/rules/index.ts LAYOUT_RULES): each rule contributes its title
 * as a heading line — error-tier rules marked "(hard error — blocks commit)" —
 * followed by its guidance prose, in registry order. Every other prompt
 * section is authored by hand in prompt.json; this script never touches them.
 *
 * The two catalog files are then rewritten exactly the way the kernel's
 * catalog save path (lab save, @agent-kernel/kernel catalog-service) writes
 * them, so a later lab save produces zero churn:
 *   prompt.json          <- canonicalizePrompt(document)      (prompt-kit)
 *   prompt.rendered.md   <- snapshot header + renderXmlMarkdown(document)
 *
 * Deterministic and idempotent: generated nodes carry stable ids derived from
 * rule ids, so running the script twice yields byte-identical files.
 *
 * Run it after ANY rule registry change (new rule, edited guidance, reorder):
 *
 *   bun scripts/assemble-prompt.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  canonicalizePrompt,
  renderXmlMarkdown,
  validatePrompt,
} from "@codecaine-ai/prompt-kit";
import type { PromptDocument } from "@codecaine-ai/prompt-kit";

import { LAYOUT_RULES } from "../src/rules/index";
import type { LayoutRule } from "../src/rules/index";

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
const MANIFEST_FILE = join(CATALOG_DIR, "agent.json");

/**
 * Must stay byte-identical to RENDERED_SNAPSHOT_HEADER in
 * @agent-kernel/kernel's catalog-service (the lab-save path), so both writers
 * produce the same prompt.rendered.md.
 */
const RENDERED_SNAPSHOT_HEADER =
  "<!-- derived from prompt.json — do not edit. regenerate: bun run scripts/render-prompts-to-json.ts -->\n\n";

const GUIDANCE_SECTION_TAG = "layout_guidance";
const ERROR_TIER_MARKER = "(hard error — blocks commit)";

/** Collapse a rule's multi-line guidance prose into one flowing line. */
function flattenGuidance(guidance: string): string {
  return guidance
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" ");
}

/** Heading line for one rule: title, tier marker for errors. */
function ruleHeading(rule: LayoutRule): string {
  return rule.tier === "error" ? `${rule.title} ${ERROR_TIER_MARKER}` : rule.title;
}

/**
 * The generated children of `<layout_guidance>`: a fixed framing paragraph,
 * then one field node per registered rule (heading line + indented guidance
 * paragraph). Node ids derive from rule ids so regeneration is stable.
 */
function buildGuidanceChildren(rules: readonly LayoutRule[]): unknown[] {
  const intro = {
    type: "paragraph",
    id: "node-guidance-intro",
    content: [
      "Generally how boards should be laid out. These are defaults, not laws — deviate when the diagram calls for it, and say so. Respect reading order and expected grouping: related objects stay together. Each guideline has a matching diagnostic, so drift shows up in the board digest as an E* error or W* warning under the same name.",
    ],
  };

  const ruleNodes = rules.map((rule) => ({
    type: "field",
    id: `node-guidance-${rule.id}`,
    label: ruleHeading(rule),
    value: [],
    children: [
      {
        type: "paragraph",
        id: `node-guidance-${rule.id}-text`,
        content: [flattenGuidance(rule.guidance)],
      },
    ],
  }));

  return [intro, ...ruleNodes];
}

/** Replace the guidance section's children in-place; throws if it is missing. */
export function assembleGuidance(
  document: PromptDocument,
  rules: readonly LayoutRule[],
): PromptDocument {
  const nodes = (document as unknown as { nodes: Array<Record<string, unknown>> }).nodes;
  const section = nodes.find(
    (node) => node.type === "section" && node.tag === GUIDANCE_SECTION_TAG,
  );
  if (!section) {
    throw new Error(
      `assemble-prompt: prompt.json has no <${GUIDANCE_SECTION_TAG}> section to regenerate.`,
    );
  }
  section.children = buildGuidanceChildren(rules);
  return document;
}

function main() {
  const document = JSON.parse(readFileSync(PROMPT_FILE, "utf8")) as PromptDocument;
  const manifest = JSON.parse(readFileSync(MANIFEST_FILE, "utf8")) as {
    variables?: Record<string, unknown>;
  };

  assembleGuidance(document, LAYOUT_RULES);

  // The same validation gate the kernel registry applies at boot/lab-save:
  // a document this script writes is one the next harness boot accepts.
  const validation = validatePrompt(document, {
    declaredVariables: Object.keys(manifest.variables ?? {}),
  });
  const errors = validation.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`assemble-prompt: ${error.code}: ${error.message}`);
    }
    process.exit(1);
  }

  const canonical = canonicalizePrompt(document);
  const body = renderXmlMarkdown(document);
  const snapshot = `${RENDERED_SNAPSHOT_HEADER}${body.endsWith("\n") ? body : `${body}\n`}`;

  writeFileSync(PROMPT_FILE, canonical, "utf8");
  writeFileSync(RENDERED_FILE, snapshot, "utf8");

  console.log(
    `assemble-prompt: wrote <${GUIDANCE_SECTION_TAG}> from ${LAYOUT_RULES.length} registered rule(s): ` +
      LAYOUT_RULES.map((rule) => rule.id).join(", "),
  );
  console.log(`assemble-prompt: ${PROMPT_FILE}`);
  console.log(`assemble-prompt: ${RENDERED_FILE}`);
}

if (import.meta.main) {
  main();
}

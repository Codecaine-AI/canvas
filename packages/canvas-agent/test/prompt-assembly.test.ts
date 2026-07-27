/**
 * Prompt shape gate: the static prompt contains only the editor identity,
 * the six non-negotiable rules, the board world model, the canonical
 * state-text grammar and render-delivery contract, the five-phase workflow,
 * and the closing reminders. Vocabulary rosters arrive through
 * <capabilities>, craft detail through <style_guide>, tool mechanics through
 * the tool descriptions, and live perception through operation results and
 * deliberate whole-board looks.
 *
 * Shape is part of the contract: each block of board state is its own
 * delimited subsection of the grammar, and every bullet and step carries one
 * sentence with its qualifications nested beneath it.
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

function sectionByTag(nodes: PromptNode[], tag: string): PromptNode | undefined {
  return nodes.find((node) => node.type === "section" && node.tag === tag);
}

/** Every listItem in the tree, as { id, text } pairs. */
function listItems(root: unknown): { id: string; text: string }[] {
  const found: { id: string; text: string }[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    const node = value as PromptNode;
    if (node.type === "listItem") {
      const content = Array.isArray(node.content) ? node.content : [];
      found.push({
        id: String(node.id ?? "(unnamed)"),
        text: content.filter((part): part is string => typeof part === "string").join(""),
      });
    }
    for (const child of Object.values(node)) walk(child);
  };
  walk(root);
  return found;
}

describe("layout-editor prompt", () => {
  test("the always-on registry is the five graph lints", () => {
    expect(LAYOUT_RULES.map((rule) => rule.id)).toEqual([
      "covered-content",
      "containment",
      "broken-edges",
      "unreadable-labels",
      "crowding",
    ]);
  });

  test("ships exactly the four static prompt sections", () => {
    const { nodes } = readPrompt();
    expect(
      nodes
        .filter((node) => node.type === "section")
        .map((node) => node.tag),
    ).toEqual([
      "purpose",
      "board_model",
      "state_grammar",
      "workflow",
    ]);
  });

  test("declares no contextUsage nodes", () => {
    const { nodes } = readPrompt();
    expect(nodes.filter((node) => node.type === "contextUsage")).toEqual([]);
  });

  test("keeps out-of-surface terms out of the prompt", () => {
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
      "render_draft",
      "apply_quickfix",
      "quickfix",
      "inspect",
      "abandon",
      "core_taste",
      "channels",
      "context_policy",
      "contextUsage",
      "working_loop",
      "STUDY FIRST",
      "apply_ops",
      "all-or-nothing",
      "batch",
      "suggested op",
    ]) {
      expect(raw.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });

  test("every bullet and step carries a single sentence", () => {
    const { nodes } = readPrompt();
    for (const item of listItems(nodes)) {
      expect(item.text, `${item.id} packs more than one sentence`).not.toMatch(
        /[.!?]"?\s+[A-Z`]/,
      );
    }
  });

  test("pins the identity, instruction channel, and draft framing", () => {
    const { text } = readPrompt();
    expect(text).toContain("full board editor for a shared whiteboard");
    expect(text).toContain("their instruction arrives as the message that follows your context blocks");
    expect(text).toContain("Open entries in the user_requests block are part of that instruction");
    expect(text).toContain("Your edits build a draft, not the live board");
    expect(text).toContain("outcome committed presents that draft to the operator for review");
  });

  test("places every rule in its governing phase", () => {
    const { text } = readPrompt();
    expect(text).toContain("fit_section when you want it closed around the children");
    expect(text).toContain("Do not rearrange what the request did not ask you to touch");
    expect(text).toContain("Draw every type, color, and glyph from the capabilities rosters");
    expect(text).toContain("Types and colors outside them are rejected");
    expect(text).toContain("An unknown glyph silently degrades the icon");
    expect(text).toContain("Judge from your latest `look`");
    expect(text).toContain("never from memory of an older turn");
    expect(text).toContain(
      "A request is answered by editing board content, never by editing the request",
    );
    expect(text).toContain("Every one is disposed with resolve_request");
  });

  test("keeps craft numbers out of the prompt, in judgment language", () => {
    const { text } = readPrompt();
    expect(text).not.toMatch(/\b(288|224|144|160|96|80|48)\b/);
    expect(text).not.toContain("15% ink");
    expect(text).not.toContain("2–3 nodes");
    expect(text).toContain("around twenty sections, not five");
    expect(text).toContain(
      "The style guide's sizes and gaps are targets, not minimums to shave toward",
    );
    expect(text).toContain("the style guide's targets are what uniform means");
    expect(text).toContain("the gutters and frame padding the style guide targets");
    expect(text).toContain("the style guide's board-size target");
    expect(text).toContain("Judge spacing against the style guide's targets");
  });

  test("pins the board taxonomy and containment invariant", () => {
    const { text } = readPrompt();
    expect(text).toContain("Sections are the only containers");
    expect(text).toContain("nothing is ever section-less");
    expect(text).toContain("A fresh board starts with one empty base section");
    expect(text).toContain(
      "Stickies are the note objects; their text renders as simple markdown",
    );
    expect(text).toContain(
      "Objects — shapes and icons — are the placeable diagram nodes",
    );
    expect(text).toContain("Connections are routed wires between objects");
    expect(text).toContain("Annotations are comments anchored to an object");
    expect(text).toContain("add_annotation opens your own thread on an object");
    expect(text).toContain("Annotations never appear in the board digest");
    expect(text).not.toContain("annotation-marker");
    expect(text).toContain("Chips and labels are not standalone objects");
  });

  test("pins the description contract", () => {
    const { text } = readPrompt();
    expect(text).toContain(
      "a short markdown account of what the diagram represents, its pieces, and how it reads",
    );
    expect(text).toContain("update_description replaces it");
    expect(text).toContain("The board description rides in the same block");
    expect(text).toContain("the user's ask is where its first one comes from");
    expect(text).toContain("Update the description with update_description");
  });

  test("pins the diagnostics contract", () => {
    const { text } = readPrompt();
    expect(text).toContain(
      "Five diagnostics run on every edit: covered-content, containment, broken-edges, unreadable-labels, and crowding.",
    );
    expect(text).toContain("A committed finalize runs one more, frame-slack");
    expect(text).toContain("E* errors in your edited scope block a committed finalize");
    expect(text).toContain("name every overridden id in the finalize message");
    expect(text).toContain("A finding names what is wrong and where; the fix is yours to choose");
  });

  test("gives every state block its own delimited subsection, in order", () => {
    const { nodes } = readPrompt();
    const grammar = sectionByTag(nodes, "state_grammar");
    const blocks = (grammar?.children as PromptNode[])
      .filter((child) => child.type === "section" && child.tag === "state_block")
      .map((child) => (child.attrs as { name?: string } | undefined)?.name);
    expect(blocks).toEqual([
      "APPLIED",
      "BOARD digest",
      "DELTA",
      "BOARD DIFF",
      "LINTS",
      "ROUTES",
      "REQUESTS",
      "NO-OP and ERROR",
    ]);
  });

  test("specifies the state-text grammar the agent reads", () => {
    const { text } = readPrompt();
    expect(text).toContain("An indented object tree where indentation is containment");
    expect(text).toContain("Text is never truncated");
    expect(text).toContain("What the operation changed, derived by comparing the documents");
    expect(text).toContain("`look`'s cumulative base→draft change list");
    expect(text).toContain("exact edits a committed finalize will propose");
    expect(text).toContain("An operation returns `LINTS · +new −resolved`");
    expect(text).toContain("through none|ids");
    expect(text).toContain("REQUESTS · k/n disposed");
    expect(text).toContain("`NO-OP · …` when the request was legal and there was nothing to do");
    expect(text).toContain("`ERROR · …` when it was not");
  });

  test("tells the true perception-delivery contract", () => {
    const { text } = readPrompt();
    expect(text).toContain(
      "The board_state context block is the spawn-time snapshot — the digest plus the lint report — and goes stale the moment you edit; from then on `look` is the truth.",
    );
    expect(text).toContain(
      "An operation result is sized to the operation: its APPLIED line, its DELTA, its lint delta, and the digest rows around what it touched.",
    );
    expect(text).toContain(
      "`look` is the step back — the full digest, the cumulative BOARD DIFF, every open finding, ROUTES, REQUESTS, and a full-board render.",
    );
    expect(text).toContain(
      "`look` carries the full-board render; a section close-up arrives on any call that names a view.",
    );
    expect(text).toContain("A failed or missing render is always explained in the result text");
    expect(text).not.toContain("carries the current state");
    expect(text).not.toContain("current full-board render (plus the requested close-up)");
  });

  test("pins the five workflow phases as nested XML in order", () => {
    const { nodes, text } = readPrompt();
    const workflow = sectionByTag(nodes, "workflow");
    const phases = (workflow?.children as PromptNode[]).filter(
      (child) => child.type === "section" && (child as { tag?: string }).tag === "phase",
    ) as { attrs?: { id?: number; name?: string }; children?: PromptNode[] }[];
    expect(phases.length).toBe(5);
    const names = ["orientate", "plan", "build", "qa", "finalize"];
    phases.forEach((phase, index) => {
      expect(phase.attrs?.id).toBe(index + 1);
      expect(phase.attrs?.name).toBe(names[index]);
      const childTags = (phase.children ?? [])
        .filter((child) => child.type === "section")
        .map((child) => (child as { tag?: string }).tag);
      expect(childTags[0]).toBe("objective");
      expect(childTags[1]).toBe("steps");
    });
    expect(text).toContain("Put it down and get it working: sections first");
    expect(text).toContain(
      "The visual pass: once the diagram works and says the right thing, make it look right",
    );
    expect(text).toContain("Merge the instruction and the open requests into one work list");
    expect(text).toContain("That list drives the run");
    expect(text).toContain("the instruction wins");
    expect(text).toContain("Spend a `look` with a view when an area is too dense to read");
    expect(text).toContain(
      "There is no house reading direction to obey; arrows follow the flow you chose.",
    );
    expect(text).toContain("Frames hold the space you give them");
    expect(text).toContain("A refused call changes nothing");
    expect(text).toContain("The error names the tool and the field");
    expect(text).toContain("Every E* in your edited scope is fixed");
    expect(text).toContain("Every surviving W* is named in the message");
    expect(text).toContain("Prefer a useful partial draft over outcome none");
  });

  test("pins the loop framing", () => {
    const { text } = readPrompt();
    expect(text).toContain("The phases run as a loop navigated by state");
    expect(text).toContain("A phase with nothing to do is skipped");
    expect(text).toContain("Committing is Finalize's exit condition, not a phase of its own");
  });

  test("pins the sticky rule", () => {
    const { text } = readPrompt();
    expect(text).toContain("Node text is a label: a few words, one line.");
    expect(text).toContain(
      "The moment it needs a sentence of explanation, the sentence goes on a sticky beside the node.",
    );
  });

  test("pins the annotation-restraint rule", () => {
    const { text } = readPrompt();
    expect(text).toContain("proceed on your best guess");
    expect(text).toContain("The run never waits for an answer");
    expect(text).toContain("is a failure of judgment, not diligence");
  });

  test("routes annotations to user_requests, never the digest", () => {
    const { text } = readPrompt();
    expect(text).toContain("indentation is containment");
    expect(text).toContain("appearing only when present");
    expect(text).toContain("The operator's arrive in the user_requests block");
    expect(text).toContain("never appear in the board digest");
    expect(text).not.toContain("USER ANNOTATIONS (READ-ONLY)");
    expect(text).not.toContain("invoke-time annotations");
  });
});

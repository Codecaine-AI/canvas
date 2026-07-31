/**
 * Prompt shape gate: the static prompt is the purpose, the state skeleton,
 * and the five-phase workflow — operational text only. Board grammar lives in
 * the <state_grammar> context block (test/context-loaders.test.ts is its
 * gate), kind semantics and rosters in <capabilities>, craft detail in
 * <style_guide>, tool mechanics in the tool descriptions, and live perception
 * in the bare-value state blocks and operation results.
 *
 * Shape is part of the contract: the skeleton names every <state> child in
 * artifact order, and every bullet and step carries one sentence with its
 * qualifications nested beneath it.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { LAYOUT_RULES } from "../src/board/lints";

const CATALOG_DIR = join(
  import.meta.dir,
  "..",
  "src",
  "catalog",
  "layout-editor",
);
const PROMPT_FILE = join(CATALOG_DIR, "prompt", "prompt.json");

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
  test("the always-on registry is the seven board lints", () => {
    expect(LAYOUT_RULES.map((rule) => rule.id)).toEqual([
      "covered-content",
      "containment",
      "broken-edges",
      "unreadable-labels",
      "crowding",
      "clipped-text",
      "section-child-color",
    ]);
  });

  test("ships exactly the three static prompt sections", () => {
    const { nodes } = readPrompt();
    expect(
      nodes
        .filter((node) => node.type === "section")
        .map((node) => node.tag),
    ).toEqual([
      "purpose",
      "state_structure",
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
      // The retired CRUD roster. The gesture surface replaced every one of
      // these; fit_section is the only member of the old thirteen that
      // survives, so it is deliberately absent from this list.
      "add_section",
      "update_section",
      "remove_section",
      "add_sticky",
      "update_sticky",
      "remove_sticky",
      "add_object",
      "update_object",
      "remove_object",
      "add_connection",
      "update_connection",
      "remove_connection",
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
    expect(text).toContain("their instruction is the <instruction> block of your state");
    expect(text).toContain(
      "Open entries in the <requests> block of your state are part of that instruction",
    );
    expect(text).toContain("Your edits build a draft, not the live board");
    expect(text).toContain("outcome committed presents that draft to the operator for review");
  });

  test("the skeleton names every state child, in artifact order", () => {
    const { nodes } = readPrompt();
    const structure = sectionByTag(nodes, "state_structure");
    const items = listItems(structure).map((item) => item.text);
    const children = [
      "<instruction>",
      "<board>",
      "<recent_ops>",
      "<diff>",
      "<lints>",
      "<requests>",
      "<views>",
      "<recent_conversation>",
    ];
    const positions = children.map((child) =>
      items.findIndex((item) => item.startsWith(`${child} —`)));
    for (const [index, at] of positions.entries()) {
      expect(at, children[index]).toBeGreaterThanOrEqual(0);
    }
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test("teaches structure and points to the grammar, never the grammar itself", () => {
    const { text } = readPrompt();
    expect(text).toContain(
      "Every request opens with a <state> block re-derived from the live board that instant",
    );
    expect(text).toContain("never a snapshot, and never stale under you");
    expect(text).toContain(
      "The state carries bare values; the grammar for reading every block — line formats, elided defaults, result headers — is the <state_grammar> block of your context.",
    );
    // The grammar itself stays out: no line formats, no legend text.
    expect(text).not.toContain("[k=v…]");
    expect(text).not.toContain("elided defaults:");
    expect(text).not.toContain("─(s0 h y=");
    expect(text).not.toContain('Rn open target — "body"');
    expect(text).not.toContain("`gaps x`");
    expect(text).not.toContain("state_block");
  });

  test("keeps the operational result habits, in judgment language", () => {
    const { text } = readPrompt();
    expect(text).toContain(
      "An operation result is sized to the operation: its APPLIED line, its DELTA, its lint delta, and ROUTES for any wire it moved",
    );
    expect(text).toContain(
      "The numbers in a result are the ones that landed after the grid snap — read them back and compute the next gesture from those.",
    );
    expect(text).toContain(
      "A note under an APPLIED headline is report-only: the edit landed, and nothing was rejected.",
    );
    expect(text).toContain(
      "A NO-OP or ERROR result changes nothing — read the line, fix the call, send it again.",
    );
  });

  test("tells the tool-call cadence with the templated cap", () => {
    const { text } = readPrompt();
    expect(text).toContain("Send at most {{toolCallCap}} tool call(s) in one message.");
    expect(text).not.toContain("Send at most three tool calls in one message.");
    expect(text).toContain(
      "Share a message only among genuinely independent gestures planned from the same board state, with none reading what another writes; an allowance of one simply means every call rides alone.",
    );
    expect(text).toContain(
      "Send one at a time whenever the next gesture depends on a result: sizing or fit work, route work chained from a returned polyline, lint fixes, and anything reacting to a warning.",
    );
    expect(text).toContain(
      "Results for the whole message arrive together, so after the first call moves the board, every remaining call runs from a plan made against a board that no longer exists.",
    );
    expect(text).toContain(
      "`look` and `finalize` each ride alone in their own message: `look` behind edits frames a board the same message is still changing, while `finalize` is the run's last word.",
    );
  });

  test("tells the look contract operationally", () => {
    const { text } = readPrompt();
    expect(text).toContain(
      "`look` is the close-up: it frames exactly one region, named by `view` ids, and returns it rendered and measured — the board itself always arrives with your <state> block, never from `look`.",
    );
    expect(text).toContain("Name the smallest set that answers the question");
    expect(text).toContain(
      "Edit from the small results and the current first image; use `look` when judgment needs a close-up or a measured region.",
    );
    expect(text).toContain(
      "A failed or missing `look` render is explained in its result text; a failed current-board render is explained in <views> — judge from what actually arrived.",
    );
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

  test("places every rule in its governing phase", () => {
    const { text } = readPrompt();
    expect(text).toContain("fit_section when you want it closed around the children");
    expect(text).toContain("Do not rearrange what the request did not ask you to touch");
    expect(text).toContain("Draw every type, color, and glyph from the capabilities rosters");
    expect(text).toContain("Types and colors outside them are rejected");
    expect(text).toContain("An unknown glyph silently degrades the icon");
    expect(text).toContain(
      "Judge the whole board from the first attached current-board render",
    );
    expect(text).toContain("never from memory of an older turn");
    expect(text).toContain(
      "A request is answered by editing board content, never by editing the request",
    );
    expect(text).toContain("Every one is disposed with resolve_request");
  });

  test("teaches bare placement and the deliberate steps after it", () => {
    const { text } = readPrompt();
    expect(text).toContain(
      "A placement carries only what the gesture carries: the pick, the spot, and any text typed in the same motion",
    );
    expect(text).toContain("Size and color come from the creation defaults");
    expect(text).toContain(
      "Everything beyond the default is its own deliberate step afterwards",
    );
  });

  test("teaches a lock as a don't-touch signal", () => {
    const { text } = readPrompt();
    expect(text).toContain("A lock the operator set is a don't-touch signal");
    expect(text).toContain(
      "Locking is a section-level gesture, so one lock covers the frame and everything inside it",
    );
    expect(text).toContain(
      "Work around a locked region unless the request explicitly requires changing what it protects",
    );
  });

  test("names the workflow tools the gesture surface added", () => {
    const { text } = readPrompt();
    expect(text).toContain(
      "Use reply_annotation to add to a thread that is still open, and resolve_request only when you are closing one",
    );
    expect(text).toContain("Rename the board with set_board_title");
    expect(text).toContain("Update the description with update_description");
    expect(text).toContain("Open a thread with add_annotation");
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
    expect(text).toContain(
      "Spend a `look` framing the area when it is too dense to read at full-board scale",
    );
    expect(text).toContain(
      "There is no house reading direction to obey; arrows follow the flow you chose.",
    );
    expect(text).toContain("Frames hold the space you give them");
    expect(text).toContain("A refused call changes nothing");
    expect(text).toContain("The error names the tool and the field");
    expect(text).toContain("Every E* in your edited scope is fixed");
    expect(text).toContain("Every W* in your edited scope is fixed");
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

  test("the retired context blocks stay out of the model's vocabulary", () => {
    const { raw } = readPrompt();
    for (const retired of ["board_state", "editor_state", "user_requests"]) {
      expect(raw, retired).not.toContain(retired);
    }
  });
});

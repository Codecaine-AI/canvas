/**
 * Prompt shape gate: the static prompt contains only the editor identity,
 * the six non-negotiable rules, the board world model, the canonical
 * state-text grammar and render-delivery contract, the five-phase workflow,
 * and the closing reminders. Vocabulary rosters arrive through
 * <capabilities>, craft detail through <style_guide>, tool mechanics through
 * the tool descriptions, and live perception through operation results, the
 * state block's current-board and recent-change renders, and deliberate
 * framed looks preserved in the recent conversation tail.
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
  test("the always-on registry is the six board lints", () => {
    expect(LAYOUT_RULES.map((rule) => rule.id)).toEqual([
      "covered-content",
      "containment",
      "broken-edges",
      "unreadable-labels",
      "crowding",
      "clipped-text",
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

  test("teaches the 20 grid as snap-and-report, not a validation rule", () => {
    const { text } = readPrompt();
    expect(text).toContain("Every geometry number you write lands on a 20 grid");
    expect(text).toContain("rounded to the nearest 20 before they land — snapped, never rejected");
    expect(text).toContain(
      "The result reports the numbers that actually applied, so read them back and compute the next gesture from those",
    );
    expect(text).toContain("Think in twenties");
    // The exempt fields are fractions and metrics, not world coordinates.
    expect(text).toContain("are fractions and measurements rather than grid units");
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
      "reply_annotation says one more thing in a thread that is still open",
    );
    expect(text).toContain("resolve_request is the only call that closes one");
    expect(text).toContain("which set_board_title renames");
    expect(text).toContain("Rename the board with set_board_title");
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
      "Six diagnostics run on every edit: covered-content, containment, broken-edges, unreadable-labels, crowding, and clipped-text.",
    );
    expect(text).toContain("A committed finalize runs one more, frame-slack");
    expect(text).toContain(
      "All findings — E* errors and W* warnings — in your edited scope block a committed finalize and must be fixed.",
    );
    expect(text).toContain(
      "Warnings are not overridable at commit: fix every scoped W* before finalizing.",
    );
    expect(text).toContain(
      "Every open E* or W* in your edited scope blocks a committed finalize, including a frame-slack finding raised at finalize.",
    );
    expect(text).not.toContain("name every overridden id in the finalize message");
    expect(text).toContain("A finding names what is wrong and where; the fix is yours to choose");
  });

  test("gives every state block its own delimited subsection, in order", () => {
    const { nodes } = readPrompt();
    const grammar = sectionByTag(nodes, "state_structure");
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
      "MEASURES",
      "REQUESTS",
      "VIEWS",
      "NO-OP and ERROR",
    ]);
  });

  test("specifies the state-text grammar the agent reads", () => {
    const { text } = readPrompt();
    expect(text).toContain("Three children: <description> is the board description markdown");
    expect(text).toContain("Text is never truncated");
    expect(text).toContain("What the operation changed, derived by comparing the documents");
    expect(text).toContain("The <diff> block's cumulative base→draft change list");
    expect(text).toContain("exact edits a committed finalize will propose");
    expect(text).toContain("An operation returns `LINTS · +new −resolved`");
    expect(text).toContain("through none|ids");
    expect(text).toContain("REQUESTS · k/n disposed");
    // The APPLIED headline is a gesture verb over the geometry that landed.
    expect(text).toContain("`APPLIED · place_shape api-gw 240,480 280×100`");
    expect(text).toContain("The verb is the gesture you performed");
    expect(text).toContain("The numbers are the ones that landed after the grid snap");
    expect(text).toContain("A note under the headline is report-only");
    // ROUTES prints the numbered segments `shift_segment` addresses, and every
    // routing call returns a fresh one so the next shift chains off the result.
    expect(text).toContain(
      "path A ─(s0 h y=240)→ (s1 v x=520) ─(s2 h y=300)→ B",
    );
    expect(text).toContain("`sN` is one straight run of the wire");
    expect(text).toContain("That printed number is exactly what shift_segment writes");
    expect(text).toContain(
      "read it before sending another shift, and never take the next segment numbers from the digest above it",
    );
    // MEASURES is the readout a framed look returns.
    expect(text).toContain("`MEASURES · section home 0,0 480×360`");
    expect(text).toContain("`gaps x` and `gaps y` give the clear corridor");
    expect(text).toContain("`pitch x` and `pitch y` give the repeat between rows and columns");
    expect(text).toContain("`free` gives a framing section's unused margins");
    expect(text).toContain("`NO-OP · …` when the request was legal and there was nothing to do");
    expect(text).toContain("`ERROR · …` when it was not");
  });

  test("tells the true perception-delivery contract", () => {
    const { text, raw } = readPrompt();
    // Section ③ is re-derived per request, with the current board first and
    // recent change history beneath it, so the prompt must not describe a
    // snapshot that ages.
    expect(text).toContain(
      "Every request opens with a <state> block re-derived from the live board that instant",
    );
    expect(text).toContain("can never go stale under you");
    expect(text).toContain("<instruction> the ask, <board> the digest");
    expect(text).toContain(
      "<views> the board as it stands now and the three most recent changes attached beneath it",
    );
    expect(text).toContain(
      "first the board as it stands now, then up to three renders from the changes immediately before the current one",
    );
    expect(text).toContain(
      "newest first and each captioned with the gesture summary that made it",
    );
    expect(text).toContain(
      "If current-board rendering fails after an edit, the block reports the degradation and keeps the previous current-board render",
    );
    expect(text).toContain(
      "`look`'s framed close-ups are returned with the tool result and stay visible in the recent conversation tail",
    );
    expect(text).toContain(
      "An operation result is sized to the operation: its APPLIED line, its DELTA, its lint delta, and ROUTES for any wire it moved",
    );
    expect(text).toContain(
      "Send at most {{toolCallCap}} tool call(s) in one message.",
    );
    expect(text).not.toContain("Send at most three tool calls in one message.");
    expect(text).not.toContain("tool calls in one message");
    // `look` owns close study: one framed region per call, rendered and
    // measured; the board render itself always rides the state block.
    expect(text).toContain(
      "`look` is the close-up — it frames exactly one region and returns that region rendered and measured, alongside the digest, the cumulative base→draft diff, the open findings, the routed truth for every connection, and the request queue",
    );
    expect(text).toContain(
      "the board itself always arrives with your <state> block, never from `look`",
    );
    expect(text).not.toContain("render of the whole board");
    // The one framing knob and the promise the framed region carries.
    expect(text).toContain(
      "One knob frames the region: `view` names one or more section, object, or connection ids",
    );
    expect(text).toContain(
      "a lone section id takes that section close up, and any other set frames the union of everything named",
    );
    expect(text).toContain(
      "Name the smallest set that answers the question",
    );
    expect(text).toContain("it comes back rendered and with its MEASURES block");
    // Framing is look's alone: a mutator's schema carries no `view`.
    expect(text).toContain(
      "Framing is `look`'s alone, since an edit takes no view argument and returns no picture",
    );
    expect(text).not.toContain("arrives on any mutating call that names a view");
    // The state block carries the current board and recent changes while look
    // carries board text and returns framed views for close study.
    expect(text).not.toContain("No board text comes back from `look`");
    expect(text).toContain(
      "The first image attached beneath every <state> block is the board as it stands now, followed by up to three prior change renders; `look` carries the board text with it and returns its framed views and measurements in the tool result for close study",
    );
    expect(text).toContain(
      "Edit from the small results and the current first image; use `look` when judgment needs a close-up or a measured region",
    );
    expect(text).toContain(
      "A failed or missing `look` render is explained in its result text; a failed current-board render is explained in <views>",
    );
    expect(text).not.toContain("carries the current state");
    expect(text).not.toContain("current full-board render (plus the requested close-up)");
    // The three retired context blocks are gone from the model's vocabulary.
    for (const retired of ["board_state", "editor_state", "user_requests"]) {
      expect(raw, retired).not.toContain(retired);
    }
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
    expect(text).not.toContain("Every surviving W* is named in the message");
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

  test("routes annotations to the request queue, never the digest", () => {
    const { text } = readPrompt();
    expect(text).toContain("indentation is containment");
    expect(text).toContain("appearing only when present");
    expect(text).toContain("The operator's arrive in the <requests> block of your state");
    expect(text).toContain("never appear in the board digest");
    expect(text).not.toContain("USER ANNOTATIONS (READ-ONLY)");
    expect(text).not.toContain("invoke-time annotations");
  });
});

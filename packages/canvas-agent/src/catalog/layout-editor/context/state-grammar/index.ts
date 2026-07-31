/**
 * The <state_grammar> context block — the reading key for board state.
 *
 * Section ③ delivers bare values: the <state> children and the tool-result
 * blocks carry no legends and no explanations. This block is where their
 * grammar lives — one concise entry per block, the minimum needed to read it.
 *
 * Two hard rules:
 *
 *   1. Line grammars are QUOTED, never copied. The object/edge grammar and
 *      the route notation are imported from board/digest.ts, and the lint
 *      roster from the lint registry, so the key cannot drift from the lines
 *      the renderers actually emit. (The system prompt's old hand-copied
 *      grammar rotted exactly this way.)
 *   2. Entries are keys, not essays. What a line means and how to read it —
 *      behavioral rules live in the system prompt, kind semantics in
 *      <capabilities>.
 */
import {
  DIGEST_DEFAULTS_LEGEND,
  DIGEST_GRAMMAR,
  DIGEST_ROUTE_LEGEND,
} from "../../../../board/digest";
import { FINISHING_RULES, LAYOUT_RULES } from "../../../../board/lints";

const INDENT = "    ";

/** Wrap flush-left `- ` bullet lines in a tag, body indented one level. */
function tagBlock(tag: string, bullets: readonly string[]): string {
  return [
    `<${tag}>`,
    ...bullets.map((line) => `${INDENT}- ${line}`),
    `</${tag}>`,
  ].join("\n");
}

const HEADER =
  "How board state reads. The <state> block and every tool result carry bare "
  + "values in a fixed grammar — this is the key, one entry per block. Counts "
  + "ride as attributes on the blocks themselves, and an empty block is a "
  + "self-closing tag.";

const ALWAYS_ON_RULES = LAYOUT_RULES.map((rule) => rule.id).join(", ");

const FINISHING_ONLY_RULES = FINISHING_RULES
  .filter((rule) => !LAYOUT_RULES.some((always) => always.id === rule.id))
  .map((rule) => rule.id)
  .join(", ");

const BLOCKS: ReadonlyArray<{ tag: string; bullets: readonly string[] }> = [
  {
    tag: "board",
    bullets: [
      `object line: ${DIGEST_GRAMMAR} — indentation is containment, and the tree runs the base section, then each section's contents`,
      DIGEST_DEFAULTS_LEGEND,
      "object extras appear only when set: locked= · shape= · layout=mode,pad=,gap= · dir= · author= (who placed it)",
      'edge line: id from→to "label" [extras] · route — extras when set: dashed · a color · arrow= · anchors=a→b · pos= · wp= · lp=along[@offset] (the label chip\'s pin)',
      DIGEST_ROUTE_LEGEND,
      "segment indices are never renumbered — take the sN for a shift from the newest printing of that edge, never an older one",
      "text is never truncated: whitespace collapses to single spaces, but every word is there",
      "<description> is the board's own markdown account — the board shows what is there, the description says what it means; update_description replaces it, and set_board_title renames the board",
      "annotation threads never appear in the digest; they are the <requests> queue",
    ],
  },
  {
    tag: "recent_ops",
    bullets: [
      "one line per call this run, newest last: tN tool target detail — the durable ledger; NO-OP and ERROR calls are marked as such",
    ],
  },
  {
    tag: "diff",
    bullets: [
      "the cumulative base→draft change, one line per changed entity: addSection id · updateObject id  moved · recolored · … · removeConnection id",
      "built from the exact edits a committed finalize proposes — it always equals what committing would ship",
    ],
  },
  {
    tag: "lints",
    bullets: [
      "one open finding per line, grouped under <errors> and <warnings> and recomputed every request: E1 rule: what is wrong and where (a suggested fix)",
      "ids are stable only until the draft changes, then they reassign from E1/W1",
      `always-on rules: ${ALWAYS_ON_RULES}; a committed finalize adds ${FINISHING_ONLY_RULES} — is a frame far larger than its children need`,
      "every open E* and W* in your edited scope blocks a committed finalize; the finding names the problem, the fix is yours to choose",
    ],
  },
  {
    tag: "requests",
    bullets: [
      'the operator\'s annotation threads, one line each: Rn open target author — "body" · replies indented as ↳ author — "reply" · Rn done|declined "note" once disposed',
      "answer a thread by editing board content, then dispose it with resolve_request — the disposal note is what the operator sees",
    ],
  },
  {
    tag: "views",
    bullets: [
      "names the attached images in order: (1) the board as it stands now, then up to three prior change renders, newest first, each captioned with the gesture that made it",
      "a failed current-board render is reported here and the previous render is kept",
    ],
  },
  {
    tag: "recent_conversation",
    bullets: [
      "the capped tail of the run's messages; the <state> block above it always carries the current picture, and <recent_ops> the durable history",
    ],
  },
  {
    tag: "results",
    bullets: [
      "APPLIED · gesture target geometry — the headline of a call that changed the draft; the numbers are the ones that landed after the grid snap, so plan the next gesture from them; an indented note beneath is report-only, the edit still landed",
      "DELTA — what the call changed: + id … added · − id removed · id x,y → x,y moved · id x,y w×h → … resized · id field before → after · route a→b → c→d repointed · anchors|pos|wp … → … steered",
      "LINTS · +new −resolved — the findings the call opened, each in prose, and the ids it resolved; · +0 −0 (n open) when nothing changed; · clean when nothing is open either",
      "ROUTES — the routed truth for every wire the call touched: id anchors a→b path A ─(s0 h y=…)→ … B through none|ids; a clean wire crosses nothing, so aim for through none",
      "REQUESTS · none | k/n disposed — the queue after a request-touching call",
      "NO-OP · … the call was legal and there was nothing to do; ERROR · … it was not — read the line, fix the call, send it again",
      "a result is sized to its operation; the standing picture is never restated there, because the next <state> block carries it",
    ],
  },
  {
    tag: "look",
    bullets: [
      "LOOK · n renders [· close-up id] [· framed label] — then the standing truth in one result: the flat digest (BOARD, then EDGES — same line grammar as <board>), BOARD DIFF, DIAGNOSTICS · n errors · m warnings (the full recount), ROUTES for every edge, REQUESTS, and MEASURES for each framed region",
      "MEASURES · region x,y w×h — gaps x|y the clear corridor between each neighbouring pair, named by the two ids · pitch x|y the row/column repeat · free a frame's unused margins per side · ink the share of the region its boxes paint",
      "spacing is read off MEASURES rows, not derived from digest coordinates",
    ],
  },
];

/** The full static <state_grammar> block: the header, then one key per block. */
export function formatStateGrammar(): string {
  return [
    HEADER,
    ...BLOCKS.map(({ tag, bullets }) => tagBlock(tag, bullets)),
  ].join("\n\n");
}

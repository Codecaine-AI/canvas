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

type Bullet = string | { text: string; children: readonly Bullet[] };

function formatBullets(bullets: readonly Bullet[], depth = 1): string[] {
  return bullets.flatMap((bullet) => typeof bullet === "string"
    ? [`${INDENT.repeat(depth)}- ${bullet}`]
    : [
        `${INDENT.repeat(depth)}- ${bullet.text}`,
        ...formatBullets(bullet.children, depth + 1),
      ]);
}

/** Wrap nested bullet lines in a tag, body indented one level. */
function tagBlock(tag: string, bullets: readonly Bullet[]): string {
  return [
    `<${tag}>`,
    ...formatBullets(bullets),
    `</${tag}>`,
  ].join("\n");
}

const HEADER =
  "How board state reads. This is the key, one entry per block.\n\n"
  + "- The <state> block and every tool result carry bare values in a fixed grammar.\n"
  + "- Counts ride as attributes on the blocks themselves.\n"
  + "- An empty block is a self-closing tag.";

const ALWAYS_ON_RULES = LAYOUT_RULES.map((rule) => rule.id).join(", ");

const FINISHING_ONLY_RULES = FINISHING_RULES
  .filter((rule) => !LAYOUT_RULES.some((always) => always.id === rule.id))
  .map((rule) => rule.id)
  .join(", ");

const BLOCKS: ReadonlyArray<{ tag: string; bullets: readonly Bullet[] }> = [
  {
    tag: "board",
    bullets: [
      {
        text: `object line: ${DIGEST_GRAMMAR}`,
        children: [
          "indentation is containment",
          "the tree runs the base section, then each section's contents",
        ],
      },
      DIGEST_DEFAULTS_LEGEND,
      {
        text: "object extras appear only when set:",
        children: ["locked=", "shape=", "layout=mode,pad=,gap=", "dir=", "author= (who placed it)"],
      },
      {
        text: 'edge line: id from→to "label" [extras] · route',
        children: [{
          text: "extras when set:",
          children: ["dashed", "a color", "arrow=", "anchors=a→b", "pos=", "wp=", "lp=along[@offset] (the label chip's pin)"],
        }],
      },
      DIGEST_ROUTE_LEGEND,
      {
        text: "segment indices are never renumbered",
        children: ["take the sN for a shift from the newest printing of that edge, never an older one"],
      },
      {
        text: "text is never truncated",
        children: ["whitespace collapses to single spaces, but every word is there"],
      },
      {
        text: "<description> is the board's own markdown account",
        children: [
          "the board shows what is there, the description says what it means",
          "update_description replaces it",
          "set_board_title renames the board",
        ],
      },
      {
        text: "annotation threads never appear in the digest",
        children: ["they are the <requests> queue"],
      },
    ],
  },
  {
    tag: "recent_ops",
    bullets: [
      {
        text: "one line per call this run, newest last: tN tool target detail",
        children: ["the durable ledger", "NO-OP and ERROR calls are marked as such"],
      },
    ],
  },
  {
    tag: "diff",
    bullets: [
      {
        text: "the cumulative base→draft change, one line per changed entity:",
        children: ["addSection id · updateObject id  moved · recolored · … · removeConnection id"],
      },
      {
        text: "built from the exact edits a committed finalize proposes",
        children: ["it always equals what committing would ship"],
      },
    ],
  },
  {
    tag: "lints",
    bullets: [
      {
        text: "one open finding per line:",
        children: [
          "grouped under <errors> and <warnings>",
          "recomputed every request",
          "E1 rule: what is wrong and where (a suggested fix)",
        ],
      },
      "ids are stable only until the draft changes, then they reassign from E1/W1",
      `always-on rules: ${ALWAYS_ON_RULES}`,
      {
        text: `a committed finalize adds ${FINISHING_ONLY_RULES}`,
        children: ["is a frame far larger than its children need"],
      },
      {
        text: "every open E* and W* in your edited scope blocks a committed finalize",
        children: ["the finding names the problem, the fix is yours to choose"],
      },
    ],
  },
  {
    tag: "requests",
    bullets: [
      {
        text: "the operator's annotation threads, one line each:",
        children: [
          'Rn open target author — "body"',
          'replies indented as ↳ author — "reply"',
          'Rn done|declined "note" once disposed',
        ],
      },
      {
        text: "answer a thread by editing board content, then dispose it with resolve_request",
        children: ["the disposal note is what the operator sees"],
      },
    ],
  },
  {
    tag: "views",
    bullets: [
      {
        text: "names the attached images in order:",
        children: [
          "(1) the board as it stands now",
          "then up to three prior change renders, newest first, each captioned with the gesture that made it",
        ],
      },
      "a failed current-board render is reported here and the previous render is kept",
    ],
  },
  {
    tag: "recent_conversation",
    bullets: [
      {
        text: "the capped tail of the run's messages",
        children: [
          "the <state> block above it always carries the current picture",
          "<recent_ops> carries the durable history",
        ],
      },
    ],
  },
  {
    tag: "results",
    bullets: [
      {
        text: "APPLIED · gesture target geometry",
        children: [
          "the headline of a call that changed the draft",
          "the numbers are the ones that landed after the grid snap, so plan the next gesture from them",
          "an indented note beneath is report-only, the edit still landed",
        ],
      },
      {
        text: "DELTA",
        children: [{
          text: "what the call changed:",
          children: [
            "+ id … added",
            "− id removed",
            "id x,y → x,y moved",
            "id x,y w×h → … resized",
            "id field before → after",
            "route a→b → c→d repointed",
            "anchors|pos|wp … → … steered",
          ],
        }],
      },
      {
        text: "LINTS · +new −resolved",
        children: [
          "the findings the call opened, each in prose, and the ids it resolved",
          "· +0 −0 (n open) when nothing changed",
          "· clean when nothing is open either",
        ],
      },
      {
        text: "ROUTES",
        children: [
          "the routed truth for every wire the call touched:",
          "id anchors a→b path A ─(s0 h y=…)→ … B through none|ids",
          "a clean wire crosses nothing, so aim for through none",
        ],
      },
      {
        text: "REQUESTS · none | k/n disposed",
        children: ["the queue after a request-touching call"],
      },
      {
        text: "NO-OP · …",
        children: ["the call was legal and there was nothing to do"],
      },
      {
        text: "ERROR · …",
        children: ["the call was not legal", "read the line, fix the call, send it again"],
      },
      {
        text: "a result is sized to its operation",
        children: ["the standing picture is never restated there, because the next <state> block carries it"],
      },
    ],
  },
  {
    tag: "look",
    bullets: [
      {
        text: "LOOK · n renders [· close-up id] [· framed label]",
        children: [{
          text: "then the standing truth in one result:",
          children: [
            "the flat digest (BOARD, then EDGES, same line grammar as <board>)",
            "BOARD DIFF",
            "DIAGNOSTICS · n errors · m warnings (the full recount)",
            "ROUTES for every edge",
            "REQUESTS",
            "MEASURES for each framed region",
          ],
        }],
      },
      {
        text: "MEASURES · region x,y w×h",
        children: [
          "gaps x|y: the clear corridor between each neighbouring pair, named by the two ids",
          "pitch x|y: the row/column repeat",
          "free: a frame's unused margins per side",
          "ink: the share of the region its boxes paint",
        ],
      },
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

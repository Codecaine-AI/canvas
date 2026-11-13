/**
 * The `rules` topic: the board rules every canvas edit keeps. It carries the
 * Rules section of the former skill and the theme rule that the `canvas_open`
 * description used to hold. Every number comes from the code that enforces or
 * aims at it, so the topic cannot quote a limit the tools disagree with.
 *
 * The color, icon, fact and space rules answer Ford's round 0 review of 20
 * drawn boards: "less grey", "Don't use blue inside of a blue area.",
 * "Prefer using real icons where we can", and "once the board gets really
 * full, it needs to, like, re... Just move sections and other things around."
 * The outline rules answer his round 1 review: "it doesn't necessarily need
 * to fit the base rectangle shape that we start with."
 * The traffic, subsection and shape rules answer his round 4 review: "give
 * them the wires just, like, enough room in between, like, larger sections",
 * "convey this, like, hierarchy with subsections" and "would it be better if
 * I adjusted the aspect ratio".
 */
import { NAME_TARGET_WORDS } from "../board/text-rules";
import { LABELLED_GAP_AIR_PX } from "../connectors/label-placement";
import { LANE_GAP_PX } from "../connectors/lanes";
import { AGENT_GRID } from "../session/tools/grid";
import type { AuthoringTopic } from "./design";
import { CRAFT_TARGETS } from "./style-guide/craft-targets";

/** A length rounded up to the grid a drawer's numbers land on. */
const onGrid = (px: number): number => Math.ceil(px / AGENT_GRID) * AGENT_GRID;

/**
 * The room one more wire takes in a gap between sections: one router lane
 * (`LANE_GAP_PX`) on the grid.
 */
export const SECTION_GAP_PER_WIRE = onGrid(LANE_GAP_PX);

/**
 * The length a labelled leg needs, as a base plus a step for each label
 * character. The base is the air `labelledGapPx` keeps around a chip plus one
 * grid step for the chip's padding. The step covers one character of the
 * label font. The chip lies across a vertical leg, so that leg needs the air,
 * the chip's height and the wire's two end gaps, whatever the label
 * (authoring-guidance.test.ts measures real chips against all three).
 */
const LABEL_LEG_BASE = onGrid(LABELLED_GAP_AIR_PX) + AGENT_GRID;
export const LABEL_LEG = { base: LABEL_LEG_BASE, perCharacter: 10, vertical: LABEL_LEG_BASE + AGENT_GRID } as const;

/**
 * The Layout section, one rule a line. A rule a layout tool needs the drawer
 * to know goes at the end of this list. The served guidance has a byte cap
 * (authoring-guidance.test.ts), so each new line replaces text elsewhere.
 */
const LAYOUT_RULES: readonly string[] = [
  `Geometry lands on a ${AGENT_GRID} unit grid.`,
  `A flow node is ${CRAFT_TARGETS.nodeWidth} by ${CRAFT_TARGETS.nodeHeight}.`,
  `\`arrange_section\` sets the gaps: ${CRAFT_TARGETS.nodeGapRow} across a row and ${CRAFT_TARGETS.nodeGapColumn} down a column.`,
  "When the board gets full or a section must grow, make room: `arrange` the sections in reading order with `flow: {axis: \"x\" or \"y\", gap}`.",
  "Put the two sections with the most wires between them side by side. A store, a sink or a check sits beside the section that uses it. Never put a section between two sections that wire to each other.",
  `The gap between two sections grows with the wires in it: ${CRAFT_TARGETS.sectionGutterSideBySide}, plus ${SECTION_GAP_PER_WIRE} for each wire after the first. Count each wire that crosses the gap or runs along it. Gaps inside a section stay as \`arrange_section\` sets them.`,
  `A horizontal wire leg that carries a label is at least ${LABEL_LEG.base} plus ${LABEL_LEG.perCharacter} for each label character long: the chip, and ${LABELLED_GAP_AIR_PX / 2} clear on each side. A vertical one is at least ${LABEL_LEG.vertical} long. A gap between side-by-side sections that a labeled wire crosses is at least the horizontal length before you add for its other wires.`,
  "One `arrange` call sets one gap, so give a row of sections the widest gap a pair in it needs. After `connect`, call `arrange_section` again on a section of nodes that holds a labeled wire: it widens the gap under the label.",
  "Draw what lives inside a thing as a subsection: `place_section` inside the section, titled for the thing. A host and its loop, a mode and its knobs, a pool and its servers: the parts go in the subsection, and no wire runs from the thing to each part. 2 or more nodes that share a group name make a subsection too. In a section of 7 or more nodes, find these groups before you place a node. Never draw a subsection for 1 node or for a group with no name.",
  "Never call `arrange_section` on a section that holds subsections. `arrange` its subsections and loose nodes with `space`, then call `fit_section` on it.",
  "The board's outline follows the flow, not a rectangle. Choose the shape that makes the wires shortest (wider, taller, a grid, a hub with spokes), and move whole sections to get it.",
  "A section keeps the size of its content. Never stretch a section or a node to fill a row.",
  "Center a section on the node or section it connects to.",
  "After you move, add or delete a node in a section, call `fit_section`. It centers the children and evens each row.",
  "The engine straightens a wire less than 40px off axis and names the move. Never move that box back. Offset 40px or more to keep an elbow.",
  "Never pin wire ends to place or spread arrowheads. The board centers and merges them.",
  "Move a wire label by hand only when you must. A label you pin joins no column.",
  "Make the call each near-miss names, then call `canvas_check` again.",
];

export function canvasRules(): AuthoringTopic {
  return {
    id: "rules",
    title: "Canvas Rules",
    text: [
      "These rules hold on every board. Read this topic before you lay out or restructure a board.",
      "",
      "## Color and Theme",
      "",
      "- Color encodes kind, never decoration. Give each section and node its role's hue.",
      "- Every section and subsection takes a hue that the color key gives a meaning. Vary the hues across the board. Draw a gray or white section only when the source asks for one. When a check names gray for a section, give it a free hue.",
      "- A subsection takes a color apart from its section and from the subsections beside it.",
      "- Never put a node or a sticky on a section of its own color.",
      "- Never nest a gray section directly in a gray section.",
      "- Never change the workspace theme. The theme is the person's workspace choice, and no tool changes it.",
      "",
      "## Icons and Shapes",
      "",
      "- A node that names a real product or provider (Claude Code, Codex, GitHub, Postgres) uses its brand icon. Find it with `find_icon` and a `query` such as \"codex\".",
      "- A component with a role and no product name uses the glyph for the role, such as `database` or `agent`.",
      "- Use a specific shape where one fits: `decision` for a branch, `process` for a step, `ellipse` for a start or end. A plain `rectangle` is only a payload or a message.",
      "- Each kind of thing the source names takes its own shape or icon. Never repeat one icon across nodes of different kinds.",
      "",
      "## Text",
      "",
      `- A name is ${NAME_TARGET_WORDS} words or fewer.`,
      "- A node shows its name only. Put extra context in a sticky note next to it.",
      "- A section has a title only.",
      "- A node draws no text beyond its name. Put a fact a reader needs (a size, a tool name) in the name, a wire label or a sticky.",
      "- Put each sticky beside the node it explains.",
      "",
      "## Layout",
      "",
      ...LAYOUT_RULES.map((rule) => `- ${rule}`),
      "",
      "## Wires",
      "",
      "- Label a wire only for a condition, a branch or a payload.",
      "- A wire label says what the wire carries. It never repeats a node or section name.",
      "- A dashed edge means planned or optional. A solid edge exists.",
      "- Wires that share a source or a target and one meaning run as one trunk and split at the end. Give them one color and one style, and never split a trunk the board merged.",
      "- Wires with different meanings take different colors, so they run in separate lanes. The board still joins wires that end at one node: keep that junction.",
      "",
      "## Source",
      "",
      "- Every box and wire maps to one real thing in the source.",
    ].join("\n"),
  };
}

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
 * The junction, empty-block, gap-maximum, direction and fix rules answer the
 * round 5 judges: two meanings on one line, empty blocks up to 1460 by 580,
 * and sections stretched past their content.
 * The order, band, group-wire and record rules answer the round 5 cycle 2
 * diagnoses: wires of 1500 to 2900 px declined as forced, a band of 280 that
 * 13 wires share, and a section 79% empty.
 */
import { CHIP_HEIGHT } from "../board/lints/geometry";
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
 * The room a label adds to a wire's lane in a band between sections: the
 * chip's height on the grid, less the lane the wire already has.
 */
export const SECTION_GAP_PER_LABEL = onGrid(CHIP_HEIGHT) - SECTION_GAP_PER_WIRE;

/**
 * The gap a band between sections needs: every wire that crosses it or runs
 * along it counts, from every pair of sections, and `labels` of them carry a
 * label.
 */
export function bandGap(wires: number, labels = 0): number {
  return CRAFT_TARGETS.sectionGutterSideBySide + SECTION_GAP_PER_WIRE * Math.max(0, wires - 1) + SECTION_GAP_PER_LABEL * labels;
}

/** The most a gap between sections may pass its rule number: past it the gap reads as an empty band. */
export const SECTION_GAP_SLACK = 120;

/** A wire longer than this joins sections that sit too far apart: a placement fault, not a routing one. */
export const LONG_WIRE = 1500;

/** The empty block no board keeps, in the frame or inside a section: this area or more, with both sides `side` or more. */
export const EMPTY_BLOCK = { area: 120_000, side: 200 } as const;

/** The least share of a section its nodes and subsections cover. A section `arrange_section` laid out may sit under it. */
export const SECTION_FILL_MIN = 0.35;

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
  "Put the two sections with the most wires between them side by side. Never put a section between two sections that wire to each other. A store sits beside the nodes that write to it. A store or an outcome that several stages feed sits after the last of them, never before or above the first.",
  "The board reads one way, left to right or top to bottom, and the story starts at the top or the left. On the main path, a section sits after its source. Steps inside a section run the same way, and a chain never turns back. Order a row of targets in the order of their sources.",
  `Section order comes before routing. A wire over ${LONG_WIRE} long, a wire through a section that holds neither of its ends and a crossing between sections are placement faults: \`canvas_check\` lists them under LAYOUT. Move a section first (swap two neighbours, or change its row), then route. To decline such a finding, name the move you tried and what it measured.`,
  `A band is the gap between two sections, or between two rows or two columns of sections. Size it for every wire that crosses it or runs along it, from every pair of sections, not one pair: ${bandGap(1)}, plus ${SECTION_GAP_PER_WIRE} for each wire after the first, plus ${SECTION_GAP_PER_LABEL} more for each of them that carries a label. Gaps inside a section stay as \`arrange_section\` sets them.`,
  `A horizontal wire leg that carries a label is at least ${LABEL_LEG.base} plus ${LABEL_LEG.perCharacter} for each label character long: the chip, and ${LABELLED_GAP_AIR_PX / 2} clear on each side. A vertical one is at least ${LABEL_LEG.vertical} long. A gap between side-by-side sections that a labeled wire crosses is at least the horizontal length before you add for its other wires.`,
  `One \`arrange\` call sets one gap, so give a row of sections the widest gap a band in it needs, and never over ${SECTION_GAP_SLACK} more: a wider gap is an empty band. Never narrow a band below its number. After \`connect\`, call \`arrange_section\` again on a section of nodes that holds a labeled wire: it widens the gap under the label.`,
  "Draw what lives inside a thing as a subsection: `place_section` inside the section, titled for the thing. A host and its loop, a mode and its knobs, a pool and its servers: the parts go in the subsection, and no wire runs from the thing to each part. A record of 2 or more fields is one subsection titled for the record, with its fields stacked in one column, never loose boxes. 2 or more nodes that share a group name make a subsection too. A section of 8 or more nodes holds subsections: name its groups before you place a node. When the source names two sides (inside and outside, existing and proposed), each side of 2 or more nodes is a subsection. Never draw a subsection for 1 node or for a group with no name.",
  "Never call `arrange_section` on a section that holds subsections. `arrange` its subsections and loose nodes with `space`, then call `fit_section` on it.",
  "Choose the board shape the flow needs (wide for a left-to-right pipeline with feedback, a hub with spokes for a fan-out, a grid or 2 or 3 rows otherwise), and move whole sections to get it.",
  `Keep no empty block of ${EMPTY_BLOCK.area.toLocaleString("en-US")} px² or more with both sides ${EMPTY_BLOCK.side} or more (300 by 400, 200 by 600), in the frame or in a section. To close one, shrink the section or the frame, or move a neighbour in. Never widen a section, add a sticky or reverse a chain to fill space. Bend a wire before you keep an empty block.`,
  `A section keeps the size of its content: \`fit_section\` sets it. Its nodes fill ${SECTION_FILL_MIN * 100}% or more of it, less only at the gaps \`arrange_section\` sets. Never stretch a section or a node to fill a row, align an edge or make room for a wire.`,
  "Center a section on the node or section it connects to, and a hub on the row it fans out to.",
  "After you move, add or delete a node in a section, call `fit_section`. It centers the children and evens each row.",
  "The engine straightens a wire less than 40px off axis and names the move. Never move that box back. Offset 40px or more to keep an elbow.",
  "Never pin a wire end with `position` to place or spread arrowheads. The board centers and merges them. `anchor` only picks the side.",
  "Move a wire label by hand only when you must. A label you pin joins no column.",
  "Make the call each near-miss names, then call `canvas_check` again.",
  "Fix a finding without stretching a section, merging nodes, deleting a subsection or growing an empty block. A wire that must end on a node ends on a node inside the subsection.",
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
      "- Never put a node or a sticky on a section of its own color. Draw a gray node only when the color key gives gray a meaning.",
      "- Never nest a gray section directly in a gray section.",
      "- Never change the workspace theme. The theme is the person's workspace choice, and no tool changes it.",
      "",
      "## Icons and Shapes",
      "",
      "- A node that names a real product or provider (Claude Code, Codex, GitHub, Postgres) uses its brand icon. Find it with `find_icon` and a `query` such as \"codex\".",
      "- A component with a role and no product name uses the glyph for the role, such as `database` or `agent`.",
      "- Use a specific shape where one fits: `decision` for a branch, `process` for a step, `ellipse` for a start or end. A plain `rectangle` is only a payload or a message. Among icon nodes, a step is an icon node too, with the glyph for its role.",
      "- Each kind of thing the source names takes its own shape or icon. Never repeat one icon across nodes of different kinds.",
      "",
      "## Text",
      "",
      `- A name is ${NAME_TARGET_WORDS} words or fewer.`,
      "- A node shows its name only. Put extra context in a sticky note next to it.",
      "- A section has a title only.",
      "- A node draws no text beyond its name. Put a fact a reader needs (a size, a tool name) in the name, a wire label or a sticky.",
      "- Put each sticky beside the node it explains, and the color key beside the title or the first section, never alone in a corner.",
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
      "- Wires that share a source or a target and one meaning run as one trunk and split at the end. Give them one color and one dash, and never split a trunk the board merged.",
      "- When every member of a section or subsection sends or receives the same wire, `connect` its frame once, not each member, and keep it there. Any other wire ends on a node.",
      "- Wires that differ in color or dash never share a line or an arrowhead. Where both meet one node, give each meaning its own side of the node, nearest its other ends: set `anchor` on that end in `connect`, or with `change_connection`. Two wires that cross on the way in trade sides, so choose sides that keep them apart.",
      "",
      "## Source",
      "",
      "- Every box and wire maps to one real thing in the source.",
    ].join("\n"),
  };
}

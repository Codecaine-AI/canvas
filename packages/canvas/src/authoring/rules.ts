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
 */
import { NAME_TARGET_WORDS } from "../board/text-rules";
import { AGENT_GRID } from "../session/tools/grid";
import type { AuthoringTopic } from "./design";
import { CRAFT_TARGETS } from "./style-guide/craft-targets";

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
  "The board's outline follows the flow, not a rectangle. An empty corner is fine.",
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
      "- Vary the hues of nodes and sections across the board. Gray is for a section with no role hue, never the default.",
      "- Never put a node or a sticky on a section of its own color.",
      "- Never nest a gray section directly in a gray section.",
      "- Never change the workspace theme. The theme is the person's workspace choice, and no tool changes it.",
      "",
      "## Icons and Shapes",
      "",
      "- A node that names a real product or provider (Claude Code, Codex, GitHub, Postgres) uses its brand icon. Find it with `find_icon` and a `query` such as \"codex\".",
      "- A component with a role and no product name uses the glyph for the role, such as `database` or `agent`.",
      "- Use a specific shape where one fits: `decision` for a branch, `process` for a step, `ellipse` for a start or end. A plain `rectangle` is only a payload or a message.",
      "",
      "## Text",
      "",
      `- A name is ${NAME_TARGET_WORDS} words or fewer.`,
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
      "",
      "## Source",
      "",
      "- Every box and wire maps to one real thing in the source.",
    ].join("\n"),
  };
}

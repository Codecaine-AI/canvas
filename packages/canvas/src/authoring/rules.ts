/**
 * The `rules` topic: the board rules every canvas edit keeps. It carries the
 * canvas skill's Rules section and the theme rules that the `canvas_open`
 * description used to hold. Every number comes from the code that enforces or
 * aims at it, so the topic cannot quote a limit the tools disagree with.
 */
import { NAME_TARGET_WORDS } from "../board/text-rules";
import { CANVAS_STYLE_FILENAME, CANVAS_THEME_IDS } from "../theme/canvas-style";
import { AGENT_GRID } from "../session/tools/grid";
import type { AuthoringTopic } from "./design";
import { CRAFT_TARGETS } from "./style-guide/craft-targets";

export function canvasRules(): AuthoringTopic {
  const themes = `${CANVAS_THEME_IDS.slice(0, -1).join(", ")} or ${CANVAS_THEME_IDS.at(-1)}`;
  return {
    id: "rules",
    title: "Canvas Rules",
    text: [
      "These rules hold on every board. Read this topic before you lay out or restructure a board.",
      "",
      "## Color and Theme",
      "",
      "- Color encodes kind, never decoration. Give each section and node its role's hue.",
      "- Never change the workspace theme. The theme is the person's workspace choice, and no tool changes it.",
      `- The workspace style file \`canvases/${CANVAS_STYLE_FILENAME}\` holds the visual theme (${themes}) and its overrides. Renders and lints use it.`,
      "- `canvas_open` reads the workspace style file again each time it runs, and its STYLE line reports the active theme and any overrides.",
      "- In every theme, color still encodes what kind of thing an object is.",
      "",
      "## Text",
      "",
      `- A name is ${NAME_TARGET_WORDS} words or fewer.`,
      "- A node shows its name only. Put extra context in a sticky note next to it.",
      "- A section has a title only.",
      "",
      "## Geometry",
      "",
      `- Geometry lands on a ${AGENT_GRID} unit grid.`,
      `- A flow node is ${CRAFT_TARGETS.nodeWidth} by ${CRAFT_TARGETS.nodeHeight}.`,
      `- \`arrange_section\` sets the gaps: ${CRAFT_TARGETS.nodeGapRow} across a row and ${CRAFT_TARGETS.nodeGapColumn} down a column.`,
      "",
      "## Wires",
      "",
      "- Label a wire only for a condition, a branch or a payload.",
      "- A dashed edge means planned or optional. A solid edge exists.",
      "",
      "## Source",
      "",
      "- Every box and wire maps to one real thing in the source.",
    ].join("\n"),
  };
}

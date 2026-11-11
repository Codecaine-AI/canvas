/**
 * The `workflow` topic: how an agent works a board through the canvas MCP. It
 * carries the canvas skill's description, intro, Workflow and References, and
 * the open-save-check rules the MCP instructions and the `canvas_open`
 * description used to hold. Every edit tool refuses until the server process
 * reads this topic, so the edit rules sit here and nowhere else.
 */
import { CANVAS_COLORS } from "../state/schema/colors";
import type { AuthoringTopic } from "./design";
import { VISUAL_PATTERNS } from "./visual-patterns";
import { catalogCounts } from "./vocabulary";

/** The MCP resource that renders every glyph in the default style. */
export const CONTACT_SHEET_URI = "codecaine://canvas/contact-sheet";

/** The tools a server process may call before it reads this topic. */
export const OPEN_TOOLS = ["canvas_capabilities", "canvas_list", "canvas_open", "canvas_guidance", "look", "canvas_check"] as const;

export function canvasWorkflow(): AuthoringTopic {
  const { kinds, groups } = catalogCounts();
  const open = OPEN_TOOLS.map(tool => `\`${tool}\``);
  return {
    id: "workflow",
    title: "Canvas Workflow",
    text: [
      "The canvas tools draw and edit Codecaine Canvas boards: system architecture, flow and pipeline diagrams, state charts and ownership maps. They come from the codecaine-canvas MCP server.",
      "",
      "## When to Use the Canvas Tools",
      "",
      "- Use them when the user says canvas or board, after the instruments skill routes a diagram to canvas, and before any place_*, connect or look call.",
      "- The instruments skill decides whether a subject is a canvas at all. This topic says how to draw one.",
      "",
      "## The Edit Gate",
      "",
      `- Every edit tool is refused until this server process reads this topic with \`canvas_guidance\`. One read per server process is enough.`,
      `- ${open.slice(0, -1).join(", ")} and ${open.at(-1)} stay open before the read.`,
      "",
      "## Boards and Saves",
      "",
      "- A board is a typed JSON file: `canvases/<id>.canvas.json` for a standalone board, or a page's `.canvas.json` sidecar inside the workspace.",
      "- The canvas tools are the only write path for agents. Never write a `.canvas.json` file directly.",
      "- Open a board with `canvas_open` before any other board tool: pass an id from `canvas_list` or the board's file path. Start a new board with `canvas_create`.",
      "- `canvas_open` reads the file fresh from disk and returns the board state: the description, the full digest and the open lint findings that the edit tools work against.",
      "- Every edit saves to the open file the moment it applies, and returns a delta and lint changes.",
      "- An edit is refused when the file changed elsewhere. Call `canvas_open` again to reload the board, and every later edit saves to the file again.",
      "",
      "## Workflow",
      "",
      "1. Understand. Read the request and the board digest. Research the subject until you can name every actor, store and boundary. Map each concept to a visual pattern, and write the plan before you place anything: the sections in rows, each section's nodes as rows, the color key, and every wire.",
      "2. Build. Place everything, then connect. `place_section` for every section with its title, icon and color. `place_shape` for every node inside its section with its name and color. `arrange_section` for every section with its node rows, then `arrange` the sections with `space`. Then `connect` every wire and call `tighten_wires` once.",
      "3. Finish. Call `canvas_check`, read its whole-board PNG, and `look` at any section whose text you cannot read in it. Fix every error before you call the board done. `canvas_check` runs every lint and returns a PNG of the whole board.",
      "",
      "## Topics",
      "",
      "Read a topic with `canvas_guidance` when a step needs it, one topic at a time. Read topic `diagram_design` before the first `place_section`: it holds the build order and the board size. Read topic `rules` before you lay out or restructure a board.",
      "",
      "- Topic `rules` holds the board rules: color and the theme, text, the grid, wires and the source.",
      "- Topic `operating_context` holds the state grammar that reads tool results, and the aesthetic.",
      "- Topic `state_grammar` is the reading key for the board digest and every tool result.",
      "- Topic `aesthetic` is the house style.",
      "- Topic `diagram_design` says how a diagram reads.",
      `- Topic \`visual_patterns\` lists the ${VISUAL_PATTERNS.length} patterns.`,
      `- Topic \`visual_vocabulary\` lists ${kinds} object kinds in ${groups} groups, with their preferred colors.`,
      `- Topic \`color_palette\` lists the ${CANVAS_COLORS.length} colors and what each one means.`,
      "- Topic `canvas_conventions` covers ids, text limits, containment and the grid.",
      `- The resource \`${CONTACT_SHEET_URI}\` renders every glyph in the default style.`,
    ].join("\n"),
  };
}

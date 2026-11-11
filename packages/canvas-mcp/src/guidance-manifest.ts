/**
 * The rule-unit manifest of the deleted skill. Each unit keeps a run of the hand-written SKILL.md lines as the skill
 * wrote them, with the file and line range it came from, and names the served guidance that now carries it: a
 * `canvas_guidance` topic, or a drop with a reason. The units are frozen literals, because the skill folder, its
 * source and its generator are gone. capabilities.test.ts runs each unit's contract against the served text and
 * strips each unit to prove its contract fails. cli.ts manifest prints the units as JSON for the prose judge.
 */
import { OPEN_TOOLS } from "@codecaine-ai/canvas/authoring";

/** The eval scenario that exercises a unit. The gate runners build one task per scenario. */
export const SCENARIOS = {
  "draw-board": "Draw a new board from a brief, from canvas_capabilities through canvas_check.",
  "edit-board": "Change an existing board through canvas_open and the edit tools.",
  "read-board": "Answer a question about a board without editing it.",
  "choose-kinds": "Pick the object kinds, colors and patterns that fit a diagram.",
} as const;
export type ScenarioId = keyof typeof SCENARIOS;

/** metadata: skill frontmatter. rule, step, link: hand-written prose. */
export type UnitKind = "metadata" | "rule" | "step" | "link";
/**
 * Where the unit is served now. A drop to instruments is allowed only for a unit that routes output to another
 * system. A drop to skill-folder is allowed only for a unit that maintains the skill folder itself, which goes away
 * with the folder, and it has no anchors.
 */
export type Destination = { topic: string } | { drop: "instruments" | "skill-folder"; reason: string };
/**
 * Recorded behavior gets a structured assertion. Each tool is in tools/list and named in the served text. The
 * refusal is the exact text an edit gets before topic workflow is read. The resource is in resources/list. Each count
 * names a value the code holds (capabilities.test.ts reads it) and the number the served text states.
 */
export type Behavior = {
  tools?: readonly string[];
  refusal?: string;
  resource?: string;
  counts?: Readonly<Record<string, number>>;
};
export type ManifestUnit = {
  id: string;
  kind: UnitKind;
  /** The deleted skill file the unit came from, as a path under the canvas-mcp package. */
  file: string;
  /** First and last line, 1-based and inclusive. */
  lines: readonly [number, number];
  /** The unit's lines as the file held them, or the true rule when the unit carries a correction. */
  text: string;
  /**
   * Set when the skill stated a rule that the code does not do. `text` then holds the true rule, so the prose judge
   * compares the served text against it, and `skillText` records the skill's lines as written.
   */
  correction?: { skillText: string; source: string };
  /** Exact phrases of the served text that carry the unit's rule. A skill-folder drop has none. */
  anchors: readonly string[];
  scenario: ScenarioId;
  destination: Destination;
  behavior?: Behavior;
};
const SKILL = "src/skill/SKILL.md";
/** The text every edit tool returns until the server process reads topic workflow. */
export const WORKFLOW_GATE =
  "Read the canvas workflow before your first edit: call canvas_guidance('workflow'), that is canvas_guidance with topic \"workflow\". Required once per server process.";

const workflow = { topic: "workflow" } as const;
const rules = { topic: "rules" } as const;

const UNITS: readonly ManifestUnit[] = [
  {
    id: "skill.frontmatter", kind: "metadata", file: SKILL, lines: [1, 12], scenario: "draw-board", destination: workflow,
    text: "---\nname: canvas\ndescription: \"Draw and edit Codecaine Canvas boards through the\n  codecaine-canvas MCP: system architecture, flow and pipeline diagrams,\n  state charts and ownership maps. Use after the instruments skill\n  routes a diagram to canvas, when Ford says canvas or board, or before\n  any place_*, connect or look call.\"\ncompatibility: \"Needs the codecaine-canvas MCP server.\"\nmetadata:\n  version: \"0.1.0\"\n  product: canvas\n---",
    anchors: [
      "The canvas tools draw and edit Codecaine Canvas boards: system architecture, flow and pipeline diagrams, state charts and ownership maps",
      "Use them when the user says canvas or board, after the instruments skill routes a diagram to canvas, and before any place_*, connect or look call",
      "They come from the codecaine-canvas MCP server",
    ],
  },
  {
    id: "skill.intro", kind: "rule", file: SKILL, lines: [14, 19], scenario: "edit-board", destination: workflow,
    // Correction: canvas_open also opens a page's sidecar board. canvasTarget resolves any path with a separator to a
    // .canvas.json file inside the workspace (packages/canvas-mcp/src/service.ts:341-352).
    text: "# Canvas\n\nA board is a typed JSON file: `canvases/<id>.canvas.json` for a standalone board, or a page's `.canvas.json` sidecar inside the workspace. The MCP is\nthe only write path for agents. Every edit saves at once and returns a\ndelta and lint changes. The instruments skill decides whether a\nsubject is a canvas at all. This skill says how to draw one.",
    correction: {
      skillText: "# Canvas\n\nA board is a typed JSON file at `canvases/<id>.canvas.json`. The MCP is\nthe only write path for agents. Every edit saves at once and returns a\ndelta and lint changes. The instruments skill decides whether a\nsubject is a canvas at all. This skill says how to draw one.",
      source: "packages/canvas-mcp/src/service.ts:341-352 (canvasTarget: a path with a separator is any .canvas.json file inside the workspace, such as a docs page's sidecar)",
    },
    anchors: [
      "A board is a typed JSON file: `canvases/<id>.canvas.json` for a standalone board, or a page's `.canvas.json` sidecar inside the workspace",
      "The canvas tools are the only write path for agents",
      "Every edit saves to the open file the moment it applies, and returns a delta and lint changes",
      "The instruments skill decides whether a subject is a canvas at all",
      "This topic says how to draw one",
    ],
  },
  {
    id: "skill.workflow.heading", kind: "rule", file: SKILL, lines: [21, 21], scenario: "draw-board", destination: workflow,
    text: "## Workflow",
    anchors: ["## Workflow"],
  },
  {
    id: "skill.workflow.snapshot", kind: "step", file: SKILL, lines: [23, 24], scenario: "draw-board",
    destination: { drop: "skill-folder", reason: "The step compares the skill folder's snapshot.json with the server and regenerates the folder. It maintains the folder itself, which cp16 deletes with its generator. A served topic has no copy to go stale." },
    text: "1. Understand. Compare `snapshot.json` with the snapshot id that\n   `canvas_guidance` returns, and regenerate the skill if they differ.",
    anchors: [],
  },
  {
    id: "skill.workflow.understand", kind: "step", file: SKILL, lines: [25, 29], scenario: "draw-board", destination: workflow,
    text: "   Read the request and the board digest. Research the subject until\n   you can name every actor, store and boundary. Map each concept to a\n   visual pattern, and write the plan before you place anything: the\n   sections in rows, each section's nodes as rows, the color key, and\n   every wire.",
    anchors: [
      "1. Understand. Read the request and the board digest",
      "Research the subject until you can name every actor, store and boundary",
      "Map each concept to a visual pattern, and write the plan before you place anything: the sections in rows, each section's nodes as rows, the color key, and every wire",
    ],
  },
  {
    id: "skill.workflow.build", kind: "step", file: SKILL, lines: [30, 35], scenario: "draw-board", destination: workflow,
    text: "2. Build. Place everything, then connect. `place_section` for every\n   section with its title, icon and color. `place_shape` for every\n   node inside its section with its name and color.\n   `arrange_section` for every section with its node rows, then\n   `arrange` the sections with `space`. Then `connect` every wire and call\n   `tighten_wires` once.",
    anchors: [
      "2. Build. Place everything, then connect",
      "`place_section` for every section with its title, icon and color",
      "`place_shape` for every node inside its section with its name and color",
      "`arrange_section` for every section with its node rows, then `arrange` the sections with `space`",
      "Then `connect` every wire and call `tighten_wires` once",
    ],
    behavior: { tools: ["place_section", "place_shape", "arrange_section", "arrange", "connect", "tighten_wires"] },
  },
  {
    id: "skill.workflow.finish", kind: "step", file: SKILL, lines: [36, 38], scenario: "draw-board", destination: workflow,
    text: "3. Finish. Call `canvas_check`, read its whole-board PNG, and `look` at\n   any section whose text you cannot read in it. Fix every error\n   before you call it done.",
    anchors: [
      "3. Finish. Call `canvas_check`, read its whole-board PNG, and `look` at any section whose text you cannot read in it",
      "Fix every error before you call the board done",
      "`canvas_check` runs every lint and returns a PNG of the whole board",
    ],
    behavior: { tools: ["canvas_check", "look"] },
  },
  {
    id: "skill.rules.color", kind: "rule", file: SKILL, lines: [40, 43], scenario: "draw-board", destination: rules,
    text: "## Rules\n\n- Color encodes kind, never decoration. Give each section and node its\n  role's hue. Never change the workspace theme.",
    anchors: ["These rules hold on every board", "Color encodes kind, never decoration", "Give each section and node its role's hue", "Never change the workspace theme"],
  },
  {
    id: "skill.rules.text", kind: "rule", file: SKILL, lines: [44, 45], scenario: "draw-board", destination: rules,
    text: "- A name is 5 words or fewer. A node shows its name only; put extra\n  context in a sticky note next to it. A section has a title only.",
    anchors: ["A name is 5 words or fewer", "A node shows its name only. Put extra context in a sticky note next to it", "A section has a title only"],
    behavior: { counts: { "name words": 5 } },
  },
  {
    id: "skill.rules.labels", kind: "rule", file: SKILL, lines: [46, 46], scenario: "draw-board", destination: rules,
    text: "- Label a wire only for a condition, a branch or a payload.",
    anchors: ["Label a wire only for a condition, a branch or a payload"],
  },
  {
    id: "skill.rules.geometry", kind: "rule", file: SKILL, lines: [47, 49], scenario: "draw-board", destination: rules,
    text: "- Geometry lands on a 20 unit grid. A flow node is 280 by 100.\n  `arrange_section` sets the gaps: 200 across a row and 100 down a\n  column.",
    anchors: ["Geometry lands on a 20 unit grid", "A flow node is 280 by 100", "`arrange_section` sets the gaps: 200 across a row and 100 down a column"],
    behavior: { tools: ["arrange_section"], counts: { grid: 20, "node width": 280, "node height": 100, "row gap": 200, "column gap": 100 } },
  },
  {
    id: "skill.rules.edges", kind: "rule", file: SKILL, lines: [50, 50], scenario: "draw-board", destination: rules,
    text: "- A dashed edge means planned or optional. A solid edge exists.",
    anchors: ["A dashed edge means planned or optional", "A solid edge exists"],
  },
  {
    id: "skill.rules.source", kind: "rule", file: SKILL, lines: [51, 51], scenario: "draw-board", destination: rules,
    text: "- Every box and wire maps to one real thing in the source.",
    anchors: ["Every box and wire maps to one real thing in the source"],
  },
  {
    id: "skill.references.operating-context", kind: "link", file: SKILL, lines: [53, 56], scenario: "draw-board", destination: workflow,
    text: "## References\n\n- `references/operating-context.md` holds the state grammar that\n  reads tool results, and the aesthetic topic.",
    anchors: ["## Topics", "Topic `operating_context` holds the state grammar that reads tool results, and the aesthetic"],
  },
  {
    id: "skill.references.diagram-design", kind: "link", file: SKILL, lines: [57, 57], scenario: "draw-board", destination: workflow,
    text: "- `references/diagram-design.md` says how a diagram reads.",
    anchors: ["Topic `diagram_design` says how a diagram reads"],
  },
  {
    id: "skill.references.visual-patterns", kind: "link", file: SKILL, lines: [58, 58], scenario: "choose-kinds", destination: workflow,
    text: "- `references/visual-patterns.md` lists the ten patterns.",
    anchors: ["Topic `visual_patterns` lists the 10 patterns"],
    behavior: { counts: { patterns: 10 } },
  },
  {
    id: "skill.references.vocabulary", kind: "link", file: SKILL, lines: [59, 60], scenario: "choose-kinds", destination: workflow,
    text: "- `references/vocabulary.md` lists 103 object kinds in 10 groups with\n  their preferred colors.",
    anchors: ["Topic `visual_vocabulary` lists 103 object kinds in 10 groups, with their preferred colors"],
    behavior: { counts: { "object kinds": 103, "kind groups": 10 } },
  },
  {
    id: "skill.references.colors", kind: "link", file: SKILL, lines: [61, 61], scenario: "choose-kinds", destination: workflow,
    text: "- `references/colors.md` lists the 10 colors and what each one means.",
    anchors: ["Topic `color_palette` lists the 10 colors and what each one means"],
    behavior: { counts: { colors: 10 } },
  },
  {
    id: "skill.references.conventions", kind: "link", file: SKILL, lines: [62, 63], scenario: "edit-board", destination: workflow,
    text: "- `references/conventions.md` covers ids, text limits, containment and\n  the grid.",
    anchors: ["Topic `canvas_conventions` covers ids, text limits, containment and the grid"],
  },
  {
    id: "skill.references.contact-sheet", kind: "link", file: SKILL, lines: [64, 64], scenario: "choose-kinds", destination: workflow,
    text: "- `assets/contact-sheet.png` renders every glyph in the default style.",
    anchors: ["The resource `codecaine://canvas/contact-sheet` renders every glyph in the default style"],
    behavior: { resource: "codecaine://canvas/contact-sheet" },
  },
];

/** The full manifest, as frozen literals. */
export async function guidanceManifest(): Promise<ManifestUnit[]> {
  return UNITS.map(unit => ({ ...unit }));
}

/** The tools that stay open before the workflow read. Every other tool on the server is an edit and needs topic workflow. */
export const UNGATED: ReadonlySet<string> = new Set(OPEN_TOOLS);

/** The topics a tool needs, read in this server process. The index lists the result as each topic's required_for. */
export const requiredTopics = (tool: string): readonly string[] => UNGATED.has(tool) ? [] : ["workflow"];

/** The fixed fields of the canvas_capabilities index. Each other field is live. */
export const CAPABILITIES = {
  protocol_version: "1",
  guidance_tool: "canvas_guidance",
  entry_tool: "canvas_open",
  completion_tools: ["canvas_check"],
  operations: ["canvas_capabilities", "canvas_guidance", "canvas_open", "place_section", "look", "canvas_check"],
} as const;

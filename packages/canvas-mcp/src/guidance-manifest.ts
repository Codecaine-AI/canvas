/**
 * The rule-unit manifest of the canvas skill: the hand-written `src/skill/SKILL.md`, which guidance.ts copies into
 * the skill folder, and the six references the generator writes. Each unit keeps a run of skill lines as the skill
 * wrote them, and names the served guidance that now carries it: a `canvas_guidance` topic, or a drop with a reason.
 * A hand-written unit is a frozen literal. A generated reference is one unit that spans its whole file, because its
 * topic serves the same text, and it reads that text from the file. capabilities.test.ts runs each unit's contract
 * against the served text and strips each unit to prove its contract fails. cli.ts manifest prints the units as JSON
 * for the prose judge.
 */
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { OPEN_TOOLS } from "@codecaine-ai/canvas/authoring";

/** The canvas-mcp package folder. Every unit file is a path under it. */
export const PACKAGE_ROOT = resolve(import.meta.dir, "..");

/** The eval scenario that exercises a unit. The gate runners build one task per scenario. */
export const SCENARIOS = {
  "draw-board": "Draw a new board from a brief, from canvas_capabilities through canvas_check.",
  "edit-board": "Change an existing board through canvas_open and the edit tools.",
  "read-board": "Answer a question about a board without editing it.",
  "choose-kinds": "Pick the object kinds, colors and patterns that fit a diagram.",
} as const;
export type ScenarioId = keyof typeof SCENARIOS;

/** metadata: skill frontmatter. rule, step, link: hand-written prose. generated: a whole generated reference file. */
export type UnitKind = "metadata" | "rule" | "step" | "link" | "generated";
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
  /** Path under PACKAGE_ROOT. */
  file: string;
  /** First and last line, 1-based and inclusive. */
  lines: readonly [number, number];
  /** The pinned sha256 of the whole file. */
  sha256: string;
  /** The unit's lines as the file holds them, or the true rule when the unit carries a correction. */
  text: string;
  /**
   * Set when the skill stated a rule that the code does not do. `text` then holds the true rule, so the prose judge
   * compares the served text against it, and `skillText` records the skill's lines as written.
   */
  correction?: { skillText: string; source: string };
  /** Exact phrases of the served text that carry the unit's rule. A generated unit and a skill-folder drop have none. */
  anchors: readonly string[];
  scenario: ScenarioId;
  destination: Destination;
  behavior?: Behavior;
};
type UnitSpec = Omit<ManifestUnit, "sha256" | "text"> & { text?: string };

const SKILL = "src/skill/SKILL.md";
const REFERENCES = "skills/canvas/references";

/** The sha256 of each skill file the units cover. A changed file fails the line-span test until the units move with it. */
export const PINNED_SHA256: Readonly<Record<string, string>> = {
  [SKILL]: "79949cc4a4f07da005fb42408794838374e51e700b5be6279b145e551ea61c36",
  [`${REFERENCES}/colors.md`]: "d1b8b33b2f5d7e17bb69695595b5ada9f757d0941fa6221a0435786ce692a3df",
  [`${REFERENCES}/conventions.md`]: "c10a569f4f7df24c20bf1f358788f1acc0ace5c16016a27a1dbb5a2808319c48",
  [`${REFERENCES}/diagram-design.md`]: "85baf121a0afb3676976aa2966fe3c0b45679d29f8f7ccfb64889d2e1ef41105",
  [`${REFERENCES}/operating-context.md`]: "19ed18d1658651c7748fb9c507ec4b47edf2e7da82ff0bb328270fe099495368",
  [`${REFERENCES}/visual-patterns.md`]: "7d606f6116467761206a2b21d510c086f5a969280f449e60ad01c4e86e55a12d",
  [`${REFERENCES}/vocabulary.md`]: "415659dd5213ef59d9d101b08b46df33bfce9e6026c7d18624d862f97324f3b2",
};

/** The text every edit tool returns until the server process reads topic workflow. */
export const WORKFLOW_GATE =
  "Read the canvas workflow before your first edit: call canvas_guidance('workflow'), that is canvas_guidance with topic \"workflow\". Required once per server process.";

const workflow = { topic: "workflow" } as const;
const rules = { topic: "rules" } as const;

/** A generated reference file is one unit when its destination serves the same text. */
const generated = (name: string, topic: string, scenario: ScenarioId, lines: number): UnitSpec =>
  ({ id: `reference.${name}`, kind: "generated", file: `${REFERENCES}/${name}.md`, lines: [1, lines], anchors: [], scenario, destination: { topic } });

const UNITS: readonly UnitSpec[] = [
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
  generated("operating-context", "operating_context", "draw-board", 197),
  generated("visual-patterns", "visual_patterns", "choose-kinds", 134),
  generated("diagram-design", "diagram_design", "draw-board", 197),
  generated("vocabulary", "visual_vocabulary", "choose-kinds", 572),
  generated("colors", "color_palette", "choose-kinds", 21),
  generated("conventions", "canvas_conventions", "edit-board", 80),
];

/** The full manifest. Each unit carries its file's pinned sha256, and a generated unit carries its whole file as text. */
export async function guidanceManifest(root = PACKAGE_ROOT): Promise<ManifestUnit[]> {
  return Promise.all(UNITS.map(async unit => ({
    ...unit,
    sha256: PINNED_SHA256[unit.file]!,
    text: unit.text ?? (await readFile(join(root, unit.file), "utf8")).split("\n").slice(0, unit.lines[1]).join("\n"),
  })));
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

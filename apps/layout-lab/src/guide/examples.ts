/**
 * Guide DSL programs. Every string here runs through the REAL parse->expand
 * pipeline at render time; scratchpad/validate-guide-examples.ts asserts they
 * all parse, expand, and route cleanly.
 */

export interface FieldDoc {
  token: string;
  meaning: string;
  /** Optional explicit token role when the tokenizer needs help (legend chips). */
  kind?: "op" | "slot" | "ord" | "id" | "type" | "size" | "punct";
}

export interface LanguageEntry {
  id: string;
  name: string;
  syntax: string;
  meaning: string;
  /** Token-level documentation for this op. */
  docs: FieldDoc[];
  /** Primary live example. */
  dsl: string;
  /** Optional contrast example rendered beside the primary ("without"). */
  contrastDsl?: string;
  contrastNote?: string;
}

/** The anatomy exemplar broken down token by token, shown above the reference. */
export const ANATOMY_TOKENS: readonly FieldDoc[] = [
  { token: "leaf:", meaning: "keyword — what this line does", kind: "op" },
  { token: "N", meaning: "compass slot — where in the region", kind: "slot" },
  { token: "2=", meaning: "reference number — declared once, reused later", kind: "ord" },
  { token: "checkout", meaning: "a name you chose for the object", kind: "id" },
  { token: "#pill", meaning: "shape type", kind: "type" },
  { token: "(M)", meaning: "size — S, M, or L", kind: "size" },
];

export const LANGUAGE_ENTRIES: readonly LanguageEntry[] = [
  {
    id: "leaf",
    name: "leaf",
    syntax: "leaf: N 2=checkout#pill(M) C 3=goals#pill(M)",
    meaning: "Places loose items in a region. Each item gets a compass slot and a size — never pixel coordinates. The solver turns those into geometry.",
    docs: [
      { token: "N / NE / E / SE / S / SW / W / NW / C", meaning: "the nine compass slots — which part of the region the item sits in", kind: "slot" },
      { token: "2=", meaning: "reference number: a short number declared once, then used by edges, tiers, and fans to point at this object", kind: "ord" },
      { token: "checkout", meaning: "your name for the object (anything you like)", kind: "id" },
      { token: "#pill", meaning: "shape type: pill, process, sticky, decision, database, predefined-process, ...", kind: "type" },
      { token: "(M)", meaning: "size — S small chip, M standard, L large for emphasis. The solver picks the pixels.", kind: "size" },
    ],
    dsl: [
      'sec 1=panel label "Leaf placement"',
      "  leaf: NW 2=note#sticky(M) C 3=step#process(M) SE 4=tag#pill(S)",
      "edges:",
    ].join("\n"),
  },
  {
    id: "split",
    name: "row / col",
    syntax: "row 1|2   ·   col 1|1|4",
    meaning: "Divides a region into weighted bands. row puts children side by side (weights share the width); col stacks them (weights share the height). An empty corridor is kept between neighbors automatically, so lines have room to run.",
    docs: [
      { token: "row", meaning: "children left-to-right; 1|2 means the second band is twice as wide", kind: "op" },
      { token: "col", meaning: "children top-to-bottom; weights share the height instead", kind: "op" },
      { token: "1|2", meaning: "one weight per child, separated by | — proportions, not pixels" },
      { token: "(indent)", meaning: "the lines indented under a split are its children, in order", kind: "punct" },
    ],
    dsl: [
      "col 1|2",
      '  sec 1=side label "weight 1"',
      "    leaf: C 2=a#process(M)",
      '  sec 3=main label "weight 2"',
      "    leaf: C 4=b#process(L)",
      "edges:",
    ].join("\n"),
  },
  {
    id: "hug",
    name: "@corner (pinned lane)",
    syntax: "row 1@NW|3",
    meaning: "Adding @ and a corner to a weight pins that band: it keeps its natural content size, tucked into that corner, instead of stretching to fill the whole band (rule R7).",
    docs: [
      { token: "@NW", meaning: "the corner to pin to — any compass value; the child sits there at its natural size and never stretches", kind: "slot" },
      { token: "1@NW|3", meaning: "band 1 is pinned to the north-west corner; band 3 fills its space normally" },
    ],
    dsl: [
      "row 1@NW|3",
      '  sec 1=rail label "Lane @NW"',
      "    leaf: N 2=one#pill(S) C 3=two#pill(S) S 4=three#pill(S)",
      '  sec 5=stage label "Stage"',
      "    leaf: C 6=content#process(L)",
      "edges:",
    ].join("\n"),
    contrastDsl: [
      "row 1|3",
      '  sec 1=rail label "No hug"',
      "    leaf: N 2=one#pill(S) C 3=two#pill(S) S 4=three#pill(S)",
      '  sec 5=stage label "Stage"',
      "    leaf: C 6=content#process(L)",
      "edges:",
    ].join("\n"),
    contrastNote: "same program without @NW — the rail stretches across its whole band",
  },
  {
    id: "sec",
    name: "sec",
    syntax: 'sec 1=board label "Board"',
    meaning: "A labeled container with exactly one child (a leaf, grid, or split). Its frame is automatic: a 64px band at the top for the label, 48px of padding, and the section shrinks to fit its content (rule R3).",
    docs: [
      { token: "1=board", meaning: "reference number + the section's name" },
      { token: 'label "Board"', meaning: "optional display label for the header chip" },
      { token: "(one child)", meaning: "the single indented node under it — nest sections for hierarchy", kind: "punct" },
    ],
    dsl: [
      'sec 1=outer label "Automatic padding"',
      '  sec 2=inner label "Nested"',
      "    leaf: C 3=content#process(M)",
      "edges:",
    ].join("\n"),
  },
  {
    id: "grid",
    name: "grid",
    syntax: "grid 2x3 g32: 2=c1#process(M) ...",
    meaning: "Rows x columns of identical cells, filled row by row, with one shared gap. Cells keep their row and column identity, and that skeleton anchors everything placed later (rule R4).",
    docs: [
      { token: "2x3", meaning: "rows x columns; cells fill row by row", kind: "size" },
      { token: "flush / g32 / g64 / g96", meaning: "the gap between cells — flush means touching (tables); the rest come from the spacing ladder", kind: "size" },
      { token: "cells", meaning: "the same number=name#type(size) items as a leaf, but every cell gets the exact same size", kind: "id" },
    ],
    dsl: [
      'sec 1=table label "grid 2x3 g32"',
      "  grid 2x3 g32: 2=c1#process(M) 3=c2#process(M) 4=c3#process(M) 5=c4#process(M) 6=c5#process(M) 7=c6#process(M)",
      "edges:",
    ].join("\n"),
  },
  {
    id: "tier",
    name: "tier",
    syntax: "tier hero y: 2 5",
    meaning: "Lines up objects on one shared centerline — even across section boundaries, which nesting alone can never say (rule R5). Written after the tree.",
    docs: [
      { token: "hero", meaning: "a name for the centerline (anything you like)", kind: "id" },
      { token: "y:", meaning: "axis — y lines up y-centers (one horizontal row); x lines up x-centers (one column)", kind: "op" },
      { token: "2 5", meaning: "the members, by reference number — from anywhere in the tree", kind: "ord" },
    ],
    dsl: [
      "row 1|1",
      '  sec 1=left label "Left"',
      "    leaf: N 2=a#process(M) S 3=b#process(M)",
      '  sec 4=right label "Right"',
      "    leaf: C 5=c#process(M)",
      "tier t1 y: 2 5",
      "edges:",
    ].join("\n"),
    contrastDsl: [
      "row 1|1",
      '  sec 1=left label "Left"',
      "    leaf: N 2=a#process(M) S 3=b#process(M)",
      '  sec 4=right label "Right"',
      "    leaf: C 5=c#process(M)",
      "edges:",
    ].join("\n"),
    contrastNote: "same program without the tier line — a and c drift apart",
  },
  {
    id: "fan",
    name: "fan",
    syntax: "fan 2 > (3 4 5) S",
    meaning: "A hub with children spread out beside it: the children line up on one shared centerline, evenly spaced, and the hub centers itself over their midpoint with 64px of clearance (rule R6). Fans nest into trees.",
    docs: [
      { token: "2", meaning: "the hub, by reference number", kind: "ord" },
      { token: "(3 4 5)", meaning: "the children, by reference number — their order becomes left-to-right order", kind: "ord" },
      { token: "S", meaning: "which side of the hub the children sit on: N, S, E, or W", kind: "slot" },
    ],
    dsl: [
      'sec 1=tree label "fan S"',
      "  leaf: N 2=hub#decision(M) SW 3=a#process(M) S 4=b#process(M) SE 5=c#process(M)",
      "fan 2 > (3 4 5) S",
      "edges: 2>3 2>4 2>5",
    ].join("\n"),
  },
  {
    id: "edges",
    name: "edges",
    syntax: "edges: 2>4 4>6 6>2",
    meaning: "Declares the arrows, never their paths. from>to by reference number; the router computes every line's route — forward flow through the corridors, feedback loops around the outside (rule R9).",
    docs: [
      { token: "2>4", meaning: "an arrow from object 2 to object 4", kind: "ord" },
      { token: "(always last)", meaning: "the edges: line closes every program, even when there are no arrows", kind: "punct" },
      { token: "(no waypoints)", meaning: "there is deliberately no way to say where a line bends — routing is the solver's job", kind: "punct" },
    ],
    dsl: [
      "col 1|1|1",
      '  sec 1=s1 label "A"',
      "    leaf: C 2=a#process(M)",
      '  sec 3=s2 label "B"',
      "    leaf: C 4=b#process(M)",
      '  sec 5=s3 label "C"',
      "    leaf: C 6=c#process(M)",
      "edges: 2>4 4>6 6>2",
    ].join("\n"),
  },
];

/**
 * "How a program is shaped" exemplar — the indent-grammar teaching program.
 * Rendered as flat text AND as a nesting diagram; validated like every program.
 */
export const NESTING_EXAMPLE_DSL = [
  "col 2|1",
  '  sec 1=top label "Top"',
  "    grid 1x3 g32: 2=a#process(M) 3=b#process(M) 4=c#process(M)",
  '  sec 5=bottom label "Bottom"',
  "    leaf: W 6=note#sticky(S) C 7=core#process(L)",
  "tier hero y: 2 7",
  "edges: 2>3 3>4 4>7",
].join("\n");

export interface WorkedStep {
  title: string;
  annotation: string;
  /** Rules that fire on this step, by id. */
  rules: string[];
  dsl: string;
  /** Glosses rendered beside matching (trimmed) program lines. */
  notes?: Record<string, string>;
}

const STEP_1 = [
  "row 1@NW|4",
  '  sec 1=config label "Config"',
  "    leaf: N 2=checkout#pill(M) C 3=goals#pill(M) S 4=secrets#pill(M)",
  '  sec 5=stage label "Stage"',
  "    leaf: C 6=placeholder#sticky(M)",
  "edges:",
].join("\n");

const STEP_2 = [
  "row 1@NW|4",
  '  sec 1=config label "Config"',
  "    leaf: N 2=checkout#pill(M) C 3=goals#pill(M) S 4=secrets#pill(M)",
  '  sec 5=loop label "Runner loop"',
  "    grid 1x4 g96: 6=cli#process(M) 7=sched#process(M) 8=workers#process(M) 9=match#decision(M)",
  "edges:",
].join("\n");

const STEP_3 = [
  "row 1@NW|4",
  '  sec 1=config label "Config"',
  "    leaf: N 2=checkout#pill(M) C 3=goals#pill(M) S 4=secrets#pill(M)",
  "  col 2|1",
  '    sec 5=loop label "Runner loop"',
  "      grid 1x4 g96: 6=cli#process(M) 7=sched#process(M) 8=workers#process(M) 9=match#decision(M)",
  '    sec 10=board label "Board — hub"',
  "      grid 1x3 g64: 11=epochs#database(M) 12=artifacts#database(M) 13=saves#database(M)",
  "edges:",
].join("\n");

const STEP_4 = [
  "row 1@NW|4|2",
  '  sec 1=config label "Config"',
  "    leaf: N 2=checkout#pill(M) C 3=goals#pill(M) S 4=secrets#pill(M)",
  "  col 2|1",
  '    sec 5=loop label "Runner loop"',
  "      grid 1x4 g96: 6=cli#process(M) 7=sched#process(M) 8=workers#process(M) 9=match#decision(M)",
  '    sec 10=board label "Board — hub"',
  "      grid 1x3 g64: 11=epochs#database(M) 12=artifacts#database(M) 13=saves#database(M)",
  '  sec 14=score label "Score gate"',
  "    grid 3x1 g64: 15=objdiff#process(M) 16=qa#process(M) 17=regress#decision(M)",
  "edges:",
].join("\n");

const STEP_5 = [
  "row 1@NW|4|2",
  '  sec 1=config label "Config"',
  "    leaf: N 2=checkout#pill(M) C 3=goals#pill(M) S 4=secrets#pill(M)",
  "  col 2|1",
  '    sec 5=loop label "Runner loop"',
  "      grid 1x4 g96: 6=cli#process(M) 7=sched#process(M) 8=workers#process(M) 9=match#decision(M)",
  '    sec 10=board label "Board — hub"',
  "      grid 1x3 g64: 11=epochs#database(M) 12=artifacts#database(M) 13=saves#database(M)",
  '  sec 14=score label "Score gate"',
  "    grid 3x1 g64: 15=objdiff#process(M) 16=qa#process(M) 17=regress#decision(M)",
  "tier hero y: 6 15",
  "edges:",
].join("\n");

const STEP_6 = [
  "row 1@NW|4|2",
  '  sec 1=config label "Config"',
  "    leaf: N 2=checkout#pill(M) C 3=goals#pill(M) S 4=secrets#pill(M)",
  "  col 2|1",
  '    sec 5=loop label "Runner loop"',
  "      grid 1x4 g96: 6=cli#process(M) 7=sched#process(M) 8=workers#process(M) 9=match#decision(M)",
  '    sec 10=board label "Board — hub"',
  "      grid 1x3 g64: 11=epochs#database(M) 12=artifacts#database(M) 13=saves#database(M)",
  '  sec 14=score label "Score gate"',
  "    col 2|1",
  "      grid 3x1 g64: 15=objdiff#process(M) 16=qa#process(M) 17=regress#decision(M)",
  "      leaf: SW 18=absorb#pill(S) SE 19=reject#pill(S)",
  "tier hero y: 6 15",
  "fan 17 > (18 19) S",
  "edges: 6>7 7>8 8>9 9>15 15>16 16>17 17>18 17>19 9>8 13>15",
].join("\n");

const STEP_7 = [
  "row 1@NW|4|2",
  '  sec 1=config label "Config"',
  "    leaf: N 2=checkout#pill(M) C 3=goals#pill(M) S 4=secrets#pill(M)",
  "  col 2|1",
  '    sec 5=loop label "Runner loop"',
  "      grid 1x4 g96: 6=cli#process(M) 7=sched#process(M) 8=workers#process(M) 9=match#decision(M)",
  '    sec 10=board label "Board — hub"',
  "      grid 2x2 g64: 11=epochs#database(M) 12=artifacts#database(M) 13=saves#database(M) 20=cache#database(M)",
  '  sec 14=score label "Score gate"',
  "    col 2|1",
  "      grid 3x1 g64: 15=objdiff#process(M) 16=qa#process(M) 17=regress#decision(M)",
  "      leaf: SW 18=absorb#pill(S) SE 19=reject#pill(S)",
  "tier hero y: 6 15",
  "fan 17 > (18 19) S",
  "edges: 6>7 7>8 8>9 9>15 15>16 16>17 17>18 17>19 9>8 13>15",
].join("\n");

export const WORKED_STEPS: readonly WorkedStep[] = [
  {
    title: "A lane and a stage",
    annotation: "One row split. The config lane is pinned to the top-left at its natural size; the stage fills its band.",
    rules: ["R7", "R2"],
    dsl: STEP_1,
    notes: {
      "row 1@NW|4": "two bands side by side, 1:4 — the first is pinned top-left",
      'sec 1=config label "Config"': "a labeled container",
      "leaf: N 2=checkout#pill(M) C 3=goals#pill(M) S 4=secrets#pill(M)": "three pills, stacked N / C / S",
      'sec 5=stage label "Stage"': "placeholder for what comes next",
    },
  },
  {
    title: "The runner pipeline",
    annotation: "The stage becomes the runner loop: a 1x4 grid at the loose 96 gap.",
    rules: ["R3", "R4", "R2"],
    dsl: STEP_2,
    notes: {
      'sec 5=loop label "Runner loop"': "replaces the stage",
      "grid 1x4 g96: 6=cli#process(M) 7=sched#process(M) 8=workers#process(M) 9=match#decision(M)": "1 row x 4 identical cells, 96 gap",
    },
  },
  {
    title: "The board hub below",
    annotation: "The stage band splits 2:1 vertically; the board gets its own 1x3 grid of stores.",
    rules: ["R4", "R2", "R3"],
    dsl: STEP_3,
    notes: {
      "col 2|1": "loop over board, heights 2:1",
      "grid 1x3 g64: 11=epochs#database(M) 12=artifacts#database(M) 13=saves#database(M)": "three stores, 64 gap",
    },
  },
  {
    title: "A score column",
    annotation: "A third root band. The pinned lane keeps its size; the stage bands cede width and re-solve.",
    rules: ["R4", "R3"],
    dsl: STEP_4,
    notes: {
      "row 1@NW|4|2": "now three bands: 1:4:2",
      "grid 3x1 g64: 15=objdiff#process(M) 16=qa#process(M) 17=regress#decision(M)": "a vertical chain",
    },
  },
  {
    title: "Line up the hero row",
    annotation: "One tier line puts cli and objdiff on one shared horizontal centerline — across section boundaries.",
    rules: ["R5"],
    dsl: STEP_5,
    notes: {
      "tier hero y: 6 15": "6 = cli, 15 = objdiff — one centerline",
    },
  },
  {
    title: "Fan out, wire the arrows",
    annotation: "The decision fans out to absorb/reject; the edges block declares every arrow, including the 9>8 retry loop. Lines are routed, never drawn.",
    rules: ["R6", "R9"],
    dsl: STEP_6,
    notes: {
      "col 2|1": "score section: chain over outcomes",
      "leaf: SW 18=absorb#pill(S) SE 19=reject#pill(S)": "the two outcomes",
      "fan 17 > (18 19) S": "17 = regress; children south, evenly spaced",
      "edges: 6>7 7>8 8>9 9>15 15>16 16>17 17>18 17>19 9>8 13>15": "every arrow — 9>8 is the retry",
    },
  },
  {
    title: "The edit: one more store",
    annotation: "One changed line: the board grid goes 1x3 to 2x2 with a new cache cell. Watch how much of the board stays put.",
    rules: ["R4", "R10"],
    dsl: STEP_7,
    notes: {
      "grid 2x2 g64: 11=epochs#database(M) 12=artifacts#database(M) 13=saves#database(M) 20=cache#database(M)": "the edit — the grid re-solves around it",
    },
  },
];

export const WORKED_EXPAND_SIZE = { width: 1024, height: 576 };
export const LANGUAGE_EXPAND_SIZE = { width: 512, height: 336 };

/** Canonical pattern data, shared by internal context and external consumers. */
export interface VisualPattern {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Monospace conceptual sketch, not literal Canvas objects or coordinates. */
  readonly ascii: string;
  readonly useCase: string;
}

export const VISUAL_PATTERNS: readonly VisualPattern[] = [
  {
    id: "fan-out",
    name: "Fan-Out",
    description: "One source produces or delegates to many recipients. Spread recipients across the reading direction and label the dispatched work. Conditional choices belong to a decision; parallel delegation shows the recipients that actually work.",
    ascii: `[Source] --+--> [Recipient A]
          +--> [Recipient B]
          +--> [Recipient C]`,
    useCase: "A coordinator dispatches independent tasks to several workers.",
  },
  {
    id: "convergence",
    name: "Convergence",
    description: "Several contributions reach one receiving process or participant. Make clear whether it waits for all, selects one, or aggregates. Merging arrows alone does not establish synchronization; a join barrier needs an explicit wait step or label supported by the source.",
    ascii: `[Input A] --+
[Input B] --+--> [Combine] --> [Result]
[Input C] --+`,
    useCase: "An aggregator combines worker results into a single report.",
  },
  {
    id: "hierarchy",
    name: "Hierarchy",
    description: "Parent-child ownership or decomposition expressed through repeated local branches or justified nested sections. Label ownership separately from execution order. Use supported objects and connections for the branches.",
    ascii: `[Parent]
  +-- [Child A]
  |     +-- [Grandchild]
  +-- [Child B]`,
    useCase: "A service owns two subsystems, one of which owns a smaller component.",
  },
  {
    id: "sequence",
    name: "Sequence",
    description: "Ordered stages or events form a readable chain with labeled transitions. Preserve order, conditions, and terminal outcomes. A timeline uses supported steps or event objects.",
    ascii: `[Start] --> [Step 1] --> [Step 2] --> [End]`,
    useCase: "A request passes through validation, processing, and response delivery.",
  },
  {
    id: "feedback-cycle",
    name: "Feedback Cycle",
    description: "A result affects later work through a return connection between distinct stages or participants. Label the return trigger and destination. Canvas rejects a self-loop on one object.",
    ascii: `[Act] -----> [Observe]
  ^              |
  |              v
[Adjust] <-- [Evaluate]`,
    useCase: "An evaluator's findings guide the next revision of a generated result.",
  },
  {
    id: "transformation",
    name: "Transformation",
    description: "An input artifact passes through a transformation step to become an output artifact. Show what changed and which step changed it. Nearby before/after examples can explain the mechanism.",
    ascii: `[Input] --> [Transform] --> [Output]
 raw record                 indexed record`,
    useCase: "An indexing step converts a supplied source record into a searchable record.",
  },
  {
    id: "side-by-side",
    name: "Side-by-Side",
    description: "Two alternatives use parallel structures with corresponding parts aligned. Keep a consistent visual baseline so meaningful differences can be compared.",
    ascii: `Option A                  Option B
[Request]                 [Request]
    |                         |
    v                         v
[Database]                [Cache] --> [Database]`,
    useCase: "Compare direct database reads with a proposed cached read path.",
  },
  {
    id: "separation",
    name: "Separation",
    description: "A purposeful gap or section boundary separates phases or responsibilities. Explicit handoff connections show what crosses the boundary and who receives it. Whitespace alone cannot express causality.",
    ascii: `Responsibility A           Responsibility B
[Prepare] ----- handoff -----> [Receive]`,
    useCase: "A producer hands a completed work item to a separately owned processing service.",
  },
  {
    id: "shared-resource",
    name: "Shared Resource",
    description: "Several participants use one shared store placed near its consumers. Label read/write relationships and retain one store instead of drawing misleading duplicates.",
    ascii: `[Writer] --write--> [Shared Store] --read--> [Reader A]
                         |
                         +----------read--> [Reader B]`,
    useCase: "One ingestion process updates an index that multiple query services read.",
  },
];

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

/** Preserve sketch spacing and arrows while keeping every entry valid XML. */
export function renderVisualPatterns(patterns: readonly VisualPattern[] = VISUAL_PATTERNS): string {
  return [
    "<patterns>",
    ...patterns.map(pattern => [
      `  <pattern id="${escapeXml(pattern.id)}">`,
      `    <name>${escapeXml(pattern.name)}</name>`,
      `    <description>${escapeXml(pattern.description)}</description>`,
      `    <ascii xml:space="preserve"><![CDATA[${pattern.ascii.replaceAll("]]>", "]]]]><![CDATA[>")}]]></ascii>`,
      `    <use_case>${escapeXml(pattern.useCase)}</use_case>`,
      "  </pattern>",
    ].join("\n")),
    "</patterns>",
  ].join("\n");
}

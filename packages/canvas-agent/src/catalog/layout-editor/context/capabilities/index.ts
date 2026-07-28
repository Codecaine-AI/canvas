/**
 * The <capabilities> context block, assembled in two halves.
 *
 * FIRST the material: four nested XML kind blocks in reading order —
 * <sections>, <stickies>, <objects>, <connections> — each rendering as
 * <description> → <functionality> (one nested block per topic) → generated
 * rosters (<vocabulary> on objects, <fields> on connections) → <tips>. A kind
 * block says what the thing IS and how it behaves; it names no tools.
 *
 * THEN the gestures: one <gestures> block holding a child per verb group —
 * place, arrange, content, sections, edges, delete — each a group blurb
 * followed by its tools and their consequences. The groups, their order, and
 * the tools inside them are read off the registration roster
 * (service/session/tools/operations), so this half cannot drift from the
 * surface.
 *
 * Kind documentation lives in ./kinds (one file per kind); gesture
 * consequences come from ./ops.ts; the generated fragments come from
 * ./vocabulary.generated.ts, emitted by scripts/generate-capabilities.ts from
 * the validator's schema tables.
 *
 * The capabilities loader serves exactly this static text.
 */
import {
  CONNECTIONS_SPEC,
  OBJECTS_SPEC,
  SECTIONS_SPEC,
  STICKIES_SPEC,
  type CapabilityKind,
  type KindSpec,
  type SpecItem,
} from "./kinds";
import {
  formatGestureGroup,
  gestureGroups,
} from "./ops";
import {
  CAPABILITIES_CONNECTION_FIELDS_GENERATED,
  CAPABILITIES_OBJECTS_GENERATED,
} from "./vocabulary.generated";

export {
  GESTURE_GROUP_BLURBS,
  OP_REFERENCE,
  formatGestureGroup,
  gestureGroups,
  type GestureGroup,
} from "./ops";
export {
  CONNECTIONS_SPEC,
  OBJECTS_SPEC,
  SECTIONS_SPEC,
  STICKIES_SPEC,
  type CapabilityKind,
  type KindSpec,
  type SpecItem,
  type SpecPoint,
  type SpecTopic,
} from "./kinds";
export {
  CAPABILITIES_CONNECTION_FIELDS_GENERATED,
  CAPABILITIES_OBJECTS_GENERATED,
} from "./vocabulary.generated";

const CAPABILITIES_HEADER = [
  "The board holds four kinds of entity — sections, stickies, objects, and connections — and you change them with gestures: the moves a person makes with a mouse, one per call. The four blocks below describe the material — what each kind is and how it behaves. The <gestures> block after them describes what you can do to it, grouped by verb: place something, arrange it, change what it says or how it looks, work a frame, work an edge, delete. A tool's parameter schema states its fields; the entries here state what the call does to the board. A gesture applies, or it is refused and nothing changes.",
  "Every number you write into board geometry lands on a 20 grid — positions, sizes, nudges, gaps. It is enforced by snapping, not by refusal: an off-grid number is rounded to the nearest 20 and the result reports the geometry that actually landed, so read the applied numbers back instead of assuming yours survived. Text measurements and the 0..1 fractions — an endpoint's position, a label's place along its route — are not grid values and are left alone.",
].join("\n\n");

export const KIND_SPECS: Record<CapabilityKind, KindSpec> = {
  sections: SECTIONS_SPEC,
  stickies: STICKIES_SPEC,
  objects: OBJECTS_SPEC,
  connections: CONNECTIONS_SPEC,
};

const KIND_ORDER: readonly CapabilityKind[] = [
  "sections",
  "stickies",
  "objects",
  "connections",
];

const INDENT = "    ";

/** Indent every non-empty line of a flush-left block by `levels`. */
function indentBlock(text: string, levels: number): string[] {
  const prefix = INDENT.repeat(levels);
  return text.split("\n").map((line) => (line.length > 0 ? `${prefix}${line}` : line));
}

/** Wrap flush-left body lines in a tag at the given indent level. */
function tagBlock(tag: string, body: string, level: number): string[] {
  const prefix = INDENT.repeat(level);
  return [
    `${prefix}<${tag}>`,
    ...indentBlock(body, level + 1),
    `${prefix}</${tag}>`,
  ];
}

/** Render items as flush-left `- ` bullets, subpoints one level deeper. */
function bulletLines(items: readonly SpecItem[]): string {
  return items
    .flatMap((item) => {
      if (typeof item === "string") return [`- ${item}`];
      return [
        `- ${item.point}`,
        ...(item.subpoints ?? []).map((sub) => `${INDENT}- ${sub}`),
      ];
    })
    .join("\n");
}

function formatKindSection(kind: CapabilityKind): string {
  const spec = KIND_SPECS[kind];
  const lines = [
    `<${kind}>`,
    ...tagBlock("description", spec.description, 1),
  ];

  if (spec.functionality.length > 0) {
    lines.push(`${INDENT}<functionality>`);
    for (const topic of spec.functionality) {
      lines.push(...tagBlock(topic.topic, bulletLines(topic.items), 2));
    }
    lines.push(`${INDENT}</functionality>`);
  }

  if (kind === "objects") {
    lines.push(...tagBlock("vocabulary", CAPABILITIES_OBJECTS_GENERATED, 1));
  } else if (kind === "connections") {
    lines.push(...tagBlock("fields", CAPABILITIES_CONNECTION_FIELDS_GENERATED, 1));
  }

  if (spec.tips.length > 0) {
    lines.push(...tagBlock("tips", bulletLines(spec.tips), 1));
  }

  lines.push(`</${kind}>`);
  return lines.join("\n");
}

/**
 * The gesture half: one child block per verb group that the roster actually
 * has tools in, in the roster's own order.
 */
function formatGestureSection(): string {
  const lines = ["<gestures>"];
  for (const { group, tools } of gestureGroups()) {
    lines.push(...tagBlock(group, formatGestureGroup(group, tools), 1));
  }
  lines.push("</gestures>");
  return lines.join("\n");
}

/** The full static <capabilities> block: the material, then the gestures. */
export function formatCapabilities(): string {
  return [
    CAPABILITIES_HEADER,
    ...KIND_ORDER.map(formatKindSection),
    formatGestureSection(),
  ].join("\n\n");
}

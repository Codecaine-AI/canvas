/**
 * The <capabilities> context block, assembled as four nested XML kind blocks
 * in reading order: <sections>, <stickies>, <objects>, <connections>.
 *
 * Each kind renders as <description> → <ops> → <functionality> (one nested
 * block per topic) → generated rosters (<vocabulary> on objects, <fields> on
 * connections) → <tips>. Kind documentation lives in ./kinds (one file per
 * kind); op consequences come from ./ops.ts; the generated fragments come
 * from ./vocabulary.generated.ts, emitted by scripts/generate-capabilities.ts
 * from the validator's schema tables.
 *
 * The capabilities loader serves exactly this static text.
 */
import {
  CONNECTIONS_SPEC,
  OBJECTS_SPEC,
  SECTIONS_SPEC,
  STICKIES_SPEC,
  type KindSpec,
  type SpecItem,
} from "./kinds";
import {
  formatOpReference,
  type CapabilityKind,
} from "./ops";
import {
  CAPABILITIES_CONNECTION_FIELDS_GENERATED,
  CAPABILITIES_OBJECTS_GENERATED,
} from "./vocabulary.generated";

export {
  OP_KIND_GROUPS,
  OP_REFERENCE,
  formatOpReference,
  type CapabilityKind,
} from "./ops";
export {
  CONNECTIONS_SPEC,
  OBJECTS_SPEC,
  SECTIONS_SPEC,
  STICKIES_SPEC,
  type KindSpec,
  type SpecItem,
  type SpecPoint,
  type SpecTopic,
} from "./kinds";
export {
  CAPABILITIES_CONNECTION_FIELDS_GENERATED,
  CAPABILITIES_OBJECTS_GENERATED,
} from "./vocabulary.generated";

const CAPABILITIES_HEADER =
  "The board holds four kinds of entities — sections, stickies, objects, and connections — and thirteen operations act on them: add, update, and remove per kind, plus fit_section, which sections alone have. Each operation is its own tool and every call carries exactly one; the tool's parameter schema states its fields, and the entries below state what it does to the board. An operation applies, or it is refused and nothing changes.";

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
    ...tagBlock("ops", formatOpReference(kind), 1),
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

/** The full static <capabilities> block. */
export function formatCapabilities(): string {
  return [
    CAPABILITIES_HEADER,
    ...KIND_ORDER.map(formatKindSection),
  ].join("\n\n");
}

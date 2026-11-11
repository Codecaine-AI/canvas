import { OBJECT_PREFERENCES, type ObjectPreference } from "../objects/registry";
import { ICON_GLYPH_CATEGORIES, resolveIconGlyph } from "../objects/shapes/icon/icon-glyphs";
import { CANVAS_COLORS } from "../state/schema/colors";
import { CANVAS_THEME_IDS } from "../theme/canvas-style";
import { TOUCH_GUTTER } from "../board/section-colors";
import { BRAND_GLYPH_PREFIX, isBrandGlyph, isGlyphName } from "../session/tools/glyph-names";
import type { AuthoringTopic } from "./design";

const xml = (value: string) => value.replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const indent = (text: string) => text.split("\n").map(line => line ? `    ${line}` : line).join("\n");

/** Heads the brand logos: when a logo is right, where to find more, and when the generic glyph is. */
const BRAND_RULE = `Brand icons (${BRAND_GLYPH_PREFIX}*) are product logos. A node that names a real product or provider uses its brand icon, and find_icon searches every brand by name. An unnamed role gets the generic glyph: PostgreSQL gets ${BRAND_GLYPH_PREFIX}postgres, and an unnamed database gets database.`;

interface CatalogGroup {
  readonly name: string;
  readonly lead?: string;
  readonly entries: readonly ObjectPreference[];
}

/** A registry glyph's group: the same category in every icon pack. Undefined for a shape type. */
const categoryOf = (name: string) => isGlyphName(name) ? resolveIconGlyph(name, "nucleo").category : undefined;

/** The generic glyphs, or the brand logos, by category in the registry's display order. */
function glyphGroups(brands: boolean): CatalogGroup[] {
  return ICON_GLYPH_CATEGORIES
    .map(({ id, label }) => ({
      name: label,
      entries: OBJECT_PREFERENCES.filter(entry =>
        categoryOf(entry.name) === id && isBrandGlyph(entry.name) === brands),
    }))
    .filter(group => group.entries.length > 0);
}

/**
 * Every registry entry exactly once, in named groups: the shapes, the generic
 * glyphs by category, then the brand logos, each group in roster order.
 */
function catalogGroups(): CatalogGroup[] {
  return [
    { name: "Shapes", entries: OBJECT_PREFERENCES.filter(entry => categoryOf(entry.name) === undefined) },
    ...glyphGroups(false),
    ...glyphGroups(true).map((group, index) => index === 0 ? { ...group, lead: BRAND_RULE } : group),
  ];
}

/** How many object kinds the catalog lists, and in how many groups. */
export function catalogCounts(): { kinds: number; groups: number } {
  const groups = catalogGroups();
  return { kinds: groups.reduce((sum, group) => sum + group.entries.length, 0), groups: groups.length };
}

/** One line per entry: name, preferred color, meaning, then its uses. */
function formatCatalogGroup({ name, lead, entries }: CatalogGroup): string {
  const bullets = entries.map(entry =>
    `- ${xml(entry.name)} (${xml(entry.color)}): ${xml(entry.meaning)}. Use when: ${entry.scenarios.map(xml).join("; ")}.`).join("\n");
  return `<group name="${xml(name)}">\n${indent(lead ? `${xml(lead)}\n\n${bullets}` : bullets)}\n</group>`;
}

/** One complete catalog for shapes and glyphs, generated from the live registry. */
export function visualVocabulary(): AuthoringTopic {
  return {
    id: "visual_vocabulary",
    title: "Visual Vocabulary",
    text: `<entity_kinds>
    - A section is a titled frame that groups related content. It holds objects and other sections, and its header shows an optional icon and the title.
    - A shape or a glyph is a diagram node, and its type says what it is. A shape's name renders inside it, and a glyph's name below it.
    - A sticky holds Markdown text: an explanation or a concrete example beside its subject.
    - A connection is a routed wire between two objects, stickies or sections.
</entity_kinds>

<object_catalog>
    Choose the type by what the node is. Each line gives the name, its preferred color, its meaning and its uses. The shapes come first, then the glyphs by category, then the brand icons. A glyph name is an icon object's type, and any glyph can also be a section's header icon.

${indent(catalogGroups().map(formatCatalogGroup).join("\n\n"))}
</object_catalog>`,
  };
}

export function colorPalette(): AuthoringTopic {
  return {
    id: "color_palette",
    title: "Color Palette",
    text: `${CANVAS_COLORS.join(", ")}

<color_meaning>
    Color encodes kind, not decoration. Give each kind of thing one hue, such as one for every data store and another for every agent.

    - Before you place nodes, write the board's color key: three to five roles, one hue each.
    - Give the sections hues too, and vary them across the board. Use gray only for a section with no role hue. A board of gray frames reads as one flat template.
    - A section never takes the color of a node or a sticky it holds, even when all its nodes share one hue: a blue node sits in a violet or gray section, never a blue one. A sticky is yellow by default, so a section that holds one is not yellow.
    - A nested section never shares its parent's color, and a gray section never sits directly in a gray section. Two sibling sections closer than one gutter (${TOUCH_GUTTER}px) never share a color.
    - A node takes its role's hue, whatever its icon. Use the preferred color a catalog entry lists only when its role has no hue in the key.
    - Red means failure, reject, or error, and nothing else. Keep orange, yellow and pink for emphasis you choose.
    - When a viewer cannot guess the key from the names, put it on the board as a short note, one line per hue.
</color_meaning>

<theme>
    The workspace theme (${CANVAS_THEME_IDS.join(", ")}) decides how each color renders. Never change it, and never design for one theme: the same board renders in every theme.
</theme>`,
  };
}

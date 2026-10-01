import { OBJECT_PREFERENCES, type ObjectPreference } from "../../../canvas/src/objects/registry";
import { ICON_GLYPH_CATEGORIES, resolveIconGlyph } from "../../../canvas/src/objects/shapes/icon/icon-glyphs";
import { CANVAS_COLORS } from "../../../canvas/src/state/schema/colors";
import { CANVAS_STYLE_FILENAME, CANVAS_THEME_IDS } from "../../../canvas/src/theme/canvas-style";
import { BRAND_GLYPH_PREFIX, isBrandGlyph, isGlyphName } from "../service/session/tools/glyph-names";
import type { AuthoringTopic } from "./design";

const xml = (value: string) => value.replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const indent = (text: string) => text.split("\n").map(line => line ? `    ${line}` : line).join("\n");

/** Heads the brand logos: when a logo is right, and when the generic glyph is. */
const BRAND_RULE = `Brand logos (${BRAND_GLYPH_PREFIX}*) are filled product logos. Use one only for the exact product the diagram names, and the generic glyph for the role: PostgreSQL gets ${BRAND_GLYPH_PREFIX}postgres, and an unnamed database gets database. The roster has no AWS or OpenAI logos.`;

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

function formatCatalogGroup({ name, lead, entries }: CatalogGroup): string {
  const bullets = entries.map(entry => `- ${xml(entry.name)} (${xml(entry.color)})
    - Meaning: ${xml(entry.meaning)}
    - Use when:
${entry.scenarios.map(scenario => `        - ${xml(scenario)}`).join("\n")}`).join("\n\n");
  return `<group name="${xml(name)}">\n${indent(lead ? `${xml(lead)}\n\n${bullets}` : bullets)}\n</group>`;
}

/** One complete catalog for shapes and glyphs, generated from the live registry. */
export function visualVocabulary(): AuthoringTopic {
  return {
    id: "visual_vocabulary",
    title: "Visual Vocabulary",
    text: `<entity_kinds>
    <sections>
        A section is a titled frame that groups related content. Sections can contain objects and other sections.

        The header shows an optional icon, the title, and an optional detail: one short fact after the title.
    </sections>

    <objects>
        Shapes and glyphs represent diagram nodes. Their type communicates what they represent.

        Shape labels render inside the shape. Glyph labels render below the glyph. Either can add one detail line under its label: a single fact, rendered muted.
    </objects>

    <stickies>
        A sticky holds Markdown text for supporting explanations and concrete examples.
    </stickies>

    <connections>
        A connection is a routed wire between two objects. Its label describes their relationship.

        Connections can attach to shapes, glyphs, stickies, and sections.
    </connections>
</entity_kinds>

<object_catalog>
    Choose shape based on what it represents.

    Each bullet gives the supported name and preferred color, followed by its meaning and use cases. The shapes come first, then the glyphs by category, then the brand logos. A glyph name is an icon object's type, and any glyph can also be a section's header icon.

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
    Color encodes kind, not decoration. Give each kind of thing one hue, such as one for every data store and another for every agent. Most nodes keep gray or the preferred color their catalog entry lists.
</color_meaning>

<theme>
    The visual theme (${CANVAS_THEME_IDS.join(", ")}) is a workspace setting a person picks in Studio, stored in canvases/${CANVAS_STYLE_FILENAME}. It decides how each roster color renders. Never change the theme, and never design for a single theme: the same board renders in every theme.
</theme>`,
  };
}

import { OBJECT_PREFERENCES } from "../../../canvas/src/objects/registry";
import { CANVAS_COLORS } from "../../../canvas/src/state/schema/colors";
import type { AuthoringTopic } from "./design";

const xml = (value: string) => value.replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** One complete catalog for shapes and glyphs, generated from the live registry. */
export function visualVocabulary(): AuthoringTopic {
  return {
    id: "visual_vocabulary",
    title: "Visual Vocabulary",
    text: `<entity_kinds>
    <sections>
        A section is a titled frame that groups related content. Sections can contain objects and other sections.
    </sections>

    <objects>
        Shapes and glyphs represent diagram nodes. Their type communicates what they represent.

        Shape labels render inside the shape. Glyph labels render below the glyph.
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

    Each bullet gives the supported name and preferred color, followed by its meaning and use cases.

${OBJECT_PREFERENCES.map(entry => `    - ${xml(entry.name)} (${xml(entry.color)})
        - Meaning: ${xml(entry.meaning)}
        - Use when:
${entry.scenarios.map(scenario => `            - ${xml(scenario)}`).join("\n")}`).join("\n\n")}
</object_catalog>`,
  };
}

export function colorPalette(): AuthoringTopic {
  return {
    id: "color_palette",
    title: "Color Palette",
    text: CANVAS_COLORS.join(", "),
  };
}

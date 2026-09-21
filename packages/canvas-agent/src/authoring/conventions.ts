import { formatCraftTargets } from "../catalog/layout-editor/context/style-guide/craft-targets";
import { creationDefaultFor } from "../service/session/tools/creation-defaults";
import { AGENT_GRID } from "../service/session/tools/grid";
import type { AuthoringTopic } from "./design";

export function canvasConventions(): AuthoringTopic {
  const defaults = ["shape", "icon", "sticky", "section"].map(kind => {
    const { size, color } = creationDefaultFor(kind);
    const colorText = kind === "shape" || kind === "icon"
      ? "the object's preferred color from the catalog"
      : color;
    return `        - ${kind}: ${size.width}×${size.height}; ${colorText}.`;
  }).join("\n");
  return {
    id: "canvas_conventions",
    title: "Canvas Conventions",
    text: `<identity>
    - Use descriptive string IDs for sections, objects, stickies, and connections.
    - Give each new section a stable numbered prefix and a descriptive name, such as s01-ingestion or s02-retrieval. Reuse the full section prefix for its objects, stickies, and internal connections.
    - IDs must be unique across objects and connections. Section prefixes do not create separate ID spaces.
    - Preserve existing IDs when editing existing content.

    Creation actions accept the IDs you choose and reject collisions.

    <naming_examples>
        | Entity | ID | Visible title or label |
        | --- | --- | --- |
        | Ingestion section | s01-ingestion | Ingestion |
        | Parser in that section | s01-ingestion-parser | Parse source |
        | Supporting sticky | s01-ingestion-input-example | Input example |
        | Internal connection | s01-ingestion-parser-to-index | writes |
        | Retrieval section | s02-retrieval | Retrieval |
        | Cross-section connection | s01-ingestion-to-s02-retrieval | indexed records |

        Use descriptive strings rather than IDs such as object1 or shape2. The group number identifies the section; the remaining words identify the entity's purpose. Visible labels stay short and do not need the ID prefix.

        Keep group numbers stable when sections move or the reading order changes. For additions to an existing diagram, follow its naming convention and preserve its IDs. Choose an unused group prefix for a new section and check every complete ID for collisions.

        Prefixes group names for readability; they do not create containment or connect objects. Section membership remains geometric, and connections use actual endpoint IDs.
    </naming_examples>
</identity>

<containment>
    Membership is geometric: whatever sits inside a frame's bounds is that section's child.

    Position is the membership signal. You do not supply a parent ID.

    The base section is the page; grow it when the diagram needs room. Only sections contain other entities.

    Sections keep their geometry as content changes. fit_section fits a frame around its current children; it does not fit its ancestors automatically.
</containment>

<connection_binding>
    Connections reference their endpoint objects directly. Both endpoint objects must exist before connecting them.

    Routes recompute when endpoint objects move or resize. Cross-section connections use the same endpoint references as connections within a section.

    Connections route orthogonally. Routing controls adjust the connection without moving its objects.
</connection_binding>

<geometry>
    Use multiples of ${AGENT_GRID} for the positions, widths, heights, nudges, gaps, padding, and routing coordinates you choose. For example: a 280×100 object at (240, 480), a 140-unit gap, or a 40-unit padding. A multiple of 10 that is not also a multiple of ${AGENT_GRID} is off-grid.

    Tools snap the geometry they write to the ${AGENT_GRID}-unit grid. Tool results report the geometry that actually landed; use those applied values for the next edit.

    Endpoint positions and label positions along a route are 0–1 fractions, not grid distances. Text measurements and untouched geometry may also be off-grid. Do not change unrelated existing content solely to normalize its geometry.

    <creation_defaults>
${defaults}
    </creation_defaults>

    <spacing_targets>
${formatCraftTargets().split("\n").map(line => line ? `        ${line}` : "").join("\n")}
    </spacing_targets>

    Spacing targets are starting points for local groups. Adjust them for content, labels, and actual routes.
</geometry>`,
  };
}

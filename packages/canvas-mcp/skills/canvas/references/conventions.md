<!-- Generated from packages/canvas/src/authoring/conventions.ts (sha256 7512963793f4dc173bdaf245b42bba4841aa1e48ec9cab3b5313e609c438f474). Do not edit. Regenerate with `bun packages/canvas-mcp/src/cli.ts guidance --write`. -->

# Canvas Conventions

<identity>
    - Use descriptive string IDs for sections, objects, stickies, and connections.
    - Give each new section a stable numbered prefix and a descriptive name, such as s01-ingestion or s02-retrieval. Reuse the full section prefix for its objects, stickies, and internal connections.
    - IDs must be unique across objects and connections. Section prefixes do not create separate ID spaces.
    - Preserve existing IDs when editing existing content.

    Creation actions accept the IDs you choose and reject collisions.

    <naming_examples>
        | Entity | ID | Visible title or label | Detail |
        | --- | --- | --- | --- |
        | Ingestion section | s01-ingestion | Ingestion | nightly batch |
        | Parser in that section | s01-ingestion-parser | Parse source | tree-sitter |
        | Supporting sticky | s01-ingestion-input-example | Input example | |
        | Internal connection | s01-ingestion-parser-to-index | writes | |
        | Retrieval section | s02-retrieval | Retrieval | pgvector |
        | Cross-section connection | s01-ingestion-to-s02-retrieval | indexed records | |

        Use descriptive strings rather than IDs such as object1 or shape2. The group number identifies the section; the remaining words identify the entity's purpose. Visible labels stay short and do not need the ID prefix. Stickies and connections have no detail line.

        Keep group numbers stable when sections move or the reading order changes. For additions to an existing diagram, follow its naming convention and preserve its IDs. Choose an unused group prefix for a new section and check every complete ID for collisions.

        Prefixes group names for readability; they do not create containment or connect objects. Section membership remains geometric, and connections use actual endpoint IDs.
    </naming_examples>
</identity>

<text_limits>
    Names and detail lines on shapes, icons, and sections have limits, and two lint warnings enforce them:

    - label-is-prose: a name over 6 words or 40 characters, or one with a sentence break or line break. Aim for 5 words or fewer.
    - detail-too-long: a detail over 48 characters, with more than one sentence, or with a line break.

    To fix either, shorten the name, keep one fact in the detail, and move the rest to a sticky beside the subject. Sticky bodies and connection labels are outside these limits.

    Both warnings judge only the text you write: names and details on objects you create, and ones you change. A person's existing labels are theirs, so leave them as they are unless the request asks you to edit them.
</text_limits>

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
    Use multiples of 20 for the positions, widths, heights, nudges, gaps, padding, and routing coordinates you choose. For example: a 280×100 object at (240, 480), a 140-unit gap, or a 40-unit padding. A multiple of 10 that is not also a multiple of 20 is off-grid.

    Tools snap the geometry they write to the 20-unit grid. Tool results report the geometry that actually landed; use those applied values for the next edit.

    Endpoint positions and label positions along a route are 0–1 fractions, not grid distances. Text measurements and untouched geometry may also be off-grid. Do not change unrelated existing content solely to normalize its geometry.

    <creation_defaults>
        - shape: 280×100; the object's preferred color from the catalog.
        - icon: 300×120; the object's preferred color from the catalog.
        - sticky: 180×120; yellow.
        - section: 480×360; gray.
    </creation_defaults>

    <spacing_targets>
        Starting dimensions for local peer groups, not composition mandates. Adjust them for content and actual routes; section sizes and counts follow meaning.

        - flow node: 280×100, never narrower than 240
        - node gaps: 140 across a row, 100 down a column
        - arrow corridor: 100 of clear channel wherever a wire and its label pass between siblings
        - section gutters: 140 side by side, 160 between stacked rows
        - frame padding: 40 inside every frame before its first child
    </spacing_targets>

    Spacing targets are starting points for local groups. Adjust them for content, labels, and actual routes.
</geometry>

<!-- Generated from packages/canvas/src/authoring/vocabulary.ts (sha256 bcdcab7e8ebb1dbcb317a80265fa3f68543a4b48902e51be6f8964152ada8ab7). Do not edit. Regenerate with `bun packages/canvas-mcp/src/cli.ts guidance --write`. -->

# Color Palette

gray, red, orange, yellow, green, teal, blue, violet, pink, white

<color_meaning>
    Color encodes kind, not decoration. Give each kind of thing one hue, such as one for every data store and another for every agent.

    - Before you place nodes, write the board's color key: three to five roles, one hue each.
    - Sections show where each group starts and ends. A nested section never shares its parent's color. Two sibling sections closer than one gutter (48px) never share a color. Siblings with whitespace between them can share one, so sections with one role keep one color.
    - A section never takes the hue of a node it holds. Keep section colors off the key's hues: gray first, then at most three cool hues (blue, violet, green, teal) on one board. Keep orange, yellow, pink and red for emphasis you choose.
    - A node takes its role's hue, whatever its icon. Use the preferred color a catalog entry lists only when its role has no hue in the key, so two nodes with different roles never share a hue by accident.
    - Red means failure, reject, or error, and nothing else.
    - When a viewer cannot guess the key from the names, put it on the board as a short note, one line per hue. A key that is only in the board description is invisible.
</color_meaning>

<theme>
    The visual theme (figjam, schematic-light, schematic-dark) is a workspace setting a person picks in Studio, stored in canvases/canvas-style.json. It decides how each roster color renders. Never change the theme, and never design for a single theme: the same board renders in every theme.
</theme>

<!-- Generated from packages/canvas/src/authoring/vocabulary.ts (sha256 783f926700a0cfa2d4dac9ce43a0e8971400656e85acb15a53cc7d4940938aa5). Do not edit. Regenerate with `bun packages/canvas-mcp/src/cli.ts guidance --write`. -->

# Color Palette

gray, red, orange, yellow, green, teal, blue, violet, pink, white

<color_meaning>
    Color encodes kind, not decoration. Give each kind of thing one hue, such as one for every data store and another for every agent.

    - Before you place nodes, write the board's color key: three to five roles, one hue each.
    - Sections show where each group starts and ends. A nested section never shares its parent's color. Two sibling sections closer than one gutter (48px) never share a color. Siblings with whitespace between them can share one, so sections with one role keep one color.
    - A category section holds nodes of one hue, such as every agent node. It can take that hue, so the frame names the category. A section that holds nodes of several hues never takes one of them.
    - Keep other section colors off the key's hues: gray first, then at most three cool hues (blue, violet, green, teal) on one board. Category sections count toward the three, and keep their hue past it. Keep orange, yellow, pink and red for emphasis you choose.
    - A node takes its role's hue, whatever its icon. Use the preferred color a catalog entry lists only when its role has no hue in the key, so two nodes with different roles never share a hue by accident.
    - Red means failure, reject, or error, and nothing else.
    - When a viewer cannot guess the key from the names, put it on the board as a short note, one line per hue. A key that is only in the board description is invisible.
</color_meaning>

<theme>
    The visual theme (figjam, schematic-light, schematic-dark) is a workspace setting a person picks in Studio, stored in canvases/canvas-style.json. It decides how each roster color renders. Never change the theme, and never design for a single theme: the same board renders in every theme.
</theme>

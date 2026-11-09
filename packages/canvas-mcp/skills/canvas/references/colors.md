<!-- Generated from packages/canvas/src/authoring/vocabulary.ts (sha256 4707e10ae834efa98243fb68ee531bb786779e25f1d2acaf1700efd2cda7d192). Do not edit. Regenerate with `bun packages/canvas-mcp/src/cli.ts guidance --write`. -->

# Color Palette

gray, red, orange, yellow, green, teal, blue, violet, pink, white

<color_meaning>
    Color encodes kind, not decoration. Give each kind of thing one hue, such as one for every data store and another for every agent.

    - Before you place nodes, write the board's color key: three to five roles, one hue each. Give each section the hue of the role it holds.
    - Give each top-level section its own hue. A nested section never shares its parent's color.
    - A node takes its role's hue, whatever its icon. Use the preferred color a catalog entry lists only when its role has no hue in the key, so two nodes with different roles never share a hue by accident.
    - Red means failure, reject, or error, and nothing else.
    - When a viewer cannot guess the key from the names, put it on the board as a short note, one line per hue. A key that is only in the board description is invisible.
</color_meaning>

<theme>
    The visual theme (figjam, schematic-light, schematic-dark) is a workspace setting a person picks in Studio, stored in canvases/canvas-style.json. It decides how each roster color renders. Never change the theme, and never design for a single theme: the same board renders in every theme.
</theme>

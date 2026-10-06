import { CANVAS_STYLE_CONTROLS, type CanvasStyleKey } from "@codecaine-ai/canvas/style";

/** The rail ships without its color controls; their code stays behind this flag. */
export const SHOW_COLOR_CONTROLS = false;

/** Number controls that only set how strong a color is, hidden with the color rows. */
export const COLOR_STRENGTH_KEYS: ReadonlySet<CanvasStyleKey> = new Set<CanvasStyleKey>([
  "sectionTintBase",
  "sectionTintStep",
  "sectionTintMax",
  "sectionBorderOpacity",
  "headerChipMix",
]);

/** Every token control; the theme itself is picked with the cards above the groups. */
export const TOKEN_CONTROLS = CANVAS_STYLE_CONTROLS.filter((control) => control.key !== "theme");

export const GROUP_ORDER = Array.from(new Set(TOKEN_CONTROLS.map((control) => control.group)));

/**
 * Which groups are expanded — remembered across rail opens. v2 since the color
 * controls were hidden (decision 42: the rail's own UI keys move; the settings
 * cache and canvas-style.json, which hold the board's colors, stay).
 */
export const OPEN_GROUPS_STORAGE_KEY = "canvas-studio-style-rail-groups.v2";

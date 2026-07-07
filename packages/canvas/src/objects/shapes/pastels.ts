/**
 * Shared shape pastel palette (moved from theme/tokens.ts in the theme
 * dispersal — shape-family palette data co-locates with the shape defs).
 * Values sampled from FigJam reference exports.
 */

/** Fill/stroke pastel pairs shared by shapes, chips, and the palette popover. */
export const PASTEL_PAIRS = {
  gray: { fill: "#E6E6E6", stroke: "#C4C4C4" },
  gray2: { fill: "#D9D9D9", stroke: "#B3B3B3" },
  blue: { fill: "#C2E5FF", stroke: "#3DADFF" },
  yellow: { fill: "#FFECBD", stroke: "#FFC943" },
  orange: { fill: "#FFE0C2", stroke: "#FF9E42" },
  red: { fill: "#FFC7C2", stroke: "#F24822" },
  green: { fill: "#DDF8E2", stroke: "#66D575" },
  greenChip: { fill: "#CDF4D3", stroke: "#66D575" },
  purple: { fill: "#DCCCFF", stroke: "#874FFF" },
  purple2: { fill: "#E4CCFF", stroke: "#874FFF" },
  teal: { fill: "#5AD8CC", stroke: "#369E94" },
  pink: { fill: "#FFC2EC", stroke: "#F849C1" },
} as const;

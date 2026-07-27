/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate: bun packages/canvas/scripts/generate-inter-metrics.ts
 *
 * Advance widths (font units) parsed from the app's bundled Inter variable
 * TTF (packages/canvas-agent/assets/fonts/Inter-Variable.ttf).
 *
 * - `INTER_ADVANCES_REGULAR` reflects the font's DEFAULT INSTANCE
 *   (wght 400) straight from hmtx — what the browser uses for normal-weight
 *   Inter text.
 * - `INTER_ADVANCES_BOLD` is the wght-700 instance (hmtx + the HVAR
 *   advance deltas at the normalized wght coordinate) — what the browser
 *   uses for font-weight 700 Inter text.
 *
 * Coverage: ASCII, Latin-1, general punctuation, arrows U+2190–U+21FF and a
 * small symbol set; codepoints the font's cmap does not map are omitted.
 * Consumers use the fallback advances (rounded mean of the covered set) for
 * uncovered codepoints — see render/text-metrics.ts.
 */

export interface InterAdvanceRange {
  /** First codepoint of the run. */
  readonly start: number;
  /** Advance widths (font units) for start, start+1, … in order. */
  readonly advances: readonly number[];
}

/** Font units per em (head.unitsPerEm). */
export const INTER_UNITS_PER_EM = 2816;

/** Fallback advance (font units) for codepoints outside the table. */
export const INTER_FALLBACK_ADVANCE_REGULAR = 1707;
export const INTER_FALLBACK_ADVANCE_BOLD = 1781;

export const INTER_ADVANCES_REGULAR: readonly InterAdvanceRange[] = [
  { start: 0x20, advances: [792, 784, 1136, 1776, 1796, 2288, 1800, 624, 1020, 1020, 1408, 1856, 788, 1296, 776, 1004, 1760, 1308, 1704, 1792, 1808, 1712, 1756, 1608, 1736, 1756, 776, 788, 1856, 1856, 1856, 1428, 2636, 1904, 1832, 2048, 2024, 1684, 1652, 2092, 2084, 744, 1528, 1836, 1584, 2504, 2120, 2144, 1788, 2144, 1800, 1796, 1808, 2088, 1904, 2672, 1808, 1872, 1760, 1020, 1004, 1020, 1320, 1272, 1400, 1588, 1748, 1572, 1748, 1640, 1016, 1716, 1664, 668, 668, 1532, 668, 2448, 1648, 1680, 1716, 1716, 1048, 1472, 1024, 1636, 1568, 2288, 1520, 1568, 1524, 1020, 920, 1020, 1856] },
  { start: 0xa0, advances: [792, 784, 1572, 1776, 2036, 1544, 748, 1552, 1664, 2576, 1264, 1520, 1520, 1296, 1888, 1264, 1280, 1856, 1184, 1212, 1400, 1752, 1688, 776, 752, 882, 1264, 1520, 2488, 2608, 2672, 1428, 1904, 1904, 1904, 1904, 1904, 1904, 2788, 2048, 1684, 1684, 1684, 1684, 744, 744, 744, 744, 2024, 2120, 2144, 2144, 2144, 2144, 2144, 1856, 2144, 2088, 2088, 2088, 2088, 1872, 1776, 1716, 1588, 1588, 1588, 1588, 1588, 1588, 2604, 1572, 1640, 1640, 1640, 1640, 668, 668, 668, 668, 1632, 1648, 1680, 1680, 1680, 1680, 1680, 1856, 1680, 1636, 1636, 1636, 1636, 1568, 1716, 1568] },
  { start: 0x2010, advances: [1008, 1008, 1824, 1408, 2816, 2816, 1008, 1272, 560, 520, 560, 624, 1072, 1072, 1072, 1264, 1776, 1520, 1584, 1584, 752, 1544, 2312, 752] },
  { start: 0x2030, advances: [2944, 3572, 620, 1140, 1660, 620, 1140, 1660, 1264, 1008, 1008] },
  { start: 0x2190, advances: [2688, 2688, 2688, 2688, 3776, 2688, 2688, 2688, 2688, 2688] },
  { start: 0x21a9, advances: [3218, 3218] },
  { start: 0x21b0, advances: [2774, 2774] },
  { start: 0x21b3, advances: [2774, 2336, 2774] },
  { start: 0x21ba, advances: [2688, 2688] },
  { start: 0x21d0, advances: [2688] },
  { start: 0x21d2, advances: [2688] },
  { start: 0x21d4, advances: [3776] },
  { start: 0x21de, advances: [1700, 1700] },
  { start: 0x21e4, advances: [2848, 2848] },
  { start: 0x21e7, advances: [2880] },
  { start: 0x21ea, advances: [2880] },
  { start: 0x2212, advances: [1856] },
  { start: 0x2248, advances: [1856] },
  { start: 0x2260, advances: [1856] },
  { start: 0x2264, advances: [1856, 1856] },
  { start: 0x25aa, advances: [1584] },
  { start: 0x25cf, advances: [2576] },
  { start: 0x25e6, advances: [1584] },
  { start: 0x2713, advances: [2480] },
  { start: 0x2717, advances: [2480] },
];

export const INTER_ADVANCES_BOLD: readonly InterAdvanceRange[] = [
  { start: 0x20, advances: [653, 914, 1105, 1829, 1844, 2420, 1898, 588, 1152, 1152, 1590, 1914, 853, 1320, 838, 1098, 1938, 1378, 1774, 1857, 1909, 1815, 1859, 1675, 1861, 1859, 838, 853, 1914, 1914, 1914, 1584, 2902, 2106, 1861, 2118, 2048, 1725, 1647, 2142, 2101, 790, 1605, 1942, 1598, 2576, 2070, 2202, 1824, 2204, 1848, 1844, 1882, 2054, 2106, 2917, 2012, 2040, 1878, 1152, 1098, 1152, 1373, 1342, 1400, 1634, 1789, 1654, 1789, 1683, 1086, 1783, 1758, 766, 766, 1638, 766, 2568, 1751, 1728, 1781, 1781, 1151, 1582, 1094, 1751, 1650, 2394, 1616, 1650, 1610, 1152, 1052, 1152, 1914] },
  { start: 0xa0, advances: [653, 914, 1654, 1891, 2154, 1611, 971, 1670, 1506, 2576, 1372, 1762, 1633, 1320, 1869, 1590, 1294, 1914, 1194, 1246, 1400, 1877, 1717, 838, 1054, 904, 1365, 1772, 2476, 2579, 2718, 1584, 2106, 2106, 2106, 2106, 2106, 2106, 2901, 2118, 1725, 1725, 1725, 1725, 790, 790, 790, 790, 2048, 2070, 2202, 2202, 2202, 2202, 2202, 1914, 2202, 2054, 2054, 2054, 2054, 2040, 1889, 1870, 1634, 1634, 1634, 1634, 1634, 1634, 2573, 1654, 1683, 1683, 1683, 1683, 766, 766, 766, 766, 1688, 1751, 1728, 1728, 1728, 1728, 1728, 1914, 1728, 1751, 1751, 1751, 1751, 1650, 1726, 1650] },
  { start: 0x2010, advances: [1308, 1308, 1920, 1408, 2816, 2816, 1421, 1346, 682, 642, 682, 694, 1187, 1185, 1185, 1250, 1668, 1618, 1306, 1306, 831, 1544, 2250, 831] },
  { start: 0x2030, advances: [3078, 3752, 786, 1378, 1970, 786, 1378, 1970, 1566, 1104, 1104] },
  { start: 0x2190, advances: [2688, 2688, 2688, 2688, 3776, 2688, 2688, 2688, 2688, 2688] },
  { start: 0x21a9, advances: [3266, 3266] },
  { start: 0x21b0, advances: [2854, 2854] },
  { start: 0x21b3, advances: [2854, 2536, 2854] },
  { start: 0x21ba, advances: [2688, 2688] },
  { start: 0x21d0, advances: [2688] },
  { start: 0x21d2, advances: [2688] },
  { start: 0x21d4, advances: [3776] },
  { start: 0x21de, advances: [1791, 1791] },
  { start: 0x21e4, advances: [2963, 2963] },
  { start: 0x21e7, advances: [3110] },
  { start: 0x21ea, advances: [3110] },
  { start: 0x2212, advances: [1914] },
  { start: 0x2248, advances: [1914] },
  { start: 0x2260, advances: [1914] },
  { start: 0x2264, advances: [1914, 1914] },
  { start: 0x25aa, advances: [1306] },
  { start: 0x25cf, advances: [2576] },
  { start: 0x25e6, advances: [1306] },
  { start: 0x2713, advances: [2480] },
  { start: 0x2717, advances: [2480] },
];

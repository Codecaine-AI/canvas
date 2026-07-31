/**
 * Creation defaults — the size and color a PLACED object lands at.
 *
 * `place_shape` and `place_sticky` carry no size and no color parameters at
 * all (docs/30-agent-layout/50-tool-surface/10-gestures §Place: "only the pick
 * and the click"; the numbers themselves are
 * docs/30-agent-layout/50-tool-surface/20-grid-and-defaults), so
 * these numbers are load-bearing, not a convenience: they are the entire
 * answer to "how big is a new node". The agent never reasons about size at
 * placement; sizing afterward is `resize` / `match_size`, and spacing is
 * `space_out` — deliberate steps like everything else.
 *
 * WHERE THE NUMBERS COME FROM (plan D5). Two rules, applied in order:
 *
 *  1. Prefer the STYLE GUIDE's craft targets over the UI defaults. The UI's
 *     per-type table sits below the guide's own minimums for a node (a 184×96
 *     `process` is under `nodeMinWidth` 224), so a board built from UI
 *     defaults starts out failing the targets the agent is graded on.
 *  2. Round to a multiple of the agent's 20 grid
 *     (service/session/tools/grid.ts), so a placed object is already on-grid
 *     and every later `move_by`/`resize`/`match_size` keeps it there.
 *
 * Neither source table is edited: `CRAFT_TARGETS` is prompt guidance and
 * `OBJECT_TYPE_DEFAULTS` is the UI's own contract. This module is the
 * enforcement, and whether the UI ever adopts these numbers is a separate
 * product call.
 *
 * Colors: a registry-named object (any shape or glyph in the object-preference
 * registry) lands wearing its PREFERRED color — a placed "memory" is blue with
 * no caller involvement. Sections and stickies sit outside the registry and
 * keep the canvas package's per-kind first-use fallbacks (`FIRST_USE_COLORS`).
 * Recoloring afterward is its own gesture (`change_color`).
 */
import { FIRST_USE_COLORS } from "@codecaine-ai/canvas/actions";
import type { CanvasColor } from "@codecaine-ai/canvas/schema";

import { preferredObjectColor } from "../../../../../canvas/src/objects/registry";

import { OBJECT_TYPE_DEFAULTS } from "../../../../../canvas/src/state/schema/object-defaults";
import { AGENT_GRID } from "./grid";
import {
  glyphForPlaceableType,
  isPlaceableType,
  type FoldedTypeName,
} from "./placeable-types";
import { CRAFT_TARGETS } from "../../../catalog/layout-editor/context/style-guide/craft-targets";

/**
 * The four things a place gesture can create. Not the document's type union:
 * every shape and every glyph collapses to one of these, because the default
 * SIZE is a property of the kind, not of which pictogram it draws.
 */
export type CreationKind = "shape" | "sticky" | "section" | "icon";

export interface CreationDefault {
  /** Default box, always a multiple of AGENT_GRID on both axes. */
  readonly size: { readonly width: number; readonly height: number };
  /** Default color pick, the canvas package's first-use fallback for the kind. */
  readonly color: CanvasColor;
}

/** Rounds a source number to the nearest agent-grid multiple, floor of one unit. */
function toGrid(value: number): number {
  return Math.max(AGENT_GRID, Math.round(value / AGENT_GRID) * AGENT_GRID);
}

/**
 * The table. One row per kind; the comment on each row names its source and
 * its rounding, because "why 280 and not 288" is the question every reader of
 * this file arrives with.
 */
export const CREATION_DEFAULTS: Readonly<Record<CreationKind, CreationDefault>> = {
  // Nodes/shapes — CRAFT_TARGETS.nodeWidth 288 → 280, nodeHeight 96 → 100.
  // The style guide's target node, rounded to the grid (288 rounds DOWN to
  // 280, 96 rounds UP to 100). Still comfortably above nodeMinWidth (224),
  // which the UI's own 184×96 `process` default is not.
  shape: {
    size: { width: toGrid(CRAFT_TARGETS.nodeWidth), height: toGrid(CRAFT_TARGETS.nodeHeight) },
    color: FIRST_USE_COLORS.shape,
  },

  // Stickies — OBJECT_TYPE_DEFAULTS.sticky 176×128 → 180×120. The craft
  // targets say nothing about note size (they size NODES), so the UI default
  // is the honest source; only the grid rounding is applied (176 up to 180,
  // 128 down to 120).
  sticky: {
    size: {
      width: toGrid(OBJECT_TYPE_DEFAULTS.sticky.geometry.width),
      height: toGrid(OBJECT_TYPE_DEFAULTS.sticky.geometry.height),
    },
    color: FIRST_USE_COLORS.sticky,
  },

  // Sections — OBJECT_TYPE_DEFAULTS.section 480×360, already ×20, unchanged.
  // A frame is meant to wrap other objects, and 480×360 holds a 2-3 node
  // column (nodesPerSectionMin/Max) at framePadding 48 without a fit.
  section: {
    size: {
      width: toGrid(OBJECT_TYPE_DEFAULTS.section.geometry.width),
      height: toGrid(OBJECT_TYPE_DEFAULTS.section.geometry.height),
    },
    color: FIRST_USE_COLORS.section,
  },

  // Icons — OBJECT_TYPE_DEFAULTS.icon 120×120, already ×20, unchanged. An
  // icon is a glyph with its text captioned beneath, not a labelled box, so
  // the node target does not apply: it stays square and small.
  icon: {
    size: {
      width: toGrid(OBJECT_TYPE_DEFAULTS.icon.geometry.width),
      height: toGrid(OBJECT_TYPE_DEFAULTS.icon.geometry.height),
    },
    // Icons read the "shape" color bucket in the canvas package
    // (colorKindForType: only sticky and section have their own).
    color: FIRST_USE_COLORS.shape,
  },
};

/**
 * Which row a place gesture reads. Accepts a `CreationKind` directly, or any
 * folded type name from the tool surface — a glyph name resolves to `"icon"`,
 * every other shape name to `"shape"`. An unrecognized name resolves to
 * `"shape"` rather than throwing: the schema is the gate, and a default is not
 * worth failing a turn over.
 */
export function creationKindFor(kindOrType: CreationKind | FoldedTypeName | string): CreationKind {
  if (kindOrType === "shape") return "shape";
  if (kindOrType === "sticky") return "sticky";
  if (kindOrType === "section") return "section";
  if (kindOrType === "icon") return "icon";
  if (!isPlaceableType(kindOrType)) return "shape";
  return glyphForPlaceableType(kindOrType) === undefined ? "shape" : "icon";
}

/**
 * The default size and color a placed object of this kind (or type) gets.
 * Size always comes off the kind row; color resolves through the
 * object-preference registry first — the preferred color IS the creation
 * default for every registry name — and falls back to the kind row for the
 * names outside it (section, sticky, and the bare kind words).
 */
export function creationDefaultFor(
  kindOrType: CreationKind | FoldedTypeName | string,
): CreationDefault {
  const byKind = CREATION_DEFAULTS[creationKindFor(kindOrType)];
  const preferred = preferredObjectColor(kindOrType);
  return preferred === undefined ? byKind : { size: byKind.size, color: preferred };
}

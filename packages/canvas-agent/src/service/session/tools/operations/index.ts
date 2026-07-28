/**
 * Registration surface for the layout editor's mutation tools — the gesture
 * roster (docs/30-agent-layout/50-tool-surface/00-overview), in six groups:
 *
 *   Place     place_section, place_sticky, place_shape, clone, connect
 *   Arrange   move_to, move_by, resize, match_size, align, space_out
 *   Content   update_text, change_color, change_shape
 *   Sections  fit_section, change_section_border, lock, unlock
 *   Edges     style_edge, change_connection, reroute, shift_segment,
 *             reset_route, move_label
 *   Delete    delete
 *
 * Every tool names a motion a person makes on the canvas rather than a CRUD
 * verb over a kind: one home per concern (all text is `update_text`, all color
 * is `change_color`), and creation carries defaults so a placement is a bare
 * payload. The six group modules define their state checks and lowering; this
 * module exposes the structural runtime contract every descriptor satisfies.
 *
 * `operationTools` is the roster, ordered group by group in the order above —
 * roughly the order a board gets built. It is the single source the agent
 * catalog registers from (`catalog/layout-editor/tools/index.ts`) and
 * the `<capabilities>` block derives from, so a tool added to a group module
 * is not on the surface until it is listed here. The name index provides
 * direct lookup.
 */
import type { TSchema } from "@mariozechner/pi-ai";

import type { LayoutToolRenderResult } from "../runtime";
import type { OperationHost } from "./operation-tool";
import {
  align,
  matchSize,
  moveBy,
  moveTo,
  resize,
  spaceOut,
} from "./arrange";
import {
  changeColor,
  changeShape,
  updateText,
} from "./content";
import { deleteEntity } from "./delete";
import {
  changeConnection,
  moveLabel,
  reroute,
  resetRoute,
  shiftSegment,
  styleEdge,
} from "./edges";
import {
  clone,
  connect,
  placeSection,
  placeShape,
  placeSticky,
} from "./place";
import {
  changeSectionBorder,
  fitSection,
  lock,
  unlock,
} from "./sections";

export interface OperationTool {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly executionMode: "sequential";
  readonly parameters: TSchema;
  execute(
    params: Record<string, unknown>,
    ctx: OperationHost,
  ): LayoutToolRenderResult;
}

export {
  align,
  changeColor,
  changeConnection,
  changeSectionBorder,
  changeShape,
  clone,
  connect,
  deleteEntity,
  fitSection,
  lock,
  matchSize,
  moveBy,
  moveLabel,
  moveTo,
  placeSection,
  placeShape,
  placeSticky,
  reroute,
  resetRoute,
  resize,
  shiftSegment,
  spaceOut,
  styleEdge,
  unlock,
  updateText,
};

export const operationTools: readonly OperationTool[] = [
  // Place (./place.ts). Bare creation payloads, defaults for everything else,
  // and the two gestures that follow a placement: copy it, wire it.
  placeSection,
  placeSticky,
  placeShape,
  clone,
  connect,
  // Arrange (./arrange.ts). The six geometry-only gestures; frames travel
  // whole, connection ids are rejected, everything snaps first and the result
  // reports what landed.
  moveTo,
  moveBy,
  resize,
  matchSize,
  align,
  spaceOut,
  // Content & appearance (./content.ts). Kind-agnostic: one home for text, one
  // for color, and the folded-type shape swap.
  updateText,
  changeColor,
  changeShape,
  // Sections (./sections.ts). A frame as a frame: close it, restroke it,
  // protect or release its region.
  fitSection,
  changeSectionBorder,
  lock,
  unlock,
  // Edges (./edges.ts). Restyle, repoint, and the three routing instruments
  // plus the label pin. Every one of them returns the edge's fresh numbered
  // polyline, which is what lets a second shift in the same turn chain off the
  // first instead of off a stale digest.
  styleEdge,
  changeConnection,
  reroute,
  shiftSegment,
  resetRoute,
  moveLabel,
  // Delete (./delete.ts). One verb, three cascades.
  deleteEntity,
];

const operationToolsByName = new Map(
  operationTools.map((tool) => [tool.name, tool]),
);

export function findOperationTool(name: string): OperationTool | undefined {
  return operationToolsByName.get(name);
}

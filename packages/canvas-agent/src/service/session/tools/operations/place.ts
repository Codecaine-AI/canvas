/**
 * The Place group (docs/30-agent-layout/50-tool-surface/10-gestures §Place) —
 * the five gestures that
 * put something new on the board: `place_section`, `place_sticky`,
 * `place_shape`, `clone`, and `connect`.
 *
 * Two rules run through all five and are worth stating once:
 *
 * 1. EACH PAYLOAD CARRIES ONLY WHAT THE CREATION GESTURE CARRIES. The pick,
 *    the click, and the typing that happens in the same motion — nothing more.
 *    Size and color come from the creation defaults
 *    (../creation-defaults.ts), and every
 *    property beyond the default is its own later gesture. There is no `color`
 *    on `place_shape` because recoloring is `change_color`, not because it was
 *    forgotten.
 *
 * 2. THE GEOMETRY THAT LANDS IS ON THE AGENT GRID, and the summary reports what
 *    LANDED, not what was asked for (../grid.ts: snap, not reject). A model
 *    that asks for (241, 477) is told it got (240, 480), so the next gesture
 *    computes off the truth. For `clone` that means the copy's CORNER and its
 *    SIZE are both snapped even though neither was named: an offset from an
 *    off-grid source would otherwise land off-grid, and a copy of a hand-drawn
 *    240×157 box would carry that 157 forever.
 *
 * 3. NO LOCK GATE ON A PLACEMENT, deliberately. Placements write a NEW id,
 *    which no lock can cover, and the frame a new object appears to land in is
 *    decided afterwards by the membership reconcile — which already refuses to
 *    adopt anything into a section locked "all" (`sectionCanParent`,
 *    packages/canvas/src/state/section-membership.ts). So a place or a clone
 *    inside a frozen region drops the object on the board, not into the region,
 *    and there is nothing for a validate-time gate to add. `clone`'s SOURCE is
 *    read the same way `match_size`'s `like` source is — measured, never
 *    written — so a locked box can still be copied. `connect` is the exception among the
 *    five: it writes a new edge, but an edge belongs to the regions its ends
 *    sit in, so it gates on those (`requireUnlockedEndpoint`).
 *
 * The shared operation factory owns everything around these descriptors —
 * membership reconciliation, diffing, linting, routed truth, rendering, and
 * event emission — so a spec here is validation plus one lowered patch.
 */
import type { InteractiveCanvasObject } from "@codecaine-ai/canvas/schema";
import { sectionDescendantIds } from "../../../../../../canvas/src/state/geometry";
import { draftPlacedObject } from "../../../../../../canvas/src/state/schema/object-defaults";

import { creationDefaultFor } from "../creation-defaults";
import { snapPoint, snapSize } from "../grid";
import { defineOperationTool } from "./operation-tool";
import { toDocumentFields } from "../placeable-types";
import {
  CloneParams,
  ConnectParams,
  PlaceSectionParams,
  PlaceShapeParams,
  PlaceStickyParams,
} from "../schemas";

/** The applied box, as the summary reports it: `x,y W×H`. */
function placement(geometry: {
  x: number;
  y: number;
  width: number;
  height: number;
}): string {
  return `${geometry.x},${geometry.y} ${geometry.width}×${geometry.height}`;
}

export const placeSection = defineOperationTool({
  name: "place_section",
  description:
    "Draw a titled frame. Membership is reconciled from geometry, so the frame "
    + "adopts whatever its edges already cover, and it keeps the footprint it "
    + "lands with until something fits or resizes it. Undrawn size takes the "
    + "default section footprint.",
  fields: PlaceSectionParams.properties,
  validate: (ctx, p) => ctx.requireFreeId(p.id),
  apply: (ctx, p) => {
    const [x, y] = snapPoint(p.at);
    const defaults = creationDefaultFor("section");
    const size = snapSize(p.size ?? defaults.size);
    const geometry = { x, y, width: size.width, height: size.height };
    return ctx.applyLowered(
      {
        type: "addObject",
        object: draftPlacedObject("section", geometry, {
          id: p.id,
          text: p.text,
          color: defaults.color,
        }),
      },
      `place_section ${p.id} ${placement(geometry)}`,
    );
  },
});

export const placeSticky = defineOperationTool({
  name: "place_sticky",
  description:
    "Drop a note with its text already on it. Size and color are the defaults — "
    + "resize or recolor it afterward if the note earns it.",
  fields: PlaceStickyParams.properties,
  validate: (ctx, p) => ctx.requireFreeId(p.id),
  apply: (ctx, p) => {
    const [x, y] = snapPoint(p.at);
    const defaults = creationDefaultFor("sticky");
    const geometry = {
      x,
      y,
      width: defaults.size.width,
      height: defaults.size.height,
    };
    return ctx.applyLowered(
      {
        type: "addObject",
        object: draftPlacedObject("sticky", geometry, {
          id: p.id,
          text: p.text,
          color: defaults.color,
        }),
      },
      `place_sticky ${p.id} ${placement(geometry)}`,
    );
  },
});

export const placeShape = defineOperationTool({
  name: "place_shape",
  description:
    "Place a shape — the pick and the click, nothing else. It arrives untitled, "
    + "at the default size and color for its kind; labelling, resizing, "
    + "recoloring, and turning it are each their own gesture afterward. "
    + "Containment follows geometry: a shape outside every frame belongs to no "
    + "section.",
  fields: PlaceShapeParams.properties,
  validate: (ctx, p) => ctx.requireFreeId(p.id),
  apply: (ctx, p) => {
    const [x, y] = snapPoint(p.at);
    // The folded name decides BOTH the document fields and which defaults row
    // to read: a glyph name lowers to {type:"icon", icon} and sizes as an icon,
    // every other name lowers to a bare type and sizes as a node.
    const fields = toDocumentFields(p.type);
    const defaults = creationDefaultFor(p.type);
    const geometry = {
      x,
      y,
      width: defaults.size.width,
      height: defaults.size.height,
    };
    return ctx.applyLowered(
      {
        type: "addObject",
        object: draftPlacedObject(fields.type, geometry, {
          id: p.id,
          // This gesture does not carry text: the explicit empty string keeps
          // a placed shape blank instead of taking draftPlacedObject's
          // per-type label. `update_text` fills it later.
          text: "",
          color: defaults.color,
          ...(fields.icon ? { icon: fields.icon } : {}),
        }),
      },
      `place_shape ${p.id} ${p.type} ${placement(geometry)}`,
    );
  },
});

/**
 * Where a copy lands when the call names neither `at` nor `by`.
 *
 * The UI's paste and duplicate paths both nudge a copy by +24/+24
 * (`buildPastePayload` in packages/canvas/src/interaction/clipboard.ts, and
 * `handleDuplicateSelection` in state/actions/objects.ts). 24 is not on the
 * agent's 20 grid, so the agent path takes its snapped value — the same
 * gesture, quantized like every other number this surface writes. The corner
 * this offset produces is snapped again, since an off-grid source would
 * otherwise carry its offset onto the copy.
 */
const CLONE_PASTE_OFFSET: readonly [number, number] = snapPoint([24, 24]);

/** The fields a copy inherits from its source. Kind, size, and look — not identity. */
function clonedFrom(
  source: InteractiveCanvasObject,
  id: string,
  position: readonly [number, number],
  text: string | undefined,
): Record<string, unknown> {
  // The copy's size is a number this gesture WRITES, so it lands on the grid
  // even when the source's does not: cloning a hand-drawn 243×157 box gives a
  // 240×160 copy, and a row built from it stays on the grid.
  const size = snapSize(source.geometry);
  return {
    id,
    type: source.type,
    text: text ?? source.text,
    geometry: {
      x: position[0],
      y: position[1],
      width: size.width,
      height: size.height,
    },
    ...(source.color !== undefined ? { color: source.color } : {}),
    ...(source.direction !== undefined ? { direction: source.direction } : {}),
    ...(source.icon !== undefined ? { icon: source.icon } : {}),
    // `style` carries the render-shape selector and a section's border stroke,
    // so a copy that dropped it would not look like its source.
    ...(source.style !== undefined ? { style: { ...source.style } } : {}),
    // NOT copied: `parentId` (membership is re-derived from the copy's own
    // geometry) and `locked` (a lock is a person's don't-touch mark on one
    // region of the board, not a property of the thing that was copied).
  };
}

export const clone = defineOperationTool({
  name: "clone",
  description:
    "Copy one object. The copy inherits the source's kind, size, color, shape "
    + "type/direction/glyph, and border style, so a row of options matches "
    + "without re-specifying a number. Two things it does NOT carry: edges "
    + "attached to the source (draw those with connect), and, for a section, "
    + "its contents — a cloned frame arrives empty, because copying "
    + "descendants without copying the edges between them would half-copy the "
    + "structure. A copy is never locked, whatever the source is.",
  fields: CloneParams.properties,
  validate: (ctx, p) => {
    const errors = [...ctx.requireFreeId(p.id)];
    const source = ctx.draft.objects.find((object) => object.id === p.sourceId);
    if (!source) {
      errors.push(
        ctx.draft.connections.some((connection) => connection.id === p.sourceId)
          ? `sourceId "${p.sourceId}" is an edge — edges are not cloned; draw the new one with connect.`
          : `sourceId "${p.sourceId}" is not on the board.`,
      );
    }
    if (p.at !== undefined && p.by !== undefined) {
      const atCall = JSON.stringify({
        sourceId: p.sourceId,
        id: p.id,
        at: p.at,
        ...(p.text !== undefined ? { text: p.text } : {}),
      });
      const byCall = JSON.stringify({
        sourceId: p.sourceId,
        id: p.id,
        by: p.by,
        ...(p.text !== undefined ? { text: p.text } : {}),
      });
      errors.push(
        `one position source per call: send clone ${atCall} to set the copy's absolute corner, or clone ${byCall} to offset it from the source — never both; omit both for the paste offset.`,
      );
    }
    return errors;
  },
  apply: (ctx, p) => {
    const source = ctx.draft.objects.find((object) => object.id === p.sourceId)!;
    // The CORNER THE COPY LANDS ON is what snaps, however it was named: an
    // absolute `at`, an offset `by` from the source, or the default paste
    // nudge. Snapping the offset instead would leave a copy of an off-grid
    // original off-grid forever, and a clone is how a row of matching options
    // gets built — the row has to start on the grid.
    const offset = p.by ?? CLONE_PASTE_OFFSET;
    const position: [number, number] = p.at !== undefined
      ? snapPoint(p.at)
      : snapPoint([source.geometry.x + offset[0], source.geometry.y + offset[1]]);

    const object = clonedFrom(source, p.id, position, p.text);
    const geometry = object.geometry as { x: number; y: number; width: number; height: number };
    // The same descendant walk the remove cascade uses, so "what a clone left
    // behind" and "what a delete would have taken" can never disagree.
    const emptied = source.type === "section"
      ? sectionDescendantIds(ctx.draft, p.sourceId).size
      : 0;
    return ctx.applyLowered(
      { type: "addObject", object },
      `clone ${p.id} from ${p.sourceId} ${placement(geometry)}`,
      emptied > 0
        ? [
            `the frame copied without its ${emptied} descendant${emptied === 1 ? "" : "s"} — place or clone the contents into ${p.id} yourself`,
          ]
        : undefined,
    );
  },
});

export const connect = defineOperationTool({
  name: "connect",
  description:
    "Route an edge between two objects. A second edge over an existing from→to "
    + "pair applies with a duplicate warning; prefer restyling the existing "
    + "edge. Neither endpoint object changes — an edge owns only itself.",
  fields: ConnectParams.properties,
  validate: (ctx, p) => [
    ...ctx.requireFreeId(p.id),
    ...ctx.requireEndpoint("from", p.from),
    ...ctx.requireEndpoint("to", p.to),
    ...ctx.requireDistinctEndpoints(p.from, p.to),
    // A new edge carries no lock of its own, so it is gated by the regions its
    // ends sit in: a wire into a frame locked "all" is an edit inside that
    // frame. A "background" lock pins only the frame's own box, so edges
    // between the children it holds are still free to draw.
    ...ctx.requireUnlockedEndpoint("from", p.from),
    ...ctx.requireUnlockedEndpoint("to", p.to),
  ],
  apply: (ctx, p) => {
    // A duplicate applies and warns rather than failing, because a second edge
    // between the same pair is occasionally what was meant.
    const duplicate = ctx.draft.connections.find(
      (connection) =>
        connection.from.objectId === p.from.objectId
        && connection.to.objectId === p.to.objectId,
    );
    return ctx.applyLowered(
      {
        type: "addConnection",
        connection: {
          id: p.id,
          from: p.from,
          to: p.to,
          ...(p.label !== undefined ? { label: p.label } : {}),
          ...(p.style !== undefined ? { style: p.style } : {}),
          ...(p.arrow !== undefined ? { arrow: p.arrow } : {}),
          ...(p.color !== undefined ? { color: p.color } : {}),
        },
      },
      `connect ${p.id} ${p.from.objectId}→${p.to.objectId}`,
      duplicate
        ? [
            `possible duplicate of ${duplicate.id} — style_edge restyles the edge that is already there`,
          ]
        : undefined,
    );
  },
});

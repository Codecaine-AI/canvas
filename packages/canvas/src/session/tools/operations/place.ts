/**
 * The Place group (docs/10-system-design/70-agent-tool-surface/20-gestures §Place) —
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
 *    property beyond the default is its own later gesture. `place_shape` and
 *    `place_section` carry an optional `color`, because coloring right after
 *    placing cost the drawer one call per node and left most frames gray.
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
import type { InteractiveCanvasObject } from "../../../state/schema";
import { sectionDescendantIds } from "../../../state/geometry";
import type { CanvasColor } from "../../../state/schema/colors";
import { reconcileSectionMembership } from "../../../state/section-membership";
import { pickSectionColor } from "../../../board/section-colors";
import { draftPlacedObject, FIRST_USE_COLORS } from "../../../state/schema/object-defaults";

import { creationDefaultFor } from "../creation-defaults";
import { detailDroppedNote, storedDetail } from "../detail-line";
import { NO_GLYPH, isGlyphName, unknownGlyphMessage } from "../glyph-names";
import { snapPoint, snapSize } from "../grid";
import { withAutoSize } from "./auto-size";
import type { OpContext, OpOutcome } from "./op-context";
import { defineOperationTool } from "./operation-tool";
import { toDocumentFields } from "../placeable-types";
import {
  CloneParams,
  ConnectParams,
  PlaceSectionParams,
  PlaceShapeParams,
  PlaceStickyParams,
} from "../schemas";

/**
 * Place a new node, grow it to fit its text, match it with its row and column
 * peers (auto-size.ts: centers held), and report the box that LANDED.
 */
function placeFitted(
  ctx: OpContext,
  id: string,
  lowered: OpOutcome,
  summary: (landed: { x: number; y: number; width: number; height: number }) => string,
): OpOutcome {
  const outcome = withAutoSize(lowered, [id], ctx.canvasStyle, "center", true);
  if (outcome.status !== "applied") return outcome;
  const landed = outcome.draft.objects.find((object) => object.id === id)!.geometry;
  return { ...outcome, summary: summary(landed) };
}

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
    "Draw a titled frame, colored in the same call. Membership is reconciled "
    + "from geometry, so the frame adopts whatever its edges already cover, and "
    + "it keeps the footprint it lands with until something fits, arranges or "
    + "resizes it. Undrawn size takes the default section footprint. The header "
    + "shows the optional icon and the title. Without a color it takes one that "
    + "paints apart from its parent section, the sections it holds and its "
    + "sibling sections; a section never shares its parent's or a sibling's "
    + "color or painted fill.",
  fields: PlaceSectionParams.properties,
  validate: (ctx, p) => [
    ...ctx.requireFreeId(p.id),
    // An empty icon, or "none", is no icon; anything else must be a glyph by
    // its exact name, and a near miss comes back with the names it was
    // reaching for.
    ...(p.icon !== undefined && p.icon !== "" && p.icon !== NO_GLYPH && !isGlyphName(p.icon)
      ? [unknownGlyphMessage("icon", p.icon)]
      : []),
  ],
  apply: (ctx, p) => {
    const [x, y] = snapPoint(p.at);
    const defaults = creationDefaultFor("section");
    const size = snapSize(p.size ?? defaults.size);
    const geometry = { x, y, width: size.width, height: size.height };
    const lower = (color: CanvasColor, summary: string) => ctx.applyLowered(
      {
        type: "addObject",
        object: draftPlacedObject("section", geometry, {
          id: p.id,
          text: p.text,
          color,
          ...(p.icon !== undefined && isGlyphName(p.icon) ? { icon: p.icon } : {}),
        }),
      },
      summary,
    );
    const at = `place_section ${p.id} ${placement(geometry)}`;
    if (p.color) return lower(p.color, `${at} ${p.color}`);
    // No color named: place it, read the parent and the sections it adopts
    // from the reconciled tree, and pick a hue none of them nor
    // its siblings paints, so the hierarchy and the group edges read.
    const probe = lower(defaults.color, at);
    if (probe.status !== "applied") return probe;
    const color = pickSectionColor(reconcileSectionMembership(probe.draft), p.id, ctx.canvasStyle);
    return lower(color, `${at} ${color}`);
  },
});

export const placeSticky = defineOperationTool({
  name: "place_sticky",
  description:
    "Drop a note with its text already on it. Width and color are the defaults; on the "
    + "schematic themes its height is the height its text needs. Resize or recolor it "
    + "afterward if the note earns it.",
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
    // A card note lands at the height its text needs (auto-size.ts rule 0).
    return placeFitted(
      ctx,
      p.id,
      ctx.applyLowered(
        {
          type: "addObject",
          object: draftPlacedObject("sticky", geometry, {
            id: p.id,
            text: p.text,
            color: defaults.color,
          }),
        },
        `place_sticky ${p.id} ${placement(geometry)}`,
      ),
      (landed) => `place_sticky ${p.id} ${placement(landed)}`,
    );
  },
});

export const placeShape = defineOperationTool({
  name: "place_shape",
  description:
    "Place a shape with its name, its one-fact detail line and its color in one "
    + "call, at the default size for its kind. When the text does not fit that "
    + "size the shape grows to fit, keeping its center. It and the same-type shapes "
    + "in its row share the row's largest height, and those in its column the "
    + "column's largest width. Omit text or color and it arrives "
    + "untitled or in its type's preferred color, for update_text and "
    + "change_color afterward; resizing and turning it are their own gestures. "
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
    return placeFitted(ctx, p.id, ctx.applyLowered(
      {
        type: "addObject",
        object: draftPlacedObject(fields.type, geometry, {
          id: p.id,
          // The explicit empty string keeps an unnamed shape blank instead of
          // taking draftPlacedObject's per-type label. Carrying the name here
          // saves the drawer one call per node (climb round 4: naming and
          // coloring after placement were two of every seven calls).
          text: p.text ?? "",
          detail: storedDetail(p.detail),
          color: p.color ?? defaults.color,
          ...(fields.icon ? { icon: fields.icon } : {}),
        }),
      },
      "place_shape",
    ), (landed) => `place_shape ${p.id} ${p.type} ${placement(landed)}${p.text ? ` "${p.text}"` : ""}${p.color ? ` ${p.color}` : ""}`);
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
  detail: string | undefined,
): Record<string, unknown> {
  // The copy's size is a number this gesture WRITES, so it lands on the grid
  // even when the source's does not: cloning a hand-drawn 243×157 box gives a
  // 240×160 copy, and a row built from it stays on the grid.
  const size = snapSize(source.geometry);
  // The detail travels like the name: carried over unless the call names one,
  // and an empty one clears it. A sticky or a section never carries one.
  const copiedDetail = source.type === "sticky" || source.type === "section"
    ? undefined
    : detail !== undefined ? storedDetail(detail) : storedDetail(source.detail);
  return {
    id,
    type: source.type,
    text: text ?? source.text,
    ...(copiedDetail !== undefined ? { detail: copiedDetail } : {}),
    geometry: {
      x: position[0],
      y: position[1],
      width: size.width,
      height: size.height,
    },
    ...(source.color !== undefined ? { color: source.color } : {}),
    ...(source.direction !== undefined ? { direction: source.direction } : {}),
    // An icon's glyph, and a section's header glyph — both are the same field.
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
    + "type/direction/glyph, detail line (shapes and icons), and border style, so a row of options "
    + "matches without re-specifying a number. A copy whose new text does not fit "
    + "grows to fit and joins its row and column sizes, like place_shape. Two things it does NOT carry: edges "
    + "attached to the source (draw those with connect), and, for a section, "
    + "its contents — a cloned frame arrives empty, because copying "
    + "descendants without copying the edges between them would half-copy the "
    + "structure. A copy is never locked, whatever the source is. A section "
    + "copy keeps the source's color unless that color would match its parent "
    + "or a sibling (the source itself, beside it); then it takes the color "
    + "place_section would pick, and says so.",
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
        ...(p.detail !== undefined ? { detail: p.detail } : {}),
      });
      const byCall = JSON.stringify({
        sourceId: p.sourceId,
        id: p.id,
        by: p.by,
        ...(p.text !== undefined ? { text: p.text } : {}),
        ...(p.detail !== undefined ? { detail: p.detail } : {}),
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

    const object = clonedFrom(source, p.id, position, p.text, p.detail);
    // The same descendant walk the remove cascade uses, so "what a clone left
    // behind" and "what a delete would have taken" can never disagree.
    const emptied = source.type === "section"
      ? sectionDescendantIds(ctx.draft, p.sourceId).size
      : 0;
    const notes = [
      ...(emptied > 0
        ? [
            `the frame copied without its ${emptied} descendant${emptied === 1 ? "" : "s"} — place or clone the contents into ${p.id} yourself`,
          ]
        : []),
      ...((source.type === "sticky" || source.type === "section") && storedDetail(p.detail) !== undefined
        ? [detailDroppedNote(source.type)]
        : []),
    ];
    const lower = (copy: Record<string, unknown>, extra: string[]) => {
      const all = [...notes, ...extra];
      return placeFitted(ctx, p.id, ctx.applyLowered(
        { type: "addObject", object: copy },
        "clone",
        all.length > 0 ? all : undefined,
      ), (landed) => `clone ${p.id} from ${p.sourceId} ${placement(landed)}`);
    };
    const probe = lower(object, []);
    if (source.type !== "section" || probe.status !== "applied") return probe;
    // A section copy lands beside its source as a sibling: keep the source's
    // color only while it reads apart from the copy's parent and siblings.
    const kept = source.color ?? FIRST_USE_COLORS.section;
    const color = pickSectionColor(reconcileSectionMembership(probe.draft), p.id, ctx.canvasStyle, kept);
    if (color === kept) return probe;
    return lower({ ...object, color }, [`the copy takes ${color}: ${kept} would match its parent, a touching sibling or a node it holds`]);
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

/**
 * The Content & appearance group — `update_text`, `change_color`,
 * `change_shape` (docs/10-system-design/70-agent-tool-surface/20-gestures
 * §Content & appearance).
 *
 * ONE HOME PER CONCERN. All text goes through `update_text` and all color
 * through `change_color`, whatever kind is on the other end: a sticky's body, a
 * section's title, a shape's label, and an edge's label are one gesture with
 * four targets, not four tools. That is why the first two gate on
 * `requireBoardEntity` — mere existence — and dispatch on kind inside `apply`,
 * where the only difference is which document channel the patch names
 * (`text` on an object, `label` on a connection). A shape's, icon's, or
 * section's one-line `detail` is text too, so it rides the same call: the name
 * and its fact are written together or apart, never through a second tool. A
 * detail sent to a sticky or an edge — kinds with no detail line — is dropped
 * with a note rather than refused, so the rest of the call still lands.
 *
 * LOCKS GATE ALL THREE. Text and color are edits like any other, so a box under
 * a lock refuses them, and so does an edge whose ends sit inside a locked-all
 * region — an edge into a protected region is part of that region. The gate is
 * the same dispatch the apply does, run one step earlier
 * (`requireUnlockedTarget` below).
 *
 * `change_shape` is the exception: it is shapes-only (`requireShape`), because
 * a section is not a diamond and a sticky is not a cylinder. It is also the one
 * gesture that writes the folded type vocabulary, so it is the one place that
 * has to get the icon⇄shape transition right — see `shapeSwapPatch` below. Its
 * one section exception is the header glyph (`patch.icon`): picking a glyph is
 * one gesture whatever it lands on, and a frame's glyph is the only part of a
 * frame this tool can change — see `requireSwapTarget`.
 *
 * TEXT FIT. `update_text` runs the renderer's own wrap/clamp decision
 * (board/text-fit.ts) over the object's CURRENT box and the NEW text, and
 * attaches the verdict as an `OpOutcome.notes` line when the text would clip,
 * may clip (within 1px of the box edge), or cannot be measured exactly
 * (characters the bundled fonts lack). Report-only: the write still lands. Same philosophy as the unreadable-labels
 * lint — say it, don't block it — and the same family of warning `resize` and
 * `match_size` fire from the other direction.
 *
 * WHY EDGE LABELS ARE NOT FIT-CHECKED HERE. `textFitReport`'s `edge-label`
 * slot answers "does the chip fit the corridor it renders in?" — it needs the
 * corridor as its `size`, and a label chip never truncates, it grows. So the
 * verdict is a CROWDING one, not a legibility one, and computing an honest
 * corridor means routing the edge and measuring against both endpoint rects —
 * which is exactly what the `unreadable-labels` rule already does, with the
 * routed truth, and which already fires in the lint delta of this very same
 * APPLIED result. A second, cruder corridor estimate here could only duplicate
 * that finding or contradict it, so `update_text` on a connection writes the
 * label and leaves the verdict to the lint that owns it.
 */
import { Type } from "@mariozechner/pi-ai";
import type { InteractiveCanvasObject } from "@codecaine-ai/canvas/schema";

import { textFitReport } from "../../../../board/text-fit";
import { entityKindOf } from "../../perception/op-surface";
import { detailDroppedNote, storedDetail } from "../detail-line";
import { NO_GLYPH, isGlyphName, unknownGlyphMessage } from "../glyph-names";
import { defineOperationTool } from "./operation-tool";
import type { OpContext } from "./op-context";
import {
  fromDocumentFields,
  toDocumentFields,
  type FoldedTypeName,
} from "../placeable-types";
import { Color, DETAIL_RULE, Id, NAME_RULE, ShapeSwapPatch } from "../schemas";
import type { ConnectionPatch, ObjectPatch, ShapeSwapPatch as ShapeSwap } from "../schemas";

/** Whether this id names an edge rather than an object. */
function isConnectionId(ctx: OpContext, id: string): boolean {
  return ctx.draft.connections.some((connection) => connection.id === id);
}

/**
 * The lock gate for a kind-agnostic content gesture: the same dispatch its
 * `apply` does, one step earlier. A box is gated by its own lock or by an
 * ancestor locked "all"; an edge has no lock of its own and is gated by the
 * locked-all region its ends sit in (op-context.ts).
 */
function requireUnlockedTarget(ctx: OpContext, id: string): string[] {
  return isConnectionId(ctx, id) ? ctx.requireUnlockedEdge(id) : ctx.requireUnlocked(id);
}

// ---------------------------------------------------------------------------
// update_text
// ---------------------------------------------------------------------------

export const updateText = defineOperationTool({
  name: "update_text",
  description:
    "Write the words on anything that carries them — a shape's, icon's, or section's name and its one-line detail, a sticky's body, an edge's label. Send text, detail, or both. Text that no longer fits its box still applies, with a warning naming the size it would need.",
  fields: {
    id: Id,
    text: Type.Optional(Type.String({
      description:
        `The replacement text. On a shape, icon, or section it is the name: ${NAME_RULE}. `
        + "On a sticky it is the markdown body; on an edge, the label. Empty clears it.",
    })),
    detail: Type.Optional(Type.String({
      description: `Shapes, icons, and sections only: ${DETAIL_RULE}. Empty clears it.`,
    })),
  },
  validate: (ctx, p) => {
    // Both fields are optional so either can be written alone; asking for
    // neither is not a gesture. (A root-level "at least one" would be dropped
    // by providers that keep only `properties` and `required`.)
    if (p.text === undefined && p.detail === undefined) {
      return ["name what to write — text, detail, or both; an update_text with neither changes nothing."];
    }
    const errors = ctx.requireBoardEntity(p.id);
    return errors.length > 0 ? errors : requireUnlockedTarget(ctx, p.id);
  },
  apply: (ctx, p) => {
    if (isConnectionId(ctx, p.id)) {
      const notes = p.detail === undefined ? [] : [detailDroppedNote("edge")];
      if (p.text === undefined) return { status: "noop", note: detailDroppedNote("edge") };
      // An emptied label is a REMOVED label, not an empty chip: the spread-
      // merging applier reads an own `label: undefined` as "clear it".
      const patch = (p.text === "" ? { label: undefined } : { label: p.text }) as ConnectionPatch;
      return ctx.mergeConnection(p.id, patch, `update_text ${p.id}`, notes);
    }
    const target = ctx.draft.objects.find((object) => object.id === p.id)!;
    const notes: string[] = [];
    const patch: ObjectPatch = {};
    if (p.text !== undefined) patch.text = p.text;
    if (p.detail !== undefined) {
      if (entityKindOf(target) === "sticky") {
        notes.push(detailDroppedNote("sticky"));
      } else {
        // An own `detail: undefined` is how the applier clears it.
        patch.detail = storedDetail(p.detail);
      }
    }
    if (Object.keys(patch).length === 0) return { status: "noop", note: notes[0]! };
    // The fit verdict is over the NEW name and the NEW detail line together:
    // a detail added under a name that just fitted can push it into clipping.
    const next = "detail" in patch ? { ...target, detail: patch.detail } : target;
    const report = textFitReport(next, target.geometry, patch.text ?? target.text, ctx.canvasStyle);
    if (!report.fits || !report.reliable) notes.push(report.detail);
    return ctx.mergeObject(p.id, patch, `update_text ${p.id}`, notes);
  },
});

// ---------------------------------------------------------------------------
// change_color
// ---------------------------------------------------------------------------

export const changeColor = defineOperationTool({
  name: "change_color",
  description:
    "Recolor anything that carries a color, edges included. One pick from the board's roster; the renderer derives the fill, stroke, and text tones from it.",
  fields: { id: Id, color: Color },
  validate: (ctx, p) => {
    const errors = ctx.requireBoardEntity(p.id);
    return errors.length > 0 ? errors : requireUnlockedTarget(ctx, p.id);
  },
  apply: (ctx, p) => {
    const summary = `change_color ${p.id}`;
    return isConnectionId(ctx, p.id)
      ? ctx.mergeConnection(p.id, { color: p.color }, summary)
      : ctx.mergeObject(p.id, { color: p.color }, summary);
  },
});

// ---------------------------------------------------------------------------
// change_shape
// ---------------------------------------------------------------------------

/**
 * The types that carry a `direction`, with the subset each one accepts —
 * mirroring the document validator's own soft-default block
 * (canvas/state/schema/validate.ts). Anything absent from this table has no
 * facing at all.
 */
const DIRECTIONS_BY_TYPE: Readonly<Record<string, readonly string[]>> = {
  "arrow-shape": ["left", "right"],
  triangle: ["up", "down"],
};

/**
 * The facing each of those types takes when none is supplied — the same
 * soft-default the document validator applies on load, so an agent-written
 * draft and the document a reload produces never disagree.
 */
const DEFAULT_DIRECTION_BY_TYPE: Readonly<Record<string, string>> = {
  "arrow-shape": "right",
  triangle: "up",
};

/**
 * Lower one shape swap onto an object patch, plus the notes that explain
 * anything the swap could not carry across.
 *
 * The two document fields that ride along with `type` are the ones the model
 * never sees and therefore cannot maintain itself:
 *
 * - `icon` — a folded glyph name lowers to `{type: "icon", icon}`, a folded
 *   shape name to `{type}` with NO glyph. Both directions write the key: going
 *   shape→icon sets it, icon→shape clears it. Leaving a stale glyph on a
 *   rectangle is how an icon-shaped ghost survives a swap.
 * - `direction` — only four types carry one, each with its own two-value
 *   subset. A direction the new type cannot hold is DROPPED (with a note), and
 *   a facing type that ends up without one takes the same default the document
 *   validator would apply on load, so the draft and a reloaded commit agree.
 */
function shapeSwapPatch(
  current: InteractiveCanvasObject,
  patch: { type?: string; direction?: string },
): { patch: ObjectPatch; notes: string[] } {
  const notes: string[] = [];
  const fields = patch.type === undefined
    ? undefined
    : toDocumentFields(patch.type as FoldedTypeName);
  // Two names for the same thing, and they must not be confused: the DOCUMENT
  // type is what the facing table is keyed by (every glyph is the one carrier
  // type "icon"), the FOLDED name is what the notes say back to the model.
  const documentType = fields?.type ?? current.type;
  const nextType = patch.type ?? fromDocumentFields(current);

  const accepted = DIRECTIONS_BY_TYPE[documentType];
  let direction: string | undefined;
  if (accepted === undefined) {
    direction = undefined;
    if (patch.direction !== undefined) {
      notes.push(
        `direction "${patch.direction}" dropped — a ${nextType} has no facing;`
        + " only arrow-shape (left/right) and triangle (up/down) do",
      );
    } else if (current.direction !== undefined) {
      notes.push(`direction "${current.direction}" cleared — a ${nextType} has no facing`);
    }
  } else if (patch.direction !== undefined && accepted.includes(patch.direction)) {
    direction = patch.direction;
  } else {
    // Either no direction was asked for, or one the new type cannot hold. Keep
    // the object's own facing when it is still legal, else take the validator's
    // default so nothing renders differently after a round-trip.
    direction = current.direction !== undefined && accepted.includes(current.direction)
      ? current.direction
      : DEFAULT_DIRECTION_BY_TYPE[documentType];
    if (patch.direction !== undefined) {
      notes.push(
        `direction "${patch.direction}" dropped — a ${nextType} points`
        + ` ${accepted.join(" or ")}; it faces "${direction}" instead`,
      );
    }
  }

  return {
    patch: {
      ...(fields ? { type: fields.type, icon: fields.icon } : {}),
      direction,
    } as ObjectPatch,
    notes,
  };
}

/**
 * The kind gate for `change_shape`, with its one section exception.
 *
 * A SHAPE (icons included) takes `type` and `direction` and refuses `icon`:
 * its glyph is its type, so the refusal spells the call that does what was
 * meant. A SECTION takes `icon` and nothing else — a frame is not a shape, but
 * its header glyph is a glyph pick like any other, and this is the gesture
 * that picks glyphs. Stickies and edges keep `requireShape`'s redirects.
 */
function requireSwapTarget(ctx: OpContext, id: string, patch: ShapeSwap): string[] {
  const target = ctx.draft.objects.find((object) => object.id === id);
  if (target && entityKindOf(target) === "section") {
    if (patch.type !== undefined || patch.direction !== undefined) {
      return [
        `id "${id}" is a section — a frame is not a shape; change_shape sets only its header glyph`
        + " (patch.icon), and change_section_border restrokes it.",
      ];
    }
    if (patch.icon === undefined) {
      return [`id "${id}" is a section — name its header glyph in patch.icon, or "${NO_GLYPH}" to remove it.`];
    }
    if (patch.icon !== NO_GLYPH && !isGlyphName(patch.icon)) {
      return [unknownGlyphMessage("patch.icon", patch.icon)];
    }
    return [];
  }
  const errors = ctx.requireShape(id);
  if (errors.length > 0 || patch.icon === undefined) return errors;
  // A glyph that is a type is swapped by naming it as the type; say exactly that.
  const glyph = isGlyphName(patch.icon) ? patch.icon : "<glyph>";
  return [
    `patch.icon is a section's header glyph — a shape's glyph is its type: send change_shape `
    + `${JSON.stringify({ id, patch: { type: glyph } })} instead.`,
  ];
}

export const changeShape = defineOperationTool({
  name: "change_shape",
  description:
    "Swap what a shape is, and which way it points. Icons are types: name the glyph and the object becomes that icon; name a shape and any glyph on it is dropped. A direction the new type does not support is dropped with a note. On a section, patch.icon sets the frame's header glyph (\"none\" removes it) — the one thing a section takes here. Stickies and edges are not targets.",
  fields: { id: Id, patch: ShapeSwapPatch },
  validate: (ctx, p) => {
    const errors = requireSwapTarget(ctx, p.id, p.patch);
    return errors.length > 0 ? errors : ctx.requireUnlocked(p.id);
  },
  apply: (ctx, p) => {
    const target = ctx.draft.objects.find((object) => object.id === p.id)!;
    if (entityKindOf(target) === "section") {
      // An own `icon: undefined` is how the applier removes the glyph.
      const icon = p.patch.icon === NO_GLYPH ? undefined : p.patch.icon;
      return ctx.mergeObject(p.id, { icon } as ObjectPatch, `change_shape ${p.id}`);
    }
    const { patch, notes } = shapeSwapPatch(target, p.patch);
    return ctx.mergeObject(p.id, patch, `change_shape ${p.id}`, notes);
  },
});

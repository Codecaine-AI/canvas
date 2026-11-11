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
 * (`text` on an object, `label` on a connection). The board shows names only:
 * no kind has a detail line, so a `detail` sent to any of them is dropped
 * with a note rather than refused, and the rest of the call still lands. A
 * detail an older file still holds is left as stored and never renders.
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
 * section exception is the frame's look: the header glyph (`patch.icon`),
 * because picking a glyph is one gesture whatever it lands on, and the border
 * stroke (`patch.border`). Those two are the only parts of a frame this tool
 * can change — see `requireSwapTarget`.
 *
 * TEXT FIT. `update_text` and `change_shape` run auto-size (auto-size.ts)
 * over the object: when the renderer's own wrap/clamp decision
 * (board/text-fit.ts) says the NEW text would clip in the box, the node grows
 * to the size it needs, keeping its center, and its row and column peers
 * grow with it. A sticky or section, which does not grow, still gets the
 * verdict as an `OpOutcome.notes` line, and so does text that cannot be
 * measured exactly (characters the bundled fonts lack).
 *
 * WHY EDGE LABELS ARE NOT FIT-CHECKED HERE. `textFitReport`'s `edge-label`
 * slot answers "does the chip fit the corridor it renders in?" — it needs the
 * corridor as its `size`, and a label chip never truncates, it grows. So the
 * verdict is a CROWDING one, not a legibility one, and computing an honest
 * corridor means routing the edge and measuring against both endpoint rects —
 * which is exactly what label placement (connectors/label-placement.ts) does
 * with the routed truth: it slides the chip to a clear spot, and canvas_check
 * counts a chip that found none. A second, cruder corridor estimate here
 * could only contradict it, so `update_text` on a connection writes the label
 * and leaves the chip to the placement.
 */
import { Type } from "@mariozechner/pi-ai";
import type { InteractiveCanvasObject } from "../../../state/schema";

import { withAutoSize } from "./auto-size";
import { entityKindOf } from "../../perception/op-surface";
import { NO_GLYPH, isGlyphName, unknownGlyphMessage } from "../glyph-names";
import { defineOperationTool } from "./operation-tool";
import type { OpContext } from "./op-context";
import {
  fromDocumentFields,
  toDocumentFields,
  type FoldedTypeName,
} from "../placeable-types";
import { Color, Id, NAME_RULE, ShapeSwapPatch } from "../schemas";
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

/**
 * The note for a `detail` sent to update_text. The board shows names only, so
 * the detail is dropped and the call says so; the rest of it still applies,
 * the way change_shape drops a direction a type cannot hold.
 */
export const DETAIL_DROPPED_NOTE =
  "detail dropped — a node shows its name only; put extra context in a sticky note next to it";

export const updateText = defineOperationTool({
  name: "update_text",
  description:
    "Write the words on anything that carries them — a shape's or icon's name, a section's title, a sticky's body, an edge's label. A node shows its name only; put extra context in a sticky note next to it. A shape or icon whose text no longer fits grows to fit, keeping its center, and the same-type shapes in its row (height) and column (width) grow to match, unless that would make them overlap another box. A note on the schematic themes takes the height its new text needs, shrinking or growing, width as set; a figjam sticky or a section that no longer fits still applies, with a warning naming the size it would need.",
  fields: {
    id: Id,
    text: Type.Optional(Type.String({
      description:
        `The replacement text. On a shape, icon, or section it is the name: ${NAME_RULE}. `
        + "On a sticky it is the markdown body; on an edge, the label. Empty clears it.",
    })),
    detail: Type.Optional(Type.String({
      description: "Not shown on any kind: a detail sent here is dropped with a note. Put extra context in a sticky note next to the node.",
    })),
  },
  validate: (ctx, p) => {
    // `text` is optional so a detail-only call (an older habit) reaches apply
    // and gets its drop note; asking for neither is not a gesture. (A
    // root-level "at least one" would be dropped by providers that keep only
    // `properties` and `required`.)
    if (p.text === undefined && p.detail === undefined) {
      return ["name what to write — send text; an update_text without it changes nothing."];
    }
    const errors = ctx.requireBoardEntity(p.id);
    return errors.length > 0 ? errors : requireUnlockedTarget(ctx, p.id);
  },
  apply: (ctx, p) => {
    const notes = p.detail === undefined ? [] : [DETAIL_DROPPED_NOTE];
    if (p.text === undefined) return { status: "noop", note: DETAIL_DROPPED_NOTE };
    if (isConnectionId(ctx, p.id)) {
      // An emptied label is a REMOVED label, not an empty chip: the spread-
      // merging applier reads an own `label: undefined` as "clear it".
      const patch = (p.text === "" ? { label: undefined } : { label: p.text }) as ConnectionPatch;
      return ctx.mergeConnection(p.id, patch, `update_text ${p.id}`, notes);
    }
    const patch: ObjectPatch = { text: p.text };
    // The node grows (with its peers) until its new name shows whole.
    return withAutoSize(ctx.mergeObject(p.id, patch, `update_text ${p.id}`, notes), [p.id], ctx.canvasStyle);
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
 * The kind gate for `change_shape`, with its section exception.
 *
 * A SHAPE (icons included) takes `type` and `direction` and refuses `icon`
 * and `border`: its glyph is its type, so that refusal spells the call that
 * does what was meant, and a shape has no frame to stroke. A SECTION takes
 * `icon` and `border` and nothing else — a frame is not a shape, but its
 * header glyph is a glyph pick like any other and its border is its look.
 * Stickies and edges keep `requireShape`'s redirects. A null `border` counts
 * as absent.
 */
function requireSwapTarget(ctx: OpContext, id: string, patch: ShapeSwap): string[] {
  const target = ctx.draft.objects.find((object) => object.id === id);
  const border = patch.border ?? undefined;
  if (target && entityKindOf(target) === "section") {
    if (patch.type !== undefined || patch.direction !== undefined) {
      return [
        `id "${id}" is a section — a frame is not a shape; change_shape sets only its header glyph`
        + " (patch.icon) and its border (patch.border).",
      ];
    }
    if (patch.icon === undefined && border === undefined) {
      return [
        `id "${id}" is a section — name its header glyph in patch.icon ("${NO_GLYPH}" removes it),`
        + " or its border in patch.border.",
      ];
    }
    if (patch.icon !== undefined && patch.icon !== NO_GLYPH && !isGlyphName(patch.icon)) {
      return [unknownGlyphMessage("patch.icon", patch.icon)];
    }
    return [];
  }
  const errors = ctx.requireShape(id);
  if (errors.length > 0) return errors;
  if (patch.icon !== undefined) {
    // A glyph that is a type is swapped by naming it as the type; say exactly that.
    const glyph = isGlyphName(patch.icon) ? patch.icon : "<glyph>";
    return [
      `patch.icon is a section's header glyph — a shape's glyph is its type: send change_shape `
      + `${JSON.stringify({ id, patch: { type: glyph } })} instead.`,
    ];
  }
  if (border !== undefined) {
    return [`patch.border is a section's frame stroke — a ${target!.type} has no frame to restroke.`];
  }
  if (patch.type === undefined && patch.direction === undefined) {
    return ["patch names nothing to change — send type or direction for a shape."];
  }
  return [];
}

export const changeShape = defineOperationTool({
  name: "change_shape",
  description:
    "Swap what a shape is, and which way it points. Icons are types: name the glyph and the object becomes that icon; name a shape and any glyph on it is dropped. A direction the new type does not support is dropped with a note. On a section, patch.icon sets the frame's header glyph (\"none\" removes it) and patch.border restrokes the frame — the two things a section takes here. A border of \"none\" leaves the frame invisible but fully real: it still owns its region, and membership is geometric, so nothing inside it changes hands. A shape refuses patch.border, and a null border counts as absent. Stickies and edges are not targets.",
  fields: { id: Id, patch: ShapeSwapPatch },
  validate: (ctx, p) => {
    const errors = requireSwapTarget(ctx, p.id, p.patch);
    return errors.length > 0 ? errors : ctx.requireUnlocked(p.id);
  },
  apply: (ctx, p) => {
    const target = ctx.draft.objects.find((object) => object.id === p.id)!;
    if (entityKindOf(target) === "section") {
      const border = p.patch.border ?? undefined;
      const patch = {
        // An own `icon: undefined` is how the applier removes the glyph, so the
        // key is present only when the call named a glyph.
        ...(p.patch.icon !== undefined
          ? { icon: p.patch.icon === NO_GLYPH ? undefined : p.patch.icon }
          : {}),
        // A style patch merges PER KEY on the way down (mergeObjectPatch in
        // packages/canvas/src/state/actions/objects.ts), so naming only
        // strokeStyle restrokes the border and leaves the frame's `shape` and
        // stroke width exactly where they were. Sending the whole style bag
        // would be the way to lose them.
        ...(border !== undefined ? { style: { strokeStyle: border } } : {}),
      } as ObjectPatch;
      return ctx.mergeObject(
        p.id,
        patch,
        `change_shape ${p.id}${border !== undefined ? ` border ${border}` : ""}`,
      );
    }
    const { patch, notes } = shapeSwapPatch(target, p.patch);
    // A new shape is a new text slot (a diamond's inscribed rect is narrower
    // than a rectangle's), so the name can stop fitting: grow it back.
    return withAutoSize(ctx.mergeObject(p.id, patch, `change_shape ${p.id}`, notes), [p.id], ctx.canvasStyle);
  },
});

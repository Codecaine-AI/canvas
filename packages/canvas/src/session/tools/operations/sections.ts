/**
 * The Sections group — `fit_section`, `lock`
 * (docs/10-system-design/70-agent-tool-surface/20-gestures §Sections).
 *
 * Two gestures that act on a frame AS a frame: close it around what it holds,
 * and protect or release its region. Everything a section shares with the
 * other kinds lives elsewhere — its title is `update_text`, its fill is
 * `change_color`, its header glyph and border are `change_shape`, its box is
 * the Arrange group, and opening a new frame is `place_section`. That is why
 * nothing here takes a geometry or a text.
 *
 * The shared operation factory owns the execution pipeline around these thin
 * descriptors, including containment reconciliation, diffing, linting,
 * rendering, and event emission.
 *
 * LOCK MANAGEMENT IS EXEMPT FROM THE LOCK GATE. `lock` is the one gesture a
 * lock does not gate: changing the mode of a frame's own lock, or lifting it
 * with mode "none", is the management of the lock rather than an edit under it.
 * Everything else here — fitting a frame — runs `requireUnlocked` like every
 * other mutator on the roster.
 */
import { defineOperationTool } from "./operation-tool";
import {
  Id,
  LockParams,
} from "../schemas";

export const fitSection = defineOperationTool({
  name: "fit_section",
  description:
    "Close a section around the children already inside it. Fits only the "
    + "named section — ancestors keep their slack until you fit them too.",
  fields: { id: Id },
  validate: (ctx, p) => {
    const errors = ctx.requireSection(p.id);
    return errors.length > 0 ? errors : ctx.requireUnlocked(p.id);
  },
  apply: (ctx, p) => ctx.fitSection(p.id),
});

// ---------------------------------------------------------------------------
// Lock
// ---------------------------------------------------------------------------
//
// Both gate on `requireSection`, and that gate is load-bearing: the
// document schema and the studio validator both accept `locked` on any object,
// so nothing below the tool boundary would stop a shape from being locked.
// Locking is a section-level idea — you protect a region of the board, not one
// box — and the agent-side check is where that intent is enforced on this path,
// alongside the context menu's own section gate on the UI path.
//
// A lock does not touch geometry, so it needs no agent grid; and membership
// reconciliation still runs after it, in the shared factory stage
// (operation-tool.ts), which is why no descriptor here mentions it. A lock
// cannot move an edge, so reconciliation is a no-op on this path by
// construction rather than by omission.

export const lock = defineOperationTool({
  name: "lock",
  description:
    "Protect a region, or release one. \"background\" pins the frame itself and "
    + "leaves what is inside it editable; \"all\" freezes the frame and every "
    + "descendant; \"none\" deletes the lock and restores normal editing. "
    + "Sections only — a lock covers an area of the board, not a single box. "
    + "A lock a person set is a don't-touch signal: release one only when the "
    + "request cannot be carried out otherwise, and say that you did.",
  fields: LockParams.properties,
  // Never lock-gated, by definition. Re-locking a frame that is already locked
  // changes the MODE of its own lock, and mode "none" is the one call that
  // lifts a lock, so gating it on the lock it lifts would make every lock
  // permanent. (A frame inside an ancestor locked "all" is likewise still
  // lockable — the ancestor's protection is not a reason the region cannot be
  // protected further.)
  validate: (ctx, p) => ctx.requireSection(p.id),
  apply: (ctx, p) => ctx.applyLowered(
    // `undefined` in an object patch deletes the key on the way down, so mode
    // "none" on a frame with no lock produces an identical document — which the
    // factory reports as a no-op rather than an empty APPLIED line.
    {
      type: "updateObject",
      objectId: p.id,
      patch: { locked: p.mode === "none" ? undefined : p.mode },
    },
    `lock ${p.id} ${p.mode}`,
  ),
});

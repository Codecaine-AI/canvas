/**
 * The Sections group — `fit_section`, `change_section_border`, `lock`,
 * `unlock` (docs/30-agent-layout/50-tool-surface/10-gestures §Sections).
 *
 * Four gestures that act on a frame AS a frame: close it around what it holds,
 * restroke its border, and protect or release its region. Everything a section
 * shares with the other kinds lives elsewhere — its title is `update_text`, its
 * fill is `change_color`, its box is the Arrange group, and opening a new frame
 * is `place_section`. That is why nothing here takes a geometry or a text.
 *
 * The shared operation factory owns the execution pipeline around these thin
 * descriptors, including containment reconciliation, diffing, linting,
 * rendering, and event emission.
 *
 * LOCK MANAGEMENT IS EXEMPT FROM THE LOCK GATE. `lock` and `unlock` are the two
 * gestures a lock does not gate: changing the mode of a frame's own lock, or
 * lifting it, is the management of the lock rather than an edit under it.
 * Everything else here — fitting a frame, restroking it — runs
 * `requireUnlocked` like every other mutator on the roster.
 */
import { defineOperationTool } from "./operation-tool";
import {
  ChangeSectionBorderParams,
  Id,
  LockParams,
  UnlockParams,
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
// Lock, unlock, and the border stroke
// ---------------------------------------------------------------------------
//
// All four gate on `requireSection`, and that gate is load-bearing: the
// document schema and the studio validator both accept `locked` on any object,
// so nothing below the tool boundary would stop a shape from being locked.
// Locking is a section-level idea — you protect a region of the board, not one
// box — and the agent-side check is where that intent is enforced on this path,
// alongside the context menu's own section gate on the UI path.
//
// None of these three touch geometry, so none of them need the agent grid; and
// membership reconciliation still runs after every one of them, in the shared
// factory stage (operation-tool.ts), which is why no descriptor here mentions
// it. A border restroke or a lock cannot move an edge, so reconciliation is a
// no-op on this path by construction rather than by omission.

export const changeSectionBorder = defineOperationTool({
  name: "change_section_border",
  description:
    "Restroke a frame's border. \"none\" leaves the frame invisible but fully "
    + "real: it still owns its region, and membership is geometric, so nothing "
    + "inside it changes hands.",
  fields: ChangeSectionBorderParams.properties,
  validate: (ctx, p) => {
    const errors = ctx.requireSection(p.id);
    return errors.length > 0 ? errors : ctx.requireUnlocked(p.id);
  },
  apply: (ctx, p) => ctx.applyLowered(
    // A style patch merges PER KEY on the way down (mergeObjectPatch in
    // packages/canvas/src/state/actions/objects.ts), so naming only
    // strokeStyle restrokes the border and leaves the frame's `shape` and
    // stroke width exactly where they were. Sending the whole style bag would
    // be the way to lose them.
    { type: "updateObject", objectId: p.id, patch: { style: { strokeStyle: p.border } } },
    `change_section_border ${p.id} ${p.border}`,
  ),
});

export const lock = defineOperationTool({
  name: "lock",
  description:
    "Protect a region. \"background\" pins the frame itself and leaves what is "
    + "inside it editable; \"all\" freezes the frame and every descendant. "
    + "Sections only — a lock covers an area of the board, not a single box.",
  fields: LockParams.properties,
  // No lock gate: re-locking a frame that is already locked changes the MODE of
  // its own lock, which is lock management. (A frame inside an ancestor locked
  // "all" is likewise still lockable — the ancestor's protection is not a
  // reason the region cannot be protected further.)
  validate: (ctx, p) => ctx.requireSection(p.id),
  apply: (ctx, p) => ctx.applyLowered(
    { type: "updateObject", objectId: p.id, patch: { locked: p.mode } },
    `lock ${p.id} ${p.mode}`,
  ),
});

export const unlock = defineOperationTool({
  name: "unlock",
  description:
    "Release a section's lock, restoring normal editing to the frame and its "
    + "contents. A lock a person set is a don't-touch signal: lift one only "
    + "when the request cannot be carried out otherwise, and say that you did.",
  fields: UnlockParams.properties,
  // Never lock-gated, by definition: this is the one call that lifts a lock, so
  // gating it on the lock it lifts would make every lock permanent.
  validate: (ctx, p) => ctx.requireSection(p.id),
  apply: (ctx, p) => ctx.applyLowered(
    // `undefined` in an object patch deletes the key on the way down, and an
    // already-unlocked frame therefore produces an identical document — which
    // the factory reports as a no-op rather than an empty APPLIED line.
    { type: "updateObject", objectId: p.id, patch: { locked: undefined } },
    `unlock ${p.id}`,
  ),
});

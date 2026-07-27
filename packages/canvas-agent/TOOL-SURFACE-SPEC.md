# Agent Tool Surface

Specification for the layout editor's tool surface: sixteen strongly-typed tools
built from one shared operation factory, replacing the single `apply_ops` batch
tool. Unbuilt — this describes the target, not the current tree.

The change has three independent motivations that resolve into one design:

- **Typing.** `apply_ops` declares `ops: Type.Array(Type.Any())`, so operation
  shapes reach the model only as prose. The model discovers them by rejection;
  in the 2026-07-24 run the same `from`/`to` shape error recurred in six of
  eight scenarios and an off-roster color killed a nineteen-op batch.
- **Granularity.** One operation per call makes each edit individually
  validated, individually reported, and individually visible in the run rail.
- **Explicit layout.** Automatic section fitting is gone — sections keep exactly
  the geometry they are given — and fitting is an operation the model calls when
  a region is finished. This motivation has **already shipped** in the batch
  surface as the thirteenth model-facing op, `fitSection({ sectionId })`. This
  spec carries it into the typed per-operation surface; §4.1 records the
  semantics as built.

---

## 1. Shape of the system

Sixteen tools. Thirteen are mutators built from the same factory, `look` is
read-only, and the remaining two are the existing session tools.

| Group | Tools |
| --- | --- |
| Sections | `add_section` `update_section` `remove_section` |
| Stickies | `add_sticky` `update_sticky` `remove_sticky` |
| Objects | `add_object` `update_object` `remove_object` |
| Connections | `add_connection` `update_connection` `remove_connection` |
| Layout | `fit_section` |
| Perception | `look` |
| Session | `resolve_request` `finalize` |

`agent.json` sets `"extensions": false`, so the coding agent's file tools are
absent. This list is the model's entire vocabulary.

**One operation per call, one call per turn.** The runtime supports multiple and
parallel tool calls per assistant message (`agent-loop.js:225-230` dispatches to
`executeToolCallsParallel`, or `executeToolCallsSequential` when any called tool
declares `executionMode: "sequential"`). Serial execution is a deliberate choice
for edit quality, not a platform limit. Every mutator declares
`executionMode: "sequential"` so that ordering is guaranteed if batching is
enabled later.

Three properties follow structurally and are worth naming, because each replaces
machinery that exists today:

- **Atomicity is free.** An operation applies or it does not. There is no
  partial batch, no whole-batch rejection, and no forward-reference seeding
  (`op-surface.ts:109-120` retires).
- **Silent skips become errors.** Duplicate ids, self-loops, and targets that
  vanished mid-batch are currently soft outcomes buried in an APPLIED line. Each
  becomes an ordinary validation error that reports before anything mutates. The
  one deliberate exception is a fit with nothing to fit around, which stays a
  no-op rather than a failure (§4.1).
- **Layout is already never implicit.** Geometry changes only when the model
  asked for them. Membership still reconciles from geometry after every
  operation — that is a derivation, not a layout mutation.

---

## 2. The operation factory

Every mutator is `defineOperationTool(spec)`. The factory owns the entire shared
pipeline — validation dispatch, mutation, containment reconciliation, diffing,
linting, rendering, and event emission. An operation spec supplies only what is
unique to it: its schema fields, its state-dependent checks, and its mutation.

```ts
interface OperationSpec<TFields extends TProperties> {
  /** Tool name, snake_case, matching resolve_request / finalize. */
  name: string
  /** Consequences only — the schema carries shape, so never restate fields. */
  description: string
  /** Operation-specific parameters, without the shared mixin. */
  fields: TFields
  /** State-dependent checks only. Empty array means valid. */
  validate(ctx: OpContext, params: Static<TObject<TFields>>): string[]
  /** The mutation. Only runs when validate returned nothing. */
  apply(ctx: OpContext, params: Static<TObject<TFields>>): OpOutcome
}

export function defineOperationTool<TFields extends TProperties>(
  spec: OperationSpec<TFields>,
) {
  return {
    name: spec.name,
    description: spec.description,
    executionMode: "sequential" as const,
    parameters: Type.Object({
      ...spec.fields,
      view: Type.Optional(
        Type.String({ description: "Section id to render with the result." }),
      ),
    }),
    execute: (params, ctx) => runOperation(spec, params, ctx),
  }
}
```

### 2.1 Pipeline

`runOperation` executes these stages in order. Stages 4 onward run only when
stage 3 produced no errors.

1. **Schema validation** — already done by the runtime before `execute` is
   called (`validateToolArguments` in pi-ai). Shape errors never reach the
   factory.
2. **Session resolve** — look up the session and snapshot the current draft.
3. **State validation** — `spec.validate`. On any error, return an error result
   naming the tool and the failing field. No mutation, no perception, no event.
4. **Apply** — `spec.apply` returns the new draft, an APPLIED summary line, and
   any soft notes.
5. **Containment reconcile** — recompute `parentId` from geometry. This stays
   implicit; it is a derivation, not a layout mutation.
6. **Diff** — old draft against new draft, rendered as `DELTA`.
7. **Lint** — run the rule set, emit only the delta (new findings and resolved
   ids) against the pre-operation lint state.
8. **Routes** — routed truth for any connection this operation touched.
9. **Render** — only when `view` was supplied.
10. **Requests** — the open request queue, unchanged from today.
11. **Emit** — one run-UX event per operation. The step rail's row unit becomes
    the operation rather than the batch.

### 2.2 OpContext

`OpContext` is the operation's whole view of the world. Validation helpers return
`string[]` (empty means valid) and never mutate. Mutation helpers return
`OpOutcome` and never validate.

```ts
type OpOutcome =
  /** The operation changed the draft. */
  | {
      status: "applied"
      draft: InteractiveCanvasDocument
      /** The APPLIED line, e.g. "add_object api-gw". */
      summary: string
      /** Observations that do not fail the operation. */
      notes?: string[]
    }
  /** Well-formed, legal, and nothing to do. Not an error. */
  | { status: "noop"; note: string }

interface OpContext {
  readonly draft: InteractiveCanvasDocument

  // ── validation ─────────────────────────────────────────────────────────
  requireFreeId(id: string): string[]
  requireSection(id: string): string[]
  requireSticky(id: string): string[]
  requireShape(id: string): string[]
  requireConnection(id: string): string[]
  requireEndpoint(field: "from" | "to", endpoint?: Endpoint): string[]
  requireDistinctEndpoints(from?: Endpoint, to?: Endpoint): string[]
  requireNotLastSection(id: string): string[]

  // ── mutation ───────────────────────────────────────────────────────────
  insertSection(payload: SectionPayload): OpOutcome
  insertSticky(payload: StickyPayload): OpOutcome
  insertObject(payload: ObjectPayload): OpOutcome
  mergeObject(id: string, patch: ObjectPatch): OpOutcome
  removeObject(id: string): OpOutcome
  insertConnection(payload: ConnectionPayload): OpOutcome
  mergeConnection(id: string, patch: ConnectionPatch): OpOutcome
  removeConnection(id: string): OpOutcome
  fitSection(id: string): OpOutcome
}
```

`requireShape` enforces the kind gate: a section or sticky id passed to an object
operation fails with a redirect naming the correct tool. `requireSection` and
`requireSticky` do the same in the other direction.

Sections and stickies are objects with a `type` discriminator, so
`insertSection` and `insertSticky` set that field themselves. The model never
supplies it, and the payload schemas forbid it.

### 2.3 Error contract

Three layers, each with a single responsibility. Nothing appears in two.

| Layer | Owns | Reaches the model as |
| --- | --- | --- |
| Tool schema | Field presence, types, enums, id format, geometry completeness | Runtime validation error naming the tool |
| `spec.validate` | Existence, entity kind, board invariants | Error result: `add_connection: from.objectId "api-gw" is not on the board` |
| `spec.apply` notes | Non-fatal observations | A note under the APPLIED line |

Two soft outcomes survive from the batch design. A second edge over an existing
`from`→`to` pair applies with a duplicate warning, and a fit with nothing to fit
around returns a no-op note (§4.1). Every other former soft skip — duplicate
ids, self-loops, targets unavailable after earlier ops — becomes a stage-3
error, because with one operation per call there are no "earlier ops" for a
target to disappear behind.

---

## 3. Shared vocabulary

Generated from the canvas package's existing tables by
`scripts/generate-capabilities.ts`, which already emits
`capabilities/vocabulary.generated.ts` from the same source. Hand-listing any of
these rosters in the spec or the prompt is a defect.

```ts
const Id        = Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,96}$" })
const Color     = StringEnum(CANVAS_COLORS)        // colors.ts — 10 hues
const ShapeType = StringEnum(SHAPE_OBJECT_TYPES)   // 28: the 30-key roster minus section, sticky
const Glyph     = StringEnum(CANVAS_ICON_GLYPHS)   // object-types.ts — 26
const Direction = StringEnum(["left", "right", "up", "down"])
const Anchor    = StringEnum(["top", "right", "bottom", "left", "center"])
const Style     = StringEnum(["solid", "dashed"])
const Arrow     = StringEnum(["none", "forward", "back", "both"])

const Geometry = Type.Object({
  x: Type.Number(), y: Type.Number(),
  width: Type.Number(), height: Type.Number(),
}, { additionalProperties: false })

const Point = Type.Tuple([Type.Number(), Type.Number()])

const Endpoint = Type.Object({
  objectId: Id,
  anchor:   Type.Optional(Anchor),
  position: Type.Optional(Point),
}, { additionalProperties: false })

const Seal  = { additionalProperties: false }
const Patch = { additionalProperties: false, minProperties: 1 }
```

The id pattern is `validate.ts:43`'s regex, which is currently enforced only
downstream of the agent. `Seal` is what forbids a `type` field on section and
sticky payloads, replacing the hand-written checks at `op-surface.ts:218,255`.

Two properties of the wire matter for how this is written:

- The live provider is `openai-responses` with `strict: false`, which forwards
  the JSON Schema verbatim. `anyOf`, `const`, `enum`, and `pattern` all survive.
  The schema **steers** the model; it does not constrain decoding.
- The Anthropic provider rebuilds `input_schema` keeping only `properties` and
  `required`, dropping anything at the root. Keep every definition inlined —
  no `Type.Ref`, no `$defs` — so the surface stays portable.

### 3.1 Payloads

```ts
const SectionPayload = Type.Object({
  id: Id, text: Type.String(), color: Type.Optional(Color), geometry: Geometry,
}, Seal)

const StickyPayload = Type.Object({
  id: Id, text: Type.String(), color: Type.Optional(Color), geometry: Geometry,
}, Seal)

const ObjectPayload = Type.Object({
  id: Id, type: ShapeType, text: Type.Optional(Type.String()),
  color: Type.Optional(Color), geometry: Geometry,
  direction: Type.Optional(Direction), icon: Type.Optional(Glyph),
}, Seal)

const ConnectionPayload = Type.Object({
  id: Id, from: Endpoint, to: Endpoint,
  label: Type.Optional(Type.String()),
  style: Type.Optional(Style), arrow: Type.Optional(Arrow),
  color: Type.Optional(Color),
  waypoints: Type.Optional(Type.Array(Point)),
}, Seal)

const SectionPatch    = Type.Object({ text: Type.Optional(Type.String()), color: Type.Optional(Color), geometry: Type.Optional(Geometry) }, Patch)
const StickyPatch     = Type.Object({ text: Type.Optional(Type.String()), color: Type.Optional(Color), geometry: Type.Optional(Geometry) }, Patch)
const ObjectPatch     = Type.Object({ type: Type.Optional(ShapeType), text: Type.Optional(Type.String()), color: Type.Optional(Color), geometry: Type.Optional(Geometry), direction: Type.Optional(Direction), icon: Type.Optional(Glyph) }, Patch)
const ConnectionPatch = Type.Object({ from: Type.Optional(Endpoint), to: Type.Optional(Endpoint), label: Type.Optional(Type.String()), style: Type.Optional(Style), arrow: Type.Optional(Arrow), color: Type.Optional(Color), waypoints: Type.Optional(Type.Array(Point)) }, Patch)
```

`geometry` is a whole object everywhere, so a patch either replaces all four
numbers or none. This is what structurally prevents the `NaN×NaN` partial-patch
class recorded in the 2026-07-24 eval review. `Patch`'s `minProperties: 1`
rejects empty no-op updates.

---

## 4. The operations

| Tool | Fields | State validation |
| --- | --- | --- |
| `add_section` | `section: SectionPayload` | id is free |
| `update_section` | `sectionId: Id`, `patch: SectionPatch` | id exists and is a section |
| `remove_section` | `sectionId: Id` | exists, is a section, is not the last section |
| `add_sticky` | `sticky: StickyPayload` | id is free |
| `update_sticky` | `stickyId: Id`, `patch: StickyPatch` | id exists and is a sticky |
| `remove_sticky` | `stickyId: Id` | exists, is a sticky |
| `add_object` | `object: ObjectPayload` | id is free |
| `update_object` | `objectId: Id`, `patch: ObjectPatch` | id exists and is a shape |
| `remove_object` | `objectId: Id` | exists, is a shape |
| `add_connection` | `connection: ConnectionPayload` | id is free; both endpoints exist; endpoints differ |
| `update_connection` | `connectionId: Id`, `patch: ConnectionPatch` | connection exists; supplied endpoints exist and differ |
| `remove_connection` | `connectionId: Id` | connection exists |
| `fit_section` | `sectionId: Id` | exists, is a section |

Every one also carries the shared optional `view`.

Representative definitions; the rest follow identically.

```ts
export const addObject = defineOperationTool({
  name: "add_object",
  description:
    "Place a shape. Containment is reconciled from geometry — a shape outside "
    + "every frame belongs to no section.",
  fields: { object: ObjectPayload },
  validate: (ctx, p) => ctx.requireFreeId(p.object.id),
  apply:    (ctx, p) => ctx.insertObject(p.object),
})

export const addConnection = defineOperationTool({
  name: "add_connection",
  description:
    "Route an edge between two objects. A second edge over an existing "
    + "from→to pair applies with a duplicate warning; prefer restyling the "
    + "existing edge.",
  fields: { connection: ConnectionPayload },
  validate: (ctx, p) => [
    ...ctx.requireFreeId(p.connection.id),
    ...ctx.requireEndpoint("from", p.connection.from),
    ...ctx.requireEndpoint("to", p.connection.to),
    ...ctx.requireDistinctEndpoints(p.connection.from, p.connection.to),
  ],
  apply: (ctx, p) => ctx.insertConnection(p.connection),
})

export const removeSection = defineOperationTool({
  name: "remove_section",
  description: "Delete a section and every descendant inside it.",
  fields: { sectionId: Id },
  validate: (ctx, p) => [
    ...ctx.requireSection(p.sectionId),
    ...ctx.requireNotLastSection(p.sectionId),
  ],
  apply: (ctx, p) => ctx.removeObject(p.sectionId),
})
```

### 4.1 `fit_section`

Already shipped in the batch surface as `fitSection({ sectionId })`. The
semantics below are what was built; the typed surface changes only the call
shape.

```ts
export const fitSection = defineOperationTool({
  name: "fit_section",
  description:
    "Close a section around the children already inside it. Fits only the "
    + "named section — ancestors keep their slack until you fit them too.",
  fields: { sectionId: Id },
  validate: (ctx, p) => ctx.requireSection(p.sectionId),
  apply:    (ctx, p) => ctx.fitSection(p.sectionId),
})
```

**Why it exists.** Silent auto-fit was shrinking the board's base section to hug
whatever had been drawn, so the agent could never create or keep empty space.
Sections now hold exactly the geometry they are given.

**How the fit is computed.** There is no auto-fit helper to call —
`packages/canvas/src/state/agent-patch-auto-fit.ts` is deleted. `ctx.fitSection`
mirrors `resolveFitSection` (`apply-ops.ts:394-413`): read the frame's children
off a membership-reconciled copy of the draft, compute `sectionFitGeometry`, and
land the result as an ordinary geometry update on that one section. No ancestor
is touched. Because it lowers to a plain section geometry patch, `fit_section`
needs no special case below the lowering line — the carve-out at
`op-surface.ts:362` ("resolved against the document by the applier, never
lowered here") exists only because the batch surface routes every op through one
tool.

**No cascade, by design.** Fitting is a finishing move, and only the model knows
a region is finished. Cascading to ancestors is auto-fit again at smaller scope:
it would compress a parent around whichever child sections happen to exist yet,
before the siblings are placed. Ancestors carry visible slack until the model
fits them, working innermost-outward on its own schedule.

The page frame is fittable like any other section — `resolveFitSection` has no
base-section carve-out. Fitting the page to its contents is rarely what you
want, but that is the model's call to make, not the applier's.

**Empty section is a no-op, not an error.** *Decided; the spec previously
specified rejection.* A fit on a childless frame returns
`status: "noop"` carrying the shipped note:

> skipped — the section is empty, and a frame with no children has nothing to
> fit around; size it with updateSection instead

The original argument for rejecting was that the model creates frames before
filling them and will call this by accident, and that collapsing a fresh frame
is confusing. The shipped behavior already satisfies that concern — nothing
collapses — while avoiding two costs a rejection would carry: it is not a
failure, so it should not read as one in the transcript, and it should not
count against the eval rejection metrics (§6.4). A well-formed, legal request
that has nothing to do is a no-op.

The batch surface's sibling note, `skipped (section unavailable after earlier
ops)`, has no successor here: with one operation per call, a missing section is
a stage-3 `requireSection` error.

The interactive fit-to-content feature under
`stage/editor/features/section-fit/` is a separate human-facing path and is not
touched by any of this.

### 4.2 `look`

```ts
look({ view?: Id })
```

The model's deliberate "step back and judge" move, and the only place expensive
perception lives. Returns the payload today's `apply_ops` result carries: the
full board digest, the cumulative `BOARD DIFF` from base to draft, the complete
lint list, routed truth, the request queue, a full-board render at 1600px, and a
1400px section close-up when `view` is supplied.

---

## 5. The result envelope

Per-operation results are sized for one operation. Repeating a full digest and a
1600px render after every call would multiply image tokens to re-show a board
where one rectangle moved; returning nothing recreates the blind-model failure
behind the 169-rejection session in `feedback/2026-07-24-eval-review.md`. Three
tiers resolve that.

**Always** — the APPLIED line, the delta, and lints newly introduced or resolved
by this operation:

```
APPLIED · add_object api-gw
DELTA
  + api-gw (process) → section ingress @ 320,160 240×96
LINTS +1
  crowding: api-gw overlaps auth-svc by 12px
```

**Scoped digest** — the rows for the section this operation touched, not the
whole board. One operation touches one region; that is the proportionate recall
affordance.

**Render** — only when `view` was supplied.

Three result classes, distinguished by headline so the model never has to infer
from an empty delta what happened:

| Class | Headline | Carries |
| --- | --- | --- |
| Applied | `APPLIED · add_object api-gw` | delta, lint delta, scoped digest, optional render, one rail event |
| No-op | `NO-OP · fit_section ingress — <note>` | the note only |
| Error | `ERROR · fit_section — <lines>` | the error lines only |

No-ops and errors both leave the draft untouched and emit no rail event. They
differ in what they tell the model: an error means fix the call, a no-op means
the call was fine and there was nothing to do.

---

## 6. What we need to do

### 6.1 Code

**New**

- `src/service/session/operation-tool.ts` — the factory and `runOperation`.
- `src/service/session/op-context.ts` — `OpContext` implementation.
- `src/service/session/schemas.ts` — payloads, patches, shared vocabulary,
  generated rosters.
- `src/service/session/operations/` — the thirteen specs, one file per kind
  group.
- `look` tool implementation, assembled from the existing perception code.

**Modified**

- `src/agent/catalog/layout-editor/tools.ts` — replaced. `apply_ops` and its
  prose description of op encoding (`:48-54`) are deleted; `resolve_request`
  and `finalize` are unchanged.
- `src/service/session/apply-ops.ts` — split. Two things are retained and move
  into the factory: perception assembly (`assembleApplyResult`, the
  digest/delta/lint/route blocks) and `resolveFitSection` (`:394-413`), which
  becomes `OpContext.fitSection`. The batch fold in `applyOperationBatch`, the
  ordered-skip handling, and the per-batch membership reconcile are deleted —
  reconciliation moves to pipeline stage 5, per operation.
- `src/service/session/op-surface.ts` — mostly deleted. The shape validators and
  batch preamble go; the lowering to the internal six-operation grammar is kept
  and moves into `OpContext`, including the `fitSection` carve-out at `:362`,
  which stops needing to exist once fitting has its own tool.
  `classifyOperation` keeps its DELTA caller and loses its lint caller.
- `src/service/tool-runtime.ts` — the pushed-perception contract in its header
  no longer describes the system.
- `agent.json` — `maxTurns` 120 → ~300. One operation per turn makes 120 bind on
  any real board.

**Tests**

- `test/session-store-apply-ops.test.ts` — the batch atomicity test at `:163`
  describes a surface that no longer exists.
- Any test asserting post-patch auto-fit.

### 6.2 Lints

- **Drop structured quickfixes.** `board/lints/run.ts:59` emits
  `suggested op: <JSON>`; remove the `operations` field from diagnostics and
  keep the prose `suggestion`. Lints report what is wrong; the model decides the
  fix.
- **Overflow is already covered.** The containment rule detects children outside
  their frame and its suggestion text already points at `fitSection`
  (`rules/containment.ts:64`). Nothing to add. This is the structurally
  important half: membership derives from geometry, so a child placed past its
  parent's edge is not a child at all.
- **Slack is the missing rule.** A frame larger than its children need has no
  signal today. Add it as polish only — suppressed until the finishing pass, or
  ranked below everything else. An eager slack lint recreates the premature
  compression that no-cascade exists to prevent, by nagging instead of by
  automation.

### 6.3 Prompt truth

**The auto-fit pass is done.** It shipped with `fitSection`: `grep` for
`auto-fit|autoFit` across `canvas-agent/src` returns nothing. `prompt.json:807`
now reads "Frames hold the space you give them — size a section for what it will
hold, and call fitSection when you want it closed around the children already
inside", the base section's exception is gone from `prompt.json:38`, and
`capabilities/kinds/sections.ts` and `containment.ts` are rewritten. Nothing in
this section is about auto-fit any more.

What the tooling overhaul still has to change:

| Location | Change |
| --- | --- |
| `prompt.json:169,342,866` / `rendered:30,56,152` | The three `suggested op:` nodes — see §6.2 |
| `rendered:120,125,128,132,137,138` | Batch workflow language — "one batch for the whole skeleton", "one planned step per batch, several ops each", "a rejected batch applies nothing" |
| `rendered:36,62,156` | "the latest apply result is the truth" — retargets to `look` |
| `capabilities/index.ts:53` | "apply_ops speaks thirteen operations… validation is all-or-nothing" — both halves stop being true |
| `capabilities/ops.ts` | The `declaration:` strings become redundant once schemas carry shape; keep `consequences` |
| `tools.ts:48-54` | The `apply_ops` description's prose encoding of op shape |

Also `docs/30-agent-layout/00-overview` and `40-kernel`, which both state the
three-tool, one-mutator, all-or-nothing design, and rulebook R3 section-trim.

### 6.4 Eval

- The baseline is invalid; re-baseline after the prompt pass.
- Expect spatial-axis movement until the prompt teaches fitting as a deliberate
  step. That is the change landing, not a regression to chase.
- **The PH rubric measures the old failure mode.** `axes-system/ph.md:51` scores
  bands by "12–23 consecutive rejected calls before first valid op" — a
  batch-era metric. Per-operation typed tools change the shape of the rejection
  profile entirely, so the bands need rewriting before the numbers mean
  anything.
- Turn counts rise by roughly the average batch size. Watch for `maxTurns`
  truncation on the first run.

### 6.5 Run UX

`AGENT-RUN-UX-PLAN.md` assumes batch is the step unit — one SSE event per
`apply_ops` (`:153`), one rail row per batch (`:345`). The unit becomes the
operation. This is finer-grained and closer to the plan's intent, but it is
unbuilt work resting on the old assumption.

---

## 7. Decisions still owed

- **Sealing drops passthrough.** `addSection` currently lets undocumented
  `style`, `locked`, and `layout` fields reach the applier. The sealed payload
  removes that. Confirm nothing relies on it.
- **Should `finalize` require a prior `look`?** The model committing a draft it
  has not rendered since its last edit is the failure this surface makes
  possible. Taught in prose today, unenforced by the tool.

---

## 8. As built

Decisions taken while implementing, where the spec above was silent or where
the build found something better. This section is the record; the sections
above describe the target.

**Resolved from §7.**

- *Slack lint policy* — `board/lints/index.ts` exports two registries.
  `LAYOUT_RULES` is the five always-on graph lints, unchanged. `FINISHING_RULES`
  is those plus `frame-slack`, ranked last, and `finalize` is the only caller.
  The rule fires when fitting would reclaim ≥⅔ of a frame's area *and* one side
  carries ≥320px of slack; the page frame, childless frames, and frames whose
  children spill out are all skipped.
- *Scoped digest contents* — a section's rows include connections with at least
  one endpoint inside it; an edge scopes to the sections owning both endpoints.
  A changed entity belonging to no frame gets its own `OUTSIDE <id>` block.
- *`view` validation* — a `view` that does not name a section costs the render,
  not the edit. The operation applies and the result carries
  `render failed: view "<id>" — …`. Rejecting a valid mutation over a bad
  viewing preference is the blast radius this surface exists to remove.

**Where the build departs from §2–§5.**

- *No `mergeSection` / `mergeSticky`.* §2.2 declares only `mergeObject`, so all
  three update kinds route through it, following §4's own
  `remove_section → ctx.removeObject` precedent. It typechecks because
  `SectionPatch` and `StickyPatch` are structural subsets of `ObjectPatch`.
- *`update_connection` is not a pure helper composition.* A patch usually
  carries one endpoint, so distinctness has to be judged against the edge as it
  will stand — the side being repointed against the side already stored. That
  spec resolves the stored connection off `ctx.draft` before calling
  `requireDistinctEndpoints`. Comparing the patch to itself let an edge land on
  the object its other end already occupied.
- *Any zero-delta operation is a no-op.* §4.1 named only the empty fit, but §5
  defines the class as legal-and-nothing-to-do, which a patch asking for what
  the board already holds plainly is. `APPLIED` over an empty delta is a
  confusing pair to hand the model.
- *The lint baseline derives from `before`.* `session.lastDiagnostics` is a
  cache, not the definition: when it is absent, `lintDeltaBlock` runs the rules
  over the pre-operation document. A delta then means the same thing on every
  path in, rather than depending on how the session was constructed.
- *Per-operation results carry ROUTES and REQUESTS* (§2.1 stages 8 and 10),
  which §5's table omits. `BOARD DIFF` is not in the per-operation payload —
  §2.1 stage 6 defines the diff as old-draft→new-draft, and §4.2 gives the
  cumulative diff to `look`.
- *`OpOutcome` lives in `op-context.ts`* and is re-exported from
  `operation-tool.ts`, so specs have one import point and there is one
  declaration.

**Carried forward, not fixed.**

- Each applied operation emits the harness's existing `proposal` + `delta`
  event pair, so N edits leave 2N events. `AGENT-RUN-UX-PLAN.md` assumes one
  event per applied operation; reconciling them is run-UX work.
- `session.proposalCount` is never incremented anywhere in the harness, yet
  every `proposal` event carries it and `finalize` reads it as
  `Math.max(1, proposalCount)`. Pre-existing; worth a look on its own.

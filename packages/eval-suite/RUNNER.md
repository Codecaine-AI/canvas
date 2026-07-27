# RUNNER — standing eval suite for the canvas layout agent

How to execute the suite end-to-end against any change (rules, prompt, lints, perception,
model config) and produce a scorecard that diffs cleanly against the previous run.

Companion files: `axes/` (one rubric per axis + shared rules + the generic judge
prompt), `scenarios/s*.md` (the fixtures),
`runs/<run-id>/` (one directory per execution). Prior-art mechanics this protocol inherits:
`docs/agent-eval/2026-07-22-rule-eval/PROTOCOL.md` and `V4-TRIAL-PROTOCOL.md`.

**Execution policy (effective 2026-07-22 evening): Codex executors** — the Fable main
thread is the orchestrator; every worker is a separate `codex exec -m gpt-5.6-sol`
invocation. Reasoning effort by role:

- **The SUT itself is never an eval worker**: build/edit sessions always go through the
  harness on :4820, which runs its own configured model (the `layout` alias →
  gpt-5.6-sol, thinking per `agent.json` — currently `high`). Runners drive it via the
  API only; the eval never bypasses or reconfigures it. The harness model + thinking
  belong in the SUT fingerprint.
- **Scenario runners, report-writing/trial-report sessions, and mechanical eval
  workers**: `-c model_reasoning_effort="xhigh"`.
- **Judges (rating sessions)**: `-c model_reasoning_effort="low"` — a judge applies a
  fixed rubric to fixed inputs and emits a score plus its evidence contract; effort
  stays low across runs so judge calibration is comparable.

Orchestration, scorecard assembly, and final acceptance stay with the Fable main
thread. The shape of a run: boot the scenario runners in parallel (each driving its
harness sessions sequentially), fan out the rating sessions over every finished
scenario, then assemble the final scorecard.

Historical note (2026-07-22): runs before that evening, plus the first half of
`2026-07-22-v5-initial`, used Fable agents under the prior Fable-only policy. Preserve
that history in run records. The executor model belongs in the SUT fingerprint because
judge-calibration comparisons are only meaningful across like executors.

---

## Codex executor mechanics

Operational notes verified 2026-07-22:

- Pipe each worker prompt on stdin:
  `codex exec -m gpt-5.6-sol -c model_reasoning_effort="<per role, see policy>" - < prompt.md`.
- Add `-c sandbox_workspace_write.network_access=true` for any worker that must reach
  `:4000` or `:4820`; the default sandbox blocks localhost.
- Workers outside a git repo (for example, the IC blind judge's isolation directory)
  need both `--skip-git-repo-check` and `-c sandbox_mode="workspace-write"`. The
  outside-git default is read-only, and attempted writes otherwise surface only as a
  patch-rejected error.
- `qlmanage` cannot initialize inside the sandbox. Render snapshot PNGs from preview
  SVGs with the repo's `@resvg/resvg-js` at 2800px width instead.

## 0. When to run, and what it costs

Run the full suite on any change to the system under test (SUT): lint set/thresholds,
style files, system prompt, perception (digest/delta/crops), model or thinking config,
routing/renderer changes that affect output. For a quick smoke, run s1 + s3 + s7 only —
but never publish a scorecard row from a partial run without marking it `PARTIAL`.

Cost of a full run: 8 build sessions + 21 edit sessions ≈ 29 agent sessions on :4820
(historically 3–11 min each at high thinking), plus ~48 judge sessions (5 axes × 8
scenarios, some doubled for IC's two roles). Wall clock ≈ 2–4 h with scenarios run 3-wide.

## 1. Preconditions

1. Studio file API up on :4000 (`make studio` or the shared handler server) — verify
   `GET /api/canvases` answers.
2. Harness up on :4820 (`make harness`) — verify `GET /health` → `{"status":"ok"}`.
3. Reference boards render: `gc-decomp-harness`, `intent-classification-2` via
   `GET :4000/api/canvases/<id>/preview.svg?fit=content&pad=48`. If either is missing,
   STOP — nothing can be graded without the anchors.
4. **Fingerprint the SUT** into the run header (this is what makes diffs attributable):
   - repo git rev (`git rev-parse --short HEAD`) + dirty flag
   - `packages/canvas-agent` config: model id, thinking level, turn cap (from agent.json)
   - eval executor model and reasoning effort
   - hash of the system prompt file(s), hash/listing of the active lint set and style
     files (post-v5: `src/lints/`, `src/styles/`)
   - harness start time (a restart mid-run invalidates comparability — note it)
5. Create the run directory: `packages/eval-suite/runs/<YYYY-MM-DD>-<label>/`
   where `<label>` names the change under test (e.g. `2026-07-24-v5-lints`). Layout:

```
runs/<run-id>/
  scorecard.md            # the diffable artifact (see §5)
  fingerprint.md          # SUT fingerprint + infra notes
  s<N>/                   # per scenario
    stage0.json  stage0.png          # committed build state
    e1.json      e1.png              # after edit 1 … etc
    sessions.md                      # session ids, container ids, outcomes, timings
    judge-sq.md  judge-ic.md  judge-if.md  judge-es.md  judge-ph.md
    ic-reconstruction.md             # the blind judge's raw output
```

   Git policy: `scorecard.md` + `fingerprint.md` + judge files are the record worth
   keeping; PNGs/JSONs are bulky evidence — keep them locally, commit at Ford's
   discretion (default: don't commit renders). Nothing in this suite auto-commits.

## 2. Board lifecycle (per scenario)

1. `DELETE :4000/api/canvases/eval-suite-<id>` if it exists — every run starts from a
   blank board; there is no cross-run state.
2. `POST :4000/api/canvases` with a fresh document modeled on
   `canvases/bubba-voice.canvas.json`: `schemaVersion: 1`, `id: eval-suite-<id>`,
   `mode: "diagram"`, a locked `page-frame` section at the fixture's stated size, and
   1–2 placeholder nodes (the agent builds around/replacing them, same as every prior
   eval round). NEVER run suite sessions against any non-`eval-suite-*` canvas.
3. Snapshot `stage-blank.json` (the created doc) for the first ES diff base.

## 3. Session execution (per scenario)

One **runner executor** per scenario — its own `codex exec -m gpt-5.6-sol -c
model_reasoning_effort="xhigh"` invocation, per the execution policy above — owns
steps 2–4 and writes `s<N>/sessions.md`.
Scenarios are independent — boot all runner executors in parallel (8-wide; 5-wide is
round-1 precedent). If the harness visibly queues or slows, drop to 3-wide. Sessions
within a scenario stay strictly sequential.
Sessions within a scenario are strictly sequential.

For the build session and then each edit, in fixture order:

1. `POST :4820/api/canvases/eval-suite-<id>/agent/sessions` with
   `{ instruction: <verbatim from the fixture>, scopeObjectIds: ["page-frame", ...] }`.
   Session creation requires `scopeObjectIds`: include `page-frame` plus every relevant
   object id. Edits are **new sessions** (not `/message` follow-ups) so each is
   independently transcript-auditable — matching how the round-1 batteries ran.
2. Poll `GET …/sessions/:sid` every ~10s, cap 15 min. Stuck ACTIVE with the transcript
   ending on a `render_draft` start = harness death: mark `INVALID(infra)`, retry the
   session ONCE, then give up on the stage (later stages of that scenario are skipped;
   earlier stages still grade).
3. On proposal: **accept + materialize** — `POST …/accept` returns patch ops but does
   NOT persist server-side; apply the ops to the current doc and `PUT` the result to
   `:4000/api/canvases/eval-suite-<id>`, then `GET` it back to verify (the exact recipe
   every round-1 agent used).
   **Accept policy: always accept and materialize** unless the proposal is outright
   wrecked (content destroyed / unreadable) — the suite grades what the agent ships, and
   a low score IS the signal; rejecting good-faith mediocrity would hide it. A rejection
   is recorded in `sessions.md` with one line of why, the stage is graded from the
   *proposal's* draft render (`GET …/draft.svg`) for SQ/IC, and ES/IF grade the rejection
   as a failed stage.
   If an executor dies after leaving the session in `accepted`, a second `/accept` call
   returns 409. Recover from `GET …/sessions/:sid`, whose `.proposal.operations` and
   `.proposal.summary` remain available; diff the intended effects against the live
   document and apply only effects that are absent.
4. Snapshot the stage: `GET :4000/api/canvases/…` → `s<N>/<stage>.json`;
   `GET :4000/api/canvases/…/preview.svg?fit=content&pad=48` → svg → PNG at ≥2400px
   (`@resvg/resvg-js`, 2800px width) → `s<N>/<stage>.png`.
5. Record in `sessions.md`: sessionId, containerId, wall time, op count, outcome
   (committed / rejected / invalid-infra / agent-abandon), retries, and the verbatim
   commit summary.

## 4. Grading (per scenario, after its sessions finish)

One judge per axis file in `axes/` (multi-role axes like IC get one session per role),
each its own `codex exec` invocation at `low` effort (execution policy above),
**instantiated from `axes/JUDGE-PROMPT.md` + its axis file** and isolated to the
axis file's "Sees" list — the runner never hand-writes judge prompts, and the active
axis set is simply the axis files present in `axes/`. Grading for a finished scenario can start while
other scenarios are still running sessions.

| judge | sees | writes |
|---|---|---|
| SQ | final PNG, both reference PNGs, genre name, `axes/sq.md` | `judge-sq.md` — score + delta sentence + 7 sub-check lines |
| IC blind | final PNG ONLY (anonymized `board.png`) | `ic-reconstruction.md` (format in `axes/ic.md`) |
| IC scorer | reconstruction + fixture comprehension key + final JSON (for corruption checks) | `judge-ic.md` — R, C, per-fact recovered/missed/corrupted table, score |
| IF | fixture checklist + final JSON + final PNG + all commit summaries (for declared substitutions) | `judge-if.md` — per-item pass/fail, P, caps applied, score |
| ES | per-edit: pre/post JSON, edit instruction, fixture invariants, commit summary, both PNGs | `judge-es.md` — per-edit violations/accommodations/invariants + per-edit score + mean |
| PH | all transcripts (`:4820 …/transcript`), session metadata, stage diffs | `judge-ph.md` — signal-by-signal findings + score |

Rules the orchestrator enforces when collecting judge output:

- A score with no delta sentence (SQ) or no per-fact table (IC) or no per-item list
  (IF/ES) is bounced back to the judge — evidence-free numbers don't enter the scorecard.
- SQ judge must report its two reference calibration scores; drift > ±0.5 → `CAL-DRIFT`,
  re-run that judge.
- The IC blind judge for scenario sN must never be the same session as any other judge,
  and its prompt must contain no scenario vocabulary (the PNG path is allowed to be
  anonymized via a copy named `board.png` — do this; filenames leak genre).
- Judges grade from the rendered PNG at the same resolution every run (≥2400px) — a
  resolution change is a perception change and belongs in the fingerprint.

## 5. The scorecard (`runs/<run-id>/scorecard.md`)

Fixed shape, fixed ordering, one line per scenario — this file is the diff target.
Scores are the axis scores; `Δ` columns are vs the previous run's scorecard (omit the Δ
columns on the first run; the assembler computes them by reading the previous run's file,
which is named in the header).

```markdown
# Eval-suite scorecard — <run-id>
SUT: <git rev><±dirty> · model <id> @ <thinking> · prompt <hash8> · lints <hash8> · styles <hash8>
Previous run: <run-id | none> · Sessions: <n> ok / <n> rejected / <n> abandoned / <n> invalid-infra
Judge calibration: gc=<x> intent=<x> (target 7.5 / 7.0)

| scenario | SQ | ΔSQ | IC | ΔIC | IF | ΔIF | ES | ΔES | PH | ΔPH | flags |
|---|---|---|---|---|---|---|---|---|---|---|---|
| s1-linear-flow | … | … | … | … | … | … | … | … | … | … | |
| s2-branching-flowchart | … |
| s3-state-machine | … |
| s4-swimlane | … |
| s5-nested-arch | … |
| s6-org-tree | … |
| s7-telemetry-platform | … |
| s8-retrieval-designs | … |
| **mean** | … |

## Movements ≥ 1.0 (mandatory narration)
- <scenario>/<axis> <old>→<new>: <the judge's delta-sentence evidence, one line>

## Axis correlation check
<one line: any two axes whose per-scenario scores moved in lockstep this run — flag per
axes/README.md discrimination requirement>
```

Conventions that keep it diffable: scenarios always in s1–s8 order; one scenario per
line; axis columns follow the `scorecard-order` headers of the files in `axes/` — if
the axis set changed since the previous run, say so in the header and omit Δ for the
changed columns; half-points as `.5`; `INVALID(infra)` stages render as `–` (dash) and are excluded
from the mean; `flags` carries `PARTIAL`, `CAL-DRIFT`, `REJECTED(sN-eK)`, `INFRA(…)`.
Never reformat the table; never reorder columns. `git diff --no-index` between two runs'
scorecards is the intended review artifact.

## 6. Interpreting a diff

- **SQ moved, IC didn't** — cosmetic change landed (or regressed) without touching
  communication. Expected for style-file/threshold tuning.
- **IC moved, SQ didn't** — communication changed: label association, edge legibility,
  grouping clarity. Perception changes should show up here first.
- **IF dropped anywhere** — the agent is dropping or mutating specced content; treat as
  a regression gate regardless of pretty scores elsewhere.
- **ES dropped** — churn is back (re-solve-the-world behavior). Check whether a new lint
  is pushing the agent into global fixes for local asks.
- **PH dropped with outputs flat** — the same result is costing more fighting; usually a
  miscalibrated lint (round 1's section-trim noise pattern).
- Single-scenario movement = genre-specific; cross-scenario movement on one axis =
  systemic. The mandatory narration section forces the assembler to pull the judge
  evidence for anything ≥ 1.0 — never ship a scorecard whose movements are unexplained.

## 7. Suite maintenance

- Fixtures are frozen between runs. A fixture change (even a wording tweak in a build
  instruction) invalidates run-over-run comparison for that scenario — bump a
  `fixture-rev` note in the scenario file header and mark the scorecard cell `FIXTURE-REV`
  the first run after.
- When the agent starts saturating an axis (≥9 across all scenarios for two consecutive
  runs), add a harder scenario rather than inflating rubric anchors — the anchors are
  pinned to real boards and must not drift.
- The two reference boards are load-bearing calibration constants. If they are ever
  edited, re-derive their calibration scores by panel judgment and note it in
  axes/README.md.
- Anchor boards (`eval-*`, `eval-v3-*`, `eval-v4-*`) must stay on :4000 — the rubric
  cites them. Don't reuse those ids for suite runs (`eval-suite-*` namespace only).
- Update 2026-07-22: the anchor boards were archived to `canvases/archive/` (library
  declutter); their render snapshots live in `packages/eval-suite/anchors/`. Rubric
  citations resolve to those PNGs; restore the `.canvas.json` files to `canvases/` if a
  judge needs a live re-render.

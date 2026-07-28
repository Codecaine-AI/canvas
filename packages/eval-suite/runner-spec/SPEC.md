# Eval-suite runner — shared infrastructure spec

Target: `packages/eval-suite/runner/` — a Bun + TypeScript (ESM) package that executes
the standing eval suite end-to-end: deterministic scenario processes drive the
harness, BAML single-completion judges grade finished scenarios, and a deterministic
assembler emits the scorecard. No coding agents participate in the eval path.

This file defines infrastructure shared by the active scenario tier. Scenario format,
axis definitions, judge inputs, and tier-specific scorecard semantics are defined in
`SPEC-SYSTEM-TIER.md`.

Authoritative companions:

- `packages/eval-suite/RUNNER.md` — suite protocol: preconditions, board lifecycle,
  session execution, grading inputs, and scorecard format. This spec changes only the
  executor of each stage, never the protocol semantics.
- `packages/eval-suite/axes-system/*.md` — the active rubrics. Axis files are the
  source of truth for judge prompts and remain markdown; they are passed through to
  judge completions at runtime, never duplicated into `.baml` files.

## Package layout

```
packages/eval-suite/runner/
  package.json  tsconfig.json
  baml_src/
    clients.baml  generators.baml
    judges/*.baml
  baml_client/            # generated, committed
  src/
    contract.ts           # shared types
    semaphore.ts          # counting semaphore
    judge/inputs.ts       # gather per-axis inputs
    judge/render_md.ts    # verdict JSON → judge-*.md
    judge/run_judges.ts   # fire completions
    scenario/scenario.ts  # one scenario process
    scenario/queue.ts     # process queue + watcher
    scenario/harness.ts   # file API and agent API client
    scenario/snapshot.ts  # svg→png via resvg
    scorecard/assemble.ts # scorecard.md writer
    cli.ts                # subcommand dispatch
```

CLI contract:

- `bun run src/cli.ts suite --run-id <id> [--scenarios <names>] [--parallel 8]
  [--judge-concurrency 10] [--previous <run-id>]`
- `bun run src/cli.ts judge --run-id <id> [--scenario <name>]
  [--judge-concurrency 10]`
- `bun run src/cli.ts scorecard --run-id <id> [--previous <run-id>]`
- `bun run src/cli.ts clean --run-id <id> | --all`

## Run identity and isolation

The run id `<YYYY-MM-DD>-<label>` is the single key tying every artifact of a run
together. It appears in every eval board id, `fingerprint.md`, `sessions.md`,
`run_progress.json`, judge verdict envelope, `scorecard.md` header, and
`scenario_result.json`.

- Eval canvases are namespaced away from the main library in `canvases/evals/`.
  Board ids follow the active scenario spec and must satisfy
  `/^[a-z0-9][a-z0-9._-]{0,63}$/`. Lowercase the label and fail before starting if an
  id would exceed 64 characters.
- The runner uses dedicated service instances, spawned fresh for every run:
  - Eval canvas file API, with `canvasesDir = canvases/evals/`.
  - Eval harness, pointed at the same directory.
- **Both services are ephemeral and hermetic per run.** The queue picks a free
  loopback port for each (bind `:0`, read the assigned port), spawns the service as
  its own child process, waits for `/health`, and **always** stops it when the run
  ends — on success, on failure, and on SIGINT/SIGTERM. A service that is already
  listening is never adopted: there is no reuse branch and no cross-run state file.
  (A reused harness once served a three-day-old tool surface into a live run; that is
  the defect this rule closes.) Because the ports are per run, two suite runs may
  execute concurrently.
- Nothing may assume a fixed eval port. The queue passes `EVAL_FILE_API_ORIGIN` and
  `EVAL_HARNESS_ORIGIN` to each scenario child, and the harness clients take their
  origin as a constructor argument.
- One service pair serves every scenario of a run, including parallel ones.
- Service logs go to `runs/<run-id>/services/{file-api,harness}.log`, and the spawned
  identity — pid, port, origin, start time, git revision + dirty flag, and the
  prompt/lint/style/surface hashes — is recorded in
  `runs/<run-id>/services/identity.json`. That record is for audit only; nothing ever
  reads it back to decide whether to reuse a service.
- `--teardown` is accepted for compatibility and ignored; teardown is unconditional.
- `clean` deletes matching `eval.*` board files from `canvases/evals/` only and must
  refuse to touch any other directory. Run artifact directories are never
  auto-deleted.

## Run directory contract

```
runs/<run-id>/
  run_progress.json
  scorecard.md
  scorecard.json
  fingerprint.md
  services/
    identity.json
    file-api.log
    harness.log
  <scenario>/
    stage-blank.json
    stage0.json
    stage0.png
    e1.json
    e1.png
    …
    sessions.md
    scenario_result.json
    transcripts/<stage>.json
    judge-<axis>.json
    judge-<axis>.md
```

`run_progress.json` is written atomically with a temporary file plus rename:

```jsonc
{
  "run_id": "…",
  "status": "running|completed|failed",
  "started_at": "ISO",
  "finished_at": "ISO|null",
  "scenarios": {
    "<scenario>": {
      "status": "pending|building|sessions_done|judging|graded|failed|invalid_infra",
      "stages_done": ["stage0", "e1"],
      "pid": 123,
      "finished_at": null
    }
  }
}
```

The parent queue owns this file. Scenario child processes report through their exit
code and a per-scenario `scenario_result.json`, which the parent merges into progress.

## Judge verdict contract

Every `judge-<axis>.json` uses the same envelope:

```jsonc
{
  "axis": "sf",
  "scenario": "<scenario>",
  "run_id": "…",
  "judge": {
    "model": "…",
    "reasoning_effort": "low",
    "baml_fn": "…",
    "attempts": 1
  },
  "score": 7.5,
  "verdict": {},
  "usage": { "input_tokens": 0, "output_tokens": 0 },
  "flags": []
}
```

The active axis rubric's **Output contract** defines the required typed fields in
`verdict`. Evidence-free scores must be unrepresentable in the schema. Missing judge
inputs produce the same envelope with `"score": null` and a
`"SKIPPED(<reason>)"` flag. Completion or validation failures that survive retry are
recorded with an assembler-visible `ERROR` flag rather than being silently omitted.

## BAML design rules

- Use one function per axis role, with an `…AfterError(previous_error: string, …)`
  variant re-invoked after parse or validation failure, for at most two retries.
- Functions take the rubric text and a structured payload built by
  `judge/inputs.ts`. Prompts frame the role and output schema; rubric content remains
  in markdown.
- Inputs are embedded content, not paths. Isolation is structural: each judge
  receives only the inputs listed by its active axis rubric. Blind calls receive no
  scenario vocabulary.
- The default judge client uses the project's local judge endpoint, pinned model,
  and low reasoning effort. CLI judge-client options may override it through a BAML
  `ClientRegistry`. Record the resolved client in every verdict envelope and in the
  fingerprint.
- Use a BAML `Collector` per call for token usage.
- Generate and commit `baml_client/` with the package's BAML generation command when
  BAML sources change.

## Judge execution rules

- Use one global counting semaphore across the run, with 10 concurrent completions
  by default.
- Within each scenario, run independent axes concurrently; run a scorer only after
  its dependent blind reconstruction resolves.
- Recompute deterministic score arithmetic from typed per-item verdict fields.
  When the completion's score differs from the recomputation by more than 0.25, use
  the recomputed value and add `SCORE-RECOMPUTED`.
- Visual axes score each board absolutely against its rubric anchors; judges never
  receive a comparison or reference board.
- Write every verdict as both `judge-<axis>.json` and a rendered
  `judge-<axis>.md`. The JSON file is authoritative for the assembler.

## Scenario process rules

- `scenario.ts` runs as one child process per scenario. `queue.ts` spawns up to
  `--parallel` children, defaulting to 8, and merges results into
  `run_progress.json`.
- All board traffic goes to the isolated eval service pair with the board-id format
  defined by the active scenario spec.
- Apply the board lifecycle and session protocol from `RUNNER.md`: delete/create the
  eval board, create the page frame, snapshot the blank stage, run build and optional
  edit sessions, accept and materialize changes, GET-verify writes, recover from 409,
  snapshot JSON and PNG output, and record session bookkeeping.
- Save the complete transcript to
  `<scenario>/transcripts/<stage>.json` after every session.
- Exit codes are 0 for completed stages, 2 when invalid infrastructure exhausts its
  retry, and 1 for a crash. Write `scenario_result.json` before exiting.
- Start judging a scenario as soon as its child exits 0 or 2. After all scenarios
  finish grading, assemble the scorecard and finalize `run_progress.json`.
- Complete all preconditions before mutating a board: the run's own services healthy,
  `services/identity.json` written,
  and `fingerprint.md` with the run id, git revision and dirty state, agent
  configuration, prompt/lint/style/surface hashes, resolved judge client, and the
  harness start time, pid and origin.

## Scorecard rules

- Axis order comes from the active rubric set's `scorecard-order` metadata.
- Scenario order is deterministic and follows discovery order.
- Format half-points with `.5`; render unavailable scores as `–` and exclude them
  from means.
- Read verdicts only from `judge-*.json`; never parse rendered judge markdown.
- Emit `scorecard.json` beside `scorecard.md` with the same data.
- Compute deltas only against a compatible prior run. For movements at or above the
  configured threshold, derive narration from the relevant verdict evidence rather
  than asking a model to write it.
- Apply the active rubric set's cross-axis discrimination check and emit its
  assembler-visible flag when triggered.

## Verification

- Type-check the runner with the package TypeScript configuration.
- Scenario smoke tests discover every active scenario and exercise the planned
  session sequence in dry-run mode without live services.
- Judge smoke tests assemble representative active-axis inputs without making model
  calls by default.
- Scorecard smoke tests use system-axis sample verdicts or the surviving system
  baseline.
- Default smoke paths must not start dev servers or make model calls.
- Never git commit.

## Style rails

- The UI-furniture word is "trim", never "chrome".
- Do not reference eval version history or migrations in comments. State rules
  timelessly.
- Comment only where the code cannot express a constraint; match repository idiom.

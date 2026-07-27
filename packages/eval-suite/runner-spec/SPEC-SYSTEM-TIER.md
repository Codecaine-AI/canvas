# System-brief eval tier — spec (companion to SPEC.md)

The freeform scenario tier for the eval-suite runner. Philosophy: a scenario is
a natural request to diagram a **software system or process** — requirements about the
system, never about the diagram. No checklists, no invariants, no comprehension keys,
nothing derived or frozen. Grading judges the outcome against the brief: does the
board communicate the system well enough to reason about and build from? The frozen
brief + pinned judge client is the comparability contract; accept the extra judge
variance — this tier trades strictness for realism by design.

## Scenario format

```
packages/eval-suite/scenarios-system/<name>/
  brief.md        # the request, verbatim — what to build, system requirements only
  config.json     # { "complexity": 1-5, "page": {"width": W, "height": H},
                  #   "edits": [ { "title": "...", "instruction": "..." } ]?,  # optional, freeform
                  #   "tags": ["architecture" | "pipeline" | "process" | ...] }
```

- brief.md body goes to the build session verbatim (single prompt, one-shot build).
- `edits` are optional freeform follow-ups: one new session per edit, using the
  accept+materialize recipe in SPEC.md.
- Board ids: `eval.<run-id>.<name>` — same isolation/lifecycle as SPEC.md.
- Seeds: none — system-tier boards start from the blank page-frame only.

## Axes (this tier's scorecard columns, in order)

Axis rubric files live in `packages/eval-suite/axes-system/`, one per axis, each with
the canonical structure: code, scorecard-order, method, rubric anchors, output
contract. Judges are BAML single completions reusing the judge client,
semaphore, retry/AfterError, envelope, and render_md conventions.

| code | measures | judge sees |
|---|---|---|
| SF | system fidelity — blind reconstruction: an engineer who has never seen the brief reads the board and writes down the system (components, data/control flow, failure paths); a second completion compares that reconstruction against the brief | blind: final PNG only. scorer: reconstruction + brief |
| RC | requirement coverage — every requirement STATED in the brief is represented somewhere on the board (judge extracts requirements from the brief at grade time; representation may take any visual form) | brief + final PNG + final JSON |
| RD | readability/craft — calibrated against the two reference boards (7.5/7.0) across the sub-checks | final PNG + both reference PNGs |
| SD | scope discipline — ONLY when config has edits: per edit, did the agent do what was asked without collateral rework; derived entirely from the edit instruction + pre/post diff, no invariant lists | per edit: instruction + pre/post JSON + pre/post PNG + commit summary |
| PH | process health — reads the transcripts to audit the agent's working process | transcripts + session metadata |

SF is the headline axis. SD renders `–` for scenarios with no edits and is excluded
from that scenario's row mean. Envelope, null/SKIPPED/ERROR flag behavior, and
score-recomputation rules follow SPEC.md exactly.

## Runner & CLI

- `suite --run-id <id> [--scenarios <names>] ...` — one child per scenario, queue,
  judges fire on completion, semaphore. Runs write to `runs/<run-id>/` with
  per-scenario dirs named by scenario name, and record `tier: system` in
  run_progress.json and fingerprint.md.
- Scorecard: the assembler is driven by the axis files present in `axes-system/`.
- The Evals studio page needs no changes — it reads runs/ generically.

## Starter scenario set

Author 8 briefs in `scenarios-system/`, complexity-spread (two each at 2/3/4, one at
1, one at 5), all software-system subject matter: e.g. a webhook delivery subsystem
with retry/backoff and DLQ; a CI/CD pipeline with canary + rollback; an auth flow
(OAuth + session refresh) across services; an event-driven order system (queues,
consumers, idempotency); a multi-region failover topology; a data pipeline
(ingest → transform → store → serve) with backpressure; an incident-response process;
a monorepo build/cache system. Write each brief as a real user would ask — plain
prose, the system's parts and behaviors and constraints, NO diagram directives (no
colors, shapes, positions, or "use a section for X"). 1–2 briefs get one or two
freeform edits (e.g. "we added a second region — reflect that"), the rest are
build-only. Complexity 1 ≈ 5–7 components; 5 ≈ 20+ with cross-cutting concerns.

## Verification

- tsc + the smokes stay green; the scenario smoke parses every scenario dir and
  plans sessions (--dry-run, no services).
- Judge smoke: assemble SF/RC prompts from a real finished run's artifacts (any
  existing run's PNG + a sample brief) without model calls.
- No live suite execution as part of the build. No commits.

Style rails per SPEC.md (trim not chrome; no version archaeology; timeless comments).

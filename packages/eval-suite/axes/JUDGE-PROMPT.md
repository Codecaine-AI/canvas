# Generic judge prompt

The runner instantiates one judge session per axis per scenario from this template.
Fill every `{…}` slot; pass nothing else. For multi-role axes (see the axis file's
`roles:` header), instantiate one session per role and set `{ROLE}` accordingly —
single-role axes use `judge`.

---

You are the **{AXIS_CODE} {ROLE}** for eval-suite scenario **{SCENARIO_ID}**, run
**{RUN_ID}**.

1. Read `packages/eval-suite/axes/README.md` — the shared grading rules. They bind you.
2. Read `packages/eval-suite/axes/{AXIS_FILE}` — your axis. Apply it exactly as
   written: its Method, its Rubric, its Caps, its Output contract.
3. Your permitted inputs are listed below — they match your role's "Sees" list in the
   axis file. Read ONLY these files/paths. Do not read anything else in the repo, the
   run directory, or the scratchpad; your isolation is the point.

   {INPUTS — one absolute path or endpoint per line, each tagged with what it is,
    e.g. "final board PNG", "reference PNG (gc-decomp-harness, calibration 7.5)",
    "fixture comprehension key", "pre-edit JSON (E2)", "kernel transcript (build)"}

4. Produce your axis's **Output contract** in full — score plus every required
   evidence element. Half-points allowed. Do not compress toward the middle; if the
   rubric row says 4.5 or 9, say 4.5 or 9.
5. Write your complete output to `{OUT_PATH}` and return a one-paragraph summary
   (score + the single strongest piece of evidence).

Rules: no delegation or sub-agents, no git, and no canvas mutations — canvas/API access
is GET-only; you may only Read your permitted inputs and Write your one output file. A
score without the Output contract fulfilled will be bounced back to you by the
scorecard assembler. The orchestrator instantiates each judge session as
`codex exec -m gpt-5.6-sol -c model_reasoning_effort="xhigh"`.

---

Runner notes (not part of the prompt):

- `{AXIS_FILE}` is the axis file name (`sq.md`, `ic.md`, …). The active axis set is
  whatever axis files exist in `axes/` — the runner iterates that directory; adding or
  removing an axis file is the whole registration step.
- For IC, anonymize the board render as `board.png` before listing it — filenames leak
  genre (dry-run finding). The IC blind judge's `{INPUTS}` is that one file, nothing
  else, and its prompt must contain no scenario vocabulary: set `{SCENARIO_ID}` to an
  opaque slot id (e.g. `board-3`) for that role only.
- SQ (and any future render-calibrated axis) must receive both reference PNGs in
  `{INPUTS}`; the runner checks the returned calibration scores for CAL-DRIFT.

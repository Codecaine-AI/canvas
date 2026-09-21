# Rule-eval protocol — 2026-07-22

Shared reference for the five diagram-type evaluation agents. Read this fully before starting.

## System under test

The canvas layout agent (`packages/canvas-agent`): a gpt-5.6-sol model behind a layout-program
DSL (`fit_scope` programs), a spacing-ladder solver, lint reports, and a wrecked-layout gate.
Do NOT change its config, prompts, or code. You are evaluating, not fixing.

Rule vocabulary (use these exact names in findings — ground yourself by skimming
`docs/30-agent-layout/20-rulebook/`, one dir per rule):

- R1 16px grid
- R2 spacing ladder
- R3 section trim
- R4 grid
- R5 align
- R6 fan
- R7 hug
- R8 size semantics
- R9 feedback edges
- R10 language-refusal (what the DSL cannot say)
- MECH: size normalization
- MECH: wrecked-layout gate
- MECH: lint thresholds
- MECH: DSL expressiveness (fit_scope program shape)
- MECH: single-render habit (agent commits without looking / looks once)
- MECH: solver collapse / nested-section behavior

## Endpoints (studio proxy at http://127.0.0.1:3999; harness direct at :4820)

Canvas file API:
- `GET  /api/canvases` — list
- `POST /api/canvases` — create (body: full canvas document; validated)
- `GET/PUT/DELETE /api/canvases/:id`

Agent sessions:
- `POST /api/canvases/:id/agent/sessions` — body `{ instruction, scopeObjectIds?: [], annotations?, viewport? }` → `{ sessionId, containerId, baselineHash }`
- `GET  /api/canvases/:id/agent/sessions/:sid` — poll state (status, proposal, lint, retries)
- `POST /api/canvases/:id/agent/sessions/:sid/message` — follow-up instruction in same session
- `POST /api/canvases/:id/agent/sessions/:sid/accept` — commit proposal onto the canvas
- `POST /api/canvases/:id/agent/sessions/:sid/reject` — discard
- `GET  /api/canvases/:id/agent/sessions/:sid/draft.svg` — current draft render

Evidence (kernel):
- `GET /api/agent/kernel/sessions/:containerId/transcript` — full transcript
- `GET /api/agent/kernel/sessions/:containerId/transcript/images/:imageId` — render PNGs
- `GET /api/agent/kernel/runs/:runId/turns/:n/context` — per-turn context snapshot
- `GET /api/agent/kernel/blobs/:hash` — image blobs from snapshots

Download images to your scratchpad as `.png` and Read them to judge visually. Judge the FINAL
committed state too via `draft.svg` or a fresh render — not just intermediate frames.

Known failure signature: a session stuck ACTIVE whose transcript ends with a `render_draft`
start = the harness died mid-run. Note it as `harness-death`, don't wait forever
(poll timeout ≈ 5 min per session, checking every ~10s).

## Scratch canvas

Create `eval-<type>` via `POST /api/canvases` with a document modeled on
`canvases/bubba-voice.canvas.json`: `schemaVersion: 1`, matching `id`, `mode: "diagram"`,
a locked `page-frame` section covering the board, and 1–2 placeholder node objects.
Keep the board modest (e.g. 2400×1600). NEVER run sessions against any other canvas.

## Session budget

4–8 agent sessions total for your diagram type. Batch learning per run: one rich instruction
beats many trivial ones. Phase A = 1 build session (maybe 2 if the first wrecks).
Phase B = 3+ realistic edit sessions, one of which MUST be a fine-grained request the rules
plausibly cannot express (the "20px nudge" class). Accept sessions you'd plausibly keep;
reject the rest.

## Findings file format (`findings-<type>.md`)

```markdown
# Findings — <diagram type>

Canvas: eval-<type> · Sessions run: N · Date: 2026-07-22

## Sessions

### S1 — "<instruction summary>"
- session/container: <sid> / <containerId>
- outcome: committed | abandoned | wrecked-gate | lint-fight (propose_program retries: N) | harness-death
- aesthetic: <1–5> — <one sentence why: crowding, misalignment, crossing connectors, dead space, imbalance>
- friction:
  - <rule name> — PROTECTED | BLOCKED | NEUTRAL — <what happened> (turn N, image <id>)
- process: <did the agent look at renders? fine-tune after looking, or commit on first acceptable?>

## Rule tally
| rule | PROTECTED | BLOCKED | NEUTRAL | strongest evidence |
|------|-----------|---------|---------|--------------------|

## Verdict for this diagram type
<3–6 sentences: which rules earned their keep here, which blocked intent, and whether a
"render early, adjust freely" fine-tune loop would have beaten the current process. Note
anything you believe is specific to this diagram type vs. universal.>
```

Classification meanings:
- PROTECTED quality — the rule prevented an actually-worse layout (evidence: a retry/lint/gate event whose rejected state was genuinely uglier).
- BLOCKED intent — the rule refused or distorted something the instruction legitimately asked for.
- NEUTRAL — fired or constrained, but changed nothing that mattered either way.

Attribute honestly: if the agent never even attempted something because the DSL can't express
it (visible in transcript reasoning), that's `MECH: DSL expressiveness` BLOCKED — cite the turn.

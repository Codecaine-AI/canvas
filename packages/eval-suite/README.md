# Eval suite — canvas layout agent

Evaluation material for the layout agent. Scenarios are briefs for real systems; the
agent built each board from a blank base canvas through the canvas-agent kernel's own
HTTP harness and model.

The scenario launcher (`suite`, `clean`, `make eval`) is gone. It spawned the
canvas-agent kernel server per run and drove its agent sessions, and that kernel was
deleted when the agent moved into `packages/canvas` behind the canvas MCP server. A new
launcher must drive an MCP client against `packages/canvas-mcp`. What remains runs on
recorded runs: `runner/src/cli.ts judge` scores a run directory with the BAML judges, and
`runner/src/cli.ts scorecard` assembles its scorecard.

| file | what |
|---|---|
| [axes-system/](axes-system/) | The grading axes, one file per axis — **SF** system fidelity ([system-fidelity.md](axes-system/system-fidelity.md), brief-only reconstruction of the system), **RC** requirement coverage ([requirement-coverage.md](axes-system/requirement-coverage.md), atomic brief requirements vs the board), **RD** readability ([readability.md](axes-system/readability.md), can a fresh viewer read the render), **CF** craft ([craft.md](axes-system/craft.md), does the render read as a composed, finished artifact), **SD** scope discipline ([scope-discipline.md](axes-system/scope-discipline.md), out-of-scope churn on follow-up edits), dormant: no scenario carries edits, so SD renders `–`, **PH** process health ([process-health.md](axes-system/process-health.md), transcript honesty + mechanics). Visual axes are scored absolutely against their rubric anchors — no reference boards. Shared judge rules are inlined by the runner (`SHARED_JUDGE_RULES` in `runner/src/judge/inputs.ts`), which also generates SF's notation legend and CF's registry color legend from the canvas object-preference registry; adding/removing an axis = adding/removing a file. |
| [scenarios-system/](scenarios-system/) | The scenario objects: one directory per scenario with `brief.md` (the instruction) and `config.json` (complexity, page size, tags). |
| [RUNNER.md](RUNNER.md) | Historical protocol notes from the codex-executor era. |
| [runner/](runner/) | The runner: `src/cli.ts judge | scorecard`, BAML judges and scorecard assembly over recorded runs. Spec in [runner-spec/](runner-spec/) (historical for the deleted scenario launcher). |
| [runs/](runs/) | Run artifacts: per-scenario stage renders, judge evidence, `scorecard.md`. |
| [feedback/](feedback/) | Review findings and fix-round decision records. |
| [docs-eval/](docs-eval/) | Historical eval material: the 2026-07-22 rule-eval session (protocols, per-diagram findings, trial reports), moved unchanged from `docs/agent-eval/`. |

## Scenarios

| id | cx | stages | board |
|---|---|---|---|
| ivr-agent-handoff | 1 | build | 1600×1000 |
| eval-harness-orchestration | 2 | build | 1920×1200 |
| sandboxed-tool-fleet | 2 | build | 1920×1200 |
| chat-assistant-rollout | 3 | build | 2240×1400 |
| rag-ingestion-retrieval | 3 | build | 2240×1400 |
| code-review-agents | 4 | build | 2560×1600 |
| llm-inference-gateway | 4 | build | 2560×1600 |
| agent-session-orchestration | 5 | build | 3200×2000 |

Briefs are frozen: any wording change voids run-over-run comparison for that scenario.

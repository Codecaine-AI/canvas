# Eval suite — canvas layout agent

Standing, repeatable evaluation for the layout agent (harness :4820, studio :4000).
Scenarios are briefs for real systems; the agent builds each board from a blank base
canvas through the eval harness. Run it on any change to the prompt, capabilities,
styles, lints, perception, or model config; diff the scorecards. Entry point:
`make eval`.

| file | what |
|---|---|
| [axes-system/](axes-system/) | The grading axes, one file per axis — **SF** system fidelity ([sf.md](axes-system/sf.md), brief-only reconstruction of the system), **RC** requirement coverage ([rc.md](axes-system/rc.md), atomic brief requirements vs the board), **RD** readability & craft ([rd.md](axes-system/rd.md), visual quality of the render), **SD** scope discipline ([sd.md](axes-system/sd.md), out-of-scope churn on follow-up edits), **PH** process health ([ph.md](axes-system/ph.md), transcript honesty + mechanics). Shared judge rules are inlined by the runner (`SHARED_JUDGE_RULES` in `runner/src/judge/inputs.ts`); adding/removing an axis = adding/removing a file. |
| [scenarios-system/](scenarios-system/) | The scenario objects: one directory per scenario with `brief.md` (the instruction) and `config.json` (complexity, page size, tags, follow-up edits). |
| [RUNNER.md](RUNNER.md) | Historical protocol notes from the codex-executor era; the live runner is `runner/` (BAML judges + scenario processes). |
| [runner/](runner/) | The runner: `src/cli.ts suite | judge | scorecard | clean`, scenario processes, service pair (eval_file_api :4010, harness :4821), BAML judges, scorecard assembly. Spec in [runner-spec/](runner-spec/). |
| [runs/](runs/) | Run artifacts: per-scenario stage renders, judge evidence, `scorecard.md`. |
| [feedback/](feedback/) | Review findings and fix-round decision records. |

## Scenarios

| id | cx | stages | board |
|---|---|---|---|
| ivr-agent-handoff | 1 | build | 1600×1000 |
| eval-harness-orchestration | 2 | build + 1 edit | 1920×1200 |
| sandboxed-tool-fleet | 2 | build | 1920×1200 |
| rag-ingestion-retrieval | 3 | build | 2240×1400 |
| trace-ingestion-pipeline | 3 | build | 2240×1400 |
| code-review-agents | 4 | build | 2560×1600 |
| llm-inference-gateway | 4 | build + 1 edit | 2560×1600 |
| agent-session-orchestration | 5 | build | 3200×2000 |

Briefs are frozen: any wording change voids run-over-run comparison for that scenario.

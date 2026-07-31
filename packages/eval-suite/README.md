# Eval suite — canvas layout agent

Standing, repeatable evaluation for the layout agent. Scenarios are briefs for real
systems; the agent builds each board from a blank base canvas through the run's own
harness — spawned on an ephemeral port at run start, stopped at run end, never a
service some earlier run left behind. Run it on any change to the prompt, the object-preference
registry and its vocabulary context, styles, lints, perception, or model config; diff
the scorecards. Entry point:
`make eval`.

| file | what |
|---|---|
| [axes-system/](axes-system/) | The grading axes, one file per axis — **SF** system fidelity ([system-fidelity.md](axes-system/system-fidelity.md), brief-only reconstruction of the system), **RC** requirement coverage ([requirement-coverage.md](axes-system/requirement-coverage.md), atomic brief requirements vs the board), **RD** readability ([readability.md](axes-system/readability.md), can a fresh viewer read the render), **CF** craft ([craft.md](axes-system/craft.md), does the render read as a composed, finished artifact), **SD** scope discipline ([scope-discipline.md](axes-system/scope-discipline.md), out-of-scope churn on follow-up edits), dormant: no scenario carries edits, so SD renders `–`, **PH** process health ([process-health.md](axes-system/process-health.md), transcript honesty + mechanics). Visual axes are scored absolutely against their rubric anchors — no reference boards. Shared judge rules are inlined by the runner (`SHARED_JUDGE_RULES` in `runner/src/judge/inputs.ts`); adding/removing an axis = adding/removing a file. |
| [scenarios-system/](scenarios-system/) | The scenario objects: one directory per scenario with `brief.md` (the instruction) and `config.json` (complexity, page size, tags). |
| [RUNNER.md](RUNNER.md) | Historical protocol notes from the codex-executor era; the live runner is `runner/` (BAML judges + scenario processes). |
| [runner/](runner/) | The runner: `src/cli.ts suite | judge | scorecard | clean`, scenario processes, the per-run service pair (eval_file_api + harness, spawned on
ephemeral ports at run start and stopped at run end), BAML judges, scorecard assembly. Spec in [runner-spec/](runner-spec/). |
| [runs/](runs/) | Run artifacts: per-scenario stage renders, judge evidence, `scorecard.md`. |
| [feedback/](feedback/) | Review findings and fix-round decision records. |

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

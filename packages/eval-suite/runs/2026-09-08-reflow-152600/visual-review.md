# Personal visual review — reflow prompt

Run: `2026-09-08-reflow-152600`. All eight `stage0.png` images were opened and visually inspected. This review is independent of the automated scores.

## Completed run

- Duration: 32 minutes 48 seconds (20:26:01–20:58:49 UTC). All eight Astra/low sessions committed; runner exited successfully. Ephemeral harness and file API processes stopped.
- Automated scoring: 32 of 40 applicable judgments returned scores. Seven requests timed out; RAG requirement coverage failed with HTTP 502. Missing results are not passes. The eight edit-stability checks were intentionally skipped because these scenarios have no follow-up edits.
- Readability: 6.31/10 across all eight, versus 6.69 previously. Craft: 6.31/10 across all eight; the previous 5.69 used a different craft rubric. Prompt hygiene: 7.13/10.
- Semantic fidelity: 8.50/10 from five scored scenarios; requirement coverage: 9.00/10 from only three. These partial means cannot establish suite-wide semantic quality.
- The UI contains the eight latest eval boards plus the GameCube reference. Eight prior UI boards were moved to Trash; historical run artifacts remain available.

Full automated results: [scorecard](scorecard.md).

| Scenario | Semantic fidelity | Requirement coverage | Readability | Craft | Prompt hygiene |
| --- | ---: | ---: | ---: | ---: | ---: |
| Agent sessions | timeout | timeout | 6.5 | 6.5 | 8.5 |
| Chat assistant | 8 | 9 | 6.5 | 6.5 | 7.5 |
| Code review | timeout | timeout | 6.5 | 6 | 9 |
| Eval orchestration | 9 | 9 | 6 | 6.5 | 6 |
| IVR handoff | 8.5 | 9 | 6.5 | 6.5 | 8 |
| Inference gateway | timeout | timeout | 5 | 6 | 8 |
| RAG | 8.5 | HTTP 502 | 6.5 | 6 | 5 |
| Sandbox fleet | 8.5 | timeout | 7 | 6.5 | 5 |

## Verdict

The prompt improves semantic object vocabulary and makes some previously missing connections explicit. It does not yet meet the requested standard for custom diagram composition. Most regions remain large gray rectangular panels. Empty space inside panels coexists with cramped labels and long routes. A clean lint result is not evidence that the composition or causal story is good.

The craft rubric changed for this run, so craft-score changes against the previous run are not controlled comparisons. This is one generated sample per scenario, not evidence of reliability across seeds.

The GameCube reference was also reopened for comparison. It uses rectangles too; the distinction is their purpose and proportion. A wide runner region establishes the main spine, a shallow state region supports it below, and narrow score/PR regions fit their local chains. Distinct region colors communicate responsibilities, while smaller health and surface groups occupy the space their content needs. The new evals still tend toward a few large uniform panels instead of this differentiated composition. The reference itself has long routes, so straightness alone is not an adequate acceptance criterion.

## Scenario observations

| Scenario | Visible improvement | Remaining visual problem |
| --- | --- | --- |
| [Agent sessions](agent-session-orchestration/stage0.png) | Scheduler, model, tool, store and human roles are visually distinct; snapshot/rehydration and event-log/client paths are explicit. | Most sections are gray; durability is oversized with substantial bottom-right blank space. Replay and release take long outer routes. The session-tree subgraph still lacks a clear connection to the main orchestrator. |
| [Chat assistant](chat-assistant-rollout/stage0.png) | Strongest semantic icon vocabulary; safety gates now directly originate human handoff routes. Memory, model, human and output have distinct appearances. | All sections still use gray panels. The champion label breaks awkwardly. Long red handoff routes cross the upper composition. The variant/experiment region still lacks an explicit connection showing which configuration drives the live model. The live transcript's writer is not clear. |
| [Code review](code-review-agents/stage0.png) | Reviewer agents, dispatch, human feedback and calibration storage are recognizable. Primary intake → reviewers → merge flow can be followed. | Three gray columns plus a full-width lower band dominate. Notes outweigh node labels. Reviewer usage originates from a section boundary rather than an explicit producer. Budget-dependent reviewer selection remains largely in a note, while the fan-out appears to enable all five. Long perimeter restart and calibration routes remain. |
| [Eval orchestration](eval-harness-orchestration/stage0.png) | Icons and decisions make roles clearer. Evidence-present/retried/invalid handling is explicit, and the shared archive is connected. | Execution reads downward, grading upward, comparison downward. The reader must trace long routes across a forced column arrangement. Large empty areas remain at top-right and bottom. |
| [IVR handoff](ivr-agent-handoff/stage0.png) | Less uniform than the previous horizontal bands. Evidence now connects to the call flow, policy feeds eligibility, and AI/human/tool/queue roles are visible. | Stretched intake, unused upper-right space and a long bypass below AI weaken the composition. Some nearby endpoints still use unnecessary elbows. |
| [Inference gateway](llm-inference-gateway/stage0.png) | API, queue and storage icons add some vocabulary; token-emitted branching clarifies retry behavior. | Mostly gray boxes in gray panels. Circuit, spend, retry, telemetry and cache routes travel long distances. The cache-hit route loops awkwardly to the stream. The rightmost telemetry label appears clipped at the image boundary. This remains one of the weakest compositions. |
| [RAG](rag-ingestion-retrieval/stage0.png) | Stores are now visually distinct and colored. Unchanged/changed content, failures, publication versions and coverage feedback are represented. | Almost everything else remains an identical gray process box, including decisions and terminal outcomes. Publication is on the right while retrieval is on the left, requiring long crossing blue routes. Read paths visually leave stores independently of the publication gate, making the intended consistency boundary unclear. The feedback path wraps around the far left. |
| [Sandbox fleet](sandboxed-tool-fleet/stage0.png) | Placement connects to leased lifecycle; supervision connects to provisioning; quarantine affects selection. Agents, queues, artifacts and monitors have distinct shapes. | Most process nodes remain gray. Within-lease execution is separated from lifecycle; telemetry is still visually isolated. Unused space and weak grouping remain despite some section tinting. |

## What the prompt still fails to produce

1. **Graph-led composition:** place related participants near one another, then resize/reposition regions around them. Region boundaries should not determine every node position.
2. **Useful space:** give labels, decisions and merges room locally while removing large empty interior bands. Growing the frame is not sufficient.
3. **Semantic grouping:** make color and section shape express responsibility or flow type; retain distinct shapes for decisions, stores and outcomes.
4. **Traceable causality:** show actual producers, readers and control targets. Notes should explain policies already represented in the graph, not supply missing branches or connections.

No additional prompt or implementation edits were made as part of this evaluation run.

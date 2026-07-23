# IF — Intent Fidelity

## Per-item verdicts

- **IF-01 — PASS.** Final JSON contains `seed-commit`, a gray process node labeled `Commit`.
- **IF-02 — PASS.** Final JSON contains `seed-ci-build`, a gray process node labeled `CI Build`.
- **IF-03 — PASS.** Final JSON contains `stage-unit-tests`, a gray process node labeled `Unit Tests`.
- **IF-04 — PASS.** Final JSON contains `stage-staging-deploy`, a gray process node labeled `Staging Deploy`.
- **IF-05 — PASS.** Final JSON contains `stage-smoke-tests`, a gray process node labeled `Smoke Tests`.
- **IF-06 — FAIL.** The color requirement landed (`stage-production` is green and is the only non-neutral pipeline node), but the ground truth specifies a terminal pill. JSON instead gives it `type: "process"` with no terminal shape/style, and the PNG shows it with the same process-box silhouette as the other full-size stages.
- **IF-07 — PASS.** JSON has solid gray `edge-push`, directed `seed-commit` → `seed-ci-build`, labeled `push`; the PNG shows the label legibly associated with that connector.
- **IF-08 — PASS.** JSON has solid gray `edge-artifact-ready`, directed `seed-ci-build` → `stage-unit-tests`, labeled `artifact ready`; the label is legible in the PNG.
- **IF-09 — PASS.** This is the build-stage-only direct Unit Tests → Staging Deploy edge. The build summary declares the completed six-stage labeled release line; its later absence is the requested E1 supersession, corroborated by the two replacement connections and E1-04.
- **IF-10 — PASS.** JSON has solid gray `edge-deployed`, directed Staging Deploy → Smoke Tests and labeled `deployed`; the PNG label is legible.
- **IF-11 — PASS.** JSON has solid gray `edge-verified`, directed Smoke Tests → Production and labeled `verified`; the PNG label is legible.
- **IF-12 — PASS.** JSON contains the yellow `pipeline-promise` sticky with the requested automatic-promotion wording at `(96, 400)`; the PNG places it in the upper-left margin adjacent to the flow rather than in a remote corner.
- **IF-13 — PASS.** There are no content sections or lanes. The sole section object is the fixture-required locked `page-frame`, not an invented content section.
- **IF-14 — PASS.** The build summary declares a six-stage line, and the final PNG preserves the intended single horizontal axis and order after the authorized E1 insertion.
- **IF-15 — FAIL.** In the PNG the label chips are centered directly on the horizontal connector strokes rather than owning clear air. This is visible for `push`, `artifact ready`, `all green`, `no criticals`, `deployed`, and `verified`; the instruction explicitly prohibited chips sitting on a line.
- **IF-NEG-1 — PASS.** The only final specced edge absence is E2's feedback edge, and that omission was explicitly disclosed in the recorded abandon reason. Under the scenario ruling, its five E2 items fail, but the absence is not silent.
- **IF-NEG-2 — PASS.** Final JSON contains exactly the fixture page frame, seven specced pipeline nodes, the specced sticky, and six forward connections. There are no extra nodes, content sections, lanes, connections, or routing objects.
- **E1-01 — PASS.** JSON contains gray process node `stage-security-scan`, labeled `Security Scan`, at `x: 1296`, between Unit Tests (`x: 928`) and Staging Deploy (`x: 1568`) on the same `y: 736` register; the PNG confirms the on-line placement.
- **E1-02 — PASS.** JSON has solid gray `edge-all-green-security`, directed Unit Tests → Security Scan and labeled `all green`.
- **E1-03 — PASS.** JSON has solid gray `edge-no-criticals`, directed Security Scan → Staging Deploy and labeled `no criticals`.
- **E1-04 — PASS.** Final JSON has no direct Unit Tests → Staging Deploy connection; the obsolete bypass edge is gone.
- **E1-05 — PASS.** The PNG shows one directed seven-stage line in order: Commit → CI Build → Unit Tests → Security Scan → Staging Deploy → Smoke Tests → Production.
- **E2-01 — FAIL.** Final JSON has no connection from `stage-smoke-tests` to `seed-commit`; the PNG likewise has no feedback edge. The session ended in explicit agent-abandon, so this requested edit item fails under the refusal rule.
- **E2-02 — FAIL.** No E2 edge exists in final JSON, so no dashed feedback edge landed; the PNG contains only the solid forward connections.
- **E2-03 — FAIL.** No E2 edge exists in final JSON, so no red feedback edge landed; the PNG shows no red connector.
- **E2-04 — FAIL.** Neither final JSON nor the PNG contains the required `regression found` edge label. The abandon reason explicitly describes the attempted label conflict, but no proposal materialized.
- **E2-05 — FAIL.** The final PNG contains no feedback route around the pipeline. Per the refusal rule, absence of a committed route fails this requested routing item; the abandon reason states that the available route would have overlapped the deployed arrow and placed its label over Unit Tests.

## Pass fraction

`P = 20 / 27 = 0.7407` (approximately 74.1%). This maps to **5** under the rubric (`P ≥ 0.70`).

## Caps applied

None.

- The absent E2 edge does **not** trigger the silent-absence cap: the session recorded an honest agent-abandon with a specific reason, and the scenario ruling directs that E2's items fail under the refusal rule.
- No edge is reversed.
- The removal of build-only edge IF-09/e3 was the requested E1 replacement, not destruction of confirmed content.

## Score

**IF: 5/10**

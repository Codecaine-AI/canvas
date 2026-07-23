# SUT fingerprint — 2026-07-22-v5-initial

- repo: da2e096+dirty (packages/canvas-agent largely untracked; v5 working tree)
- model: codex-lb/gpt-5.6-sol @ thinking=high · maxTurns=120 (agent.json)
- prompt: rendered b17a7e56 · json bfe151cd
- lints (src/lints/, 5 modules + geometry): 5bf858fc
- styles (src/styles/, 9 topics + types + index): 01b58547
- harness :4820 start: Wed Jul 22 17:07:18 2026     (v5 restart; no mid-run restarts planned)
- studio :4000 up; references gc-decomp-harness + intent-classification-2 verified rendering earlier this session
- render pipeline for snapshots: preview.svg?fit=content&pad=48 → qlmanage -s 2800 (≥2400px per RUNNER §4)
- previous run: none (first scorecard; dry-run-2026-07-22 was axis validation only)
- infra notes: Round-2 trial agents (v5r2-*) share the harness early in this run — scenario
  runners ramped in as they drain to keep concurrent sessions ≤~6 (known cross-container
  transcript race under heavy parallel load)
- executor change mid-run (22:5x): runner/judge/trial execution moved from Fable agents to
  codex exec (gpt-5.6-sol, xhigh) per Ford — Fable usage limit hit; orchestration stays Fable
  (this thread). SUT unaffected (same harness process, no restart). First-run scorecard, so no
  cross-run judge-calibration comparison is broken; note for future Δ runs: judges this run
  are gpt-5.6-sol.

# IC — Information Comprehension

- Scenario: `s1`
- Run: `2026-07-22-v5-initial`
- Weighted recovered: **17 / 28**
- **R = 0.6071**
- **C = 0**
- **Score: 4 / 10**

The ten CORE facts contribute 13/20: C1, C2, C3, and C9 are recovered unhedged; C4–C8 receive half-credit because the reconstruction explicitly says those five directions were inferred; C10 is missed. The eight SECONDARY facts contribute 4/8: S1 and S8 are recovered, S2–S5 are hedged, and S6–S7 are missed. The final JSON contains the six forward pipeline connections but no feedback connection, so the reconstruction's claim that no loop is depicted is not counted as a corruption. With R below 0.65, the board qualifies for the rubric's 4 row, and no cap changes the result.

| Fact | Weight | Call | Credit | Reconstruction evidence settling the call |
|---|---:|---|---:|---|
| C1 — software release/deployment pipeline | 2 | recovered | 2 | TOPIC: “An automated software-delivery pipeline moves every surviving commit through build, test, security, staging, and smoke-test gates into production…” |
| C2 — flow starts at Commit | 2 | recovered | 2 | ORDER: “Start at `Commit` on the far left…” |
| C3 — Commit → CI Build | 2 | recovered | 2 | EDGES: “`Commit` → `CI Build` (`push`)”; UNCERTAIN further says this is the one arrowhead that is distinctly visible. |
| C4 — CI Build → Unit Tests | 2 | hedged | 1 | EDGES states “`CI Build` → `Unit Tests`,” but UNCERTAIN says the five later transitions' direction is “inferred…rather than independently confirmed by visible arrowheads.” |
| C5 — Unit Tests → Security Scan | 2 | hedged | 1 | EDGES states “`Unit Tests` → `Security Scan`,” subject to the same explicit UNCERTAIN direction hedge. |
| C6 — Security Scan → Staging Deploy | 2 | hedged | 1 | EDGES states “`Security Scan` → `Staging Deploy`,” subject to the same explicit UNCERTAIN direction hedge. |
| C7 — Staging Deploy → Smoke Tests | 2 | hedged | 1 | EDGES states “`Staging Deploy` → `Smoke Tests`,” subject to the same explicit UNCERTAIN direction hedge. |
| C8 — Smoke Tests → Production | 2 | hedged | 1 | EDGES states “`Smoke Tests` → `Production`,” subject to the same explicit UNCERTAIN direction hedge. |
| C9 — Production is the visually distinct green end | 2 | recovered | 2 | GROUPS calls Production “the terminal destination”; CONVENTIONS says “The pale-green rectangle with green outline marks `Production` as the final destination or successful terminal state.” |
| C10 — feedback edge Smoke Tests → Commit | 2 | missed | 0 | ORDER says: “There are no depicted branches, returns, loops…” The final JSON likewise has no feedback connection, so this is a miss, not a corrupted reconstruction. |
| S1 — Commit → CI Build labeled “push” | 1 | recovered | 1 | EDGES: “`Commit` → `CI Build` (`push`)”; the corresponding direction is distinctly visible per UNCERTAIN. |
| S2 — CI Build → Unit Tests labeled “artifact ready” | 1 | hedged | 0.5 | EDGES supplies both endpoints and “artifact ready,” but UNCERTAIN explicitly hedges the transition direction. |
| S3 — Unit Tests → Security Scan labeled “all green” | 1 | hedged | 0.5 | EDGES supplies both endpoints and “all green,” but UNCERTAIN explicitly hedges the transition direction. |
| S4 — Security Scan → Staging Deploy labeled “no criticals” | 1 | hedged | 0.5 | EDGES supplies both endpoints and “no criticals,” but UNCERTAIN explicitly hedges the transition direction. |
| S5 — Staging Deploy → Smoke Tests “deployed”; Smoke Tests → Production “verified” | 1 | hedged | 0.5 | EDGES recovers both labeled transitions, but UNCERTAIN explicitly hedges both directions. |
| S6 — dashed red “regression found” feedback edge | 1 | missed | 0 | No feedback edge or “regression found” label appears; ORDER instead says there are no returns or loops. The final JSON confirms no such connection exists, so this is not a corruption. |
| S7 — single-line main pipeline, with feedback as only departure | 1 | missed | 0 | GROUPS recovers “one horizontal pipeline,” but ORDER explicitly says there are no returns or loops, so the required feedback-edge exception is not substantively recovered. |
| S8 — automatic promotion margin note | 1 | recovered | 1 | NODES reads the note verbatim, and GROUPS explains it as “a policy statement”; TOPIC also states the pipeline reaches production “without manual promotion.” |

## Corruption check

**C = 0.** The reconstruction invents no edge, reverses no encoded direction, and assigns no keyed node to a wrong group. In particular, although the fixture requires a Smoke Tests → Commit regression loop, the supplied final JSON has no such connection; the blind reconstruction accurately reports that rendered/encoded omission rather than corrupting a relationship that exists on the board.

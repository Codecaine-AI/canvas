TOPIC: An automated software-delivery pipeline moves every surviving commit through build, test, security, staging, and smoke-test gates into production without manual promotion.

NODES:
- `Eval Suite S1 — Linear Flow` — title of the enclosing board/group.
- `every commit that survives the gates ships itself — no manual promotion.` — explanatory callout.
- `Commit`
- `CI Build`
- `Unit Tests`
- `Security Scan`
- `Staging Deploy`
- `Smoke Tests`
- `Production`

EDGES:
- `Commit` → `CI Build` (`push`)
- `CI Build` → `Unit Tests` (`artifact ready`)
- `Unit Tests` → `Security Scan` (`all green`)
- `Security Scan` → `Staging Deploy` (`no criticals`)
- `Staging Deploy` → `Smoke Tests` (`deployed`)
- `Smoke Tests` → `Production` (`verified`)

GROUPS:
- The outer framed group, titled `Eval Suite S1 — Linear Flow`, contains the explanatory callout and all seven process nodes.
- The seven process nodes form one horizontal pipeline. No separately bounded subgroups are shown.
- Within that pipeline, `Commit` is the input, `CI Build`, `Unit Tests`, `Security Scan`, `Staging Deploy`, and `Smoke Tests` are successive processing or gate stages, and `Production` is the terminal destination.
- The yellow/orange callout belongs to the overall pipeline as a policy statement; it is not connected as another process stage.

ORDER: Start at `Commit` on the far left and read left to right along the only path: `Commit` → `CI Build` → `Unit Tests` → `Security Scan` → `Staging Deploy` → `Smoke Tests` → `Production`. The transition narrative is `push`, then `artifact ready`, then `all green`, then `no criticals`, then `deployed`, then `verified`. There are no depicted branches, returns, loops, or manual-promotion steps.

CONVENTIONS:
- Gray rounded rectangles represent the input and intermediate pipeline stages.
- The pale-green rectangle with green outline marks `Production` as the final destination or successful terminal state.
- The pale-yellow callout with orange outline communicates an overarching automation rule rather than an executable stage.
- Small light-gray pill labels placed between stages name the action, artifact status, gate result, or verification associated with each transition.
- A gray connector and arrowhead on the first transition establish left-to-right flow; the uniform row and successive transition wording continue that convention across the pipeline.

UNCERTAIN:
- Only the `Commit` → `CI Build` arrowhead is distinctly visible. On the five later transitions, the pill labels fill most of the gaps and obscure any connector lines or arrowheads, so their left-to-right direction is inferred from the board title, the initial arrow, the uniform horizontal sequence, and the transition wording rather than independently confirmed by visible arrowheads.

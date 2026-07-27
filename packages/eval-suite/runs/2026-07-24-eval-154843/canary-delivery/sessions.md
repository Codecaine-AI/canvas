# Sessions — 2026-07-24-eval-154843 / canary-delivery

Board: `eval.2026-07-24-eval-154843.canary-delivery`

## stage0 · attempt 1

- sessionId: 1382fcb1-554e-4611-b6a7-74893da08a90
- containerId: 98099609-38e1-5e7b-ac2b-d8311aba524c
- wall time: 114.5s
- op count: 72
- outcome: committed
- retries: 0
- commit summary: Built a complete canary-delivery flow covering signed builds, immutable provenance, staging gates, progressive traffic, telemetry pause, automatic rollback, revision consensus, audit evidence, notifications, and non-bypassable controls.

Commit summary (verbatim):

> Built a complete canary-delivery flow covering signed builds, immutable provenance, staging gates, progressive traffic, telemetry pause, automatic rollback, revision consensus, audit evidence, notifications, and non-bypassable controls.

## e1 · attempt 1

- sessionId: 39ec9c53-b7fd-4478-9e06-c7cd6d3f7721
- containerId: 54072a17-4147-5845-ac90-493869b441a2
- wall time: 113.8s
- op count: 30
- outcome: committed
- retries: 0
- commit summary: Added sequential primary→secondary canaries with same-revision handoff, regional-only secondary rollback, shared-metric escalation to both-region rollback, and widened production/governance layout; knowingly leaves pre-existing crowding warnings W1–W23.

Commit summary (verbatim):

> Added sequential primary→secondary canaries with same-revision handoff, regional-only secondary rollback, shared-metric escalation to both-region rollback, and widened production/governance layout; knowingly leaves pre-existing crowding warnings W1–W23.


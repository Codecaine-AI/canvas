# IC — Information Comprehension

- **R:** 36.5 / 39 = **0.936**
- **C:** **1** corrupted fact (SECONDARY); no corrupted CORE facts
- **Score:** **7 / 10**

All 15 CORE facts are recovered unhedged. The result clears the 7 row (`R >= 0.85`, `C <= 1`, every CORE fact recovered) but cannot reach 8 because that row requires `C = 0`. The corrupted-CORE cap does not apply.

| Fact | Weight | Call | Reconstruction line that settles the call |
|---|---:|---|---|
| C1 | 2 | recovered | `TOPIC: A state machine for a connection/session lifecycle...`; `Start at Idle` establishes Idle as the starting/resting point. |
| C2 | 2 | recovered | `Idle -> Connecting (connect(); solid gray)` |
| C3 | 2 | recovered | `Connecting -> Connected (handshake OK; solid green)` recovers the endpoints, direction, and event; the color error is assessed under S7. |
| C4 | 2 | recovered | `Connecting -> Idle (timeout; dashed red)` and ORDER says timeout `returns to Idle`, correctly distinguishing it from the forward connect edge. |
| C5 | 2 | recovered | `Connected -> Degraded (packet loss > 5%; dashed red)` |
| C6 | 2 | recovered | `Degraded -> Reconnecting (grace expired; dashed red)` |
| C7 | 2 | recovered | `Degraded -> Connected (recovered; solid green)` |
| C8 | 2 | recovered | `Reconnecting -> Connected (session resumed; solid green)` |
| C9 | 2 | recovered | `Connected -> Suspended (suspend(); solid purple)` |
| C10 | 2 | recovered | `Degraded -> Suspended (quarantine; solid purple)` |
| C11 | 2 | recovered | `Suspended -> Reconnecting (resume window; solid purple)`; ORDER explicitly continues onward to Connected. |
| C12 | 2 | recovered | `Connected -> Disconnecting (close(); solid teal)` |
| C13 | 2 | recovered | `Disconnecting -> Idle (socket closed; solid teal)` |
| C14 | 2 | recovered | `Connected -> Connected (heartbeat / 30s; solid green self-loop/recurring transition)` and NODES calls it attached to `Connected`. |
| C15 | 2 | recovered | The EDGES section gives all three required relations: `Connected -> Migrating (migrate())`, `Migrating -> Connected (migration complete)`, and `Migrating -> Reconnecting (migration failed)`. |
| S1 | 1 | recovered | `The legend explicitly defines dashed red lines as degradation/failure behavior.` |
| S2 | 1 | hedged | CONVENTIONS says `Solid green routes communicate ... recovery`, but UNCERTAIN says the broader meaning of green is `inferred` and may not be a formal global key. |
| S3 | 1 | hedged | Purple is assigned to `suspension/quarantine/resume-window routing`, but UNCERTAIN explicitly hedges the broader purple meaning as inferred; it also does not directly report the Suspended state's violet fill. |
| S4 | 1 | hedged | Teal is assigned to the shutdown routes and the shutdown path is reconstructed, but UNCERTAIN explicitly hedges the broader teal meaning as inferred; it does not directly report the Disconnecting state's teal fill. |
| S5 | 1 | recovered | `Connected -> Degraded (packet loss > 5%; dashed red)` |
| S6 | 1 | recovered | `heartbeat / 30s` is read both as an attached recurring timer and as the Connected self-transition. |
| S7 | 1 | corrupted | The reconstruction asserts `Connecting -> Connected (handshake OK; solid green)` and says gray is used only for the initial `connect()` route. Ground truth and final JSON mark `handshake OK` neutral gray, so the happy-path convention is contradicted; ordinary-state and Migrating fill colors are not recovered either. |
| S8 | 1 | recovered | The legend annotation is transcribed: `dashed red = degradation — every failure lands back in Reconnecting or Idle, nothing dead-ends.` |
| S9 | 1 | recovered | EDGES lists two distinct directed relations, `Idle -> Connecting (connect())` and `Connecting -> Idle (timeout)`, and ORDER narrates them separately as advance versus return. |

Weighted recovery: CORE `15 * 2 = 30`; SECONDARY recovered `5`, hedged `3 * 0.5 = 1.5`, corrupted `0`; total `36.5 / 39 = 0.935897...`.

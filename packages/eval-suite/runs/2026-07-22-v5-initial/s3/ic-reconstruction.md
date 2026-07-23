TOPIC: A state machine for a connection/session lifecycle, covering initial connection, an active connected state, orderly disconnection, suspension, degradation, migration, and reconnection/recovery.

NODES:
- Heading: `Eval Suite S3 — State Machine`
- State: `Idle`
- State: `Connecting`
- State: `Connected`
- State: `Disconnecting`
- State: `Suspended`
- State: `Degraded`
- State: `Migrating`
- State: `Reconnecting`
- Recurring event/timer attached to `Connected`: `heartbeat / 30s`
- Legend annotation: `dashed red = degradation — every failure lands back in Reconnecting or Idle, nothing dead-ends.`

EDGES:
- `Idle` → `Connecting` (`connect()`; solid gray)
- `Connecting` → `Idle` (`timeout`; dashed red)
- `Connecting` → `Connected` (`handshake OK`; solid green)
- `Connected` → `Connected` (`heartbeat / 30s`; solid green self-loop/recurring transition)
- `Connected` → `Disconnecting` (`close()`; solid teal)
- `Disconnecting` → `Idle` (`socket closed`; solid teal)
- `Connected` → `Suspended` (`suspend()`; solid purple)
- `Suspended` → `Reconnecting` (`resume window`; solid purple)
- `Connected` → `Degraded` (`packet loss > 5%`; dashed red)
- `Degraded` → `Connected` (`recovered`; solid green)
- `Degraded` → `Suspended` (`quarantine`; solid purple)
- `Degraded` → `Reconnecting` (`grace expired`; dashed red)
- `Connected` → `Migrating` (`migrate()`; solid orange)
- `Migrating` → `Connected` (`migration complete`; solid green)
- `Migrating` → `Reconnecting` (`migration failed`; dashed red)
- `Reconnecting` → `Connected` (`session resumed`; solid green)

GROUPS:
- No enclosing group boundaries are drawn; the groupings are communicated by placement, color, and connectivity.
- Core connection lifecycle: `Idle`, `Connecting`, `Connected`, and `Disconnecting`. It describes starting a connection, reaching the active state, and closing back to idle.
- Connected-state liveness: `Connected` with its `heartbeat / 30s` recurring self-transition.
- Degradation and recovery branch: `Degraded`, `Suspended`, and `Reconnecting`, with routes back toward `Connected` or onward through suspension/reconnection.
- Migration branch: `Migrating`, reached from `Connected`, with completion returning to `Connected` and failure feeding `Reconnecting`.

ORDER:
- Start at `Idle`; `connect()` advances to `Connecting`.
- From `Connecting`, `handshake OK` reaches `Connected`, while `timeout` returns to `Idle`.
- `Connected` is the hub and steady state: it repeats `heartbeat / 30s`, can begin orderly shutdown with `close()`, suspend with `suspend()`, degrade when `packet loss > 5%`, or start migration with `migrate()`.
- The shutdown path is `Connected` → `Disconnecting` → `Idle`, with `socket closed` completing the loop.
- The suspension path is `Connected` → `Suspended` → `Reconnecting`; a `session resumed` transition then returns from `Reconnecting` to `Connected`.
- The degradation path is `Connected` → `Degraded`. `recovered` returns directly to `Connected`; `quarantine` sends the session to `Suspended`; and `grace expired` sends it to `Reconnecting`.
- The migration path is `Connected` → `Migrating`. `migration complete` returns to `Connected`, while `migration failed` sends the session to `Reconnecting`, from which `session resumed` returns to `Connected`.
- These paths form multiple recovery loops around the central `Connected` state; the visible failure routes do not terminate without an outgoing recovery route.

CONVENTIONS:
- Colored rounded rectangles represent states; the small rounded `heartbeat / 30s` pill represents a recurring event/timer rather than another state.
- Arrowheads establish transition direction, and pill-shaped labels on the lines name the triggering event, condition, or completion.
- The legend explicitly defines dashed red lines as degradation/failure behavior. These include `timeout`, `packet loss > 5%`, `grace expired`, and `migration failed`.
- Solid green routes communicate successful establishment, recovery, completion, resumption, or continued liveness. Gray is used for the initial `connect()` route, teal for shutdown, orange for entering migration, and purple for suspension/quarantine/resume-window routing.
- Small hollow colored circles at box edges are line attachment ports, not additional states.
- Line crossings without a state or arrow endpoint do not read as additional transitions or junctions.

UNCERTAIN:
- Only the dashed-red meaning is explicitly stated in the legend. The broader meanings of green, gray, teal, orange, and purple are inferred from their repeated use on the labeled paths, so they may be visual categories rather than a formal global key.
- The board provides no literal group containers or group titles; the functional groupings above come from the visible topology and spatial arrangement.

# IF — Intent Fidelity

## Per-item verdicts

### Build checklist

- **IF-01 — PASS.** `seed-idle` is a gray process box labeled `Idle`.
- **IF-02 — FAIL.** JSON evidence: `state-connecting` is labeled `Connecting` but has `color: "blue"`; the specification requires gray/neutral. The PNG visibly renders the state blue.
- **IF-03 — FAIL.** JSON evidence: `seed-connected` is labeled `Connected` but has `color: "green"`; the specification requires gray/neutral. The PNG visibly renders the state green.
- **IF-04 — FAIL.** JSON evidence: `state-degraded` is labeled `Degraded` but has `color: "red"`; the specification requires gray/neutral. The PNG visibly renders the state red.
- **IF-05 — FAIL.** JSON evidence: `state-reconnecting` is labeled `Reconnecting` but has `color: "yellow"`; the specification requires gray/neutral. The PNG visibly renders the state yellow.
- **IF-06 — PASS.** `state-suspended` is a violet process box labeled `Suspended`.
- **IF-07 — PASS.** `state-disconnecting` is a teal process box labeled `Disconnecting`.
- **IF-08 — PASS.** The solid gray `connect()` transition runs from Idle to Connecting; the PNG shows the forward arrow on its own upper track.
- **IF-09 — PASS.** The solid gray `handshake OK` transition runs from Connecting to Connected.
- **IF-10 — PASS.** `edge-timeout` is a dashed red forward-arrow connection from `state-connecting` to `seed-idle`, labeled `timeout`.
- **IF-11 — PASS.** The dashed red `packet loss > 5%` transition runs from Connected to Degraded.
- **IF-12 — PASS.** The dashed red `grace expired` transition runs from Degraded to Reconnecting.
- **IF-13 — PASS.** The solid green `recovered` transition runs from Degraded to Connected.
- **IF-14 — PASS.** The solid green `session resumed` transition runs from Reconnecting to Connected.
- **IF-15 — PASS.** The solid violet `suspend()` transition runs from Connected to Suspended.
- **IF-16 — PASS.** The solid violet `quarantine` transition runs from Degraded to Suspended.
- **IF-17 — PASS.** The solid violet `resume window` transition runs from Suspended to Reconnecting.
- **IF-18 — PASS.** The solid teal `close()` transition runs from Connected to Disconnecting.
- **IF-19 — PASS.** The solid teal `socket closed` transition runs from Disconnecting to Idle.
- **IF-20 — PASS.** JSON contains a small green pill `heartbeat-badge` labeled `heartbeat / 30s`, and the build summary explicitly declares it as the unsupported self-loop substitution.
- **IF-21 — FAIL.** JSON/PNG evidence: Connected ends at y=672, while `heartbeat-badge` starts at y=736, leaving a 64 px open gap; no connection has the badge as an endpoint. The PNG shows the pill floating below Connected rather than touching it, sitting inside it, or having its own short attachment stub.
- **IF-22 — PASS.** In the PNG, `connect()` is a solid gray upper track and `timeout` is a distinct dashed red lower track; they do not read as one bidirectional edge.
- **IF-23 — PASS.** All 15 transition labels are legible chips and remain identifiable with their own color-coded connectors in the PNG.
- **IF-24 — PASS.** `failure-note` is a margin sticky adjacent to the right-side failure area and states that dashed red means degradation and every failure lands in Reconnecting or Idle.
- **IF-NEG-1 — PASS.** All specced states and transitions are present; the only unsupported self-loop is represented by the declared heartbeat substitution.
- **IF-NEG-2 — FAIL.** JSON evidence: the final canvas contains 28 unrequested `ellipse` objects with `port-*` ids. These are standalone routing-port nodes beyond the requested states, annotation, frame, and declared badge; their circular glyphs are also visible around state borders in the PNG.

The port-rewired transitions above pass their positive edge items because each proxy is placed directly against the appropriate state border and the PNG still depicts the required directed state-to-state transition. Their unrequested structural presence is charged under IF-NEG-2.

### E1 — Add Migrating

- **E1-01 — PASS.** `state-migrating` is an orange process box labeled `Migrating`.
- **E1-02 — PASS.** The solid orange `migrate()` transition runs from Connected to Migrating.
- **E1-03 — PASS.** The solid green `migration complete` transition runs from Migrating to Connected.
- **E1-04 — PASS.** The dashed red `migration failed` transition runs from Migrating to Reconnecting.
- **E1-05 — PASS.** In the PNG, the three new label chips do not touch an existing chip or state box.
- **E1-06 — FAIL.** JSON/PNG evidence: the final badge remains 64 px below Connected and has no dedicated stub connection, so it does not read as anchored after the edit.

### E2 — Readability geometry pass

- **E2-01 — FAIL.** PNG evidence: the long violet `resume window` connector runs through the `migration complete` chip and also intersects the `migrate()` chip area. Those chips therefore touch a line they do not belong to, contrary to the clear-air requirement.
- **E2-02 — PASS.** The PNG uses the locked frame vertically and horizontally; no full-width or full-height empty band approaches 35% of the frame area.
- **E2-03 — FAIL.** JSON/PNG evidence: `heartbeat-badge` remains separated from Connected by 64 px with no badge attachment, in the same area as Connected's incoming green recovery wires; it did not remain anchored as required.

### E3 — Timeout corridor

- **E3-01 — PASS.** `edge-timeout` directly connects Connecting to Idle and is dashed, red, and labeled `timeout`.
- **E3-02 — PASS.** JSON has one direct `edge-timeout` connection between the two states, and the PNG shows one continuous dashed path with no junction, crosshair, or intermediate arrowhead.
- **E3-03 — PASS.** The PNG shows the dashed red timeout path clearly below and separate from the solid gray `connect()` path; its chip belongs unambiguously to the back edge.
- **E3-04 — PASS.** No timeout-corridor junction or waypoint object remains in the final JSON or appears along that corridor in the PNG.

## Score

- Passed: **30**
- Total: **39**
- **P = 30/39 = 0.7692**
- Rubric mapping: **5** (`P >= 0.70` and `< 0.80`)
- Caps applied: **none**. No specced node or edge is silently absent, no edge is reversed, and no requested-and-confirmed content is shown to have been destroyed.
- **Final IF score: 5/10**

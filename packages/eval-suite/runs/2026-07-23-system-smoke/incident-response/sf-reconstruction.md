# SF blind system reconstruction

## SYSTEM PURPOSE
A three-phase incident-response workflow for detecting and triaging a high-confidence alert, coordinating mitigation between on-call and service-owner roles, resolving the incident, and recording follow-up work.

## COMPONENTS
- 2026-07-23-system-smoke · incident-response: Names the depicted incident-response workflow. [The gray title bar at the top reads “2026-07-23-system-smoke · incident-response”.]
- 1 · Detect & triage: Contains alert detection, deduplication, paging, acknowledgment, triage, and the false-alarm-versus-incident outcome. [The left blue-bounded section is labeled “1 · Detect & triage” and encloses the corresponding workflow boxes.]
- High-confidence alert: Starts the alert-handling workflow. [The first blue box in phase 1 reads “High-confidence alert” and points downward to duplicate grouping.]
- Group duplicate alerts: Groups duplicate alerts before paging. [A blue box labeled “Group duplicate alerts” appears after the alert and before paging.]
- Page primary on-call: Pages the primary on-call responder. [A blue box labeled “Page primary on-call” follows duplicate grouping.]
- Ack ≤5m?: Checks whether the page is acknowledged within five minutes. [A yellow decision box below paging reads “Ack ≤5m?” and has two outgoing paths.]
- No @5m: secondary: Escalates to a secondary responder when acknowledgment is absent at five minutes. [The left orange box reads “No @5m: secondary”; an arrow from the acknowledgment decision reaches it, and it then points to acknowledgment and triage.]
- Yes: ack + triage: Represents acknowledgment and triage after direct acknowledgment or secondary escalation. [The blue box reads “Yes: ack + triage”; it receives a direct path from “Ack ≤5m?” and another arrow from “No @5m: secondary”.]
- False?: Branches triage into false-alarm resolution or incident declaration. [A yellow decision box labeled “False?” follows “Yes: ack + triage” and visibly branches to two outcome boxes.]
- Resolve false alarm: Terminates the false-alarm path. [A gray box labeled “Resolve false alarm” is one of the two branches below “False?”.]
- Declare incident: Declares an incident and transfers control into coordination and mitigation. [A red box labeled “Declare incident” is the other branch below “False?” and has an outgoing connector to “Create shared incident record”.]
- 2 · Coordinate & mitigate: Contains incident-record creation, ownership assignment, coordination, investigation, mitigation, signal rechecking, and retry handling. [The center orange-bounded section is labeled “2 · Coordinate & mitigate”.]
- Create shared incident record: Creates a shared record for the declared incident. [The first orange box in phase 2 reads “Create shared incident record” and receives the connector from “Declare incident”.]
- Assign service owner: Assigns the affected service’s owner. [An orange box labeled “Assign service owner” follows record creation.]
- On-call: coordinate + status current: Makes the on-call role responsible for coordination and keeping status current. [A blue role box below the owner assignment reads “On-call: coordinate + status current”.]
- Owner: investigate + mitigate: Makes the service owner responsible for investigation and mitigation. [An orange role box beside the on-call box reads “Owner: investigate + mitigate”.]
- Re-check same alert signals: Rechecks the same alert signals during mitigation. [A yellow box below the two role boxes reads “Re-check same alert signals”.]
- Signals OK?: Evaluates whether the rechecked alert signals are acceptable. [A yellow decision box labeled “Signals OK?” follows the signal recheck.]
- Failed → retry: Marks a failed check or operation and directs retry behavior. [A red box below “Signals OK?” explicitly reads “Failed → retry” and is reached by a downward arrow.]
- 3 · Resolve & learn: Contains incident resolution, public closure communication, record preservation, review scheduling, and follow-up tracking. [The right green-bounded section is labeled “3 · Resolve & learn”.]
- Resolve incident: Marks the incident as resolved. [The first green box in phase 3 reads “Resolve incident” and receives an incoming arrow from phase 2.]
- Close public status update: Closes the public-facing status update after resolution. [A green box labeled “Close public status update” follows “Resolve incident” by a downward arrow.]
- Preserve record timeline: Preserves the incident record’s timeline. [A green box labeled “Preserve record timeline” follows the public-status closure.]
- Schedule post-incident review: Schedules a review after the incident. [A green box labeled “Schedule post-incident review” follows timeline preservation.]
- Actions enter follow-up tracker: Places resulting actions into a follow-up tracker. [The final blue box reads “Actions enter follow-up tracker” and follows the post-incident review step.]

## FLOWS
- control · Initial alert processing: High-confidence alert → Group duplicate alerts → Page primary on-call → Ack ≤5m? [Downward arrows connect these four boxes in this order in phase 1.]
- control · Acknowledged-within-threshold path: Ack ≤5m? → Yes: ack + triage → False? [A path runs from the acknowledgment decision directly down to “Yes: ack + triage”, which then connects to “False?”.]
- failure · No-acknowledgment escalation path: Ack ≤5m? → No @5m: secondary → Yes: ack + triage → False? [The left branch from “Ack ≤5m?” reaches “No @5m: secondary”; that box points right to “Yes: ack + triage”, after which the flow continues to “False?”.]
- control · False-alarm termination branch: False? → Resolve false alarm [One branch below the “False?” decision ends at the gray “Resolve false alarm” box.]
- control · Incident declaration and record creation: False? → Declare incident → Create shared incident record → Assign service owner [The other branch below “False?” reaches “Declare incident”; a long right-and-up connector then enters “Create shared incident record”, which points down to “Assign service owner”.]
- control · Parallel role assignment: Assign service owner → On-call: coordinate + status current → Owner: investigate + mitigate [A horizontal split below “Assign service owner” has arrowheads into both the on-call and owner role boxes.]
- control · Signal verification: On-call: coordinate + status current / Owner: investigate + mitigate → Re-check same alert signals → Signals OK? [Connectors beneath the role boxes feed toward “Re-check same alert signals”, and a downward arrow connects that box to “Signals OK?”.]
- failure · Failed signal-check route: Signals OK? → Failed → retry [A connector leaves the lower side of “Signals OK?” and ends with a downward arrow at the red “Failed → retry” box.]
- control · Transition to resolution: Signals OK? → Resolve incident [A gray connector from the signal/coordination area joins a vertical line at the right edge of phase 2, rises, and ends with an arrow entering “Resolve incident”.]
- control · Resolution and learning sequence: Resolve incident → Close public status update → Preserve record timeline → Schedule post-incident review → Actions enter follow-up tracker [Phase 3 shows these five boxes in a single top-to-bottom chain connected by downward arrows.]

## FAILURE PATHS
- The primary on-call has not acknowledged the page at five minutes.: Ack ≤5m? → No @5m: secondary → Yes: ack + triage → A secondary responder is invoked, after which acknowledgment and triage continue. [The acknowledgment decision explicitly tests “≤5m”; its failure-side box says “No @5m: secondary” and points to “Yes: ack + triage”.]
- Triage classifies the alert as false.: False? → Resolve false alarm → The false alarm is resolved without entering the incident coordination phase. [The “False?” decision visibly branches to “Resolve false alarm”, which has no outgoing connector.]
- The signal evaluation follows the failed branch.: Re-check same alert signals → Signals OK? → Failed → retry → The operation is marked failed and retry is required. [The recheck leads to “Signals OK?”, and a downward branch reaches the red box explicitly labeled “Failed → retry”.]

## CONSTRAINTS & BOUNDARIES
- Primary acknowledgment is evaluated against a five-minute threshold. [The decision reads “Ack ≤5m?” and the escalation box reads “No @5m: secondary”.]
- Duplicate alerts are grouped before the primary on-call is paged. [The ordered arrows are “High-confidence alert” → “Group duplicate alerts” → “Page primary on-call”.]
- An incident must be declared before the shared incident record is created. [The outgoing connector from “Declare incident” enters “Create shared incident record”.]
- A service owner is assigned after creation of the shared incident record. [A downward arrow connects “Create shared incident record” to “Assign service owner”.]
- Coordination/status and investigation/mitigation are explicitly separated between on-call and owner roles. [The two role boxes read “On-call: coordinate + status current” and “Owner: investigate + mitigate”.]
- Verification must use the same alert signals. [The verification box explicitly reads “Re-check same alert signals”.]
- A failed verification requires retry. [The red outcome box explicitly reads “Failed → retry”.]
- Resolution precedes closing the public status update. [A downward arrow connects “Resolve incident” to “Close public status update”.]
- The record timeline is preserved before the post-incident review is scheduled. [The phase-3 order is “Preserve record timeline” followed by “Schedule post-incident review”.]
- Follow-up actions enter a tracker after the post-incident review is scheduled. [A downward arrow connects “Schedule post-incident review” to “Actions enter follow-up tracker”.]
- The workflow is explicitly ordered into three operational phases: detect and triage; coordinate and mitigate; resolve and learn. [The three section headers are numbered “1”, “2”, and “3” from left to right.]

## UNCERTAIN
- The “False?” decision has branches to both “Resolve false alarm” and “Declare incident”.: The outgoing connectors have no visible yes/no labels, so the exact textual condition assigned to each branch is not explicitly shown, even though the destination names imply their roles.
- Multiple gray connectors join beneath and to the right of the on-call and owner role boxes.: The exact branch-by-branch ownership of every connector is visually difficult to distinguish; the picture clearly shows role splitting, signal rechecking, a retry outcome, and a route to resolution, but not every junction is labeled.
- The red box says “Failed → retry”.: The image does not name the retry destination in text; nearby connectors appear to loop back into the coordination/mitigation area, but the precise restart step is not explicitly labeled.
- The connector into “Resolve incident” rises from the right side of the coordination/verification area.: The connector is not labeled “yes” or “signals OK”, so the specific condition authorizing the transition is not explicitly written.

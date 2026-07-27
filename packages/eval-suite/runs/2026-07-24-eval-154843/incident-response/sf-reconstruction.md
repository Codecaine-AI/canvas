# SF blind system reconstruction

## SYSTEM PURPOSE
A five-stage incident-response workflow that detects and pages on an alert, obtains on-call acknowledgement and triage, coordinates investigation and mitigation through a shared incident record, verifies recovery against monitoring signals, and then resolves the incident and records follow-up work.

## COMPONENTS
- Diagram identifier: Identifies the depicted incident-response workflow. [Top label reads "2026-07-24-eval-154843 · incident-response".]
- 1 · Detect & page: Contains alert detection, duplicate grouping, primary paging, acknowledgement handling, and escalation. [Leftmost blue phase container is titled "1 · Detect & page".]
- Monitoring: Produces a high-confidence alert. [Monitoring icon and text read "Monitoring" and partially obscured "high-confidence alert" above a downward arrow.]
- Alert manager: Groups duplicate alerts and initiates grouping/paging. [Blue box reads "Alert manager group duplicates"; the following connector is labeled "group + page".]
- Page primary on-call: Pages the primary on-call responder. [Gray box reads "Page primary on-call".]
- Acknowledged...: Represents the acknowledgement check or state after the primary page. [Yellow box below the primary-page step visibly reads "Acknowle dged..." and has outgoing green and dashed orange paths.]
- Escalate to secondary on-call: Escalates the page when acknowledgement does not occur within the displayed interval. [Orange box reads "Escalate to secondary on-call"; incoming dashed connector is labeled "no · 5 min".]
- 2 · Acknowledge & tr...: Contains responder acknowledgement, initial triage, and the decision between a real incident and a false alarm. [Second phase container title is visibly truncated as "2 · Acknowledge & tr...".]
- On-call acknowledges: Records the on-call responder's acknowledgement. [Person icon is labeled "On-call acknowledges".]
- Initial triage: Performs the first assessment of the acknowledged alert. [Yellow box reads "Initial triage" and is downstream of "On-call acknowledges".]
- Real inciden...: Determines whether the alert represents a real incident. [Yellow box visibly reads "Real inciden..."; its green downward branch is labeled "no" and leads to false-alarm resolution.]
- Resolve false alarm: Terminates the workflow for an alert determined not to be a real incident. [Green rounded terminal reads "Resolve false alarm".]
- 3 · Coordinate & mitigate: Maintains the shared incident record, assigns ownership, coordinates response, investigates the incident, applies mitigation, and keeps public status current. [Third orange phase container is titled "3 · Coordinate & mitigate".]
- Shared incident record: Serves as the shared record created for the incident. [Top orange box reads "Shared incident record"; its downward connector is labeled "create".]
- Assign service owner: Assigns responsibility for the affected service. [Orange box reads "Assign service owner".]
- Service owner investigates: Investigates the incident as the assigned service owner. [Orange box reads "Service owner investigates".]
- On-call coordinates response: Coordinates the incident response. [Blue box visibly wraps the text as "On-call coordinate s response", communicating "On-call coordinates response".]
- Apply mitigation: Applies a mitigation intended to restore healthy signals. [Orange box reads "Apply mitigation".]
- Keep public status current: Maintains current public-facing incident status during response. [Blue box reads "Keep public status current".]
- 4 · Verify: Checks the mitigation against monitoring signals and gates resolution on signal health. [Purple phase container is titled "4 · Verify".]
- Verify mitigation against monitoring signals: Validates the mitigation using monitoring signals. [Purple box reads "Verify mitigation against monitoring signals".]
- Signals healthy?: Decides whether monitored signals have recovered. [Purple decision box reads "Signals healthy?"; one outgoing path is labeled "yes" and another "no · retry".]
- Resolution gate: States an additional resolution condition involving the same signals that originally alerted. [Lower purple box visibly reads "**Resolution gate** Same signals that alerted must...".]
- 5 · Resolve & learn: Resolves the incident, closes public communication, preserves the record, schedules review, and tracks follow-up actions. [Rightmost green phase container is titled "5 · Resolve & learn".]
- Resolve incident: Marks the incident resolved after successful verification. [Green rounded box reads "Resolve incident" and receives the green branch labeled "yes" from verification.]
- Close public update: Closes the public-facing incident update after resolution. [Green box reads "Close public update".]
- Preserve timeline in incident record: Retains the incident timeline in the incident record. [Green box reads "Preserve timeline in incident record".]
- Schedule post-incident review: Schedules a review of the incident. [Green box reads "Schedule post-incident review".]
- Actions enter follow-up tracker: Places resulting actions into a follow-up tracker. [Bottom teal box reads "Actions enter follow-up tracker".]

## FLOWS
- control · Primary detection and paging flow: Monitoring produces a high-confidence alert. → Alert manager groups duplicate alerts. → The connector labeled "group + page" leads to "Page primary on-call". → The primary on-call is paged. → The workflow reaches the "Acknowledged..." check or state. [Downward arrows connect Monitoring, "Alert manager group duplicates", "Page primary on-call", and "Acknowledged..."; the connector between alert manager and paging is labeled "group + page".]
- control · Acknowledged paging transition: The page reaches the "Acknowledged..." check or state. → A green path leaves that state and rises toward the acknowledgement/triage phase. → The flow enters "On-call acknowledges". [A solid green connector leaves the right side of "Acknowledged...", rises along the phase boundary, and joins the incoming path at "On-call acknowledges".]
- failure · Secondary escalation transition: The primary-page acknowledgement check yields "no" for 5 minutes. → The workflow escalates to the secondary on-call. → The orange path enters "On-call acknowledges" in phase 2. [A dashed orange downward path labeled "no · 5 min" connects "Acknowledged..." to "Escalate to secondary on-call"; an orange line then runs right and upward to the phase-2 acknowledgement entry.]
- control · Acknowledgement and triage flow: On-call acknowledges. → Initial triage is performed. → The workflow evaluates "Real inciden...". [Downward yellow/orange arrows connect "On-call acknowledges" to "Initial triage" and then to "Real inciden...".]
- control · Real-incident coordination flow: The real-incident decision follows its unlabeled orange outgoing branch. → The flow enters "Shared incident record". → The shared incident record is created. → A service owner is assigned. → The service owner investigates. → Mitigation is applied. [An orange connector leaves the right of "Real inciden..." and rises into "Shared incident record"; the record-to-assignment connector is labeled "create"; orange arrows continue through "Assign service owner", "Service owner investigates", and "Apply mitigation".]
- control · On-call coordination and public-status flow: The shared incident record feeds the on-call response-coordination branch. → On-call coordinates response. → Public status is kept current. [A blue connector leaves the right side of "Shared incident record", bends down into "On-call coordinates response", and a blue downward arrow continues to "Keep public status current".]
- control · Mitigation verification flow: Mitigation is applied. → The flow enters phase 4. → Mitigation is verified against monitoring signals. → The workflow asks "Signals healthy?". [A purple connector leaves the mitigation area and bends into the Verify phase; within that phase a downward purple arrow connects "Verify mitigation against monitoring signals" to "Signals healthy?".]
- control · Successful verification and resolution flow: "Signals healthy?" yields "yes". → The incident is resolved. → The public update is closed. → The timeline is preserved in the incident record. → A post-incident review is scheduled. → Actions enter the follow-up tracker. [A green path labeled "yes" runs from "Signals healthy?" to "Resolve incident"; downward green/teal arrows then connect "Close public update", "Preserve timeline in incident record", "Schedule post-incident review", and "Actions enter follow-up tracker" in order.]
- data · Incident record lifecycle: A shared incident record is created during coordination. → The incident timeline is later preserved in the incident record during resolve-and-learn. [Phase 3 contains "Shared incident record" with connector label "create"; phase 5 contains "Preserve timeline in incident record".]
- control · Public communication lifecycle: During response, public status is kept current. → After incident resolution, the public update is closed. [Phase 3 contains "Keep public status current" and phase 5 contains "Close public update" after "Resolve incident".]

## FAILURE PATHS
- The primary on-call has not acknowledged within 5 minutes.: "Acknowledged..." → "no · 5 min" → "Escalate to secondary on-call" → "On-call acknowledges" → The page is escalated to the secondary on-call and the acknowledgement/triage process continues. [The dashed orange branch labeled "no · 5 min" reaches "Escalate to secondary on-call", whose orange outgoing path enters phase 2.]
- Initial triage determines the alert is not a real incident.: "Real inciden..." → "no" → "Resolve false alarm" → The alert is resolved as a false alarm. [A green downward branch labeled "no" connects "Real inciden..." to the rounded terminal "Resolve false alarm".]
- The "Signals healthy?" decision yields no.: "Signals healthy?" → "no · retry" → Return toward the mitigation work → "Apply mitigation" → Verify again → Resolution is withheld and mitigation/verification is retried. [A dashed orange return path beside the Verify phase is labeled "no · retry" and bends back into the mitigation area; the successful green resolution path is separately labeled "yes".]

## CONSTRAINTS & BOUNDARIES
- A primary-page failure is escalated after 5 minutes without acknowledgement. [The escalation connector is explicitly labeled "no · 5 min".]
- False alarms do not proceed into incident coordination and instead terminate at "Resolve false alarm". [The "no" branch from "Real inciden..." ends at the green rounded false-alarm terminal.]
- Incident resolution follows a positive "Signals healthy?" result. [Only the green branch labeled "yes" visibly connects the signal-health decision to "Resolve incident".]
- An unhealthy-signal result requires retry rather than resolution. [The alternative branch is explicitly labeled "no · retry" and returns toward mitigation.]
- Mitigation is verified against monitoring signals. [The Verify-phase activity explicitly reads "Verify mitigation against monitoring signals".]
- The resolution gate refers to the same signals that originally alerted. [The lower purple box reads "**Resolution gate** Same signals that alerted must...".]
- Resolve-and-learn work is ordered as resolve incident, close public update, preserve timeline, schedule post-incident review, then enter actions into the follow-up tracker. [These five phase-5 boxes are arranged vertically and connected by downward arrows in that order.]

## UNCERTAIN
- The phase-2 title is displayed as "2 · Acknowledge & tr...".: The final word is truncated, so its complete wording is not visible.
- The decision box after initial triage reads "Real inciden...".: The final letters and any punctuation are truncated; it appears to be a real-incident decision, but the complete label is not visible.
- The box after paging reads "Acknowle dged..." because of line wrapping/truncation.: It is visually used like an acknowledgement decision or state, but the complete question/label and the explicit label of its positive branch are not visible.
- The Monitoring caption includes partially obscured text that appears to read "high-confidence alert".: Part of the caption is covered by the alert-manager box, so the exact full wording cannot be confirmed.
- The orange branch from "Real inciden..." to the shared incident record is not labeled.: Its meaning is structurally the alternative to the visible "no" branch, but an explicit "yes" label is not shown.
- The dashed "no · retry" path bends back into the mitigation area near "Apply mitigation".: The return line's exact attachment point is partly obscured by overlapping connectors and the label, so the precise retry entry node is not fully clear.
- The purple "Resolution gate" box ends with "Same signals that alerted must...".: The remainder of the gate condition is truncated, and no complete connector to or from this box is clearly visible.
- Several differently colored connectors overlap at phase boundaries.: Color suggests separate acknowledgement, coordination, mitigation, and retry branches, but some junction ownership is visually difficult to distinguish where lines overlap.

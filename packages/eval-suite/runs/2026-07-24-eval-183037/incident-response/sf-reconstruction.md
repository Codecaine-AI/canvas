# SF blind system reconstruction

## SYSTEM PURPOSE
A four-stage incident-response process for detecting and mobilizing responders, coordinating investigation and mitigation, verifying recovery and resolving the incident, then preserving records and tracking post-incident actions.

## COMPONENTS
- Diagram: 2026-07-24-eval-183037 · incident-response: Names the depicted incident-response workflow. [The gray title bar at the top reads “2026-07-24-eval-183037 · incident-response”.]
- 1 · Detect & mobilize: Contains monitoring, alert handling, responder paging, triage, incident validation, and declaration activities. [The left blue section is headed “1 · Detect & mobilize”.]
- Monitoring: Provides the signal that initiates alert handling. [A blue monitoring-wave icon is labeled “Monitoring” and connects toward the alert-management activity.]
- Alert manager groups duplicates: Receives alerts and groups duplicate alerts. [A blue box explicitly reads “Alert manager groups duplicates”; the incoming connection is labeled “alert”.]
- Page primary on-call: Mobilizes the primary on-call responder. [A blue person icon is labeled “Page primary on-call” beneath the alert-management path.]
- Ack ≤ 5 min?: Checks whether the page is acknowledged within five minutes. [A yellow decision/activity box reads “Ack ≤ 5 min?”.]
- Page secondary: Escalates notification to a secondary responder. [An orange person icon is labeled “Page secondary” and is reached by a downward orange arrow from the acknowledgement check.]
- Initial triage: Performs initial assessment after the primary on-call is mobilized. [A blue box reads “Initial triage” and is downstream of the primary on-call path.]
- Real incid...: Determines whether the triaged event is a real incident. [A yellow box below “Initial triage” visibly reads “Real incid...”; outgoing branches are labeled “no” and “yes”.]
- Resolve false...: Handles the non-incident outcome of the real-incident decision. [The “no” branch from “Real incid...” points to a green rounded shape labeled “Resolve false...”.]
- Declare incident: Formally declares an event as an incident when the event is judged real. [The “yes” branch from “Real incid...” leads to an orange outlined shape labeled “Declare incident”.]
- 2 · Coordinate & mitigate: Holds the shared incident record and coordinates on-call communications, service-owner investigation, mitigation, and public status updates. [The orange section is headed “2 · Coordinate & mitigate”.]
- Shared incident record: Acts as the common incident record used for coordination. [An orange box near the top of stage 2 reads “Shared incident record”; it receives the declaration path and has outgoing coordination/assignment paths.]
- On-call coordinates: Coordinates incident work and communications. [A blue chat icon is labeled “On-call coordinates”; the incoming dotted blue path is labeled “coordinate”.]
- Update public status page: Keeps the public status page current during the incident. [A blue display icon is labeled “Update public status page”; the path from on-call coordination is labeled “keep current”.]
- Assign service owner: Assigns the relevant service owner to the incident. [An orange person icon is labeled “Assign service owner” and is connected from the shared incident record.]
- Investigate: Performs incident diagnosis or investigation under the service-owner path. [An orange box labeled “Investigate” appears below “Assign service owner”, connected by a downward arrow.]
- Apply mitigation: Applies a mitigation based on the investigation and participates in the verification/retry loop. [An orange box labeled “Apply mitigation” appears below “Investigate”, connected by a downward arrow and by the cross-stage loop.]
- Parallel roles: Defines simultaneous ownership: on-call handles coordination and communications, while the service owner handles diagnosis and mitigation. [A note explicitly reads “**Parallel roles** - On-call: coordination + comms - Service owner: diagnosis + mitigation”.]
- 3 · Verify & resol...: Verifies mitigation using monitoring signals, decides whether mitigation passes, resolves the incident, and closes the public update. [The green section header visibly reads “3 · Verify & resol...”.]
- Verify same monitoring signals: Rechecks the same monitoring signals used to detect the incident. [A green monitoring-wave icon is labeled “Verify same monitoring signals”; its incoming cross-stage path is labeled “verify”.]
- Mitigati on...: Evaluates the mitigation result before resolution or another mitigation attempt. [A yellow box beneath verification has the visibly wrapped and truncated text “Mitigati on...”; it has a downward branch labeled “passes” and a return path toward “Apply mitigation”.]
- Resolve incident: Marks the incident resolved after the mitigation check passes. [A green rounded box reads “Resolve incident” and is reached by the branch labeled “passes”.]
- Close public update: Closes the public-facing update after incident resolution. [A green display icon below “Resolve incident” is labeled “Close public update” and is connected by a downward arrow.]
- 4 · Learn & foll...: Preserves the incident history, schedules review, and tracks follow-up work. [The purple section header visibly reads “4 · Learn & foll...”.]
- Preserve timeline: Preserves the incident timeline or record after closure. [A purple box reads “Preserve timeline”; the incoming purple cross-stage path is labeled “preserve record”.]
- Schedule post-incident review: Schedules a review of the incident after the timeline is preserved. [A purple box reads “Schedule post-incident review” and is connected downward from “Preserve timeline”.]
- Follow-up tracker: Tracks actions arising from the post-incident review. [A purple box reads “Follow-up tracker”; its incoming path from the review is labeled “actions”.]

## FLOWS
- control · Detection and primary mobilization: Monitoring produces an alert. → The alert enters “Alert manager groups duplicates” through the connection labeled “alert”. → The alert-management path proceeds to “Page primary on-call”. → The primary on-call path proceeds toward the acknowledgement check and initial triage. [Blue arrows connect the monitoring icon, the alert-manager box, the primary on-call icon, the “Ack ≤ 5 min?” box, and “Initial triage”.]
- failure · Acknowledgement escalation: Evaluate “Ack ≤ 5 min?”. → A downward orange branch pages the secondary responder. → The secondary responder path returns toward “Initial triage”. [The acknowledgement box has an orange downward arrow to the person labeled “Page secondary”; an orange left-pointing arrow enters “Initial triage” from that side.]
- control · Triage and incident declaration: Perform “Initial triage”. → Evaluate “Real incid...”. → If “no”, follow the branch to “Resolve false...”. → If “yes”, follow the branch to “Declare incident”. → The declaration path continues to “Shared incident record”. [A blue arrow runs from “Initial triage” to “Real incid...”; the decision has visible “no” and “yes” labels, and an orange routed arrow rises from the declaration area to the shared incident record.]
- data · Shared-record coordination: Create or enter the “Shared incident record” after incident declaration. → Use the record to coordinate the on-call role via the path labeled “coordinate”. → The on-call role keeps “Update public status page” current through the path labeled “keep current”. [The declaration route terminates at “Shared incident record”; dotted blue arrows labeled “coordinate” and “keep current” run downward through the on-call coordination and public-status components.]
- control · Service-owner investigation and mitigation: From the shared incident record, assign the service owner. → The service owner investigates. → Apply mitigation. [An orange arrow exits “Shared incident record” toward “Assign service owner”; downward orange arrows connect that role to “Investigate” and then to “Apply mitigation”.]
- control · Mitigation verification loop: After mitigation, enter stage 3 through the path labeled “verify”. → Verify the same monitoring signals. → Evaluate “Mitigati on...”. → If the check “passes”, resolve the incident. → The alternate routed path returns to “Apply mitigation” for another mitigation attempt. [A routed cross-stage line enters “Verify same monitoring signals” beside the label “verify”; a green arrow descends to “Mitigati on...”; the “passes” branch reaches “Resolve incident”; an orange return line terminates with a left-pointing arrow at “Apply mitigation”.]
- control · Resolution and public closure: Resolve the incident. → Close the public update. [A green downward arrow connects “Resolve incident” to the display icon labeled “Close public update”.]
- data · Record preservation and follow-up: From the closed public-update area, follow the purple route labeled “preserve record”. → Preserve timeline. → Schedule post-incident review. → Send review “actions” to the follow-up tracker. [A purple route rises from stage 3 to “Preserve timeline” and is labeled “preserve record”; downward purple arrows then connect to “Schedule post-incident review” and, through “actions”, to “Follow-up tracker”.]

## FAILURE PATHS
- The primary on-call does not satisfy the “Ack ≤ 5 min?” check.: Ack ≤ 5 min? → Page secondary → Initial triage → The secondary responder is paged and the process continues to initial triage. [An orange downward arrow leaves “Ack ≤ 5 min?” for “Page secondary”, and the orange path points into “Initial triage”; the branch itself has no visible textual condition.]
- The “Real incid...” decision is “no”.: Real incid... → no → Resolve false... → The event follows the visibly truncated false-event resolution outcome. [The “no” label appears between the real-incident decision and the green rounded shape labeled “Resolve false...”.]
- The mitigation evaluation does not take the branch labeled “passes”.: Mitigati on... → Return route → Apply mitigation → Verify same monitoring signals → Mitigation is applied again and verification is repeated. [The only labeled downward branch is “passes”; a separate orange routed line returns with an arrow into “Apply mitigation”, while the cross-stage route leads back to verification.]

## CONSTRAINTS & BOUNDARIES
- Primary acknowledgement is checked against a five-minute threshold. [The decision box explicitly reads “Ack ≤ 5 min?”.]
- Verification uses the same monitoring signals rather than a separately named signal source. [The stage-3 label explicitly says “Verify same monitoring signals”.]
- On-call and service-owner work is parallel, with separate responsibilities. [The stage-2 note says “**Parallel roles** - On-call: coordination + comms - Service owner: diagnosis + mitigation”.]
- The on-call role is responsible for coordination and communications. [The parallel-roles note explicitly assigns “coordination + comms” to “On-call”.]
- The service owner is responsible for diagnosis and mitigation. [The parallel-roles note explicitly assigns “diagnosis + mitigation” to “Service owner”.]
- The public status page is kept current during coordination and closed after resolution. [Stage 2 contains “Update public status page” under the label “keep current”; stage 3 ends with “Close public update”.]
- Post-incident actions are tracked after a post-incident review is scheduled. [The purple sequence orders “Schedule post-incident review”, then the connection labeled “actions”, then “Follow-up tracker”.]

## UNCERTAIN
- Several labels are visibly truncated: “Real incid...”, “Resolve false...”, “Mitigati on...”, “3 · Verify & resol...”, and “4 · Learn & foll...”.: The missing words cannot be recovered from the image with certainty, so the displayed text is preserved rather than expanded.
- The downward orange branch from “Ack ≤ 5 min?” is not visibly labeled.: Its placement suggests the unmet/timeout outcome, but the image does not explicitly print “no”, “timeout”, or an equivalent condition on that branch.
- The normal acknowledgement branch from “Ack ≤ 5 min?” is not visibly labeled.: The blue routing appears to connect the primary-on-call area to initial triage, but the exact branch semantics are not printed.
- A large orange outlined rounded shape appears below and to the right of “Declare incident” as part of the routed declaration line.: It has no readable label, so it cannot be identified as a separate component or responsibility.
- The non-passing branch of “Mitigati on...” has no visible text label.: The routing visibly returns to “Apply mitigation”, but the precise condition—such as failed, insufficient, or not passed—is not stated.
- The transition from “Apply mitigation” into stage-3 verification is represented by a multi-colored routed connection.: The operational sequence is visually implied, but portions of the line also form the return loop, making individual segment ownership or color semantics unclear.

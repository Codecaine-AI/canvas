# SF blind system reconstruction

## SYSTEM PURPOSE
An end-to-end incident-response process titled "Incident response · alert to learning," covering detection and paging, acknowledgement and triage, incident declaration and ownership, coordination and communication, investigation and mitigation, verification and resolution, and post-incident learning and follow-up.

## COMPONENTS
- 1 · Detect & page: Groups monitoring alerts, pages the primary on-call, and escalates when acknowledgement is not received. [A light-blue bounded section labeled "1 · Detect & page" contains "Monitoring signals," "Alert manager groups duplicates," "Page primary on-call," and "Escalate secondary on-call."]
- Monitoring signals: Provides the initial signals that enter the incident-response process. [A monitoring waveform icon labeled "Monitoring signals" has a right-pointing blue arrow toward "Alert manager groups duplicates."]
- Alert manager groups duplicates: Groups duplicate monitoring alerts before paging or escalation. [A blue rectangular activity is explicitly labeled "Alert manager groups duplicates."]
- Page primary on-call: Represents paging or engaging the primary on-call responder. [A person icon labeled "Page primary on-call" is connected to the alert-manager path by a blue line ending with an arrow toward the person.]
- Escalate secondary on-call: Receives escalation when the alert is not acknowledged within the stated interval. [An orange person icon labeled "Escalate secondary on-call" is below the alert manager, with a downward orange arrow labeled "no ack in 5 min."]
- 2 · Acknowledge & triage: Acknowledges the page, triages it, determines whether it is an incident, and resolves false alarms. [A teal bounded section labeled "2 · Acknowledge & triage" contains "Acknowledge page," "Incident?," and "Resolve false alarm."]
- Acknowledge page: Records or performs acknowledgement of the page. [A teal activity box is labeled "Acknowledge page" and receives the dashed orange escalation path.]
- Incident?: Acts as the triage decision determining whether the acknowledged condition should be treated as an incident or a false alarm. [A yellow decision-shaped rectangle labeled "Incident?" receives a teal arrow labeled "triage" and has outgoing paths labeled "declare" and "false alarm."]
- Resolve false alarm: Terminates the non-incident branch by resolving a condition classified as a false alarm. [A green rounded terminal labeled "Resolve false alarm" receives the green path labeled "false alarm" from "Incident?"]
- 3 · Declare & assign: Declares the incident, creates a shared incident record, and assigns the service owner. [A purple bounded section labeled "3 · Declare & assign" contains "Declare incident," "Create shared incident record," and "Assign service owner."]
- Declare incident: Formally declares the condition as an incident. [A purple activity box labeled "Declare incident" receives the purple path labeled "declare" from "Incident?"]
- Create shared incident record: Creates the shared record used for the declared incident. [A purple activity box labeled "Create shared incident record" receives an arrow from "Declare incident" labeled "creates."]
- Assign service owner: Identifies or assigns the service owner who owns the investigation. [An orange person icon labeled "Assign service owner" receives an orange arrow from the shared incident record labeled "assigns"; a separate orange connection is labeled "owns investigation."]
- 4 · Coordinate & communicate: Coordinates the response and keeps public status information current. [A light-blue bounded section labeled "4 · Coordinate & communicate" contains "On-call coordinates response" and "Keep public status current."]
- On-call coordinates response: Coordinates active incident response. [A blue activity box is labeled "On-call coordinates response" and has a right-pointing arrow toward "Keep public status current."]
- Keep public status current: Maintains current public-facing status during the response. [A blue activity box is labeled "Keep public status current" inside the coordination and communication section.]
- 5 · Investigate & mitigate: Investigates the incident cause and applies mitigation. [An orange bounded section labeled "5 · Investigate & mitigate" contains "Investigate cause" and "Apply mitigation."]
- Investigate cause: Investigates the cause under service-owner ownership. [An orange activity box labeled "Investigate cause" is connected from the service-owner area by an orange path labeled "owns investigation."]
- Apply mitigation: Applies the selected mitigation after cause investigation. [An orange activity box labeled "Apply mitigation" receives a right-pointing orange arrow from "Investigate cause" labeled "mitigate."]
- 6 · Verify & resolve: Checks signal health, resolves the incident when healthy, and closes the public update. [A green bounded section labeled "6 · Verify & resolve" contains "Signals healthy?," "Resolve incident," and "Close public update."]
- Signals healthy?: Verifies whether monitoring signals are healthy after mitigation. [A yellow decision-shaped rectangle labeled "Signals healthy?" receives an orange arrow from "Apply mitigation" and has a green outgoing path labeled "healthy."]
- Resolve incident: Marks the incident resolved after signals are verified healthy. [A green rounded terminal labeled "Resolve incident" receives the green path labeled "healthy" from "Signals healthy?"]
- Close public update: Closes the public-facing update after incident resolution. [A green activity box labeled "Close public update" receives a left-pointing green connection from the resolution path.]
- 7 · Learn & follow up: Preserves the incident timeline, conducts a post-incident review, and tracks follow-up actions. [A pink bounded section labeled "7 · Learn & follow up" contains "Preserve incident timeline," "Post-incident review," and "Follow-up tracker actions."]
- Preserve incident timeline: Preserves the timeline of the resolved incident for learning and review. [A purple activity box labeled "Preserve incident timeline" receives a long purple path labeled "preserve timeline" from the resolution area.]
- Post-incident review: Performs review of the incident after resolution. [A pink activity box labeled "Post-incident review" is connected with "Preserve incident timeline" and has a downward path to follow-up actions.]
- Follow-up tracker actions: Tracks actions produced by the post-incident review. [A pink activity box labeled "Follow-up tracker actions" receives a pink arrow from the post-incident review path.]

## FLOWS
- control · Detection and primary paging: Monitoring signals → Alert manager groups duplicates → Page primary on-call [Blue arrows run from the monitoring icon to the alert-manager box and then along a blue path ending at the primary on-call icon.]
- failure · Unacknowledged-page escalation: Alert manager groups duplicates → Wait for acknowledgement → If there is "no ack in 5 min," escalate secondary on-call → Secondary escalation proceeds to Acknowledge page [A downward orange arrow from the alert manager to the secondary on-call is labeled "no ack in 5 min"; a dashed orange path continues from the secondary on-call area to "Acknowledge page."]
- control · Acknowledgement and triage: Acknowledge page → triage → Incident? [A teal arrow runs from "Acknowledge page" to "Incident?" with the connector label "triage."]
- failure · False-alarm disposition: Incident? → Classify as "false alarm" → Resolve false alarm [A green branch leaves "Incident?" and points left into "Resolve false alarm"; the branch is labeled "false alarm."]
- control · Incident declaration and record creation: Incident? → declare → Declare incident → creates → Create shared incident record [A purple arrow labeled "declare" connects "Incident?" to "Declare incident"; another purple arrow labeled "creates" connects declaration to the shared incident record.]
- control · Service-owner assignment: Create shared incident record → assigns → Assign service owner [An orange path leaves "Create shared incident record," points toward the service-owner icon, and is labeled "assigns."]
- control · Response coordination and public communication: Declare incident → On-call coordinates response → Keep public status current [A blue path descends from the declaration area and enters the coordination section at "On-call coordinates response"; a blue arrow then points to "Keep public status current."]
- control · Investigation ownership and mitigation: Assign service owner → owns investigation → Investigate cause → mitigate → Apply mitigation [An orange connector labeled "owns investigation" links the service-owner area to "Investigate cause"; an orange arrow labeled "mitigate" points from investigation to "Apply mitigation."]
- control · On-call-led verification: On-call coordinates response → on-call leads → Signals healthy? [A long blue connector from the coordination section enters the verification section at "Signals healthy?" and carries the label "on-call leads."]
- control · Mitigation verification: Apply mitigation → Signals healthy? [A right-pointing orange arrow connects "Apply mitigation" directly to "Signals healthy?"]
- control · Healthy-signal resolution: Signals healthy? → healthy → Resolve incident → Close public update [A green arrow labeled "healthy" connects the signal-health decision to "Resolve incident"; a green path from the resolution area points left into "Close public update."]
- data · Resolution-to-learning handoff: Resolve incident → preserve timeline → Preserve incident timeline [A long purple path descends from the resolution area and runs into "Preserve incident timeline" with the connector label "preserve timeline."]
- control · Post-incident learning and action tracking: Preserve incident timeline → Post-incident review → Follow-up tracker actions ["Preserve incident timeline" and "Post-incident review" are joined by a pink horizontal connection, and a pink path from the review points into "Follow-up tracker actions."]

## FAILURE PATHS
- The page is not acknowledged within 5 minutes.: Alert manager groups duplicates → "no ack in 5 min" → Escalate secondary on-call → Acknowledge page → The secondary on-call is escalated and the process continues to page acknowledgement and triage. [The orange downward connector is explicitly labeled "no ack in 5 min," terminates at "Escalate secondary on-call," and a dashed orange connector proceeds to "Acknowledge page."]
- Triage determines that the condition is a false alarm rather than an incident.: Acknowledge page → triage → Incident? → "false alarm" → Resolve false alarm → The false alarm is resolved without entering declaration, assignment, mitigation, or later incident stages. [The decision "Incident?" has a green branch labeled "false alarm" pointing to the terminal "Resolve false alarm."]

## CONSTRAINTS & BOUNDARIES
- Escalation to the secondary on-call occurs when there is no acknowledgement in 5 minutes. [The connector from the alert manager to the secondary on-call is labeled exactly "no ack in 5 min."]
- The process is explicitly ordered into seven numbered operational stages. [The bounded regions are numbered and labeled in order: "1 · Detect & page," "2 · Acknowledge & triage," "3 · Declare & assign," "4 · Coordinate & communicate," "5 · Investigate & mitigate," "6 · Verify & resolve," and "7 · Learn & follow up."]
- Incident declaration precedes creation of the shared incident record. [The arrow labeled "creates" points from "Declare incident" to "Create shared incident record."]
- The shared incident record precedes assignment of the service owner. [The arrow labeled "assigns" runs from "Create shared incident record" toward "Assign service owner."]
- Mitigation is applied after cause investigation. [The arrow labeled "mitigate" points from "Investigate cause" to "Apply mitigation."]
- Incident resolution is shown only on the explicitly labeled healthy branch. [The only displayed arrow into "Resolve incident" comes from "Signals healthy?" and is labeled "healthy."]
- Public status is maintained during coordination and closed after resolution. ["Keep public status current" appears in stage 4, while "Close public update" receives a green path from the resolution area in stage 6.]
- The service owner owns the investigation, while the on-call leads the verification path. [The orange cross-stage connector is labeled "owns investigation," and the blue cross-stage connector entering verification is labeled "on-call leads."]

## UNCERTAIN
- The "Signals healthy?" decision shows only a branch labeled "healthy.": No unhealthy branch, retry loop, or failure outcome is visibly drawn, so the response to unhealthy signals cannot be reconstructed.
- The connection between "Preserve incident timeline" and "Post-incident review" appears to show arrowheads in both directions.: The picture communicates a close or bidirectional relationship, but it does not label the connection or establish a single unambiguous direction.
- The blue declaration-to-coordination route joins the coordination section above "On-call coordinates response.": The route indicates that declaration leads into response coordination, but no connector label explicitly states the handoff.
- The green path from "Resolve incident" bends toward "Close public update.": The visible arrow points into "Close public update," but the connector itself has no text describing the exact action or timing.

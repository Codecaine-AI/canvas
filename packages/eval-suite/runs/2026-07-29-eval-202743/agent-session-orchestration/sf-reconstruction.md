# SF blind system reconstruction

## SYSTEM PURPOSE
Long-lived Agent Session Orchestration: admit and place sessions, run model-and-tool turns, stream and replay output, retain event/checkpoint state, support suspension and recovery, handle cancellation, manage child sessions and quotas, and fork or retain prior state.

## COMPONENTS
- Session API: Provides the API admission point for a session. [In region "1 · API admission & placement," an API icon is labeled "Session API" and has an outgoing arrow labeled "authenticate".]
- Auth + workspace: Acts as the authentication and workspace gate before session placement. [A guardrail icon labeled "Auth + workspace" receives the "authenticate" arrow and has an outgoing arrow labeled "place".]
- Session scheduler: Schedules or places an admitted session onto a runner host. [An orchestrator icon labeled "Session scheduler" receives "place" and emits an arrow labeled "place session" toward "Runner host".]
- Runner host: Hosts execution of a placed session and initiates its run. [A server icon labeled "Runner host" receives the "place session" arrow and emits an arrow labeled "run".]
- Turn orchestrator: Coordinates the runner's turn loop. [An orchestrator icon labeled "Turn orchestrator" receives "run" and emits an arrow labeled "turn loop".]
- Model + tools: Performs the model-and-tool portion of each turn and emits streamed tokens. [A model icon labeled "Model + tools" receives the "turn loop" arrow; a green routed edge leaving it is labeled "stream tokens".]
- Client stream: Represents the client-facing message or streaming surface. [A message icon labeled "Client stream" appears in region "3 · Streaming & reattachment" adjacent to the green streaming and delivery lines.]
- Live output: Emits or dispatches live output for delivery. [A send icon labeled "Live output" is connected by a green directed line labeled "deliver" to "Client stream".]
- Replay from ACK: Provides replay associated with an acknowledgement. [A green terminal-like icon is explicitly labeled "Replay from ACK" in the streaming and reattachment region.]
- Durable event log: Retains a durable log of events or activity. [An activity-style icon labeled "Durable event log" appears in region "4 · Event log & checkpoints".]
- Turn checkpoint: Represents a checkpoint artifact for a turn. [A document icon labeled "Turn checkpoint" appears in region "4 · Event log & checkpoints".]
- Snapshot chain: Stores a chain of snapshots. [A memory/store icon labeled "Snapshot chain" appears in region "4 · Event log & checkpoints".]
- Suspend + release: Represents suspension and release of a running session or resource. [A wait icon labeled "Suspend + release" appears in region "5 · Suspension, resume & recovery".]
- Heartbeat + rescue: Observes heartbeat state and provides a rescue function. [A monitor/eye icon labeled "Heartbeat + rescue" appears in region "5 · Suspension, resume & recovery".]
- Rehydrate latest checkpoint: Runs a delegated process that restores the latest checkpoint. [A predefined-process shape contains the readable text "Rehydrate latest checkpoint".]
- Cancel / interrupt: Acts as the cancellation or interruption gate. [A guardrail icon labeled "Cancel / interrupt" appears in region "6 · Cancel & uncertain outcomes".]
- Stop stream + abandon calls: Stops streaming and abandons calls. [A process box in region 6 contains the readable text "Stop stream + abandon calls".]
- Resumable checkpoint: Provides a checkpoint artifact from which work can be resumed. [A document icon labeled "Resumable checkpoint" appears in region "6 · Cancel & uncertain outcomes".]
- Spawn scoped child: Runs a delegated process to create a scoped child session. [A predefined-process shape contains "Spawn scoped child" in region "7 · Child sessions & propagation".]
- Scoped child budget: Represents the budget assigned to a scoped child. [A coin icon is labeled "Scoped child budget".]
- Orphan reaper: Acts as a gate or enforcement component for orphaned child sessions. [A guardrail icon labeled "Orphan reaper" appears in region "7 · Child sessions & propagation".]
- Tree + workspace usage: Tracks usage across the session tree and workspace. [An activity-style icon labeled "Tree + workspace usage" appears in region "8 · Tree & workspace quotas".]
- Aggregate quota gate: Enforces an aggregate quota. [A guardrail icon is explicitly labeled "Aggregate quota gate".]
- User decision to resume: Places the decision to resume with a human user. [A human icon is labeled "User decision to resume" in the quota region.]
- Fork earlier checkpoint: Runs a delegated process that forks from an earlier checkpoint. [A predefined-process shape contains "Fork earlier checkpoint" in region "9 · Forking & retention".]
- Shared content: Represents multiple shared document or content artifacts. [A documents icon is labeled "Shared content".]
- Reachability GC: Provides reachability-based garbage collection or archival cleanup. [An archive icon is labeled "Reachability GC" in region "9 · Forking & retention".]

## FLOWS
- control · API authentication: Session API → Auth + workspace [A solid gray right-pointing arrow runs from "Session API" to "Auth + workspace" and is labeled "authenticate".]
- control · Admission placement: Auth + workspace → Session scheduler [A solid gray right-pointing arrow runs from "Auth + workspace" to "Session scheduler" and is labeled "place".]
- control · Session host placement: Session scheduler → Runner host [A solid teal right-pointing arrow crosses from region 1 into region 2 and is labeled "place session".]
- control · Start runner execution: Runner host → Turn orchestrator [A solid teal right-pointing arrow runs from "Runner host" to "Turn orchestrator" and is labeled "run".]
- control · Turn-loop invocation: Turn orchestrator → Model + tools [A solid teal right-pointing arrow runs from "Turn orchestrator" to "Model + tools" and is labeled "turn loop".]
- data · Token streaming: Model + tools → Streaming and reattachment region [A solid green routed line leaves "Model + tools," rises and crosses into region 3, and is labeled "stream tokens"; its endpoint is near the live-output side of the region.]
- data · Live-output delivery: Live output → Client stream [The green line labeled "deliver" has a left-pointing arrowhead entering the "Client stream" icon from the direction of "Live output".]

## FAILURE PATHS

## CONSTRAINTS & BOUNDARIES
- Session admission is gated by authentication and workspace handling before scheduler placement. [The only drawn admission path is ordered "Session API" --authenticate--> "Auth + workspace" --place--> "Session scheduler".]
- A scheduled session is placed on a runner host before the runner starts the turn orchestrator. [The drawn order is "Session scheduler" --place session--> "Runner host" --run--> "Turn orchestrator".]
- Model-and-tool work is invoked through the turn orchestrator. [The only edge entering "Model + tools" is the right-pointing edge from "Turn orchestrator" labeled "turn loop".]
- Child sessions have a scoped budget. [Region "7 · Child sessions & propagation" contains both "Spawn scoped child" and the coin-labeled "Scoped child budget".]
- Quota handling is aggregate across tree and workspace usage and includes a human resume decision. [Region "8 · Tree & workspace quotas" contains "Tree + workspace usage," "Aggregate quota gate," and a human icon labeled "User decision to resume".]
- Recovery is expressed in terms of the latest checkpoint. [The delegated recovery process is explicitly labeled "Rehydrate latest checkpoint".]
- Forking is expressed in terms of an earlier checkpoint. [The delegated forking process is explicitly labeled "Fork earlier checkpoint".]

## UNCERTAIN
- The green "stream tokens" edge leaves "Model + tools" and terminates in region 3 near the live-output side.: The routed endpoint does not visibly touch the "Client stream" or "Live output" icon, so its exact destination component cannot be established.
- "Replay from ACK" is shown as a labeled standalone component.: No edge connects it to the client stream or live output, so the replay trigger, source, destination, and ordering are not shown.
- Regions 4 through 9 arrange components from left to right.: There are no visible connecting edges in these regions; spatial order alone does not establish procedure order or standing relationships.
- Region 6 contains "Cancel / interrupt," "Stop stream + abandon calls," and "Resumable checkpoint.": No arrows connect these items, so the picture does not explicitly show a failure path, trigger-to-outcome sequence, or whether cancellation produces the checkpoint.
- Region 5 contains suspension, heartbeat/rescue, and checkpoint rehydration components.: No lines show whether suspension, heartbeat failure, rescue, and rehydration form one ordered recovery flow.
- Region 7 groups child spawning, child budget, and orphan reaping.: No edges show budget assignment, propagation direction, or what condition triggers the orphan reaper.
- Region 8 groups usage, a quota gate, and a user resume decision.: No branch or arrow states the quota threshold, denial outcome, or how the human decision affects resumption.
- Region 9 groups checkpoint forking, shared content, and reachability garbage collection.: No edges specify what content is shared, what owns it, retention duration, or when garbage collection occurs.

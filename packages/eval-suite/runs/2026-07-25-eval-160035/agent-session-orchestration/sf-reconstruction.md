# SF blind system reconstruction

## SYSTEM PURPOSE
Agent-session orchestration across session intake and placement, iterative model/tool execution, live streaming and reattachment, durable state and branching, suspension/recovery, cancellation, child sessions, quotas/audit/metering, and version-aware draining.

## COMPONENTS
- 1 · Session intake & placement: Groups the session-opening, authorization/quota, and placement stages. [Top-left bounded area is labeled “1 · Session intake & placement” and contains “API session open,” “Auth + workspace quotas,” and “Placement scheduler.”]
- API session open: Opens an API session and initiates intake. [Leftmost rounded node labeled “API session open,” with an outgoing arrow to “Auth + workspace quotas.”]
- Auth + workspace quotas: Applies authorization and workspace quota checks before placement. [Node labeled “Auth + workspace quotas” lies between “API session open” and “Placement scheduler,” connected by rightward arrows.]
- Placement scheduler: Schedules placement after intake checks and passes the session into turn execution. [Node labeled “Placement scheduler” receives from “Auth + workspace quotas” and has a rightward arrow to “Assemble model request.”]
- 2 · Turn execution loop: Groups request assembly, model streaming, permitted tool execution, and the repeated turn loop. [Top-center bounded area is labeled “2 · Turn execution loop.”]
- Assemble model request: Builds the request sent to the model. [Node labeled “Assemble model request” receives from “Placement scheduler” and points to “Model call / stream.”]
- Model call / stream: Invokes the model and produces a stream within the turn loop. [Node labeled “Model call / stream” is between “Assemble model request” and “Execute permitted tools.”]
- Execute permitted tools: Executes tools that are permitted during a model turn. [Orange-bordered node labeled “Execute permitted tools” receives a rightward arrow from “Model call / stream”; a solid return line loops from its lower side back to “Assemble model request.”]
- 3 · Streaming & reattach: Groups output fan-out, delivery to a live client stream, and replay/reattachment. [Top-right bounded area is labeled “3 · Streaming & reattach.”]
- Identical output fan-out: Fans out identical output toward streaming consumers. [Node labeled “Identical output fan-out” receives a solid line from the execution area and has a rightward arrow toward “Live client stream.”]
- Live client stream: Represents the live client-facing stream endpoint. [Monitor icon labeled “Live client stream” appears to the right of “Identical output fan-out.”]
- Replay + reattach: Replays output and reconnects a client to the stream. [Node labeled “Replay + reattach” is connected to the live-stream junction by a left-pointing arrow.]
- 4 · Durable state & branching: Groups durable event recording, content-addressed checkpoints, and immutable-history forks. [Middle-left bounded area is labeled “4 · Durable state & branching.”]
- Durable event log: Stores session events durably. [Node labeled “Durable event log” receives a downward solid arrow from a long cross-area line and originates a dashed teal line toward auditing.]
- Content-addressed checkpoint: Stores checkpoint state addressed by content. [Node labeled “Content-addressed checkpoint” receives a rightward solid arrow from the durable-state ingress and is connected by an orange dashed recovery route.]
- Fork / immutable history: Creates a fork while preserving immutable history. [Node labeled “Fork / immutable history” follows “Content-addressed checkpoint” by a rightward solid arrow.]
- 5 · Suspend, resume & recovery: Groups heartbeat monitoring, restoration of the latest snapshot, and idempotent replay. [Middle-center bounded area is labeled “5 · Suspend, resume & recovery.”]
- Heartbeat monitor: Monitors heartbeat status for suspension or recovery handling. [Node labeled “Heartbeat monitor” begins the solid sequence in section 5.]
- Rehydrate latest snapshot: Restores the latest available snapshot. [Node labeled “Rehydrate latest snapshot” follows “Heartbeat monitor” via a rightward arrow.]
- Replay with idempotency key: Replays work using an idempotency key. [Node labeled “Replay with idempotency key” follows “Rehydrate latest snapshot” via a rightward arrow.]
- 6 · Cancellation & safe release: Groups interruption, stopping streams/tools, and creation of a resumable checkpoint. [Middle-right bounded area is labeled “6 · Cancellation & safe release.”]
- Cancel / interrupt: Initiates cancellation or interruption. [Red hexagonal node labeled “Cancel / interrupt” starts the section-6 sequence and also has a red dashed route toward the model-stream stage.]
- Stop stream + tools: Stops active streaming and tool execution after cancellation. [Node labeled “Stop stream + tools” receives a rightward arrow from “Cancel / interrupt.”]
- Resumable checkpoint: Preserves state in a checkpoint from which work can resume. [Green-bordered node labeled “Resumable checkpoint” follows “Stop stream + tools” and receives an additional orange dashed arrow from below.]
- 7 · Child-session tree: Groups parent orchestration, scoped child sessions, and propagation/reaping. [Bottom-left bounded area is labeled “7 · Child-session tree.”]
- Parent orchestrator: Orchestrates the child-session tree. [Node labeled “Parent orchestrator” starts the section-7 solid sequence and receives a purple dashed arrow from above/right.]
- Scoped child sessions: Runs child sessions with an explicit scope. [Node labeled “Scoped child sessions” follows “Parent orchestrator” via a rightward arrow.]
- Propagation + reaper: Handles propagation and reaping for child sessions. [Node labeled “Propagation + reaper” follows “Scoped child sessions” via a rightward arrow.]
- 8 · Quotas, audit & metering: Groups tree/workspace budgets, user pausing, and audit/usage/cost recording. [Bottom-center bounded area is labeled “8 · Quotas, audit & metering.”]
- Tree + workspace budgets: Applies budget limits at tree and workspace levels. [Node labeled “Tree + workspace budgets” begins the section-8 sequence and receives an orange dashed arrow from above.]
- Pause for user...: Pauses execution for the user. [Node visibly labeled “Pause for user...” follows “Tree + workspace budgets.”]
- Audit, usage + cost: Records audit information, usage, and cost. [Node labeled “Audit, usage + cost” follows “Pause for user...” and receives a dashed teal arrow from the durable event-log route.]
- 9 · Version-aware draining: Groups draining an old-version host and transitioning to a safe replacement. [Bottom-right bounded area is labeled “9 · Version-aware draining.”]
- Old-version host: Represents a host running an old version that must be drained. [Gray node labeled “Old-version host” begins the section-9 sequence.]
- Stop placements + drain: Stops new placements and drains the old-version host. [Node labeled “Stop placements + drain” follows “Old-version host” via a rightward arrow.]
- Safe replacement: Provides the safe replacement after draining. [Green-bordered node labeled “Safe replacement” follows “Stop placements + drain” via a rightward arrow.]

## FLOWS
- control · Session intake and placement: API session open → Auth + workspace quotas → Placement scheduler → Assemble model request [Continuous rightward solid arrows connect these four nodes in order.]
- control · Turn execution: Assemble model request → Model call / stream → Execute permitted tools [Rightward solid arrows connect the three nodes in section 2.]
- control · Tool-to-model turn loop: Execute permitted tools → Assemble model request [A solid gray line leaves the lower side of “Execute permitted tools,” runs left, and terminates with an upward arrow at “Assemble model request.”]
- data · Execution output fan-out: Turn execution output → Identical output fan-out → Live client stream [A solid gray route rises from the execution area and enters “Identical output fan-out”; a rightward arrow then points toward the monitor labeled “Live client stream.”]
- data · Replay and client reattachment: Replay + reattach → Live client stream junction [The connection beside “Replay + reattach” has a left-pointing arrow toward the junction adjacent to “Live client stream.”]
- data · Durable-state recording and branching: Streaming/cross-area solid route → Durable event log → Content-addressed checkpoint → Fork / immutable history [Long solid lines descend into section 4; one arrow enters “Durable event log,” another enters “Content-addressed checkpoint,” and a rightward sequence continues to “Fork / immutable history.”]
- control · Suspend, resume, and recovery sequence: Heartbeat monitor → Rehydrate latest snapshot → Replay with idempotency key [Solid rightward arrows connect the three section-5 nodes in order.]
- control · Recovery/checkpoint dashed route: Dashed orange route associated with the recovery area → Content-addressed checkpoint [An orange dashed line runs left from the section-5 vicinity and terminates with an upward arrow at “Content-addressed checkpoint.”]
- failure · Cancellation propagation to active model stream: Cancel / interrupt → Dashed red cancellation route → Model call / stream [A red dashed line rises from “Cancel / interrupt,” runs left, and terminates with an upward red arrow at “Model call / stream.”]
- control · Safe cancellation release: Cancel / interrupt → Stop stream + tools → Resumable checkpoint [Solid rightward arrows connect all three nodes in section 6.]
- control · Child-session lifecycle: Parent orchestrator → Scoped child sessions → Propagation + reaper [Solid rightward arrows connect the three nodes in section 7.]
- control · Tool execution to child-session orchestration: Execute permitted tools → Parent orchestrator [A purple dashed route runs from the tool-execution vicinity downward and left, terminating with an arrow at “Parent orchestrator.”]
- control · Quota, pause, and metering sequence: Tree + workspace budgets → Pause for user... → Audit, usage + cost [Solid rightward arrows connect the three nodes in section 8.]
- control · Placement-to-budget linkage: Placement scheduler → Tree + workspace budgets [An orange dashed route begins beneath “Placement scheduler,” traverses downward, and terminates with a downward arrow at “Tree + workspace budgets.”]
- data · Durable event metering: Durable event log → Audit, usage + cost [A teal dashed route leaves beneath “Durable event log,” runs across the lower diagram, and terminates with a downward arrow at “Audit, usage + cost.”]
- control · Version-aware drain and replacement: Old-version host → Stop placements + drain → Safe replacement [Solid rightward arrows connect the three nodes in section 9.]
- control · Drain checkpoint preservation: Stop placements + drain → Resumable checkpoint [An orange dashed route rises from “Stop placements + drain,” runs right and upward, and terminates with an upward arrow at “Resumable checkpoint.”]

## FAILURE PATHS
- Cancel / interrupt: Cancel / interrupt → Stop stream + tools → Resumable checkpoint → The stream and tools are stopped, and a resumable checkpoint is produced. [Section 6 explicitly shows this ordered solid-arrow sequence; a red dashed route also propagates the interruption to “Model call / stream.”]
- Heartbeat condition requiring suspend/resume or recovery: Heartbeat monitor → Rehydrate latest snapshot → Replay with idempotency key → The latest snapshot is rehydrated and work is replayed with an idempotency key. [Section title is “Suspend, resume & recovery,” and its three nodes are connected in this order.]
- Old-version host: Old-version host → Stop placements + drain → Safe replacement → Placements are stopped, the host is drained, and a safe replacement is reached; a resumable checkpoint is also targeted by a dashed route. [Section 9 shows the solid sequence and an orange dashed line from “Stop placements + drain” to “Resumable checkpoint.”]

## CONSTRAINTS & BOUNDARIES
- Authorization and workspace quotas precede placement. [“Auth + workspace quotas” is ordered before “Placement scheduler.”]
- Only permitted tools are executed. [The tool node is explicitly labeled “Execute permitted tools.”]
- Streaming uses identical output fan-out. [The streaming component is explicitly labeled “Identical output fan-out.”]
- Checkpoint state is content-addressed. [The durable-state component is labeled “Content-addressed checkpoint.”]
- Branching preserves immutable history. [The branching component is labeled “Fork / immutable history.”]
- Recovery replay uses an idempotency key. [The recovery endpoint is labeled “Replay with idempotency key.”]
- Cancellation stops both the stream and tools before creating a resumable checkpoint. [Section 6 orders “Cancel / interrupt” → “Stop stream + tools” → “Resumable checkpoint.”]
- Child sessions are scoped. [The child-session component is labeled “Scoped child sessions.”]
- Budgets apply at both tree and workspace levels. [The quota component is labeled “Tree + workspace budgets.”]
- Audit includes usage and cost. [The metering component is labeled “Audit, usage + cost.”]
- Version draining stops placements before safe replacement. [Section 9 orders “Old-version host” → “Stop placements + drain” → “Safe replacement.”]

## UNCERTAIN
- A solid cross-area route enters “Identical output fan-out” from the turn-execution area.: The line visually rises near “Execute permitted tools,” but its exact source attachment is not clearly distinguishable from the nearby model/tool connection.
- Two long solid gray routes feed the durable-state area, one ending at “Durable event log” and another at “Content-addressed checkpoint.”: Their upper attachment points overlap the streaming/fan-out/reattach routing, so exact source ownership is not unambiguous.
- The orange dashed recovery route terminates with an arrow into “Content-addressed checkpoint.”: Its opposite endpoint is drawn around the recovery sequence without a clearly visible arrow or direct node attachment, so the originating recovery component cannot be assigned confidently.
- The purple dashed route targets “Parent orchestrator” and passes beneath the turn-execution area.: It appears associated with “Execute permitted tools,” but the exact initial attachment is partially overlapped by the orange dashed placement/budget route.
- The orange dashed route targets “Tree + workspace budgets.”: It begins beneath “Placement scheduler” but shares/overlaps routing with other dashed lines, making the precise source attachment slightly unclear.
- The live-stream and replay lines meet near a small bidirectional-looking junction.: The visible left-pointing arrow establishes replay toward the live-stream side, but no separate arrow clearly establishes the reverse direction.

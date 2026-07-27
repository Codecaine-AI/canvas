# SF blind system reconstruction

## SYSTEM PURPOSE
A monorepo build system that detects changed scope, constructs and schedules an ordered task graph, executes tasks in isolated elastic workers, reuses content-addressed cached results, verifies provenance, and returns trusted outputs/logs or failure logs.

## COMPONENTS
- 2026-07-24-eval-154843 · monorepo-build-cache: Names the depicted system. [The top header reads “2026-07-24-eval-154843 · monorepo-build-cache”.]
- 1 · Change scope & build graph: Contains change detection, affected-package selection, dependent expansion, and task ordering. [A blue section is titled “1 · Change scope & build graph” and encloses Developer / CI, Change detector, Affected packages, and Expand dependents + order tasks.]
- Developer / CI: Supplies modifications to the change detector. [A person icon labeled “Developer / CI” is connected toward “Change detector” by a line labeled “modified”.]
- Change detector: Detects the changed scope and maps it to affected packages. [The box “Change detector” receives “modified” from Developer / CI and has a blue outgoing path labeled “maps to” leading to “Affected packages”.]
- Affected packages: Represents packages affected by detected modifications. [A blue box labeled “Affected packages” follows the “maps to” path from Change detector.]
- Expand dependents + order tasks: Expands affected work to dependent packages and orders the resulting tasks. [A blue box explicitly reads “Expand dependents + order tasks”; it follows Affected packages and emits an orange path labeled “ordered DAG”.]
- 2 · Scheduling & execution: Schedules ready tasks, scales workers, prepares isolated workspaces, executes tasks, and checks status. [An orange section titled “2 · Scheduling & execution” encloses Scheduler ready tasks, Elastic worker pool, Isolated workspace, Execute task, and Succeeded?.]
- Scheduler ready tasks: Receives the ordered DAG and schedules tasks that are ready. [The orange path labeled “ordered DAG” enters the box “Scheduler ready tasks”.]
- Elastic worker pool: Receives assigned ready tasks, scales out, and prepares task workspaces. [The “Scheduler ready tasks” box connects to “Elastic worker pool” through “assign ready tasks”; a path labeled “scale out” leads toward a monitoring-style icon, and a path labeled “prepare” leads toward Isolated workspace.]
- Scale/monitor icon: Visually represents worker-pool scaling behavior. [An orange waveform icon appears to the right of Elastic worker pool on a connector labeled “scale out”.]
- Isolated workspace: Provides an isolated environment for a task run and initiates the pre-run cache-key path. [The box “Isolated workspace” is reached by the “prepare” path, connects to Execute task through “isolated run”, and has a teal path labeled “before run” leading to Content key.]
- Execute task: Runs a task when an isolated run is required, including after a cache miss. [The box “Execute task” receives “isolated run” from Isolated workspace and an orange “miss” path from the cache decision; it emits “status” toward Succeeded?.]
- Succeeded?: Tests the execution status for success or failure. [A yellow decision box labeled “Succeeded?” receives a connector labeled “status” from Execute task; its visibly labeled “no” branch goes to Task failed.]
- Independent branches run concurrently: States the concurrency behavior for independent graph branches. [Text inside the scheduling section reads “Independent branches run concurrently”.]
- 3 · Content-addressed cache: Computes content keys, looks up remote cached results, restores hits, stores immutable artifacts, and publishes successful cache entries. [A teal section titled “3 · Content-addressed cache” encloses Content key, Remote cache, Key found?, Restore matching result, Immutable artifact store, Publish cache entry (success only), key-input text, and a key icon.]
- Content key: Represents the content-addressed lookup key computed before a run. [A teal box labeled “Content key” is reached from Isolated workspace by the path labeled “before run” and connects to Remote cache through “lookup”.]
- Key inputs: Defines the inputs used for a content key. [A note labeled “**Key inputs**” lists “sources + command”, “declared environment”, “toolchain version”, and “dependency outputs”.]
- Remote cache: Looks up a content key for a matching cached result. [The box “Remote cache” receives a connector labeled “lookup” from Content key and connects through “match?” to Key found?.]
- Key found?: Branches cache processing into hit or miss behavior. [A yellow decision box labeled “Key found?” has a “hit” path to Restore matching result and a “miss” path to Execute task.]
- Restore matching result: Restores the result associated with a cache hit and sends it for provenance verification. [A green box labeled “Restore matching result” follows the “hit” branch and has a purple outgoing arrow entering Verify provenance.]
- Immutable artifact store: Stores immutable artifacts or outputs associated with cache publication. [A teal box labeled “Immutable artifact store” appears in the cache section on a lower path whose nearby connector text includes “immutable ou…”.]
- Publish cache entry (success only): Publishes a cache entry only for successful work. [A green box explicitly reads “Publish cache entry (success only)”.]
- Atomic convergence key: Represents atomic convergence when multiple publishers use the same key. [A key icon is accompanied by the text “Same key converges atomically”; a nearby connector label reads “atomic”.]
- 4 · Trust, publication & results: Verifies provenance, marks material trusted, exposes outputs/logs, applies failure policy, and returns the build result. [A purple section titled “4 · Trust, publication & results” encloses Verify provenance, Trusted for..., Outputs + logs, Task failed, Failure policy, and Build result returned.]
- Verify provenance: Verifies provenance for a restored result before it is trusted. [A shield/check icon labeled “Verify provenance” receives the purple arrow from Restore matching result and connects through “attestation” to Trusted for....]
- Trusted for...: Represents a trust decision or trust designation before outputs and logs are accepted. [A yellow box visibly reads “Trusted for...” and receives the connector labeled “attestation”; its outgoing connector to Outputs + logs is labeled “trusted”.]
- Outputs + logs: Holds trusted outputs and logs and participates in returning the build result. [A purple box labeled “Outputs + logs” follows the “trusted” connector and has a green downward path labeled “return” toward Build result returned.]
- Task failed: Represents the failed-task state. [A red octagonal shape labeled “Task failed” receives the red branch labeled “no” from Succeeded?.]
- Failure policy: Never caches failures, blocks dependent tasks, and returns logs to the requester. [A red box reads “**Failure policy** - never cache failures - block dependents - return logs to requester”.]
- Build result returned: Represents the final result returned to the requester. [A green rounded shape labeled “Build result returned” receives a success-side path labeled “return” and a failure-side path labeled “logs”.]

## FLOWS
- data · Change-to-ordered-DAG flow: Developer / CI supplies “modified” information to Change detector. → Change detector “maps to” Affected packages. → Affected packages feed Expand dependents + order tasks. → Expand dependents + order tasks emits an “ordered DAG”. → The ordered DAG enters Scheduler ready tasks. [The blue and orange arrows visibly connect Developer / CI → Change detector → Affected packages → Expand dependents + order tasks → Scheduler ready tasks, with labels “modified”, “maps to”, and “ordered DAG”.]
- control · Scheduling and worker preparation: Scheduler ready tasks sends “assign ready tasks” to Elastic worker pool. → Elastic worker pool can “scale out”. → Elastic worker pool sends “prepare” toward Isolated workspace. → Independent branches run concurrently. [The orange connectors are labeled “assign ready tasks”, “scale out”, and “prepare”; adjacent text states “Independent branches run concurrently”.]
- control · Pre-run cache lookup: Before a run, Isolated workspace initiates the cache path. → A Content key is formed from the stated key inputs. → Content key performs a “lookup” against Remote cache. → Remote cache asks “match?” at Key found?. [A teal path labeled “before run” goes from Isolated workspace to Content key; Content key → Remote cache is labeled “lookup”, and Remote cache → Key found? is labeled “match?”.]
- data · Cache-hit restore and trust flow: Key found? takes the “hit” branch. → Restore matching result restores the matching result. → The restored result is sent to Verify provenance. → Verify provenance supplies an “attestation” to Trusted for.... → Trusted for... emits a “trusted” result to Outputs + logs. → Outputs + logs follows “return” to Build result returned. [The hit branch visibly connects Key found? → Restore matching result; a purple arrow continues to Verify provenance, then connectors labeled “attestation” and “trusted” lead to Outputs + logs, followed by “return” toward Build result returned.]
- control · Cache-miss execution flow: Key found? takes the “miss” branch. → The miss branch enters Execute task. → Execute task sends “status” to Succeeded?. [An orange path labeled “miss” runs from the cache decision area upward into Execute task; Execute task connects to Succeeded? with the label “status”.]
- control · Isolated task execution: Elastic worker pool prepares Isolated workspace. → Isolated workspace sends an “isolated run” to Execute task. → Execute task reports “status” to Succeeded?. [The orange “prepare” path reaches Isolated workspace; a connector labeled “isolated run” leads to Execute task, followed by “status” into Succeeded?.]
- data · Successful cache publication: Immutable artifacts or outputs are associated with Immutable artifact store. → Publish cache entry is limited to “success only”. → The publication path is marked “atomic” near the key icon. → The same key converges atomically. [The lower cache area contains “Immutable artifact store”, “Publish cache entry (success only)”, a partially visible connector label “immutable ou…”, a connector labeled “atomic”, a key icon, and the statement “Same key converges atomically”.]
- failure · Failed execution handling: Execute task reports “status” to Succeeded?. → The “no” branch leads to Task failed. → Task failed feeds the Failure policy. → Failures are never cached. → Dependent tasks are blocked. → Logs are returned to the requester. → The “logs” path reaches Build result returned. [A red path labeled “no” runs from Succeeded? to Task failed; the Failure policy explicitly states “never cache failures”, “block dependents”, and “return logs to requester”, and a connector labeled “logs” leads toward Build result returned.]

## FAILURE PATHS
- The Succeeded? decision evaluates to “no” after Execute task reports status.: Execute task → status → Succeeded? → no → Task failed → Failure policy → logs → Build result returned → The failure is never cached, dependent tasks are blocked, and logs are returned to the requester as the returned build result. [The red branch labeled “no” terminates at Task failed; the policy box explicitly says “never cache failures”, “block dependents”, and “return logs to requester”; the final connector is labeled “logs”.]

## CONSTRAINTS & BOUNDARIES
- Tasks are derived by expanding dependents and ordering tasks into an ordered DAG. [The blue box reads “Expand dependents + order tasks”, and its outgoing path is labeled “ordered DAG”.]
- Only ready tasks are assigned by the scheduler. [The scheduler box reads “Scheduler ready tasks”, and its outgoing connector reads “assign ready tasks”.]
- Independent branches run concurrently. [The scheduling section explicitly states “Independent branches run concurrently”.]
- Task execution uses an isolated workspace. [A box is labeled “Isolated workspace”, and the path to Execute task is labeled “isolated run”.]
- Cache lookup occurs before a run. [The teal connector from Isolated workspace into the cache is labeled “before run”.]
- Content keys include sources + command, declared environment, toolchain version, and dependency outputs. [The “**Key inputs**” note lists exactly those four inputs.]
- Cache entries are published on success only. [The publication box is labeled “Publish cache entry (success only)”.]
- Failures are never cached. [The Failure policy explicitly says “never cache failures”.]
- A task failure blocks dependent tasks. [The Failure policy explicitly says “block dependents”.]
- Failure logs are returned to the requester. [The Failure policy explicitly says “return logs to requester”.]
- The artifact store is immutable. [The cache component is explicitly labeled “Immutable artifact store”.]
- Identical cache keys converge atomically. [The cache section states “Same key converges atomically” beside a key icon and an “atomic” connector label.]
- Cached results pass through provenance verification and an attestation/trust step before becoming trusted outputs and logs. [Restore matching result points to Verify provenance, followed by connectors labeled “attestation” and “trusted” before Outputs + logs.]
- The worker pool is elastic and can scale out. [The box is labeled “Elastic worker pool”, and its right-side connector is labeled “scale out”.]

## UNCERTAIN
- The yellow trust box visibly reads “Trusted for...”.: The remainder of the label is not shown, so the exact trust target or condition cannot be reconstructed.
- Succeeded? has a clearly visible “no” failure branch.: No clearly labeled “yes” branch or complete successful-execution route is visible.
- The cache section shows Immutable artifact store, Publish cache entry (success only), and atomic convergence.: Some lower connector labels are partially obscured, and a complete visible source-to-destination path from successful Execute task into artifact storage/publication cannot be established.
- A connector near Immutable artifact store contains the partially readable text “immutable ou…”.: The full label and exact arrow direction are not completely readable.
- A connector near Publish cache entry and the key icon is labeled “atomic”.: The precise endpoint represented by the key icon is not named.
- The scale-out path ends at a waveform-style icon.: The icon has no textual component name, so it may represent monitoring, autoscaling, or capacity, but only “scale out” is explicit.

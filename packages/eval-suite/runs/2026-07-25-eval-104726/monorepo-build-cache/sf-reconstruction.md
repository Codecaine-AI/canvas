# SF blind system reconstruction

## SYSTEM PURPOSE
A monorepo build-and-cache pipeline that detects changes, constructs and schedules a dependency-aware build graph, computes content keys, restores valid remote-cache results when available, otherwise executes tasks in isolation, uploads immutable outputs, atomically publishes a single valid cache entry, and returns outputs or failure logs.

## COMPONENTS
- Monorepo build & cache: Contains the complete depicted build, scheduling, execution, caching, trust, and result workflow. [The outer diagram is labeled “Monorepo build & cache” and encloses all six numbered sections plus the key-composition note.]
- 1 · Request & impact: Accepts a developer or CI build request and detects modified files. [The blue section labeled “1 · Request & impact” contains “Developer / CI request” and “Detect modified files,” connected by a downward arrow labeled “starts build.”]
- Developer / CI request: Initiates the build. [A rounded blue node labeled “Developer / CI request” points toward “Detect modified files” through the label “starts build.”]
- Detect modified files: Determines which files have changed and supplies them to build-graph mapping. [A process box labeled “Detect modified files” has an outgoing gray path labeled “modified files” leading to “Map to affected packages.”]
- 2 · Build graph: Maps modified files to affected packages and expands the graph with required dependents. [The purple section labeled “2 · Build graph” contains “Map to affected packages” and “Expand required dependents.”]
- Map to affected packages: Maps the modified-file set to packages affected by those changes. [The box receives the path labeled “modified files” and sends a downward path labeled “seed packages.”]
- Expand required dependents: Expands the seed-package set to include required dependent packages or tasks. [The box receives “seed packages” and emits a purple path labeled “expanded graph” toward scheduling.]
- 3 · Scheduling: Orders tasks by dependency, identifies ready tasks, and dispatches them to an elastic worker pool. [The orange section labeled “3 · Scheduling” contains “Order tasks by dependency,” “Schedule ready tasks,” and “Elastic worker pool,” linked by “dependency order” and “ready tasks.”]
- Order tasks by dependency: Orders the expanded build graph according to dependencies. [The highlighted purple box receives the arrow labeled “expanded graph” and points downward through “dependency order.”]
- Schedule ready tasks: Selects tasks that are ready for execution after dependency ordering. [The box receives “dependency order” and emits a downward path labeled “ready tasks.”]
- Elastic worker pool: Hosts or dispatches ready tasks for per-task cache lookup and possible execution. [A two-worker icon is labeled “Elastic worker pool”; an orange line leaving the scheduling area is labeled “dispatch each task” and leads to content-key calculation.]
- 4 · Key & cache lookup: Calculates a task content key, queries the remote cache, restores a matching result on a valid hit, or routes a miss to execution. [The cyan section labeled “4 · Key & cache lookup” contains “Calculate content key,” “Remote cache hit?,” and “Restore matching result.”]
- Calculate content key: Computes the key used for remote-cache lookup. [The box receives the per-task dispatch path and points downward through a connector labeled “key” to “Remote cache hit?”]
- Remote cache hit?: Determines whether a matching remote-cache result exists. [A decision-like box is labeled “Remote cache hit?”; one outgoing orange path is explicitly labeled “miss,” while another magenta path goes toward cache-provenance verification.]
- Restore matching result: Restores the matching cached result after the cache-result path is accepted. [A green box labeled “Restore matching result” receives a green arrow from the trust/provenance side of the diagram.]
- 5 · Execute & publish: Runs cache-miss tasks in an isolated workspace, tests success, and uploads immutable outputs on success. [The green section labeled “5 · Execute & publish” contains “Run in isolated workspace,” “Task succeeds?,” and “Upload immutable outputs.”]
- Run in isolated workspace: Executes a task that was not restored from cache. [The box is reached by the orange path labeled “miss” and points downward through a connector labeled “execute.”]
- Task succeeds?: Branches execution according to task success or failure. [The decision-like box is labeled “Task succeeds?”; its green downward branch is labeled “yes,” while a red dashed branch goes to “Outputs or failure logs.”]
- Upload immutable outputs: Uploads outputs from a successful task for publication. [The box receives the “yes” branch from “Task succeeds?” and emits a teal path toward “Atomic publish / converge.”]
- 6 · Trust, contention & result: Verifies cache provenance, converges publication atomically, and produces outputs or failure logs. [The pink section labeled “6 · Trust, contention & result” contains “Verify cache provenance,” “Atomic publish / converge,” and “Outputs or failure logs.”]
- Verify cache provenance: Validates the provenance of a candidate remote-cache result before restoration. [The highlighted pink box labeled “Verify cache provenance” receives the magenta path originating at “Remote cache hit?”; a green return path leads toward “Restore matching result.”]
- Atomic publish / converge: Atomically publishes or converges uploaded outputs into one cache result. [The box labeled “Atomic publish / converge” receives the teal path from “Upload immutable outputs” and points downward through “single valid cache entry.”]
- Outputs or failure logs: Represents the final result surface for successful outputs or failed-task logs. [The blue box labeled “Outputs or failure logs” receives the normal publication path and a red dashed failure path.]
- Key composition: Defines the listed inputs used to compose a content key. [A note labeled “Key composition” lists “Content key inputs,” followed by “sources + dependency outputs,” “declared environment,” and “toolchain version + command.”]

## FLOWS
- control · Request and impact discovery: Developer / CI request → starts build → Detect modified files [A blue downward arrow runs from “Developer / CI request” to “Detect modified files,” with the connector label “starts build.”]
- data · Modified files to affected-package graph: Detect modified files → modified files → Map to affected packages → seed packages → Expand required dependents → expanded graph [The gray path from file detection is labeled “modified files”; mapping points downward through “seed packages”; graph expansion emits a purple path labeled “expanded graph.”]
- control · Dependency-aware scheduling: expanded graph → Order tasks by dependency → dependency order → Schedule ready tasks → ready tasks → Elastic worker pool [The purple expanded-graph arrow enters “Order tasks by dependency”; gray arrows then pass through “dependency order” and “ready tasks” to the worker-pool icon.]
- control · Per-task dispatch and cache lookup: Elastic worker pool → dispatch each task → Calculate content key → key → Remote cache hit? [An orange path from the worker-pool area is labeled “dispatch each task” and enters “Calculate content key”; a downward connector labeled “key” reaches “Remote cache hit?”]
- data · Cache-hit validation and restore: Remote cache hit? → Verify cache provenance → Restore matching result [A magenta path runs from “Remote cache hit?” to “Verify cache provenance,” and a green routed arrow returns from the trust side into “Restore matching result.”]
- control · Cache-miss execution: Remote cache hit? → miss → Run in isolated workspace → execute → Task succeeds? [The orange branch from “Remote cache hit?” is labeled “miss” and enters “Run in isolated workspace”; a downward gray connector labeled “execute” reaches “Task succeeds?”]
- data · Successful execution and publication: Task succeeds? → yes → Upload immutable outputs → Atomic publish / converge → single valid cache entry → Outputs or failure logs [The green “yes” branch reaches “Upload immutable outputs”; a teal path enters “Atomic publish / converge,” followed by a downward connector labeled “single valid cache entry” into “Outputs or failure logs.”]
- failure · Task execution failure reporting: Task succeeds? → red dashed failure path → Outputs or failure logs [A red dashed arrow leaves the right side of “Task succeeds?” and terminates at “Outputs or failure logs.”]

## FAILURE PATHS
- The executed task does not satisfy the “Task succeeds?” decision.: Task succeeds? → red dashed branch → Outputs or failure logs → Failure logs are returned through the final result component. [The only explicitly failure-styled route is the red dashed arrow from “Task succeeds?” to the box labeled “Outputs or failure logs.”]

## CONSTRAINTS & BOUNDARIES
- Tasks are ordered by dependency before ready tasks are scheduled. [Within “3 · Scheduling,” “Order tasks by dependency” precedes “Schedule ready tasks,” connected by the label “dependency order.”]
- Only ready tasks are sent to the elastic worker pool. [The connector from “Schedule ready tasks” to “Elastic worker pool” is labeled “ready tasks.”]
- Each dispatched task receives its own content-key and cache-lookup processing. [The line from scheduling to “Calculate content key” is labeled “dispatch each task.”]
- Cache keys incorporate sources plus dependency outputs, the declared environment, and the toolchain version plus command. [The “Key composition” note explicitly lists “sources + dependency outputs,” “declared environment,” and “toolchain version + command” under “Content key inputs.”]
- Cache provenance is verified before the depicted restoration path returns a matching result. [The cache-hit-side magenta path enters “Verify cache provenance,” and the green routed path then terminates at “Restore matching result.”]
- Cache misses execute in an isolated workspace. [The branch labeled “miss” enters the box “Run in isolated workspace.”]
- Outputs are uploaded only on the explicitly labeled successful branch. [The only direct path into “Upload immutable outputs” is the green branch labeled “yes” from “Task succeeds?”]
- Uploaded outputs are immutable. [The successful output step is explicitly labeled “Upload immutable outputs.”]
- Publication is atomic or convergent and produces a single valid cache entry. [The publication box is labeled “Atomic publish / converge,” and its outgoing connector is labeled “single valid cache entry.”]
- Execution capacity is represented as elastic. [The scheduling target is explicitly labeled “Elastic worker pool.”]

## UNCERTAIN
- The magenta branch from “Remote cache hit?” to “Verify cache provenance” has no readable branch label.: Its position and destination suggest the cache-hit branch, but the diagram does not explicitly label it “hit” or state what happens if provenance verification fails.
- A green routed line leads from the trust/provenance side toward “Restore matching result.”: The line visually supports restoration after verification, but it carries no readable connector label such as “valid” or “verified.”
- The final box is labeled “Outputs or failure logs.”: The image does not specify the consumer of those outputs/logs or whether successful cache restores and newly published outputs are presented identically.
- “Remote cache hit?” and “Task succeeds?” are drawn as rectangular decision-like boxes rather than conventional diamond symbols.: Their question labels and branching imply decisions, but the image does not define formal decision-node semantics.
- The diagram uses “Expand required dependents.”: It does not clarify whether “dependents” means downstream consumers, prerequisites, or another repository-specific graph relation beyond the visible wording.

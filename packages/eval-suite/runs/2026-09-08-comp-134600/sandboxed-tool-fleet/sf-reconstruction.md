# SF blind system reconstruction

## SYSTEM PURPOSE
A sandboxed tool fleet that admits agents under tenant and runtime quotas, allocates warm or newly provisioned environments through fixed-term leases, executes tools with resource and network isolation, destroys reclaimed environments instead of reusing them, and supervises fleet capacity and unhealthy hosts.

## COMPONENTS
- Agent: Requests an environment using an image and class. [Agent icon in region “1 · Placement service — admission & allocation” connects toward “Tenant quota available?” on an edge labeled “Image + class.”]
- Tenant quota available?: Admission decision for tenant capacity. [Decision diamond labeled “Tenant quota available?” in the placement region.]
- Fair tenant wait queue: Holds requests when either admission limit is exceeded and supports fair waiting. [Process labeled “Fair tenant wait queue” is connected vertically to the tenant-quota decision by an edge labeled “Either limit exceeded”; the adjacent note says fair waits preserve other tenants' reserved capacity.]
- Compatible warm instance?: Determines whether an already-warm compatible environment can satisfy an admitted request. [Decision diamond labeled “Compatible warm instance?” follows the “Yes” outcome from the tenant-quota decision.]
- Select healthy host with capacity: Chooses a healthy host with available capacity after a warm-instance miss. [Process labeled “Select healthy host with capacity” is reached from “Compatible warm instance?” by the branch labeled “Miss.”]
- Provision cold environment / Wait for boot: Creates a cold environment and waits for it to finish booting. [Process labeled “Provision cold environment / Wait for boot” follows host selection.]
- Claim & return lease: Claims an environment and returns its lease to the requester. [Process labeled “Claim & return lease” is reached directly by “Hit · return immediately” or from cold provisioning by “Boot ready.”]
- Provisioning: Represents an environment being provisioned. [First lifecycle process in region “2 · Environment lifecycle — no tenant reuse,” labeled “Provisioning.”]
- Ready · warm pool: Holds a booted environment ready for claim in the warm pool. [Lifecycle process labeled “Ready · warm pool” follows “Provisioning” on an edge labeled “Boot OK.”]
- Leased: Represents an environment actively held under a lease. [Lifecycle process labeled “Leased” follows the warm pool on an edge labeled “Claim.”]
- Idle: Represents a lease-ended environment awaiting further lifecycle action. [Lifecycle process labeled “Idle” follows “Leased” on an edge labeled “End.”]
- Draining · no new leases / Live work continues: Prevents new leases while allowing existing live work to continue. [Lifecycle process explicitly labeled “Draining · no new leases / Live work continues.”]
- Destroyed: Represents the terminal destroyed state for drained or reclaimed environments. [Lifecycle process labeled “Destroyed” receives the “No lease” path from draining and the red “Destroy · never repool” path from the reclaimer.]
- Reclaimer · expired renewal / max age: Reclaims an environment when renewal expires or maximum age is reached. [Process labeled “Reclaimer · expired renewal / max age” is reached by a red edge from “Leased” labeled “Renewals stop.”]
- Image release · retire older instances: Marks older instances for retirement when an image is released. [Process labeled “Image release · retire older instances” connects upward to draining on a dashed edge labeled “Mark.”]
- Leased agent: Invokes tools from within a lease and receives a capped output stream. [Agent icon labeled “Leased agent” in region “3 · Within a lease — isolated tool execution,” connected bidirectionally to the tool-running process by “Call / capped output stream.”]
- Run tool · timeout / memory / CPU / network limits: Executes a tool subject to timeout, memory, CPU, and network limits. [Process explicitly labeled “Run tool · timeout / memory / CPU / network limits.”]
- Egress proxy · allowlist only: Mediates outbound traffic and permits only allowlisted egress. [Process labeled “Egress proxy · allowlist only” receives the tool runner's “All egress” edge.]
- Allowlisted destinations: Represents the destinations that outbound traffic is permitted to reach. [Process labeled “Allowlisted destinations” follows the egress proxy on an edge labeled “Allowed only.”]
- Artifact store · session key: Receives durable files associated with a session key. [Process labeled “Artifact store · session key” receives a downward path from tool execution labeled “Durable files.”]
- Kill call · TIMEOUT / Not a tool error: Terminates a call whose deadline is exceeded and classifies the result as TIMEOUT rather than a tool error. [Process labeled “Kill call · TIMEOUT / Not a tool error” is reached by a red edge from tool execution labeled “Deadline exceeded.”]
- Host capacity / pool depth / demand: Provides capacity, warm-pool depth, and demand signals for supervision. [Process labeled “Host capacity / pool depth / demand” feeds the supervisor through an edge labeled “Observe.”]
- Warm-pool supervisor: Observes fleet signals and initiates scaling of pre-booted supply. [Process labeled “Warm-pool supervisor” follows the observed capacity/pool-depth/demand signals and sends a “Scale” edge.]
- Adjust pre-booted supply: Changes the amount of pre-booted environment supply. [Process labeled “Adjust pre-booted supply” receives the supervisor's edge labeled “Scale.”]
- Repeated boot failures: Represents the failure signal used to identify a host for quarantine. [Process labeled “Repeated boot failures” begins a red path labeled “Threshold.”]
- Quarantine host · exclude from placement: Quarantines a host and excludes it from future placement. [Process labeled “Quarantine host · exclude from placement” receives the red “Threshold” path from repeated boot failures.]
- Operations monitor: Monitors boot latency, lease reclamations, tool timeouts, and escape-attempt signals. [Yellow note titled “Operations monitor” lists “Boot latency,” “Lease reclamations,” “Tool timeouts,” and “Escape-attempt signals.”]

## FLOWS
- control · Placement admission: Agent submits “Image + class.” → Evaluate “Tenant quota available?” → On “Yes,” evaluate “Compatible warm instance?” [Solid left-to-right arrows connect Agent to the tenant-quota diamond with “Image + class,” then the “Yes” branch to the compatible-warm-instance diamond.]
- control · Warm-instance hit: Evaluate “Compatible warm instance?” → On “Hit · return immediately,” proceed to “Claim & return lease.” [A solid rightward edge from the warm-instance decision to “Claim & return lease” is labeled “Hit · return immediately.”]
- control · Warm-instance miss and cold provisioning: Evaluate “Compatible warm instance?” → On “Miss,” select a healthy host with capacity. → Provision a cold environment and wait for boot. → On “Boot ready,” claim and return the lease. [The “Miss” branch routes to “Select healthy host with capacity,” then to “Provision cold environment / Wait for boot,” then by “Boot ready” to “Claim & return lease.”]
- control · Quota wait and retry: Evaluate “Tenant quota available?” → When “Either limit exceeded,” route to “Fair tenant wait queue.” → The vertical connection also points back toward the tenant-quota decision. [The quota diamond and wait queue share a vertical line labeled “Either limit exceeded,” with a downward arrowhead toward the queue and an upward arrowhead toward the decision.]
- control · Normal environment lifecycle: Provisioning. → On “Boot OK,” enter “Ready · warm pool.” → On “Claim,” enter “Leased.” → On “End,” enter “Idle.” → On “Retire,” enter “Draining · no new leases / Live work continues.” → On “No lease,” enter “Destroyed.” [Region 2 shows a solid left-to-right sequence with edge labels “Boot OK,” “Claim,” “End,” “Retire,” and “No lease.”]
- control · Retire active lease after image retirement: An image is retired while an active lease exists. → Finish the active lease. → Route the instance to “Draining · no new leases / Live work continues.” [A dashed path above the lifecycle is labeled “Image retired · finish active lease” and ends with an arrowhead at the draining state.]
- control · Image-release retirement marking: Perform “Image release · retire older instances.” → Mark the older instances. → Move them toward “Draining · no new leases / Live work continues.” [A dashed vertical edge labeled “Mark” points upward from “Image release · retire older instances” to the draining state.]
- data · Tool call and capped response: Leased agent sends a call to “Run tool · timeout / memory / CPU / network limits.” → Tool execution returns a capped output stream to the leased agent. [The edge labeled “Call / capped output stream” has arrowheads toward both the tool-running process and the leased agent.]
- data · Controlled outbound egress: Route “All egress” from tool execution to “Egress proxy · allowlist only.” → Route “Allowed only” traffic from the proxy to “Allowlisted destinations.” [Solid rightward edges are labeled “All egress” and “Allowed only.”]
- data · Durable artifact output: Tool execution produces “Durable files.” → Route them to “Artifact store · session key.” [A branch from the tool runner bends downward to the artifact store and is labeled “Durable files.”]
- control · Warm-pool scaling: Observe “Host capacity / pool depth / demand.” → Feed the observations to “Warm-pool supervisor.” → On “Scale,” adjust pre-booted supply. [Region 4 has solid arrows from the signal process to the supervisor labeled “Observe,” then from the supervisor to supply adjustment labeled “Scale.”]

## FAILURE PATHS
- Either tenant admission limit is exceeded.: Tenant quota available? → Either limit exceeded → Fair tenant wait queue → The request waits in the fair tenant queue and can return toward the quota decision. [The vertical bidirectional connection between the quota decision and queue is labeled “Either limit exceeded.”]
- Lease-renewal heartbeats stop, renewal expires, or the environment reaches maximum age.: Leased → Renewals stop → Reclaimer · expired renewal / max age → Destroy · never repool → Destroyed → The environment is destroyed and never returned to the pool. [A red path descends from “Leased” via “Renewals stop” to the reclaimer, then runs to “Destroyed” labeled “Destroy · never repool.”]
- A tool-call deadline is exceeded.: Run tool · timeout / memory / CPU / network limits → Deadline exceeded → Kill call · TIMEOUT / Not a tool error → The call is killed and reported as TIMEOUT, explicitly not as a tool error. [A red downward edge labeled “Deadline exceeded” ends at “Kill call · TIMEOUT / Not a tool error.”]
- Repeated boot failures reach the configured or applicable threshold.: Repeated boot failures → Threshold → Quarantine host · exclude from placement → The host is quarantined and excluded from placement. [A red rightward edge labeled “Threshold” connects the repeated-boot-failures process to host quarantine.]

## CONSTRAINTS & BOUNDARIES
- Tenant admission applies concurrent-environment and aggregate-runtime quotas. [Placement note states: “Tenant admission Concurrent environment + aggregate runtime quotas.”]
- Fair waits must preserve other tenants' reserved capacity. [Placement note states: “Fair waits preserve other tenants' reserved capacity.”]
- Environment lifecycle does not permit tenant reuse. [Region title is “2 · Environment lifecycle — no tenant reuse.”]
- Leases are fixed-term and require agent renewal heartbeats. [Lifecycle note states: “Fixed-term lease requires agent renewal heartbeats.”]
- An absolute maximum age applies to every environment. [Lifecycle note states: “Absolute maximum age applies to every environment.”]
- Local filesystem contents and processes do not survive reclamation. [Lifecycle note states: “Local filesystem and processes never survive reclamation.”]
- A draining environment accepts no new leases, although live work continues. [The lifecycle state is labeled “Draining · no new leases / Live work continues.”]
- Reclaimed environments are destroyed and never repooled. [The red reclaimer path is labeled “Destroy · never repool.”]
- Tool execution is bounded by timeout, memory, CPU, and network limits. [Tool process is labeled “Run tool · timeout / memory / CPU / network limits.”]
- The output stream returned to the leased agent is capped. [The agent/tool edge is labeled “Call / capped output stream.”]
- All outbound traffic passes through an allowlist-only egress proxy. [The tool-to-proxy edge says “All egress,” and the proxy is labeled “Egress proxy · allowlist only.”]
- Only allowlisted destinations may receive outbound traffic. [The proxy-to-destinations edge is labeled “Allowed only,” ending at “Allowlisted destinations.”]
- Durable files are routed to an artifact store using a session key. [The “Durable files” edge ends at “Artifact store · session key.”]
- Deadline expiration is classified as TIMEOUT and not as a tool error. [Timeout outcome is labeled “Kill call · TIMEOUT / Not a tool error.”]
- Placement selects only a healthy host with capacity. [Cold-placement process is labeled “Select healthy host with capacity.”]
- A host with repeated boot failures at threshold is excluded from placement. [The red threshold path ends at “Quarantine host · exclude from placement.”]
- Operations monitoring covers boot latency, lease reclamations, tool timeouts, and escape-attempt signals. [The “Operations monitor” note lists all four items.]

## UNCERTAIN
- The edge labeled “Either limit exceeded” has arrowheads both toward the fair tenant wait queue and back toward the tenant-quota decision.: The image supports queueing and return/retry, but it does not label the condition or timing for leaving the queue and rechecking quota.
- The dashed path labeled “Image retired · finish active lease” starts above the leased/idle portion of the lifecycle and ends at draining.: Its exact source attachment is not visibly anchored to a specific process box, so the precise state where the image-retirement signal originates is unclear.
- Most gray nodes use plain rounded-corner rectangles without component icons.: They are read as procedure steps or lifecycle states from their region ordering and arrows; the picture does not assign additional fixed icon types to them.
- The “Operations monitor” is presented as a yellow note rather than a monitor icon or connected process.: The monitored subjects are explicit, but no data edges, collection mechanism, or destination are shown.

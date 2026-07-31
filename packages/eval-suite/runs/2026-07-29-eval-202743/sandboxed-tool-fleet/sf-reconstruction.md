# SF blind system reconstruction

## SYSTEM PURPOSE
A sandboxed tool fleet that admits tool-using agents under tenant quotas, supplies warm or newly booted environments, manages environment leases and reclamation, enforces per-call resource and network controls, emits bounded output and durable artifacts, and monitors operational signals.

## COMPONENTS
- Tool-using agent: Requests an environment using an image and resource class. [Agent icon labeled "Tool-using agent" with an outgoing arrow labeled "image + resource class".]
- Placement service: Coordinates placement and checks requests against admission limits. [Orchestrator icon labeled "Placement service" between the incoming request and an arrow labeled "check limits · fair wait if exceeded".]
- Tenant concurrency + runtime quotas: Acts as the admission guardrail for tenant concurrency and runtime quotas. [Guardrail icon labeled "Tenant concurrency + runtime quotas" receiving the placement-service flow and originating admitted and miss routes.]
- Pool supervisor: Adjusts the depth of the pre-booted supply. [Orchestrator icon labeled "Pool supervisor" with an arrow labeled "adjust depth" directed to "Pre-booted supply".]
- Pre-booted supply: Represents warm, pre-booted capacity that can be returned immediately. [Server-like infrastructure icon labeled "Pre-booted supply"; it receives "admitted · claim compatible" and connects to Ready through "warm hit · return now".]
- Healthy hosts: Provides healthy host capacity for cold provisioning and is subject to quarantine after repeated boot failures. [Server icons labeled "Healthy hosts" receiving the "miss · select capacity" route, feeding Provisioning through "cold miss · boot and wait", and pointing to Host quarantine through "repeated boot failures".]
- Host quarantine: Stops or isolates hosts after repeated boot failures. [Guardrail icon labeled "Host quarantine" at the end of the red arrow labeled "repeated boot failures".]
- Provisioning: Represents an environment being provisioned before it becomes ready. [Lifecycle rectangle labeled "Provisioning" receiving the cold-miss path and pointing to Ready with the label "ready".]
- Ready: Represents available environment capacity ready to be leased. [Lifecycle rectangle labeled "Ready" receiving both the Provisioning transition and the "warm hit · return now" route, then pointing to Leased.]
- Leased: Represents an environment assigned under a lease and provides the state in which tool calls are invoked. [Lifecycle rectangle labeled "Leased" reached from Ready; it has an outgoing "lease ends" transition and a crossover labeled "invoke in lease" to Tool call.]
- Idle: Represents an environment after its lease ends and before retirement. [Lifecycle rectangle labeled "Idle" reached from Leased by the arrow labeled "lease ends".]
- Draining: Represents a retired environment waiting for active lease activity to finish before destruction. [Lifecycle rectangle labeled "Draining" reached from Idle by "retire" and connected to Destroyed by "after active lease".]
- Destroyed: Represents the terminal destroyed environment state. [Lifecycle rectangle labeled "Destroyed" receiving the "after active lease" transition and the Reclaimer route labeled "destroy · never repool".]
- Renewal heartbeat: Triggers lease renewal to keep a lease valid. [Event icon labeled "Renewal heartbeat" connected toward Leased by a line labeled "renew · keep valid".]
- Lease term + max age: Represents the lease-duration and maximum-age wait boundary. [Wait/hourglass icon labeled "Lease term + max age" with an outgoing arrow labeled "lease expired".]
- Reclaimer: Performs delegated reclamation after lease expiry and sends the environment to destruction rather than back to a pool. [Predefined-process shape labeled "Reclaimer" receiving "lease expired" and emitting "destroy · never repool" toward Destroyed.]
- Tool call: Represents a capability invocation made while an environment is leased. [Tool icon labeled "Tool call" receiving the crossover labeled "invoke in lease" and feeding per-call enforcement and artifact output.]
- Timeout · memory · CPU: Enforces timeout, memory, and CPU limits for each tool call. [Control/capability icon labeled "Timeout · memory · CPU" reached from Tool call through the arrow labeled "enforce per call".]
- Allowlist egress proxy: Applies allowlisted network-egress policy. [Guardrail icon labeled "Allowlist egress proxy" reached from the resource-control component through the arrow labeled "network policy".]
- Capped output stream: Receives streamed tool output subject to a cap. [Send icon labeled "Capped output stream" at the destination of the arrow labeled "stream capped output".]
- Session artifact store: Stores durable files associated with a session key. [Archive icon labeled "Session artifact store" reached by a blue line labeled "durable files · session key".]
- Ephemeral local state: Represents non-durable local environment state. [Archive icon labeled "Ephemeral local state" inside the output and artifacts region; no visible edge is attached.]
- Boot latency: Monitors boot latency. [Monitor icon labeled "Boot latency" in the Operations monitoring region.]
- Lease reclamations: Monitors lease reclamation activity. [Monitor icon labeled "Lease reclamations" in the Operations monitoring region.]
- Tool timeouts: Monitors tool timeout activity. [Monitor icon labeled "Tool timeouts" in the Operations monitoring region.]
- Escape-attempt signals: Monitors signals associated with escape attempts. [Monitor icon labeled "Escape-attempt signals" in the Operations monitoring region.]

## FLOWS
- control · Placement and fair admission: Tool-using agent sends "image + resource class" to Placement service. → Placement service routes "check limits · fair wait if exceeded" to Tenant concurrency + runtime quotas. → If admitted, the route labeled "admitted · claim compatible" goes to Pre-booted supply. [The upper-left region is titled "1 · Placement & fair admission" and shows rightward arrows through the agent, placement service, quota guardrail, and admitted route.]
- control · Warm-pool depth adjustment: Pool supervisor sends "adjust depth" to Pre-booted supply. [Rightward arrow from "Pool supervisor" to "Pre-booted supply" labeled "adjust depth".]
- control · Warm environment return: A compatible admitted claim reaches Pre-booted supply. → The route labeled "warm hit · return now" enters Ready. → Ready transitions to Leased. [Green admitted route terminates at Pre-booted supply; a green crossover labeled "warm hit · return now" points into Ready, which points to Leased.]
- control · Cold environment provisioning: A quota/admission miss follows "miss · select capacity" to Healthy hosts. → Healthy hosts follows "cold miss · boot and wait" to Provisioning. → Provisioning transitions to Ready when "ready". → Ready transitions to Leased. [Gray route from the quota guardrail to Healthy hosts is labeled "miss · select capacity"; another gray route descends to Provisioning under "cold miss · boot and wait"; lifecycle arrows continue to Ready and Leased.]
- control · Normal environment lifecycle: Provisioning transitions to Ready with outcome "ready". → Ready transitions to Leased. → Leased transitions to Idle when "lease ends". → Idle transitions to Draining on "retire". → Draining transitions to Destroyed "after active lease". [The region titled "2 · Environment lifecycle" shows the ordered rectangles and directed arrows with labels "ready", "lease ends", "retire", and "after active lease".]
- control · Lease renewal: Renewal heartbeat follows "renew · keep valid". → The renewal route points into Leased. [Orange line from the Renewal heartbeat area is labeled "renew · keep valid" and terminates with an arrowhead at Leased.]
- failure · Lease expiry reclamation: Lease term + max age produces "lease expired". → The expired lease is routed to Reclaimer. → Reclaimer routes "destroy · never repool" to Destroyed. [In "3 · Lease enforcement", the wait icon points to Reclaimer through "lease expired"; the red line from Reclaimer terminates at Destroyed and is labeled "destroy · never repool".]
- control · Tool invocation in a lease: Leased routes "invoke in lease" to Tool call. → Tool call routes "enforce per call" to Timeout · memory · CPU. → Timeout · memory · CPU routes "network policy" to Allowlist egress proxy. [A teal crossover descends from Leased to Tool call with "invoke in lease"; rightward arrows are labeled "enforce per call" and "network policy".]
- data · Capped output emission: Allowlist egress proxy sends "stream capped output". → The stream reaches Capped output stream. [Green arrow from Allowlist egress proxy to the send icon is labeled "stream capped output".]
- data · Durable session artifacts: Tool call emits "durable files · session key". → The route terminates at Session artifact store. [Blue line originating beneath Tool call is labeled "durable files · session key" and has an arrowhead at Session artifact store.]

## FAILURE PATHS
- Repeated boot failures on a healthy host.: Healthy hosts → repeated boot failures → Host quarantine → The host reaches Host quarantine. [Red arrow from Healthy hosts to the guardrail labeled "Host quarantine" carries the text "repeated boot failures".]
- Lease term or maximum age expires.: Lease term + max age → lease expired → Reclaimer → destroy · never repool → Destroyed → The environment is destroyed and explicitly never returned to a pool. [The wait icon routes "lease expired" to Reclaimer, whose red output is labeled "destroy · never repool" and points to Destroyed.]
- A tool call exceeds its timeout.: Tool call → Timeout · memory · CPU → Kill an overlong call → Report timeout, not tool error → The overlong call is killed and reported as a timeout rather than as a tool error. [The yellow note titled "Timeout semantics" states "Kill an overlong call" and "Report timeout, not tool error" beside the per-call control flow.]
- An idle environment is retired.: Idle → retire → Draining → after active lease → Destroyed → The environment is destroyed after the active lease condition shown on the draining path. [Orange arrows in the lifecycle region connect Idle to Draining with "retire" and Draining to Destroyed with "after active lease".]

## CONSTRAINTS & BOUNDARIES
- Admission is governed by tenant concurrency and runtime quotas. [Guardrail labeled "Tenant concurrency + runtime quotas" lies directly after "check limits · fair wait if exceeded".]
- If limits are exceeded, admission uses a fair wait. [Placement flow is explicitly labeled "check limits · fair wait if exceeded".]
- Warm claims must be compatible. [The admitted route is labeled "admitted · claim compatible".]
- A cold miss requires selecting host capacity, booting, and waiting. [Routes are labeled "miss · select capacity" and "cold miss · boot and wait".]
- Tool calls are invoked only in the Leased state. [The only visible tool-call invocation crossover originates at Leased and is labeled "invoke in lease".]
- Timeout, memory, and CPU controls are enforced per tool call. [Tool call points to "Timeout · memory · CPU" through "enforce per call".]
- Network access is constrained by an allowlist egress proxy. [The guardrail is labeled "Allowlist egress proxy" and is reached through an edge labeled "network policy".]
- Streamed output is capped. [Output edge is labeled "stream capped output" and terminates at "Capped output stream".]
- Durable files are associated with a session key. [Artifact-store route is labeled "durable files · session key".]
- An expired lease is reclaimed and destroyed rather than repooled. [Reclaimer output is explicitly labeled "destroy · never repool".]
- A renewal heartbeat keeps a lease valid. [Renewal route is labeled "renew · keep valid" and points into Leased.]
- Lease validity is bounded by a lease term and maximum age. [Wait icon is labeled "Lease term + max age" and leads to "lease expired".]
- Overlong calls are killed and classified as timeouts, not tool errors. [The "Timeout semantics" note explicitly states both requirements.]
- Repeated boot failures result in host quarantine. [The arrow from Healthy hosts to Host quarantine is labeled "repeated boot failures".]
- The system monitors boot latency, lease reclamations, tool timeouts, and escape-attempt signals. [The "6 · Operations monitoring" region contains four monitor icons with those labels.]

## UNCERTAIN
- The board uses gray, teal, green, orange, red, and blue lines.: The supplied notation legend does not assign meanings to line colors, so no additional semantics are inferred from color.
- Ready points to Leased without a readable on-line label.: The direction is visible, but the exact trigger or payload for leasing is not stated.
- Ephemeral local state is shown inside the output and durable-artifacts region without a connected edge.: Its relationship to tool calls, leases, destruction, or artifact persistence is not explicitly drawn.
- The four monitoring components have no visible incoming edges.: The board names what is monitored but does not show which components emit those observations or how telemetry is transported.
- The title reads "2026-07-29-eval-202743 · sandboxed-tool-fleet".: It identifies the board but does not provide additional operational behavior.

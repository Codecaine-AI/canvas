# IC — Information Comprehension

- **R:** 26 / 35 = **0.7429**
- **C:** **0**
- **Score:** **5.5 / 10**

The weighted denominator is 35: 14 CORE facts at weight 2 and 7 SECONDARY facts at weight 1. Recovered facts receive full weight, hedged facts receive half weight, and missed facts receive zero. The final canvas JSON confirms that none of the reconstruction's asserted relationships contradicts the committed state, so the CORE-corruption cap does not apply. At R = 0.7429 the result falls just below the 6-row threshold; 5.5 reflects that the narrative and grouping mostly survive, while the entry identity, two synchronous labels, and some relationship/convention certainty do not.

| Fact | Status | Reconstruction line that settles the call |
|---|---|---|
| C1 — Public Subnet contains exactly ALB and API Gateway | missed | `Public Subnet ... contains the unlabeled cyan symbol box and API Gateway.` The reader cannot recover the first member as ALB; UNCERTAIN says its component name cannot be read. |
| C2 — final App Subnet contains Auth, Orders, Notifications, Postgres, and added Payments | recovered | `App Subnet ... contains Orders Service, Auth Service, Payments Service, Postgres, and Notifications Service.` This matches the E1/E2 final state. |
| C3 — both subnets are inside VPC; Client, bus, satellites, email, and metrics are outside | recovered | `VPC is the large enclosing container`; both named subnets are nested inside it, while `Client, Event Bus, Analytics, Webhooks, Email Provider / External SaaS, and Metrics & Tracing sit outside the VPC boundary.` |
| C4 — Client → ALB → API Gateway | missed | `Client → unlabeled cyan public-subnet box` and `Unlabeled cyan public-subnet box → API Gateway.` The route shape is seen, but the reader cannot identify the middle node as ALB. |
| C5 — API Gateway calls Auth Service and Orders Service | recovered | `API Gateway → Orders Service` and `API Gateway → Auth Service (authn)`. |
| C6 — Orders Service reads/writes Postgres | recovered | `Orders Service → Postgres (read/write, solid gray).` |
| C7 — Event Bus is the hub for the event fan | recovered | `The three purple producer routes ... converge on Event Bus; its visible consumer branches go to Analytics, Notifications Service, and Webhooks.` The reconstruction correctly reflects the six-edge final fan after Payments was added. |
| C8 — Orders Service publishes into Event Bus | recovered | `Orders Service → Event Bus (publish, purple).` |
| C9 — Auth Service sends audit events into Event Bus | recovered | `Auth Service → Event Bus (audit events, purple).` |
| C10 — Event Bus dispatches out to Notifications Service | recovered | `Event Bus → Notifications Service (dispatch, purple).` |
| C11 — Event Bus feeds Analytics and Webhooks | hedged | Analytics is stated directly, but `Event Bus → Webhooks` is described as inferred because no arrowhead is clearly discernible and as `the best reading` in UNCERTAIN. |
| C12 — Notifications Service feeds Email Provider | recovered | `Notifications Service → Email Provider / External SaaS (send email, solid gray).` |
| C13 — Auth, Orders, and Notifications feed a shared Metrics & Tracing sink via dashed muted edges | recovered | The EDGES section lists all three service-to-metrics dashed routes, and GROUPS says they `converge before entering Metrics & Tracing.` UNCERTAIN questions only whether Postgres might additionally be a source, not the three required relationships. |
| C14 — violet event traffic is distinct from neutral synchronous calls | hedged | CONVENTIONS says solid gray connectors `appear to denote synchronous calls` and purple connectors `appear to denote event publication, dispatch, or streaming through Event Bus.` The explicit interpretive hedge earns half credit. |
| S1 — five original event labels | recovered | The EDGES section reads `publish`, `audit events`, `dispatch`, `stream`, and `external delivery` verbatim. |
| S2 — synchronous labels HTTPS, authn, REST, read/write, send email | missed | `authn`, `read/write`, and `send email` are read, but UNCERTAIN says the Client-entry and API-Gateway-to-Orders pills are illegible, so `HTTPS` and `REST` are not reconstructed. |
| S3 — Email Provider is external SaaS outside VPC | recovered | Node: `Email Provider / External SaaS`; GROUPS places it outside the VPC boundary. |
| S4 — sticky's eventing-story gist | recovered | `Services never call each other directly.` and `After the synchronous order write, everything flows through the Event Bus.` |
| S5 — Event Bus is visibly emphasized as larger and violet | missed | CONVENTIONS identifies `violet for the event bus`, but the reconstruction never reports that it is larger than service boxes. |
| S6 — distinct subnet/VPC tints | missed | CONVENTIONS notes that containers are tinted but does not recover Public green, final App teal, or the VPC's neutral gray wash. |
| S7 — one shared sink named Metrics & Tracing | recovered | `The dashed gray observability routes converge before entering Metrics & Tracing.` |

## Corruption check

The final JSON verifies the reconstruction's asserted endpoints and directions, including Orders Service → Payments Service, Payments Service → Event Bus, Event Bus → Webhooks, and the three service → Metrics & Tracing taps. The unidentified public-subnet node is ALB in JSON, so describing it as unreadable is an omission rather than a false node or wrong grouping. The possible Postgres telemetry attachment is confined to UNCERTAIN and is not asserted as an edge. Therefore **C = 0**.

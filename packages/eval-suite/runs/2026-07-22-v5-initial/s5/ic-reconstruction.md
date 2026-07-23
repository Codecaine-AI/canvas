TOPIC: A nested cloud application architecture handles client order traffic inside public and application subnets, then uses an Event Bus to distribute payment, audit, notification, analytics, webhook, and observability activity.

NODES:
- `Client`
- An unlabeled cyan box containing only a small brace-like symbol, inside `Public Subnet`
- `API Gateway`
- `Orders Service`
- `Auth Service`
- `Payments Service`
- `Postgres`
- `Notifications Service`
- `Event Bus`
- `Analytics`
- `Webhooks`
- `Email Provider` / `External SaaS` (one box with a two-line label)
- `Metrics & Tracing`
- Readable annotation box, not a system node: `EVENTING STORY` — `Services never call each other directly.` and `After the synchronous order write, everything flows through the Event Bus.`

EDGES:
- `Client` → unlabeled cyan public-subnet box (edge label is not legible)
- Unlabeled cyan public-subnet box → `API Gateway` (unlabeled)
- `API Gateway` → `Orders Service` (edge label is not legible)
- `API Gateway` → `Auth Service` (`authn`)
- `Orders Service` → `Payments Service` (`charge`, solid gray; this endpoint reading conflicts with the nearby story annotation and is therefore uncertain)
- `Orders Service` → `Postgres` (`read/write`, solid gray)
- `Orders Service` → `Event Bus` (`publish`, purple)
- `Auth Service` → `Event Bus` (`audit events`, purple)
- `Payments Service` → `Event Bus` (`payment.captured`, purple)
- `Event Bus` → `Analytics` (`stream`, purple)
- `Event Bus` → `Notifications Service` (`dispatch`, purple)
- `Event Bus` → `Webhooks` (`external delivery`, solid gray; direction is inferred because no arrowhead is clearly discernible at the Webhooks box)
- `Notifications Service` → `Email Provider` / `External SaaS` (`send email`, solid gray)
- `Orders Service` → `Metrics & Tracing` (unlabeled dashed gray route, apparent source attachment)
- `Auth Service` → `Metrics & Tracing` (unlabeled dashed gray route, apparent source attachment)
- `Notifications Service` → `Metrics & Tracing` (unlabeled dashed gray route, apparent source attachment)

GROUPS:
- `VPC` is the large enclosing container.
- `Public Subnet` is nested inside `VPC` and contains the unlabeled cyan symbol box and `API Gateway`.
- `App Subnet` is nested inside `VPC` and contains `Orders Service`, `Auth Service`, `Payments Service`, `Postgres`, and `Notifications Service`.
- `Client`, `Event Bus`, `Analytics`, `Webhooks`, `Email Provider` / `External SaaS`, and `Metrics & Tracing` sit outside the `VPC` boundary. They are not enclosed by a second named group.
- The three purple producer routes (`publish`, `audit events`, and `payment.captured`) converge on `Event Bus`; its visible consumer branches go to `Analytics`, `Notifications Service`, and `Webhooks`.
- The dashed gray observability routes converge before entering `Metrics & Tracing`.

ORDER:
- A reader starts at `Client` on the far left, follows traffic into the unlabeled cyan public-subnet box, then down to `API Gateway`.
- The main synchronous order path continues from `API Gateway` into `Orders Service`, then `Orders Service` performs `read/write` against `Postgres` and `publish`es to `Event Bus`.
- A parallel authentication branch runs from `API Gateway` to `Auth Service` via `authn`; `Auth Service` sends `audit events` to `Event Bus`.
- The visible `charge` branch appears to run from `Orders Service` to `Payments Service`; `Payments Service` then sends `payment.captured` to `Event Bus`.
- From `Event Bus`, the flow fans upward to `Analytics` via `stream`, rightward toward `Webhooks` via `external delivery`, and down/left to `Notifications Service` via `dispatch`. `Notifications Service` then calls the external email provider via `send email`.
- Separate dashed routes descend from application services and merge into `Metrics & Tracing` at the bottom.
- No return path or directed loop is visibly indicated.

CONVENTIONS:
- Large outlined and tinted containers indicate nesting: `VPC` contains `Public Subnet` and `App Subnet`.
- Arrowheads indicate direction; rounded pill labels name the action or event on an edge.
- Solid gray connectors appear to denote synchronous calls, data access, or external delivery.
- Purple connectors appear to denote event publication, dispatch, or streaming through `Event Bus`.
- Dashed gray connectors appear to denote telemetry/observability flow into `Metrics & Tracing`.
- Service colors distinguish components: cyan/teal for ingress and orders, blue for gateway/auth, magenta for payments, orange for notifications, and purple for the event bus. No explicit color legend assigns further semantics.
- Neutral white/gray boxes represent external actors or infrastructure/dependencies, although `Postgres` is a neutral box inside the app subnet.
- The `EVENTING STORY` note explicitly states that services do not call one another directly and that, after the synchronous order write, everything flows through the Event Bus.

UNCERTAIN:
- The cyan box above `API Gateway` has only a small brace-like glyph; its component name cannot be read from the picture.
- The pill on `Client` → the unlabeled cyan box and the pill on `API Gateway` → `Orders Service` render as symbols rather than legible words, so their exact labels cannot be reconstructed.
- The gray `charge` path visually appears to originate at `Orders Service` and terminate at `Payments Service`, but that is in tension with the annotation `Services never call each other directly.` The picture does not establish whether `charge` is an intentional exception or whether the routed source is being misread.
- The `external delivery` line joins `Event Bus` and `Webhooks`, but an arrowhead at `Webhooks` is not visibly clear; Event Bus → Webhooks is the best reading from the left-to-right layout and eventing narrative.
- The dashed observability lines visibly attach to `Orders Service`, `Auth Service`, and `Notifications Service` and converge at `Metrics & Tracing`, but their close pass beneath/beside `Postgres` makes it unclear whether `Postgres` is also intended as a telemetry source.
- The purple producer lines merge near the `Event Bus`, so they share a final arrowhead rather than each showing a separate terminal arrow; their labels and source attachments support the producer-to-bus readings above.

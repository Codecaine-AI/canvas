<!-- Generated from packages/canvas-agent/src/authoring/visual-patterns.ts (sha256 9721d8290813fac6ef87954f423edb9232461e6a0c5228a3d17117054556f783). Do not edit. Regenerate with `bun packages/canvas-mcp/src/cli.ts guidance --write`. -->

# Visual Patterns

The 9 patterns a diagram composes. Each sketch is conceptual, not literal coordinates.

## Fan-Out (`fan-out`)

One source produces or delegates to many recipients. Spread recipients across the reading direction and label the dispatched work. Conditional choices belong to a decision; parallel delegation shows the recipients that actually work.

```text
[Source] --+--> [Recipient A]
          +--> [Recipient B]
          +--> [Recipient C]
```

Use case: A coordinator dispatches independent tasks to several workers.

## Convergence (`convergence`)

Several contributions reach one receiving process or participant. Make clear whether it waits for all, selects one, or aggregates. Merging arrows alone does not establish synchronization; a join barrier needs an explicit wait step or label supported by the source.

```text
[Input A] --+
[Input B] --+--> [Combine] --> [Result]
[Input C] --+
```

Use case: An aggregator combines worker results into a single report.

## Hierarchy (`hierarchy`)

Parent-child ownership or decomposition expressed through repeated local branches or justified nested sections. Label ownership separately from execution order. Use supported objects and connections for the branches. Nested sections read as layers, such as a machine holding a runtime holding a sandbox, when each header carries an icon and one fact.

```text
[Parent]
  +-- [Child A]
  |     +-- [Grandchild]
  +-- [Child B]

+-(icon) Mac  darwin-arm64 ----------------+
|  +-(icon) Bun services  127.0.0.1 ----+  |
|  |  [canvas-agent]    [docs kernel]   |  |
|  |   harness · :4820   :4840          |  |
|  +------------------------------------+  |
+------------------------------------------+
```

Use case: A service owns two subsystems, one of which owns a smaller component.

## Sequence (`sequence`)

Ordered stages or events form a readable chain with labeled transitions. Preserve order, conditions, and terminal outcomes. A timeline uses supported steps or event objects. The line under each stage is its detail: one fact, not a description.

```text
[Request] --> [Validate] --> [Process] --> [Respond]
 POST /runs    JSON schema    worker pool   201 Created
```

Use case: A request passes through validation, processing, and response delivery.

## Feedback Cycle (`feedback-cycle`)

A result affects later work through a return connection between distinct stages or participants. Label the return trigger and destination. Canvas rejects a self-loop on one object.

```text
[Act] -----> [Observe]
  ^              |
  |              v
[Adjust] <-- [Evaluate]
```

Use case: An evaluator's findings guide the next revision of a generated result.

## Transformation (`transformation`)

An input artifact passes through a transformation step to become an output artifact. Show what changed and which step changed it. Nearby before/after examples can explain the mechanism.

```text
[Input] --> [Transform] --> [Output]
 raw record                 indexed record
```

Use case: An indexing step converts a supplied source record into a searchable record.

## Side-by-Side (`side-by-side`)

Two alternatives use parallel structures with corresponding parts aligned. Keep a consistent visual baseline so meaningful differences can be compared.

```text
Option A                  Option B
[Request]                 [Request]
    |                         |
    v                         v
[Database]                [Cache] --> [Database]
```

Use case: Compare direct database reads with a proposed cached read path.

## Separation (`separation`)

A purposeful gap or section boundary separates phases or responsibilities. Explicit handoff connections show what crosses the boundary and who receives it. Whitespace alone cannot express causality.

```text
Responsibility A           Responsibility B
[Prepare] ----- handoff -----> [Receive]
```

Use case: A producer hands a completed work item to a separately owned processing service.

## Shared Resource (`shared-resource`)

Several participants use one shared store placed near its consumers. Label read/write relationships and retain one store instead of drawing misleading duplicates.

```text
[Writer] --write--> [Shared Store] --read--> [Reader A]
                         |
                         +----------read--> [Reader B]
```

Use case: One ingestion process updates an index that multiple query services read.

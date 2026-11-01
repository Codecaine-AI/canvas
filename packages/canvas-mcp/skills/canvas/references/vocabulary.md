<!-- Generated from packages/canvas/src/authoring/vocabulary.ts (sha256 a1fb49385006dd5575e6c1336b6ff9d111e91138bab6fa02700bbc55f5f34b8c). Do not edit. Regenerate with `bun packages/canvas-mcp/src/cli.ts guidance --write`. -->

# Visual Vocabulary

<entity_kinds>
    <sections>
        A section is a titled frame that groups related content. Sections can contain objects and other sections.

        The header shows an optional icon, the title, and an optional detail: one short fact after the title.
    </sections>

    <objects>
        Shapes and glyphs represent diagram nodes. Their type communicates what they represent.

        Shape labels render inside the shape. Glyph labels render below the glyph. Either can add one detail line under its label: a single fact, rendered muted.
    </objects>

    <stickies>
        A sticky holds Markdown text for supporting explanations and concrete examples.
    </stickies>

    <connections>
        A connection is a routed wire between two objects. Its label describes their relationship.

        Connections can attach to shapes, glyphs, stickies, and sections.
    </connections>
</entity_kinds>

<object_catalog>
    Choose shape based on what it represents.

    Each bullet gives the supported name and preferred color, followed by its meaning and use cases. The shapes come first, then the glyphs by category, then the brand logos. A glyph name is an icon object's type, and any glyph can also be a section's header icon.

    <group name="Shapes">
        - rectangle (white)
            - Meaning: A plain box — a message or payload container
            - Use when:
                - messages, payloads, and containers that are not process steps

        - process (teal)
            - Meaning: A rounded rectangle — one step in a procedure
            - Use when:
                - a single action or stage in a walkthrough or pipeline

        - decision (yellow)
            - Meaning: A branch — the flow forks on a condition
            - Use when:
                - yes/no gates
                - routing on the outcome of a check

        - predefined-process (teal)
            - Meaning: A delegated step — work handed to another flow
            - Use when:
                - spawned sub-agents, subroutines, enqueued tasks

        - triangle (gray)
            - Meaning: A directional marker — points up or down via `direction`
            - Use when:
                - pointing a reader up or down a flow or hierarchy

        - ellipse (green)
            - Meaning: A start or end terminator
            - Use when:
                - the entry and exit points of a procedure

        - arrow-shape (gray)
            - Meaning: A routing outcome — points left or right via `direction`
            - Use when:
                - marking where a branch's outcome flows next

        - octagon (red)
            - Meaning: A stop
            - Use when:
                - hard stops, aborts, terminal failure states
    </group>

    <group name="Agents &amp; AI">
        - agent (teal)
            - Meaning: An autonomous agent — plans and acts on its own
            - Use when:
                - main agents, sub-agents, workers in a pool

        - model (violet)
            - Meaning: An LLM or model call
            - Use when:
                - model invocations, completions, embedding calls

        - orchestrator (teal)
            - Meaning: The coordinator that spawns and directs other agents
            - Use when:
                - coordination, spawn hierarchies, schedulers

        - judge (violet)
            - Meaning: An eval or verdict step
            - Use when:
                - LLM judges, scoring passes, accept/reject verdicts

        - tool (teal)
            - Meaning: A capability an agent can invoke — distinct from api and config
            - Use when:
                - tool calls, function invocations, agent capabilities

        - eval (violet)
            - Meaning: An experiment, eval set, or test harness
            - Use when:
                - eval suites, experiments, regression harnesses

        - brain (violet)
            - Meaning: Reasoning or planning — the thinking step
            - Use when:
                - planning passes, reasoning loops, reflection steps
    </group>

    <group name="Compute">
        - server (gray)
            - Meaning: Infrastructure and services
            - Use when:
                - backends, deployments, hosted services

        - function (gray)
            - Meaning: A serverless or single-purpose function
            - Use when:
                - lambdas, cloud functions, request handlers

        - container (gray)
            - Meaning: A container or isolated runtime
            - Use when:
                - containers, pods, sandboxes, isolated workers

        - cloud (gray)
            - Meaning: A cloud provider, region, or hosted platform
            - Use when:
                - cloud accounts, regions, managed platforms

        - browser (pink)
            - Meaning: A web app or browser surface
            - Use when:
                - web frontends, browser sessions, web UIs

        - desktop (pink)
            - Meaning: A desktop app or workstation
            - Use when:
                - desktop apps, workstations, operator consoles

        - laptop (pink)
            - Meaning: A laptop or local machine
            - Use when:
                - developer machines, local runs, on-device work

        - mobile (pink)
            - Meaning: A mobile app or device
            - Use when:
                - iOS and Android apps, phones, mobile clients

        - cpu (gray)
            - Meaning: Compute capacity — a CPU, GPU, or accelerator
            - Use when:
                - GPUs, CPUs, inference hardware, compute pools

        - layers (gray)
            - Meaning: A stack of layers or tiers
            - Use when:
                - architecture layers, tiers, stacked environments
    </group>

    <group name="Data">
        - memory (blue)
            - Meaning: A store an agent reads from or writes to across turns
            - Use when:
                - long/short-term memory, knowledge bases, vector stores
                - the target of state-read / state-write edges

        - knowledge (blue)
            - Meaning: A reference corpus or knowledge base
            - Use when:
                - docs corpora, wikis, curated reference material

        - queue (yellow)
            - Meaning: A queue or stream of work items
            - Use when:
                - task queues, streams, backlogs between stages

        - archive (gray)
            - Meaning: Cold storage or retired state
            - Use when:
                - archives, snapshots, retired runs

        - search (blue)
            - Meaning: Retrieval, lookup, similarity search
            - Use when:
                - retrieval steps, lookups, similarity queries

        - database (blue)
            - Meaning: A database — durable structured records
            - Use when:
                - relational and document databases, tables of record, primary stores

        - cache (blue)
            - Meaning: A cache — a fast, disposable copy of data
            - Use when:
                - caches, memoized results, read-through layers

        - table (blue)
            - Meaning: A table or tabular dataset
            - Use when:
                - tables, spreadsheets, datasets

        - filter (yellow)
            - Meaning: A filter — narrowing a set
            - Use when:
                - filters, predicates, selection steps
    </group>

    <group name="Network">
        - api (blue)
            - Meaning: An external API or connection point
            - Use when:
                - third-party APIs, endpoints, integration seams

        - send (green)
            - Meaning: Emit or dispatch
            - Use when:
                - outbound sends, notifications, publishes

        - network (gray)
            - Meaning: A network or cluster of connected nodes
            - Use when:
                - VPCs, clusters, service meshes, peer networks

        - globe (blue)
            - Meaning: The public internet or a global audience
            - Use when:
                - the open web, public endpoints, CDNs, worldwide users

        - webhook (green)
            - Meaning: A webhook — an inbound HTTP callback
            - Use when:
                - third-party callbacks, push integrations, inbound hooks

        - plug (blue)
            - Meaning: A plugin, adapter, or connector
            - Use when:
                - plugins, adapters, MCP servers, integrations

        - link (blue)
            - Meaning: A link or reference
            - Use when:
                - URLs, references, cross-links between resources

        - route (yellow)
            - Meaning: A route — a path through a system
            - Use when:
                - routing rules, request paths, traffic steering
    </group>

    <group name="Dev">
        - terminal (gray)
            - Meaning: A CLI, runner, or exec surface
            - Use when:
                - shells, CI runners, exec sandboxes

        - config (gray)
            - Meaning: Configuration and settings
            - Use when:
                - config files, flags, environment setup

        - package (white)
            - Meaning: A build artifact, bundle, or deployment
            - Use when:
                - builds, releases, deployable bundles

        - branch (gray)
            - Meaning: A git branch — a parallel line of work
            - Use when:
                - feature branches, forks, parallel work

        - pull-request (gray)
            - Meaning: A pull request — a change awaiting review
            - Use when:
                - code review, change proposals, PR checks

        - merge (gray)
            - Meaning: A merge — lines of work joining
            - Use when:
                - branch merges, integrations, joined results

        - commit (gray)
            - Meaning: A commit — one recorded change
            - Use when:
                - commits, revisions, checkpoints in history

        - code (gray)
            - Meaning: Code — a module, program, or codebase
            - Use when:
                - codebases, modules, code execution

        - bug (red)
            - Meaning: A bug, defect, or failure
            - Use when:
                - bugs, incidents, failing cases
    </group>

    <group name="People">
        - human (pink)
            - Meaning: A person in the loop
            - Use when:
                - approvals, reviews, human handoffs

        - message (pink)
            - Meaning: A conversation or message surface
            - Use when:
                - chat threads, transcripts, message payloads

        - voice (pink)
            - Meaning: A voice channel — the audio boundary where a human talks to the system
            - Use when:
                - voice sessions, speech-to-text / text-to-speech seams, call surfaces

        - users (pink)
            - Meaning: A group of people — a team or user base
            - Use when:
                - teams, end users, audiences, tenants

        - mail (pink)
            - Meaning: Email
            - Use when:
                - email sends, inboxes, digests
    </group>

    <group name="Docs">
        - document (white)
            - Meaning: A produced artifact
            - Use when:
                - reports, generated files, single deliverables

        - documents (white)
            - Meaning: Multiple documents
            - Use when:
                - reports, corpora, batches of files

        - code-file (white)
            - Meaning: A source file or script
            - Use when:
                - source files, scripts, generated code

        - folder (white)
            - Meaning: A folder, directory, or workspace
            - Use when:
                - directories, repositories, workspaces
    </group>

    <group name="Status &amp; control">
        - event (green)
            - Meaning: A trigger or event
            - Use when:
                - triggers, emitted events, state-change signals

        - guardrail (orange)
            - Meaning: A safety gate
            - Use when:
                - input/output filters, policy checks, blocked-content gates

        - monitor (blue)
            - Meaning: Observation and tracing
            - Use when:
                - traces, telemetry watchpoints, health checks

        - activity (blue)
            - Meaning: Traces, telemetry, run activity
            - Use when:
                - run logs, activity feeds, execution traces

        - key (yellow)
            - Meaning: Secrets, credentials, auth
            - Use when:
                - API keys, tokens, credential stores

        - coin (green)
            - Meaning: Cost, billing, budgets
            - Use when:
                - token spend, budgets, billing meters

        - wait (yellow)
            - Meaning: A blocking wait, join barrier, or timeout
            - Use when:
                - joins, barriers, debounces, timeouts

        - lock (yellow)
            - Meaning: A lease, claim, or mutual exclusion — key stays secrets
            - Use when:
                - leases, claims, single-writer locks

        - schedule (green)
            - Meaning: A schedule or timed trigger
            - Use when:
                - cron jobs, timers, scheduled runs

        - dashboard (blue)
            - Meaning: A dashboard or admin console
            - Use when:
                - dashboards, admin panels, control consoles

        - chart (blue)
            - Meaning: Metrics or analytics
            - Use when:
                - metrics, KPIs, analytics reports

        - gauge (blue)
            - Meaning: A meter — load, quota, or performance level
            - Use when:
                - rate limits, quotas, latency and throughput meters

        - bell (orange)
            - Meaning: An alert or notification
            - Use when:
                - alerts, pages, notifications

        - loop (yellow)
            - Meaning: A loop, retry, or recurring cycle
            - Use when:
                - retries, polling loops, iterate-until-done cycles
    </group>

    <group name="Brands">
        Brand logos (brand-*) are filled product logos. Use one only for the exact product the diagram names, and the generic glyph for the role: PostgreSQL gets brand-postgres, and an unnamed database gets database. The roster has no AWS or OpenAI logos.

        - brand-postgres (blue)
            - Meaning: PostgreSQL, the relational database (brand logo)
            - Use when:
                - the board names PostgreSQL itself; use database for a generic store

        - brand-sqlite (blue)
            - Meaning: SQLite, the embedded database (brand logo)
            - Use when:
                - the board names SQLite itself; use database for a generic store

        - brand-redis (blue)
            - Meaning: Redis, the in-memory data store (brand logo)
            - Use when:
                - the board names Redis itself; use cache for a generic cache

        - brand-mongodb (blue)
            - Meaning: MongoDB, the document database (brand logo)
            - Use when:
                - the board names MongoDB itself; use database for a generic store

        - brand-docker (gray)
            - Meaning: Docker, the container platform (brand logo)
            - Use when:
                - the board names Docker itself; use container for a generic container

        - brand-kubernetes (gray)
            - Meaning: Kubernetes, the container orchestrator (brand logo)
            - Use when:
                - the board names Kubernetes itself; use container or network otherwise

        - brand-github (gray)
            - Meaning: GitHub, the code host (brand logo)
            - Use when:
                - the board names GitHub itself; use branch or pull-request otherwise

        - brand-git (gray)
            - Meaning: Git, the version-control tool (brand logo)
            - Use when:
                - the board names Git itself; use branch, merge, or commit otherwise

        - brand-anthropic (violet)
            - Meaning: Anthropic, the AI company (brand logo)
            - Use when:
                - the board names Anthropic or its API itself; use model otherwise

        - brand-claude (violet)
            - Meaning: Claude, Anthropic's model family (brand logo)
            - Use when:
                - the board names Claude itself; use model for a generic model call

        - brand-huggingface (violet)
            - Meaning: Hugging Face, the model hub (brand logo)
            - Use when:
                - the board names Hugging Face itself; use model otherwise

        - brand-ollama (violet)
            - Meaning: Ollama, the local model runtime (brand logo)
            - Use when:
                - the board names Ollama itself; use model otherwise

        - brand-bun (gray)
            - Meaning: Bun, the JavaScript runtime (brand logo)
            - Use when:
                - the board names Bun itself; use server or code otherwise

        - brand-node (gray)
            - Meaning: Node.js, the JavaScript runtime (brand logo)
            - Use when:
                - the board names Node.js itself; use server or code otherwise

        - brand-typescript (gray)
            - Meaning: TypeScript, the language (brand logo)
            - Use when:
                - the board names TypeScript itself; use code otherwise

        - brand-python (gray)
            - Meaning: Python, the language (brand logo)
            - Use when:
                - the board names Python itself; use code otherwise

        - brand-go (gray)
            - Meaning: Go, the language (brand logo)
            - Use when:
                - the board names Go itself; use code otherwise

        - brand-rust (gray)
            - Meaning: Rust, the language (brand logo)
            - Use when:
                - the board names Rust itself; use code otherwise

        - brand-react (gray)
            - Meaning: React, the UI library (brand logo)
            - Use when:
                - the board names React itself; use browser otherwise

        - brand-nextjs (gray)
            - Meaning: Next.js, the React framework (brand logo)
            - Use when:
                - the board names Next.js itself; use browser otherwise

        - brand-vite (gray)
            - Meaning: Vite, the frontend build tool (brand logo)
            - Use when:
                - the board names Vite itself; use package otherwise

        - brand-electron (gray)
            - Meaning: Electron, the desktop app shell (brand logo)
            - Use when:
                - the board names Electron itself; use desktop otherwise

        - brand-vercel (gray)
            - Meaning: Vercel, the hosting platform (brand logo)
            - Use when:
                - the board names Vercel itself; use cloud otherwise

        - brand-cloudflare (gray)
            - Meaning: Cloudflare, the edge network (brand logo)
            - Use when:
                - the board names Cloudflare itself; use cloud or globe otherwise

        - brand-supabase (blue)
            - Meaning: Supabase, the hosted Postgres backend (brand logo)
            - Use when:
                - the board names Supabase itself; use database otherwise

        - brand-terraform (gray)
            - Meaning: Terraform, infrastructure as code (brand logo)
            - Use when:
                - the board names Terraform itself; use config otherwise

        - brand-kafka (yellow)
            - Meaning: Apache Kafka, the event-streaming platform (brand logo)
            - Use when:
                - the board names Kafka itself; use queue for a generic stream

        - brand-linear (gray)
            - Meaning: Linear, the issue tracker (brand logo)
            - Use when:
                - the board names Linear itself; use document otherwise

        - brand-figma (gray)
            - Meaning: Figma, the design tool (brand logo)
            - Use when:
                - the board names Figma itself; use document otherwise
    </group>
</object_catalog>

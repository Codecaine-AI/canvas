# Layout Agent — North Star & Prompt Redesign

Status: **living doc** — being written iteratively during the 2026-07-25 prompt-redesign interview. Decisions below are settled unless marked open/proposed.

## North-star user flow (the true desired state)

This is the end UX we are building toward. Not all of it is in scope for the current build (see scope split below), but every design decision should point at it.

1. The user says they want a new diagram — an **intent-level** ask ("diagram this system"), not a node-level spec.
2. If code or other source material is provided, the agent reads it, asks a few clarifying questions to confirm what the diagram should say, and then goes off and builds.
3. The user reviews the result and provides feedback.
4. While building, the agent can leave **annotations on specific objects** where it needs follow-up — each one opens an annotation thread anchored to that part of the diagram, and the user provides input there.
5. The user keeps interacting; the loop continues.

Two principles fall out of this flow:

- **Requests are intent, not geometry.** The agent owns turning "how this system functions" into pieces, sections, and layout. Prompts (and eval seed briefs) should not need to mention nodes.
- **The description is the shared ground.** Agent and user converge on what the diagram is saying through a persistent description, not through re-inference from geometry each run.

## Scope split

**In scope now:**
- Phase-model rewrite of the system prompt (below).
- The board **description**: a string in board state, an op/tool for the agent to update it, AI-panel display.
- An **add-annotation tool**: the agent can anchor an annotation to an object, starting a thread the user answers in (north-star step 4 lands now).
- The visual QA pass and the walkthrough-style Finalize.
- Eval-suite overhaul: intent-level briefs, new subject domain (below).

**Explicitly later (build toward, don't build now):**
- Blocking agent-initiated questions (synchronous ask-and-wait). Annotations are the async version and ship now.
- The code-reading intake flow (north-star step 2).
- On-canvas display of the description (AI panel only for now).

## Phase model

Five phases, replacing the current six. They run as a **loop, navigated by state**: a phase with nothing to do is skipped (a small tweak may need no Plan), and a failure late in the loop sends the agent back to the phase that can fix it.

```
Orientate → Plan → Build → QA → Finalize
                ↑______________________|   (loop until the quality bars pass)
```

- **Orientate** — read the instruction, open requests, the board, and the description. Know what's done, what's being asked, and what the diagram is trying to say before touching anything.
- **Plan** — decompose the message into sections and pieces; for each section, choose the vocabulary (object types, icons, colors) that best expresses that process or system.
- **Build** — put things down and get them working: place section by section, wire the connections, label. Node text stays small — a label, not a paragraph; anything needing more explanation becomes a sticky.
- **QA** — the visual pass, judged from renders once the diagram is working and makes sense. Lints own hard errors; **QA owns aesthetics**: does it look clean, are wires routed in an aesthetically sensible way, is spacing uniform, are things aligned, are elbows and paths tidy. This is the make-it-pretty pass.
- **Finalize** — the explain-through. Walk the diagram as if explaining it to someone, against the description: does the information actually flow the way the description says? Something off ⇒ loop back to Plan/Build, QA again, repeat until it passes. Update the description, then commit — commit is the exit condition, not a phase of its own.

### Craft targets live in style injection, not the system prompt (settled)

The hard numbers (288×96 nodes, ≥224 min width, row/column node gaps, 144/160 section gutters, 48 frame padding, 7× board area / ~15% ink, 2–3 nodes per section, wire-width corridors) move out of the prompt entirely and into the **style context that gets injected** — the `<style_guide>` block rendered from `src/agent/styles/`. Principle: **the system prompt explains behavior**; presentation numbers are style. Phases reference the injected targets in judgment language: Build places "at one uniform size and gap — the style guide's targets are what uniform means"; QA judges spacing uniformity against the same targets.

Ground truth (see STYLE-PIPELINE-SURVEY.md): the viewer's `PromptStyleRail`/`PromptStyleSettings` is an unrelated, deliberately firewalled prompt-*editor* cosmetic system and must not host these; the real home is a structured `CraftTargets` shape beside the `aesthetic` prose topic, rendered as a `<craft_targets>` sub-block, with the numbers stripped from prompt.json in the same change so there is one source of truth. Host-editable targets via `sessionData` are a cheap later step (no kernel changes needed). One wrinkle to fix while setting defaults: the current column-gap target equals the crowding lint's floor (both 80) — targets must sit above floors.

## The description

A **small living document** stored in canvas state, describing what the diagram represents, its pieces, and how it reads — *in its own terms*. No forced reading-direction vocabulary: diagrams can read circularly (Flow v2 is the reference case), so the description says how this one flows rather than the prompt mandating top-to-bottom or left-to-right.

- **Storage**: a string field in the board state JSON for now. It rides the existing draft/commit flow like all board state.
- **Format**: markdown, loosely templated — *what it represents*, *the pieces*, *how it reads*. Guidance in the prompt, not schema-enforced.
- **Born from the user's ask**: the first description is essentially the intake — "this is what it should do, it represents this system, these are the pieces."
- **Agent-maintained**: a tool lets the agent update the string; it writes as it builds and trues it up at Finalize.
- **Purposes**: (1) re-entry — a returning agent orientates from the description instead of inferring intent from geometry; (2) the ground for clarifying-question exchanges (annotations now, richer flows later).
- **Display**: AI panel for now.

## Annotations: two-way, thread-based (settled design; implementation gap under investigation)

Annotations become conversations anchored to objects, in both directions:

- Opening an annotation on an object opens a **thread**. Either party can start one.
- The user posts in a thread; the agent can **reply with a question**, **resolve** the thread, or act on it via board edits.
- The agent can open a new annotation on anything that didn't make sense to it while building.
- **Non-blocking**: the agent leaves the question, proceeds on its best guess, and names open questions in the finalize message. The run never waits on an answer; the user replies on their own time and the next run picks the thread up during Orientate.
- **Restraint is a prompt rule**: agent-opened annotations are for key things needing real clarification only — never "is this name right?" scattered across every object. Over-annotating is a UX failure the prompt must explicitly guard against.
- Note this reverses the current prompt's "you cannot create annotations" rule; the annotation system grows an agent-authored direction.

### Current annotation system — ground truth (mapped 2026-07-25)

- Annotations are a first-class array on the board document (`packages/canvas/src/state/schema/annotations.ts`): flat records — `id, target, intent, body, status(open|applied|resolved), createdBy(human|agent|system), createdAt`. Targets anchor by object/connection id (or a region rect). **No thread/reply structure anywhere.**
- Two latent hooks exist but nothing writes them: `createdBy: "agent"|"system"` and `status: "applied"|"resolved"` are in the schema and validator, yet every creation path hardcodes `human`/`open`.
- **`resolve_request` never touches the document.** Disposal is a session-only status on the queue entry (`canvas-agent/src/service/session/tools.ts`); the document annotation stays `open` forever, so pins and sidebar entries persist after a successful run and the agent's disposal note is visible only in the transcript. This is an existing operator-UX hole independent of the new work.
- **Hard blocker for agent-authored annotations:** the draft diff explicitly omits annotations (`board/doc-diff.ts`) and the patch-op union has no annotation variant (`protocol.ts`) — nothing the agent writes to draft annotations can survive commit today. W2 must add an annotation channel to diff + patch + accept, plus an event path back to studio.
- UI is minimal and one-way: pins render only open, object-targeted agent-requests as a `◉` with the body in a tooltip; the sidebar is a flat list; the composer is create-only. **No component anywhere renders a conversation, an author, or a status.** A thread view has no home yet.
- Cross-cutting decision forced by threads: today the document owns the annotation and the session owns its status — the root cause of invisible disposals. Two-way threads mean **status and replies move into the document** (recommended), making disposal an ordinary board mutation that rides the draft.

### W2 shape (from the gap list)

Schema thread structure + migration → creation actions take `createdBy` / append-to-thread action → annotation variant in patch ops + doc-diff + accept path → agent tools (`add_annotation`, and `resolve_request` promoted to write a persisted reply/status) → queue formatters render transcripts → thread UI (pins, sidebar, popup). Full file-level gap list lives in the 2026-07-25 exploration report; touchpoints span `packages/canvas`, `packages/canvas-agent`, `packages/studio`.

## Eval-suite overhaul

- Briefs become **intent-level**: "diagram how X functions," never naming nodes or counts — the new prompt's Orientate/Plan phases are what's being exercised.
- Subject domain shifts to **AI engineering and distributed systems** — complex, agent-based systems of the kind in Ford's vertical (reference points for complexity: GameCube decomp, CCPCU phone system).
- **Excluded**: the decompilation system itself is *not* an eval scenario (Ford is making that diagram himself). Scenarios should be genre-mates, not copies of his actual projects.
- Scenario subjects (settled): multi-agent code-review pipeline; LLM inference gateway with model fallback/routing; RAG ingestion + retrieval pipeline; eval-harness orchestration (scenario runners, judges, baselines); sandboxed tool-execution fleet with lifecycle management; telephony IVR with AI-agent handoff; distributed trace-ingestion/observability pipeline; agent-kernel-style session orchestration (spawn, snapshot, resume).

## Build plan

Workstreams, roughly dependency-ordered. Implementation goes to Codex workers per house rules; design and acceptance stay with the primary.

- **W1 — Description state + tool.** `description` string on the board doc; `update_description` tool; digest/context exposure so Orientate sees it; AI-panel display.
- **W2 — Annotation threads (two-way).** Schema thread structure + migration; `createdBy` parameterized; annotation channel through doc-diff/patch/accept + studio events; `add_annotation` tool and `resolve_request` promoted to persisted document writes; thread UI (pins, sidebar, popup). Biggest workstream — see ANNOTATION-SYSTEM-SURVEY.md for the file-level gap list.
- **W3 — Prompt rewrite + craft-targets extraction.** prompt.json restructured to the five-phase loop; `CraftTargets` added to the style system with a `<craft_targets>` block and the numbers stripped from prompt text in the same change (touchpoints in STYLE-PIPELINE-SURVEY.md); description integration, sticky rule, QA visual checklist, walkthrough Finalize. Depends on W1 tool names; ships with today's `resolve_request` semantics.
- **W4 — Eval overhaul.** New intent-level scenario briefs in the new domain; retire node-mentioning briefs; regenerate baseline after W3 lands.

**Sequencing (recommended, awaiting veto):** W1 → W3 → W4, with W2 as its own track landing after — the prompt gets a small hot-swapped addendum for `add_annotation` when threads exist (catalog disk-sync makes prompt updates cheap). Rationale: W2 spans three packages, a schema migration, a new patch channel, and net-new UI; holding the prompt rewrite on it delays the core of this effort.

## Open questions (all awaiting Ford's veto/confirm)

- Sequencing recommendation above: W1 → W3 → W4 first, W2 after with a prompt addendum.
- Sticky threshold wording: "node text is a label: a few words, one line. The moment it needs a sentence of explanation, the sentence goes on a sticky beside the node."
- Thread-status recommendation: annotation status + replies move into the document (fixes the invisible-disposal hole; threads ride the draft).
- Where agent-authored threads surface in the operator UI (pins exist; thread view has no home yet — sidebar detail? popup upgrade?).
- Craft-targets defaults: column-gap target must be raised above the 80 crowding floor — pick the number.

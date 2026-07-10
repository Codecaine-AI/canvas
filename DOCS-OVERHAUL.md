# Docs Overhaul — Session Plan

**Session 2 of 2.** Prerequisite: the layout session
([LAYOUT-OVERHAUL.md](LAYOUT-OVERHAUL.md)) has landed and the file tree is
frozen. Do not start this session before that commit exists — every doc
rewritten here references paths in the frozen tree.

## Goal

Two goals, deliberately entangled:

1. **Heavy overhaul of the canvas docs** (`docs/`) — content and structure —
   so they match the post-layout repo and the current feature set.
2. **Dogfood the docs system** while doing it. The friction found while
   authoring real docs drives changes to docs-system itself: its structure,
   its viewer/editor components, and its functionality.

The inversion that makes this work: writing the docs *is* the audit. When a
section is hard to write, that is simultaneously a docs finding and a
docs-system UX finding.

## Setup

The docs system is embedded as a git submodule at `tools/docs-framework`
(a full clone of `Codecaine-AI/docs-system`). The `bun run docs` script
already points at its CLI, which runs straight from TypeScript source — edits
inside the submodule are live immediately. No symlinks, no second checkout.

```bash
git submodule update --init tools/docs-framework   # NOT --recursive: docs-system
                                                   # embeds canvas back at external/canvas
cd tools/docs-framework && bun install && cd -
bun run docs serve                                  # workbench at http://127.0.0.1:4800
```

Confirm the workbench renders the existing canvas docs (already migrated:
`doc.json` bundles under `docs/00-foundation`, `10-system-design`,
`20-implementation`, `99-appendix`, with a backlinks index at
`docs/.index/`). Any breakage during boot is dogfood finding #1.

This session is **interactive**: Ford works in the workbench alongside the
agent. Expect review-and-react loops, not a fire-and-forget pipeline.

## The three lanes

Everything discovered in this session goes into exactly one lane:

1. **Canvas doc content/structure** → done here, through the docs system
   (workbench edits, mutation API, CLI). Restructure a section *before*
   filling its content, so we never write into a shape about to change.
2. **Docs-system changes** (components, functionality, framework structure)
   → done here, live in the submodule checkout. Small friction fixes happen
   inline as they surface; anything with design weight goes on the findings
   log and gets batched into its own pass. Don't let a docs-system rabbit
   hole stall the section walk.
3. **Canvas code findings** (dead exports, confusing APIs, layout regrets)
   → **queued only.** No canvas code changes ride along with this session;
   the tree is frozen.

Keep a running findings log (a doc in the system — dogfood it) recording each
friction point, its lane, and its resolution. This log is the dogfooding
deliverable back to the docs-system project.

## Process

### 1. Structure pass

Read `LAYOUT-PROPOSAL.md` (output of the layout session) and the current
`docs/` section map. Propose the target docs structure: which sections exist,
numbering, what merges/splits/dies. Ford approves before content work starts.

### 2. Section-by-section content pass

For each section, in order:
- Read the current doc against the frozen tree and the actual code.
- Rewrite through the docs system. Use `bun run docs grep` to find stale path
  references (the layout session intentionally left them stale) and
  `bun run docs links check` to catch broken references after edits.
- File friction into the lanes as it appears.

Implementation work in lanes 1–2 that an agent performs runs through Codex
(`codex exec`, per the global sub-agent rule); doc-content authoring judgment
stays with the primary/Ford in the workbench.

### 3. Docs-system batch pass

Work the accumulated lane-2 findings that were too big for inline fixes.
Each fix is immediately testable against the real canvas docs via the running
workbench.

### 4. Land in dependency order

1. Submodule first: commit and push docs-system changes from inside
   `tools/docs-framework` (branch → push to `Codecaine-AI/docs-system`).
2. Canvas second: bump the submodule pointer, commit docs changes +
   `docs/.index` rebuild (`bun run docs backlinks rescan`).
3. Sibling checkout at `../docs-system` pulls afterward.

## Exit criteria

- Every `docs/` section rewritten or explicitly marked current; no stale
  pre-layout paths (`docs grep` spot checks + `links check` clean).
- Docs structure matches the approved structure pass.
- Findings log complete, with every entry resolved or queued with an owner
  lane.
- Docs-system changes pushed; canvas submodule pointer bumped; both repos
  committed.

## Hazards

- **Do not init the submodule recursively** (circular: docs-system ⟲ canvas).
- The canvas test suite is red at HEAD by design — irrelevant here, but do not
  "fix" it in passing; the tree is frozen.
- Concurrent sessions have clobbered uncommitted work in this tree before:
  commit in small units, re-read files from disk before reporting their state.
- `docs/.index/` is derived, gitignored state — always rebuildable via
  `backlinks rescan`; never hand-edit.

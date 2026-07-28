<current_state>
<last_updated>2026-07-28 (F3 grid pass + R1 rename + R10 sentence executed; F3 result-shape pass still open; F5 eval-runner cap mislabel added)</last_updated>

<status>
    - F1 eval baseline — PARKED on Ford's decision.
    - F2 worked example — OPEN, ready to execute.
    - F3 rulebook — PARTIALLY DONE. The grid pass, the R1 rename, and the R10
      sentence repair are executed (see <completed>). The result-shape pass
      (digest-row and ROUTES-block claims) is the only part still open.
    - F4 viewer kernel-root switch — OPEN, ready to execute; prerequisite for
      eval state isolation.
    - F5 eval-runner tool-call-cap mislabel — OPEN, small code fix. The eval
      runner hardcodes toolCallCap = 3 with a comment calling it the agent
      default, but agent.json's default is 1, and the runner only exports
      CANVAS_AGENT_TOOL_CALL_CAP when the flag was passed explicitly — so a
      run whose fingerprint.md records cap 3 actually executed at cap 1. Fix:
      read the real default (or always export the env var), and note that two
      existing run fingerprints record the stale 3. Touches the F1 decision:
      any regenerated baseline should carry a truthful cap.
    - TWO PREMISE CORRECTIONS were found while building this bundle. Both are
      recorded in full under <risks_or_open_questions>. Read them before
      planning F1 or F3.
    - UNCOMMITTED SCOPE: all eleven rulebook doc.json files are modified
      against HEAD. Those modifications are the newest and most correct
      content in the section (the match_size/align edits and the clipped-text
      lint enumeration). A concurrent session can revert uncommitted files —
      save a patch and re-grep before assuming they are still there.
</status>

<completed>
    F3 — GRID PASS (all twelve locations, seven pages). Every rulebook
    statement about the agent's grid now says 20, verified against
    packages/canvas-agent/src/service/session/tools/grid.ts (AGENT_GRID = 20).
    `grep -rn "16px" docs/30-agent-layout/20-rulebook` returns nothing; the
    only remaining "16" strings under the rulebook are 160px/168px spacing
    rungs in 02-r2, which are not grid claims.
        - 00-overview: `b-rulebook-root` (props.concepts "16px grid" → "20
          grid"; props.covers dropped a hardcoded diagnostic count in the same
          edit), `b-rulebook-naming-3` (grid clause only — the clipped-text
          lint enumeration and its source references are untouched),
          `b-rulebook-idx-r1-5` (link text, doc path, label, and the "quantized
          to 16px" summary clause)
        - 01-r1: rewritten, see the rename entry below
        - 04-r4-grid `b-r4-detect-3`, 05-r5-align `b-r5-order-excluded-7`,
          07-r7-hug `b-r7-expand-4`, 08-r8-size-semantics `b-r8-body-3`,
          10-r10 `b-r10-body-3` — grid clause only in each; every must-preserve
          match_size/align clause re-grepped and still present verbatim.

    F3 — R1 RENAME AND REWRITE. The bundle is now
    docs/30-agent-layout/20-rulebook/01-r1-the-20-grid/ (git mv, so the rename
    is staged as a rename). Page id → canvas-30-agent-layout-20-rulebook-01-r1-
    the-20-grid, title → "R1 — The 20 grid". Blocks changed: `b-r1-root`
    (covers + concepts), `b-r1-title-1`, `b-r1-card-2` (props.title + body),
    `b-r1-enforce-3`. The body now teaches the agent's grid: the gesture tools
    run every geometry-bearing value through AGENT_GRID = 20 and snap rather
    than refuse, the result reports the geometry that landed, and the
    quantized-vs-exempt table is not duplicated — the block carries a
    kind:"doc" reference to 30-agent-layout/50-tool-surface/20-grid-and-defaults
    instead. The wrong-module citation is gone: `b-r1-enforce-3` no longer
    references CANVAS_GRID_SIZE or snapGeometry in the canvas package.
    Inbound references fixed (a full-docs grep for the old slug now returns
    nothing): 00-overview `b-rulebook-idx-r1-5`, and
    50-tool-surface/20-grid-and-defaults `b-ts-gr-three-r1-17`, which had
    framed R1 as the UI-grid rule and now points at it as the rule form of the
    agent grid while stating that the 16 grid belongs to the interactive canvas.

    F3 — R10 SENTENCE REPAIR (`b-r10-body-3`). The clause broken by the
    link-insert run is whole prose again: a successful gesture returns a result
    from `operationPerception` sized to that one operation, and a refused call
    carries only its error lines. The look description states view XOR at — a
    framed close-up of one region, one knob or the other and never both — with
    the board render riding the state block. The source reference is repointed
    to packages/canvas-agent/src/service/session/perception/perception.ts (the
    bundle's recorded path session/perception.ts was stale; the module moved
    into perception/).

    F3 — ONE ADJACENT REPAIR. 03-r3-section-trim `b-r3-body-3` carried a
    fit_section source reference to session/operations/sections.ts, which
    `docs links check` reported as stale; repointed to
    packages/canvas-agent/src/service/session/tools/operations/sections.ts
    (symbol fitSection verified there).

    VERIFICATION RUN: `bun run docs render` exits 0 on all eight touched
    bundles including the renamed R1; `bun run docs backlinks rescan docs`
    reindexes cleanly (75 sources, 1239 references); `bun run docs links check
    docs` reports 47 stale references, none under 20-rulebook or 50-tool-surface
    — all are pre-existing directory-shaped refs and missing files elsewhere
    (PROVENANCE.md, board-design-reference, canvases, package directories).
</completed>

<in_progress>
    F1 — EVAL BASELINE REGENERATION (parked on Ford)
    - Why it is owed: the eval suite writes a per-run `surface` hash over the
      agent's tool surface. Runs recorded before the session reorg carry a
      different hash than runs recorded after it, so their scores are not
      comparable and the scoreboard has no usable reference point.
    - Where the hash comes from: `collectSourceFingerprints` in
      packages/eval-suite/runner/src/scenario/queue.ts (~line 677). The
      `surface` entry (~lines 687-691) hashes three roots recursively:
        - packages/canvas-agent/src/service/session/
        - packages/canvas-agent/src/catalog/layout-editor/context/capabilities/
        - packages/canvas-agent/src/catalog/layout-editor/tools/
      via `recursiveFiles` (~line 619) and `hashFiles` (~line 630): sha256
      over repo-relative path + contents, truncated to the first eight hex
      chars.
    - Where it lands: `writeFingerprint` (~line 778, called ~line 1048) writes
      runs/<run-id>/fingerprint.md with a `surface hash` bullet and a details
      list under "Active tool-surface files"; the same hashes are duplicated
      into runs/<run-id>/services/identity.json as ServiceIdentity.hashes.
      `readFingerprint` in packages/eval-suite/runner/src/scorecard/assemble.ts
      (~line 151) parses it into scorecard.json.
    - Entry point: `make eval` → packages/eval-suite/runner/src/cli.ts suite
      --run-id <date>-eval-<time>. Output lands in packages/eval-suite/runs/.
    - Last recorded surface hash: 82bc455d, in
      packages/eval-suite/runs/2026-07-28-eval-170417/fingerprint.md.
    - Blocked on: Ford deciding to spend a suite run. See the correction in
      <risks_or_open_questions> about what "baseline" actually means here.

    F2 — WORKED EXAMPLE REGENERATION
    - Directory: docs/30-agent-layout/30-worked-example/ — eight bundles:
      00-overview ("A board in seven edits") plus 01-step-lane-and-stage,
      02-step-runner-pipeline, 03-step-board-hub, 04-step-score-column,
      05-step-hero-row, 06-step-fan-and-arrows, 07-step-one-more-store. Steps
      1-7 each carry assets/canvases/step-N.canvas.json + step-N.dsl.
    - The example's own disclaimer: 00-overview/doc.json block
      `b-worked-stale-marker` (flavour observation) states that every page is
      written against the retired batch surface and that re-recording against
      the gesture surface is its own follow-up. That block is what this
      follow-up closes; it is removed last, once nothing it warns about
      remains.
    - Prose carrying the retired batch vocabulary:
        - 00-overview `b-worked-lede-2` (also claims a 16px grid)
        - 01-step-lane-and-stage `b-step1-body-2` (also claims 16px grid units)
        - 07-step-one-more-store `b-step7-body-2` (also claims 16px
          quantization)
    - METADATA also carries it, and is easy to miss: every one of the eight
      root blocks (`b-worked-root`, `b-step1-root` … `b-step7-root`) lists the
      retired batch call in `props.concepts`; `b-step5-root` carries it in
      `props.covers` as well; `b-worked-root` also lists the batch-era
      concepts "atomic operation batch" and "cumulative board diff".
    - Scope note — the look cadence must be re-recorded too. The board arrives
      with the pushed state block; `look` is a framed close-up taking `view`
      XOR `at`, rejecting both-set and neither-set, and stripping diagnostics
      from its result
      (packages/canvas-agent/src/service/session/tools/workflow/look.ts).
    - Clean: no reference to a draft-render tool survives anywhere under
      30-worked-example.

    F3 — RULEBOOK REGENERATION (grid pass DONE; result-shape pass OPEN)
    - Directory: docs/30-agent-layout/20-rulebook/ — eleven pages: 00-overview
      plus 01-r1-the-20-grid, 02-r2-the-spacing-ladder, 03-r3-section-trim,
      04-r4-grid, 05-r5-align, 06-r6-fan, 07-r7-hug, 08-r8-size-semantics,
      09-r9-feedback-edges, 10-r10-what-the-language-refuses-to-say.
    - WHAT IS LEFT: only the result-shape pass, plus one stale batch-era clause
      found during the grid pass:
        - 01-r1-the-20-grid `b-r1-evidence-4`: "Operation results and looks
          report the post-snap geometry in their digest rows…" — left as found.
        - 04-r4-grid `b-r4-evidence-5`: "an operation result carries digest
          rows for what it touched…" — left as found.
        - 06-r6-fan `b-r6-pitch-6` and `b-r6-evidence-8`, 09-r9-feedback-edges
          `b-r9-evidence-4` — all three promise a ROUTES block; unverified.
        - Verify all five against
          packages/canvas-agent/src/service/session/perception/perception.ts
          (NOTE the corrected path: the module lives in perception/, and
          `operationPerception` and `routesBlock` are both exported there).
        - 00-overview `b-rulebook-naming-3` ends with "A fixable finding
          includes ready-to-send `suggested op:` JSON." Nothing under
          packages/canvas-agent/src emits that string any more, so the claim is
          stale batch-era phrasing in a block whose lint enumeration must be
          preserved. Fix the clause surgically; it was out of scope for the
          grid pass and remains untouched.
    - GRID TRUTH (kept for reference): `AGENT_GRID = 20` in
      packages/canvas-agent/src/service/session/tools/grid.ts is the grid the
      agent writes on. Its header is explicit that there are three grids.
      `CANVAS_GRID_SIZE = 16` (packages/canvas/src/state/geometry.ts, line 16)
      is the INTERACTIVE DRAG grid — what a human drag, resize, or nudge lands
      on, consumed by stage/editor/features/snapping/snapping.ts and
      use-canvas-hotkeys.ts. `GEOMETRY_NORMALIZATION_GRID = 4` (same file,
      line 30) is the write-path normalization.
    - WRONG-GRID INVENTORY — seven pages, twelve locations. ALL TWELVE ARE
      FIXED; kept here as the record of what was swept:
        - 00-overview: `b-rulebook-root` (props.concepts lists the wrong grid),
          `b-rulebook-naming-3` ("patched geometry snaps to the 16px grid"),
          `b-rulebook-idx-r1-5` (the R1 index line)
        - 01-r1 (now 01-r1-the-20-grid): `b-r1-root` (props.covers + props.concepts),
          `b-r1-title-1` (the page title), `b-r1-card-2` (props.title and
          body), `b-r1-enforce-3` — this last one names the WRONG MODULE, not
          just the wrong number: it cites CANVAS_GRID_SIZE = 16 and
          snapGeometry directly.
        - 04-r4-grid: `b-r4-detect-3`
        - 05-r5-align: `b-r5-order-excluded-7`
        - 07-r7-hug: `b-r7-expand-4`
        - 08-r8-size-semantics: `b-r8-body-3`
        - 10-r10-…: `b-r10-body-3`
      The DIRECTORY NAME was wrong too. It is renamed to 01-r1-the-20-grid,
      and both inbound citers are updated (00-overview's R1 index line and
      50-tool-surface/20-grid-and-defaults `b-ts-gr-three-r1-17`).
      (Not grid claims, do not touch: `b-r2-rung-sibling-11` and
      `b-r2-rung-section-12` in 02-r2-the-spacing-ladder merely contain "16"
      inside 168px / 160px.)
    - BROKEN SENTENCE in 10-r10 `b-r10-body-3` — FIXED, along with the look
      description and the stale reference path. See <completed>.
    - MUST-PRESERVE (fresh, uncommitted, would be lost by a wholesale
      regeneration). Every item below was re-grepped after the grid pass and is
      still present verbatim:
        - R1 `b-r1-enforce-3` — "…match_size copies a peer's dimensions, and
          every other coordinate comes from exact digest geometry." (This
          block is MIXED: preserve the match_size clause, fix the grid claim
          in the same block.)
        - R4 `b-r4-detect-3` — "…match_size every peer to the largest member
          and read exact digest geometry for the rest…" (also MIXED: carries a
          grid claim.)
        - R5 `b-r5-detect-3` — "align puts a set of boxes on one edge or
          centerline, space_out sets the repeated gap along the flow axis,
          match_size copies a peer's dimensions…"
        - R10 `b-r10-body-3` — "match_size carries peer size, and the exact
          pitch comes from the latest BOARD digest." (MIXED: same block as the
          broken sentence and a grid claim.)
        - ALSO FRESH, not in the original follow-up note: R8
          `b-r8-target-5` ("…then use match_size to match peers to the largest
          member without hand-copying its dimensions.") and R5
          `b-r5-expand-4` ("Exact alignment is aesthetic guidance rather than a
          diagnostic.").
        - 00-overview `b-rulebook-naming-3` — the clipped-text lint
          enumeration: "The covered-content, containment, broken-edges,
          crowding, unreadable-labels, and clipped-text lints judge production
          geometry…", each lint name carrying a source reference to
          packages/canvas-agent/src/board/lints/rules/<name>.ts. This block is
          the most MIXED of all: the enumeration and its references are new
          and correct, while the same paragraph carries the stale 16px clause
          and batch-era phrasing about a ready-to-send suggested op. Edit it
          surgically; do not replace it.

    F4 — VIEWER KERNEL-ROOT SWITCH
    - Goal: a configurable kernel root, so an eval run can be pointed at its
      own state directory instead of sharing a developer's live one.
    - packages/canvas-agent/src/viewer/lib/ holds exactly two files:
      kernel-api.ts (URL builders — AGENT_API_BASE = "/api/agent",
      LAYOUT_AGENT_NAME, and the trace/catalog/transcript path helpers) and
      navigation.ts (pushState + synthetic popstate).
    - KEY FINDING: the viewer never touches a kernel root. It is a pure HTTP
      client; every byte arrives over the proxy. So this follow-up is mostly a
      SERVICE-side change plus a viewer target change:
        - packages/canvas-agent/src/service/kernel.ts is the seam.
          `REPO_ROOT` (line 29) → `AGENT_KERNEL_DIR` (line 31) →
          `PI_SESSIONS_DIR` (line 32). Not env-overridable today.
        - `bootKernelDatabase` (~line 94) passes REPO_ROOT — not
          AGENT_KERNEL_DIR — to the kernel database path helper and the
          manifest writer, which derive the state directory internally. Both
          must be threaded, or the root splits across two trees.
        - packages/canvas-agent/src/service/session/store.ts line 68 builds
          SESSION_DIR_ROOT from AGENT_KERNEL_DIR, while ~line 441 passes
          REPO_ROOT as the kernel state root. Two independent roots to unify.
        - packages/canvas-agent/src/cli.ts line 79 has a third, cwd-based
          derivation (already fronted by a CLI_RENDER_DIR env override).
        - PRECEDENT TO COPY: `CANVAS_AGENT_CANVASES_DIR` in kernel.ts line 35
          is the existing env-resolved-directory pattern in this file.
        - Viewer side: the constant that actually pins which harness the
          viewer sees is HARNESS_TARGET in
          packages/canvas-agent/src/viewer/vite.config.ts (~line 38), feeding
          the /api proxy; AGENT_API_BASE in lib/kernel-api.ts is the in-app
          prefix.
    - NAME TRAP: vite.config.ts also defines an `AGENT_KERNEL_DIR`, but that
      one is the SIBLING SOURCE CHECKOUT used for server.fs.allow. It has
      nothing to do with the state directory. Do not conflate them.
</in_progress>

<next_actions>
    - FIRST, no dependencies: F3 result-shape pass — the five digest-row and
      ROUTES-block claims, plus the stale `suggested op:` clause in
      00-overview `b-rulebook-naming-3`. Read
      packages/canvas-agent/src/service/session/perception/perception.ts first.
      The grid pass, the R1 rename, and the R10 sentence repair are done.
    - IN PARALLEL if there is a second worker: F2 worked-example re-recording.
      It needs a headless CLI run, so it is the longest-lead item.
    - F4 whenever code time is available; it gates isolated eval state.
    - F1 only after Ford decides. Ask him directly; it is a one-word unblock.
</next_actions>

<risks_or_open_questions>
    - CORRECTION 1 (F1) — there is NO committed eval baseline file. The
      follow-up was framed as "the fingerprint marks pre/post-reorg runs
      incomparable", which is true, but there is no baseline JSON under
      packages/eval-suite/ and no fingerprint-comparison code anywhere. The
      de-facto baseline is the previous run directory's fingerprint.md and
      scorecard.json, compared by hand. "Regenerating the baseline" therefore
      means: run the suite, and treat the new run directory as the reference
      point. The `surface` field in scorecard.json is explicitly optional
      (assemble.ts documents it as absent in fingerprints written before the
      surface hash existed), so older runs will simply lack it.
    - CORRECTION 2 (F3) — the rulebook does NOT contain a stale
      look-with-diagnostic description. The follow-up was framed as "the stale
      look-with-diagnostic description in the rulebook overview and R10", but
      a sweep of every doc.json under 20-rulebook found no text describing
      `look` as carrying a diagnostic argument or knob. What is actually there:
      R10 `b-r10-body-3` describes look's result loosely ("a look returns the
      whole board"), and the same block's second sentence correctly says no
      diagnostic enforces abstract peer alignment. 00-overview mentions
      diagnostics only in props.covers and in `b-rulebook-lab-body-20`,
      neither tied to look. So the real item is narrower: make
      `b-r10-body-3` state `view` XOR `at` while repairing its broken opening
      clause. The premise about the TOOL is correct — look.ts does reject
      both-set and neither-set and strips diagnostics — it just was never
      wrong in the rulebook.
    - OPEN (Ford): does F1 run now, or wait until F3 and F4 land so one run
      covers everything? A suite run costs real inference.
    - SETTLED (Ford, during the grid pass): R1 is renamed. The bundle is
      01-r1-the-20-grid, 20 is the standard everywhere the agent's behavior is
      described, and both inbound citers were rewritten in the same pass.
    - RISK: the rulebook's correct content is uncommitted. A concurrent
      session working the same tree can revert it. Save a patch before a long
      sitting and re-grep file contents before reporting anything as done.
    - RISK (F1 execution): stale services silently reuse listeners on the eval
      ports and will run old in-memory code. Kill them before a run and check
      the transcript's tool names to confirm the run exercised the current
      surface.
</risks_or_open_questions>

<important_paths>
    - packages/canvas-agent/src/service/session/tools/grid.ts — AGENT_GRID = 20
      and the three-grid header; the authority for every F3 grid repair
    - packages/canvas/src/state/geometry.ts — CANVAS_GRID_SIZE = 16 (drag
      grid, line 16), GEOMETRY_NORMALIZATION_GRID = 4 (line 30)
    - packages/canvas-agent/src/service/session/tools/workflow/look.ts — view
      XOR at; the look cadence F2 must re-record and F3 must describe
    - packages/canvas-agent/src/service/session/perception/perception.ts — the
      authority for every result-shape claim F3 still owes
    - docs/30-agent-layout/20-rulebook/ — eleven pages, all uncommitted;
      01-r1-the-20-grid is a staged rename
    - docs/30-agent-layout/30-worked-example/00-overview/doc.json — carries
      `b-worked-stale-marker`, the disclaimer F2 closes
    - packages/eval-suite/runner/src/scenario/queue.ts —
      collectSourceFingerprints and the surface hash
    - packages/eval-suite/runner/src/scorecard/assemble.ts — readFingerprint
    - packages/eval-suite/runs/2026-07-28-eval-170417/fingerprint.md — the most
      recent recorded surface hash (82bc455d)
    - packages/canvas-agent/src/service/kernel.ts — the F4 seam
      (REPO_ROOT / AGENT_KERNEL_DIR / PI_SESSIONS_DIR / bootKernelDatabase),
      plus CANVAS_AGENT_CANVASES_DIR as the pattern to copy
    - packages/canvas-agent/src/service/session/store.ts — SESSION_DIR_ROOT
      and the kernel state root
    - packages/canvas-agent/src/viewer/vite.config.ts — HARNESS_TARGET; also
      the source-checkout constant that must not be confused with the state
      directory
    - docs/30-agent-layout/60-running — how to run the harness, viewer, and
      headless CLI that F2 and F4 both need
</important_paths>
</current_state>

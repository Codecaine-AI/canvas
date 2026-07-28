<implementation_scope>
    <owned_surfaces>
        - `docs/30-agent-layout/20-rulebook/**/doc.json`: eleven pages
          (00-overview plus 01-r1 through 10-r10) — grid claims, result-shape
          claims, and R10's malformed sentence.
        - `docs/30-agent-layout/30-worked-example/**/doc.json`: eight bundles
          (00-overview plus 01-step through 07-step) and their
          `assets/canvases/step-N.canvas.json` + `step-N.dsl` sidecars.
        - `packages/canvas-agent/src/service/kernel.ts`: kernel-root
          resolution (F4's primary seam).
        - `packages/canvas-agent/src/service/session/store.ts`: the session
          directory root and the state root passed to the kernel.
        - `packages/canvas-agent/src/cli.ts`: the third, cwd-based derivation
          of the state directory.
        - `packages/canvas-agent/src/viewer/vite.config.ts` and
          `packages/canvas-agent/src/viewer/lib/kernel-api.ts`: the viewer's
          harness target and API base.
    </owned_surfaces>

    <read_only_references>
        - `packages/canvas-agent/src/service/session/tools/grid.ts`: the grid
          truth. AGENT_GRID = 20; its header names all three grids.
        - `packages/canvas/src/state/geometry.ts`: CANVAS_GRID_SIZE = 16 (the
          interactive drag grid, line 16) and GEOMETRY_NORMALIZATION_GRID = 4
          (line 30). Consumers that prove the drag framing:
          `packages/canvas/src/stage/editor/features/snapping/snapping.ts`
          and `packages/canvas/src/stage/editor/use-canvas-hotkeys.ts`.
        - `packages/canvas-agent/src/service/session/tools/workflow/look.ts`:
          `view` XOR `at`, both-set and neither-set rejected, diagnostics
          stripped from the result. The look cadence the worked example must
          match.
        - `packages/canvas-agent/src/service/session/tools/operations/`: the
          gesture specs the worked example and rulebook describe.
        - `packages/canvas-agent/src/service/session/perception.ts`: what an
          operation result and a look actually carry — the authority for
          every result-shape claim.
        - `packages/eval-suite/runner/src/scenario/queue.ts`:
          `collectSourceFingerprints` (~line 677) and the `surface` entry
          (~lines 687-691), hashing three roots —
          `packages/canvas-agent/src/service/session/`,
          `packages/canvas-agent/src/catalog/layout-editor/context/capabilities/`,
          and `packages/canvas-agent/src/catalog/layout-editor/tools/` —
          via `recursiveFiles` + `hashFiles` (sha256, first eight hex chars).
          `writeFingerprint` emits `runs/<run-id>/fingerprint.md`.
        - `packages/eval-suite/runner/src/scorecard/assemble.ts`:
          `readFingerprint` and the optional `surface` field carried into
          scorecard.json.
        - `packages/eval-suite/RUNNER.md`: the surface-hash prose.
        - `docs/30-agent-layout/40-kernel/doc.json` and
          `docs/30-agent-layout/60-running/doc.json`: current pages; use them
          as the voice and reference-style model, do not edit them here.
    </read_only_references>

    <generated_outputs>
        - `docs/.index/backlinks.db`: `bun run docs backlinks rescan docs`.
        - `packages/eval-suite/runs/<run-id>/`: fingerprint.md, scorecard.md,
          scorecard.json, services/identity.json, per-scenario output. Written
          by a suite run; never hand-edited.
        - Worked-example canvas sidecars: regenerated from the re-recorded
          session, not hand-tuned.
    </generated_outputs>

    <commands_and_entrypoints>
        - `bun run docs render docs/30-agent-layout/<bundle>`: render one
          bundle to the agent surface; the per-edit gate.
        - `bun run docs backlinks rescan docs` / `bun run docs links check docs`:
          reference integrity (positional docsRoot).
        - `make harness` / `make traces`: harness on :4820, viewer on :4830.
          Operating detail lives in docs/30-agent-layout/60-running.
        - `bun run cli --canvas <id> --scope <ids> --instruction "…"` from
          `packages/canvas-agent`: the headless session used to re-record the
          worked example.
        - `make eval`: the suite run that produces a new fingerprint. Parked
          on Ford (F1).
    </commands_and_entrypoints>

    <adjacent_surfaces_requiring_caution>
        - The kernel root is derived in more places than it looks:
          `service/kernel.ts` defines AGENT_KERNEL_DIR and PI_SESSIONS_DIR
          off REPO_ROOT, but `bootKernelDatabase` passes REPO_ROOT itself to
          the kernel database and manifest helpers, `store.ts` builds
          SESSION_DIR_ROOT from AGENT_KERNEL_DIR while passing REPO_ROOT as
          the state root, and `cli.ts` resolves its own copy from
          `process.cwd()`. F4 must thread one value through all of them.
        - `CANVAS_AGENT_CANVASES_DIR` in `service/kernel.ts` is the existing
          precedent for an env-resolved directory; copy its pattern rather
          than inventing a new one.
        - `AGENT_KERNEL_DIR` in `viewer/vite.config.ts` is the sibling source
          checkout used for `server.fs.allow`, not the state directory. Do not
          conflate the two names.
        - The rulebook's uncommitted working-tree edits are the newest
          content in the section; check `git status` before assuming HEAD is
          the truth.
    </adjacent_surfaces_requiring_caution>

    <out_of_scope>
        - The tool surface itself and the capabilities block.
        - docs/30-agent-layout/40-kernel and 60-running.
        - The eval suite's scoring axes and judges.
        - Studio and canvas package internals beyond reading the grid
          constants.
    </out_of_scope>
</implementation_scope>

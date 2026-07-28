<problem>
    <objective_question>
        - The agent's editing surface was refactored into editing gestures
          under packages/canvas-agent/src/service/session/. Which artifacts
          still describe or measure the surface it replaced, and what does
          each one need before it can be trusted again?
    </objective_question>

    <current_baseline>
        - 2026-07-28: the gesture surface is in place. Tools live under
          packages/canvas-agent/src/service/session/tools/ split into
          operations/ and workflow/; the catalog registers what the service
          defines.
        - packages/canvas-agent/src/service/session/tools/grid.ts is explicit
          that there are three grids and that AGENT_GRID = 20 is the one the
          agent writes on. packages/canvas/src/state/geometry.ts holds the
          other two: CANVAS_GRID_SIZE = 16 for interactive drag/resize/nudge
          and GEOMETRY_NORMALIZATION_GRID = 4 for every geometry write.
        - packages/canvas-agent/src/service/session/tools/workflow/look.ts
          takes `view` XOR `at` — it rejects both-set and neither-set, and
          strips diagnostics from its result. The board arrives with the
          pushed state block; look is the framed close-up, not the way the
          whole board is fetched.
        - docs/30-agent-layout/40-kernel and docs/30-agent-layout/60-running
          are current. The rulebook and the worked example are not.
    </current_baseline>

    <why_current_state_is_insufficient>
        - Seven rulebook pages teach a 16px agent grid. An agent that follows
          them writes geometry on the wrong quantum, and R1 compounds it by
          citing CANVAS_GRID_SIZE and snapGeometry by name — the wrong module,
          not just the wrong number.
        - The worked example carries a disclaimer admitting it was recorded
          against the retired batch surface. A disclaimer is a stopgap; a
          reader still has to reconstruct what the current surface would do.
        - Rulebook pages promise that operation results carry digest rows.
          Result shapes are how an agent decides what to read next, so a wrong
          promise sends it looking for a block that is not there.
        - The eval suite hashes the session directory into a per-run surface
          fingerprint. Runs from before and after the reorg carry different
          hashes and are not comparable, so the scoreboard has no usable
          reference point until someone decides to re-baseline.
        - Eval runs share the developer's kernel state directory, so an eval
          and a live session write into the same place. Isolating them needs a
          configurable kernel root that does not exist yet.
    </why_current_state_is_insufficient>

    <failure_modes>
        - `wholesale_regeneration`: rewriting a rulebook page from scratch
          destroys the fresh match_size/align content and the clipped-text
          lint enumeration, both of which are correct and both of which sit
          in the same blocks as the stale claims. Edit by block id.
        - `doc_verified_against_doc`: confirming a claim by reading another
          page instead of the code. Every grid, tool, and result-shape claim
          is checked against the named source file.
        - `premature_rebaseline`: running the eval suite before the decision
          is made spends inference and overwrites the comparison it was meant
          to preserve.
        - `partial_kernel_root`: parameterizing one of the several places the
          kernel root is derived and leaving the others, producing a run
          whose sessions and trace database live in different trees.
    </failure_modes>

    <prior_evidence>
        - docs/30-agent-layout/30-worked-example/00-overview/doc.json block
          `b-worked-stale-marker`: the example's own admission that it is
          written against the retired batch surface, and that re-recording it
          is a separate follow-up.
        - packages/canvas-agent/src/service/session/tools/grid.ts header:
          "THREE GRIDS, ONE OF THEM THIS ONE."
        - packages/eval-suite/runner/src/scenario/queue.ts
          `collectSourceFingerprints`: the surface hash and the roots it
          covers.
        - packages/eval-suite/RUNNER.md: prose describing the surface hash.
    </prior_evidence>

    <expected_value>
        - An agent-layout section an agent can follow without being taught the
          wrong grid, a worked example that matches the surface it documents,
          an eval scoreboard with a defensible reference point, and eval runs
          that cannot corrupt a developer's live kernel state.
    </expected_value>
</problem>

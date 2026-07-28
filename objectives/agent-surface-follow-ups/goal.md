<goal>
    - Close the four follow-ups the gesture tool surface left owed: an eval
      baseline that can be compared again, a worked example re-recorded
      against the gesture surface, a rulebook whose numbers and result
      shapes match the code, and a configurable kernel root so eval runs can
      be isolated from a developer's live state.
    - This objective owns: docs/30-agent-layout/20-rulebook/**,
      docs/30-agent-layout/30-worked-example/**, the kernel-root resolution
      in packages/canvas-agent/src/service/ and the viewer's harness target,
      and the decision record for when the eval suite is re-baselined.
    - Each of the four is independently landable. They are bundled because
      they share one cause: the surface under
      packages/canvas-agent/src/service/session/ changed, and the artifacts
      describing or measuring it did not follow.
</goal>

<context_refresh>
    <required_files>
        - objectives/agent-surface-follow-ups/goal.md
        - objectives/agent-surface-follow-ups/current_state.md
        - objectives/agent-surface-follow-ups/context/00_problem.md
        - objectives/agent-surface-follow-ups/context/01_constraints.md
        - objectives/agent-surface-follow-ups/context/02_implementation_scope.md
        - objectives/agent-surface-follow-ups/context/03_working_plan.md
        - objectives/agent-surface-follow-ups/context/04_validation_and_handoff.md
    </required_files>

    <instruction>
        - At objective start and after compaction/resume, reread the required
          files and treat this bundle as the authority for this objective.
        - current_state.md carries the per-follow-up status, including which
          items are parked on Ford and which are ready to execute.
        - Code wins over prose. Every claim this objective repairs was
          verified against a named file; re-verify before rewriting, because
          the surface is still moving.
    </instruction>
</context_refresh>

<working_strategy>
    - Treat the four follow-ups as separate work items with separate gates.
      F2 (worked example) and F3 (rulebook) are doc regenerations and can run
      in parallel; F4 (kernel root) is a code change; F1 (eval baseline) is a
      decision that unblocks a run, not an edit.
    - F4 lands before any eval re-baseline that needs isolation: a
      configurable kernel root is the prerequisite for pointing an eval run
      at its own state directory.
    - Doc work is surgical, never wholesale. The rulebook and the worked
      example both carry fresh, correct content mixed into stale blocks;
      regenerating a page from scratch destroys the fresh part. Edit by
      block id.
    - Verify every repaired claim against the code path named in
      context/02, not against another doc.
</working_strategy>

<success_metrics>
    - No page under docs/30-agent-layout/ states a grid value that
      contradicts packages/canvas-agent/src/service/session/tools/grid.ts.
    - The worked example describes the gesture surface and the current look
      cadence, and its stale-surface disclaimer block has been removed
      because it is no longer true.
    - The kernel root is resolved from one configurable value, and an eval
      run can be pointed at a state directory that is not the developer's.
    - The eval baseline decision is recorded here with a date and an owner,
      whichever way it goes.
</success_metrics>

<non_goals>
    - Do not change the tool surface itself to make a doc true; the doc is
      what is wrong.
    - Do not re-baseline the eval suite before Ford decides — a run costs
      real inference and discards the comparison it is meant to preserve.
    - Do not renumber or restructure docs/30-agent-layout/ sections; this
      objective repairs content inside the existing tree.
    - Do not fold the three grids into one. They are deliberately distinct.
</non_goals>

<completion_criteria>
    - All four follow-ups either landed with their gate green or explicitly
      closed with a recorded rationale in current_state.md.
    - `bun run docs render` clean for every touched bundle, backlinks
      rescanned, links check reporting no stale references.
    - current_state.md updated with a final handoff marked COMPLETE.
</completion_criteria>

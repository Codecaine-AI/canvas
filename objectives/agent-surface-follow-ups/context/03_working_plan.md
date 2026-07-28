<working_plan>
    <overview>
        1. session_boot - Load state, confirm which follow-ups are live and
           which are parked, check the tree.
        2. f3_rulebook - Repair the rulebook in place, by block id.
        3. f2_worked_example - Re-record the example against the gesture
           surface and rewrite its pages.
        4. f4_kernel_root - Make the kernel root configurable end to end.
        5. f1_eval_baseline - On Ford's decision, run the suite and record
           the new reference point.
        6. sitting_close - Validate, record, hand off.
    </overview>

    <operating_principles>
        - One follow-up at a time in a sitting unless two are genuinely
          independent; F2 and F3 are the pair that can run in parallel.
        - Every claim is verified against the source file named in
          context/02 before it is written, and the verification is recorded
          in current_state.md next to the change.
        - Surgical edits. Open the doc.json, change the named block's text
          runs, leave every other block byte-identical.
        - When a repair reveals that the premise was wrong, fix the premise
          in this bundle rather than writing a doc to match it. Two such
          corrections are already recorded in current_state.md.
        - F4 is a prerequisite for isolated eval state; land it before an
          eval re-baseline that needs isolation, not after.
    </operating_principles>

    <phase id="1" name="session_boot">
        <objective>
            - Know which of the four is live, and start from a tree that
              matches the state file.
        </objective>
        <inputs>
            - This bundle's required_files; `git status`.
        </inputs>
        <process>
            - Read current_state.md; announce which follow-ups are open,
              parked, and done.
            - Confirm the uncommitted rulebook edits are still present before
              planning around them.
            - Re-read grid.ts and look.ts; the surface moves.
        </process>
        <outputs>
            - A one-paragraph opener naming the follow-up this sitting takes.
        </outputs>
        <gate>
            - Tree state reconciled with current_state.md, or the divergence
              written down.
        </gate>
        <failure_handling>
            - If the uncommitted rulebook content is gone, recover it before
              editing: a concurrent session can revert uncommitted files.
              Save a patch first.
        </failure_handling>
    </phase>

    <phase id="2" name="f3_rulebook">
        <objective>
            - Every rulebook page states the agent grid correctly, describes
              result shapes that exist, and reads as a whole sentence.
        </objective>
        <inputs>
            - The stale-claim inventory and the must-preserve inventory in
              current_state.md.
        </inputs>
        <process>
            - Grid pass: correct the twelve locations across seven pages,
              including R1's `b-r1-enforce-3` which cites the wrong module by
              name. Decide the R1 page identity separately — its title and
              its directory name both carry the wrong number, and renaming a
              bundle rewrites inbound references.
            - Result-shape pass: repair the digest-row claims in
              `b-r1-evidence-4` and `b-r4-evidence-5` against
              service/session/perception.ts, and check the neighbouring
              ROUTES-block claims in `b-r6-pitch-6`, `b-r6-evidence-8`, and
              `b-r9-evidence-4` while there.
            - Sentence pass: repair R10 `b-r10-body-3`, whose leading clause
              was broken by a link-label swap and now reads "Every successful
              the operation surface result is sized to its own operation".
              While in that block, make the look description state `view` XOR
              `at`.
            - Render each page after its edit; rescan backlinks once at the
              end of the pass.
        </process>
        <outputs>
            - Eleven pages rendering clean, with the must-preserve content
              intact.
        </outputs>
        <gate>
            - No "16" in a grid context under 20-rulebook; every preserved
              block still present verbatim.
        </gate>
        <failure_handling>
            - If a page needs more than block-level repair, park the page in
              current_state.md with what is wrong rather than regenerating it
              and losing the fresh content.
        </failure_handling>
    </phase>

    <phase id="3" name="f2_worked_example">
        <objective>
            - The seven-stage example shows the gesture surface doing the
              work, and the disclaimer is gone because it is no longer true.
        </objective>
        <inputs>
            - The current example's structure and its canvas sidecars.
        </inputs>
        <process>
            - Re-record: run the headless CLI against a board that produces
              the same shape of story, capturing the real calls and results.
            - Rewrite each step page against that recording: one gesture per
              call, bare place_* payloads, geometry on the agent grid, and
              the current look cadence — the board arrives with the pushed
              state block and a look is a framed close-up.
            - Sweep `props.concepts` and `props.covers` on all eight root
              blocks; the retired batch vocabulary is in the metadata as well
              as the prose.
            - Remove `b-worked-stale-marker` from 00-overview last, once
              nothing it warns about remains.
        </process>
        <outputs>
            - Eight bundles describing the current surface; sidecar canvases
              regenerated from the recording.
        </outputs>
        <gate>
            - No retired tool or batch vocabulary anywhere under
              30-worked-example, including root block props.
        </gate>
        <failure_handling>
            - If a re-recorded session does not produce a legible seven-stage
              story, keep the narrative structure and re-record smaller
              pieces rather than shipping a story the transcript does not
              support.
        </failure_handling>
    </phase>

    <phase id="4" name="f4_kernel_root">
        <objective>
            - One configurable value locates the kernel state directory, and
              every consumer reads it.
        </objective>
        <inputs>
            - The consumer list in context/02.
        </inputs>
        <process>
            - Add an env-resolved kernel root in service/kernel.ts following
              the CANVAS_AGENT_CANVASES_DIR pattern; redefine AGENT_KERNEL_DIR
              and PI_SESSIONS_DIR from it.
            - Thread it into the kernel database path, the manifest writer,
              and the state root, all of which currently take REPO_ROOT.
            - Update store.ts's session directory root and reconcile cli.ts's
              cwd-based fallback.
            - Viewer side: make the harness target configurable so the SPA can
              point at a harness bound to a different root.
        </process>
        <outputs>
            - A harness that can be started against an isolated state
              directory, with its viewer able to reach it.
        </outputs>
        <gate>
            - With the root set to a scratch directory, a full session writes
              its trace database, manifest, agent state, and session directory
              there and nothing into the default tree.
        </gate>
        <failure_handling>
            - If a consumer cannot be threaded (an upstream helper insists on
              a repo root), record which one and stop; a split root is worse
              than the current single hardcode.
        </failure_handling>
    </phase>

    <phase id="5" name="f1_eval_baseline">
        <objective>
            - The eval scoreboard has a reference point that matches the
              current surface.
        </objective>
        <inputs>
            - Ford's decision; the most recent run directory under
              packages/eval-suite/runs/.
        </inputs>
        <process>
            - Confirm the decision is recorded in current_state.md with a
              date.
            - Run `make eval`; capture the new run id.
            - Record the new surface hash and note which prior runs it makes
              incomparable, so the boundary is documented rather than
              inferred.
        </process>
        <outputs>
            - A run directory with fingerprint.md and scorecard.json, and a
              current_state.md entry naming it as the reference point.
        </outputs>
        <gate>
            - The new run's surface hash differs from the pre-reorg runs and
              matches the current tree.
        </gate>
        <failure_handling>
            - Stale services reuse listeners on the eval ports and will run
              old in-memory code. Kill them before a run, and check the
              transcript's tool names to confirm the run used the current
              surface.
        </failure_handling>
    </phase>

    <phase id="6" name="sitting_close">
        <objective>
            - Leave the repo and the state file ready for the next sitting.
        </objective>
        <inputs>
            - The sitting's changes.
        </inputs>
        <process>
            - Render every touched bundle; rescan backlinks; links check.
            - Update current_state.md: per-follow-up status, what was
              verified against which file, uncommitted scope, next action.
        </process>
        <outputs>
            - Updated current_state.md.
        </outputs>
        <gate>
            - A fresh agent could resume from this bundle alone.
        </gate>
        <failure_handling>
            - If closing mid-repair, name the exact block ids left
              half-edited; a half-edited doc.json is invisible in `git
              status`.
        </failure_handling>
    </phase>
</working_plan>

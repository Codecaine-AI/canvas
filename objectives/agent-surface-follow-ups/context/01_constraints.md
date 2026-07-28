<constraints>
    <hard_rules>
        - The three grids stay distinct and stay named: AGENT_GRID = 20
          (packages/canvas-agent/src/service/session/tools/grid.ts) is what
          the agent writes on; CANVAS_GRID_SIZE = 16
          (packages/canvas/src/state/geometry.ts) is the interactive drag
          grid; GEOMETRY_NORMALIZATION_GRID = 4 is the write-path
          normalization. A doc that says "the grid" without saying which one
          is not fixed.
        - No hardcoded tool or diagnostic counts in prose. Rosters change;
          a count in a sentence is a claim that rots on the next commit.
        - Timeless prose. No "formerly", no "superseded", no version
          archaeology, no reference to what a surface used to be. State what
          is true now. The word "chrome" is banned for UI furniture; the word
          is "trim".
        - Doc bundles are edited by block id. `bun run docs render <bundle>`
          must succeed and `bun run docs backlinks rescan docs` must be run
          after any reference change.
        - Source references in doc.json use file paths only, never
          directories.
    </hard_rules>

    <forbidden_shortcuts>
        - `regenerating a rulebook page wholesale`: the fresh
          match_size/align content and the clipped-text lint enumeration live
          inside the same blocks as the stale claims and would be lost. See
          the must-preserve inventory in current_state.md.
        - `deleting the worked example's disclaimer without re-recording`:
          the disclaimer is the only thing currently making the page honest.
          It goes when the content it warns about goes, not before.
        - `running make eval to "see where we are"`: a run is the
          re-baseline. It is Ford's call, not a diagnostic step.
        - `changing a tool to match a doc`: the code is the specification
          here.
    </forbidden_shortcuts>

    <data_and_feature_boundaries>
        - packages/canvas-agent/src/service/session/ is the surface of record.
          This objective reads it; it does not reshape it.
        - .agent-kernel/ and .pi-agent/ are machine-local and gitignored. F4
          changes how the first one is located, never what is committed.
        - packages/eval-suite/runs/ holds prior run output. Existing run
          directories are evidence; do not delete them to make room for a new
          baseline.
        - docs/.index/ is derived state rebuilt by the backlinks rescan;
          never hand-edited.
    </data_and_feature_boundaries>

    <risk_budget>
        - `wrong grid shipped`: zero tolerance. A grid claim is either
          verified against grid.ts in the same sitting or it is not written.
        - `broken doc render`: never left broken between edits; render the
          bundle after each page.
        - `kernel root split across trees`: F4 is not done while any consumer
          still derives the root independently. All of them move together or
          none do.
    </risk_budget>

    <promotion_or_completion_gates>
        - `follow_up_done`: change landed, its gate from context/04 green,
          current_state.md row updated with the date and what was verified.
        - `sitting_done`: every touched bundle renders, backlinks rescanned,
          links check reports no stale references, current_state.md carries
          the next action.
    </promotion_or_completion_gates>
</constraints>

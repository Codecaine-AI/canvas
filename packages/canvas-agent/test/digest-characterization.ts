/** Exact model-visible digest text pins (nested tree + EDGES; lossless op-writable surface) plus the lint-report pins. */
export const DIGEST_TEXT_SNAPSHOTS: Readonly<Record<string, string>> = {
  "digest-rich": `BOARD  # indent = containment · id type "text" [color] x,y w×h [k=v…] · elided defaults: color gray (sticky yellow) · edge solid gray arrow=forward · shape per type
  page section "Page frame" 0,0 640×480 locked=background
    inner section "Inner" blue 32,64 320×240
      task process "Do the thing" teal 64,128 184×96
    note sticky "Remember this" 400,64 160×160
EDGES
  task-note task→note "see" dashed`,
  "digest-annotations": `BOARD · no locked frame  # indent = containment · id type "text" [color] x,y w×h [k=v…] · elided defaults: color gray (sticky yellow) · edge solid gray arrow=forward · shape per type
  task rectangle "task" 0,0 160×96
  other rectangle "other" 320,0 160×96
EDGES
  task-other task→other —`,
  "digest-frameless": `BOARD · no locked frame  # indent = containment · id type "text" [color] x,y w×h [k=v…] · elided defaults: color gray (sticky yellow) · edge solid gray arrow=forward · shape per type
  only rectangle "only" 0,0 160×96
EDGES
  (none)`,
  "digest-solo-section": `BOARD · no locked frame  # indent = containment · id type "text" [color] x,y w×h [k=v…] · elided defaults: color gray (sticky yellow) · edge solid gray arrow=forward · shape per type
  solo section "Solo" 0,0 480×320
    (empty)
EDGES
  (none)`,
  "digest-clipping": `BOARD · no locked frame  # indent = containment · id type "text" [color] x,y w×h [k=v…] · elided defaults: color gray (sticky yellow) · edge solid gray arrow=forward · shape per type
  wordy rectangle "multi line xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx…(+148ch)" 0,0 160×96
EDGES
  (none)`,
  "perception-labeled-gap": `BOARD · no locked frame  # indent = containment · id type "text" [color] x,y w×h [k=v…] · elided defaults: color gray (sticky yellow) · edge solid gray arrow=forward · shape per type
  alpha rectangle "alpha" 0,0 160×96
  beta rectangle "beta" 208,0 160×96
EDGES
  edge alpha→beta "go"`,
  "perception-single": `BOARD · no locked frame  # indent = containment · id type "text" [color] x,y w×h [k=v…] · elided defaults: color gray (sticky yellow) · edge solid gray arrow=forward · shape per type
  alpha rectangle "alpha" 0,0 160×96
EDGES
  (none)`,
  "perception-object-delta": `BOARD · no locked frame  # indent = containment · id type "text" [color] x,y w×h [k=v…] · elided defaults: color gray (sticky yellow) · edge solid gray arrow=forward · shape per type
  alpha rectangle "alpha" 0,0 160×96
  beta rectangle "beta" 320,0 160×96
  gamma rectangle "gamma" 640,0 160×96
EDGES
  (none)`,
  "perception-membership": `BOARD · no locked frame  # indent = containment · id type "text" [color] x,y w×h [k=v…] · elided defaults: color gray (sticky yellow) · edge solid gray arrow=forward · shape per type
  section-a section "section-a" 0,0 400×320
    child rectangle "child" 80,112 160×96
  section-b section "section-b" 500,0 400×320
    (empty)
EDGES
  (none)`,
  "perception-connections": `BOARD · no locked frame  # indent = containment · id type "text" [color] x,y w×h [k=v…] · elided defaults: color gray (sticky yellow) · edge solid gray arrow=forward · shape per type
  alpha rectangle "alpha" 0,0 160×96
  beta rectangle "beta" 480,0 160×96
  gamma rectangle "gamma" 960,0 160×96
EDGES
  alpha-beta alpha→beta "before"
  beta-gamma beta→gamma —`,
  "perception-clean-pair": `BOARD · no locked frame  # indent = containment · id type "text" [color] x,y w×h [k=v…] · elided defaults: color gray (sticky yellow) · edge solid gray arrow=forward · shape per type
  alpha rectangle "alpha" 0,0 160×96
  beta rectangle "beta" 480,0 160×96
EDGES
  (none)`,
  "perception-two-overlaps": `BOARD · no locked frame  # indent = containment · id type "text" [color] x,y w×h [k=v…] · elided defaults: color gray (sticky yellow) · edge solid gray arrow=forward · shape per type
  a1 rectangle "a1" 0,0 160×96
  a2 rectangle "a2" 40,0 160×96
  b1 rectangle "b1" 2000,0 160×96
  b2 rectangle "b2" 2040,0 160×96
EDGES
  (none)`,
  "perception-quickfix": `BOARD · no locked frame  # indent = containment · id type "text" [color] x,y w×h [k=v…] · elided defaults: color gray (sticky yellow) · edge solid gray arrow=forward · shape per type
  alpha rectangle "alpha" 0,0 160×96
  beta rectangle "beta" 204,0 160×96
EDGES
  edge alpha→beta "X"`,
  "comprehensive-all-blocks": `BOARD  # indent = containment · id type "text" [color] x,y w×h [k=v…] · elided defaults: color gray (sticky yellow) · edge solid gray arrow=forward · shape per type
  page-all section "All fields page" violet 0,0 1280×900 locked=background
    nested-frame section "Nested locked" 32,32 320×240 locked=background
      (empty)
    section-all section "Nested section" blue 48,80 720×560 locked=all
      node-a process "First node" teal 96,160 180×100
      node-b decision "Second node" orange 480,400 190×110
    sticky-all sticky "Sticky text" 820,100 180×180
    marker-all annotation-marker "Marker" red 1040,120 32×32
EDGES
  edge-forward node-a→node-b "forward label" blue
  edge-none node-a→node-b "none label" dashed red arrow=none
  edge-back node-b→node-a "back label" arrow=back wp=400,300→320,280
  edge-both node-b→node-a — arrow=both`,
};

const CLEAN = "DIAGNOSTICS · clean";

export const DIAGNOSTICS_TEXT_SNAPSHOTS: Readonly<Record<string, string>> = {
  "digest-rich": CLEAN,
  "digest-annotations": CLEAN,
  "digest-frameless": CLEAN,
  "digest-solo-section": CLEAN,
  "digest-clipping": CLEAN,
  "perception-labeled-gap": `DIAGNOSTICS · 0 errors · 1 warning
  W1 unreadable-labels: label "go" chip on edge (43×30px) bleeds onto alpha and beta: 48px of corridor where the chip needs 76px (open the alpha↔beta corridor to ≥76px so the chip and its 16px margins fit) [quickfix]`,
  "perception-single": CLEAN,
  "perception-object-delta": CLEAN,
  "perception-membership": CLEAN,
  "perception-connections": CLEAN,
  "perception-clean-pair": CLEAN,
  "perception-two-overlaps": `DIAGNOSTICS · 2 errors · 0 warnings
  E1 covered-content: a1 and a2 overlap by 75% of the smaller box; covers the text center of a1 and a2 (move a2 clear of a1)
  E2 covered-content: b1 and b2 overlap by 75% of the smaller box; covers the text center of b1 and b2 (move b2 clear of b1)`,
  "perception-quickfix": `DIAGNOSTICS · 0 errors · 1 warning
  W1 unreadable-labels: label "X" chip on edge (41×30px) bleeds onto alpha and beta: 44px of corridor where the chip needs 73px (open the alpha↔beta corridor to ≥73px so the chip and its 16px margins fit) [quickfix]`,
  "comprehensive-all-blocks": `DIAGNOSTICS · 12 errors · 4 warnings
  E1 covered-content: label "forward label" chip on edge-forward overlaps label "none label" chip on edge-none (separate the two edges (spacing or waypoints) so both labels read)
  E2 covered-content: label "forward label" chip on edge-forward overlaps label "back label" chip on edge-back (separate the two edges (spacing or waypoints) so both labels read)
  E3 covered-content: label "none label" chip on edge-none overlaps label "back label" chip on edge-back (separate the two edges (spacing or waypoints) so both labels read)
  E4 covered-content: label "forward label" chip on edge-forward lies on edge-none's path for 30px (move the label with a waypoint or reroute edge-none so the chip owns its wire)
  E5 covered-content: label "forward label" chip on edge-forward lies on edge-back's path for 30px (move the label with a waypoint or reroute edge-back so the chip owns its wire)
  E6 covered-content: label "forward label" chip on edge-forward lies on edge-both's path for 30px (move the label with a waypoint or reroute edge-both so the chip owns its wire)
  E7 covered-content: label "none label" chip on edge-none lies on edge-forward's path for 30px (move the label with a waypoint or reroute edge-forward so the chip owns its wire)
  E8 covered-content: label "none label" chip on edge-none lies on edge-back's path for 30px (move the label with a waypoint or reroute edge-back so the chip owns its wire)
  E9 covered-content: label "none label" chip on edge-none lies on edge-both's path for 30px (move the label with a waypoint or reroute edge-both so the chip owns its wire)
  E10 covered-content: label "back label" chip on edge-back lies on edge-forward's path for 30px (move the label with a waypoint or reroute edge-forward so the chip owns its wire)
  E11 covered-content: label "back label" chip on edge-back lies on edge-none's path for 30px (move the label with a waypoint or reroute edge-none so the chip owns its wire)
  E12 covered-content: label "back label" chip on edge-back lies on edge-both's path for 30px (move the label with a waypoint or reroute edge-both so the chip owns its wire)
  W1 broken-edges: edge-forward and edge-back run anti-parallel between node-a and node-b (use one edge with a both-ends arrow, or offset the two routes)
  W2 broken-edges: edge-forward and edge-both run anti-parallel between node-a and node-b (use one edge with a both-ends arrow, or offset the two routes)
  W3 broken-edges: edge-none and edge-back run anti-parallel between node-a and node-b (use one edge with a both-ends arrow, or offset the two routes)
  W4 broken-edges: edge-none and edge-both run anti-parallel between node-a and node-b (use one edge with a both-ends arrow, or offset the two routes)`,
};

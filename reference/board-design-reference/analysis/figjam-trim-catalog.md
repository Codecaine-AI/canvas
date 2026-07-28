# FigJam UI Trim & Interaction Catalog

Source: screen recording of FigJam in use on a board titled **"V2 Flow"** (file chip, top-left), showing a section literally titled "Interview Agent" containing sub-flows like "Interview Flow", "Memory Bank", etc. Frames analyzed: `board-design-reference/analysis/figjam-frames/fj-001.png` through `fj-089.png` (**89 frames total, not 100** — the brief's "NNN=001..100" assumption is corrected here), captured at 2fps over ~44s, plus 11 scene-change keyframes `scene-01.png`–`scene-11.png`. Frame N ≈ N/2 seconds. All frames are 1476×1080.

**Methodology note:** every claim below is either (a) directly verified by reading the cited frame(s) myself, or (b) explicitly marked as an estimate/guess. Where multiple independent passes (mine + dispatched sub-agent frame scans) converged on the same reading, confidence is high; where only one pass caught something, or evidence conflicts, that is flagged.

**Window trim note:** the recording shows a browser-app-mode or desktop-app window — three flat/unlit traffic-light dots (fj-001, top-left, ~y=0–15), a single tab reading "V2 Flow" with a small purple FigJam icon and a "+" new-tab button, no visible URL bar. This is FigJam running as a dedicated window, not a normal browser tab with visible trim.

---

## 1. Bottom toolbar (centered rounded dock)

**Geometry (fj-001/fj-005, estimate):** a white/near-white rounded-pill dock, horizontally centered, sitting just above the bottom edge of the viewport. Bounding box roughly **x=509–966, y=1033–1071** → width ≈457px, height ≈38px. Corner radius is a full pill (radius ≈ half the bar height, ~19px). A soft drop shadow is visible beneath it separating it from the canvas (estimate, not pixel-measured).

**Button inventory, left to right** (confirmed via fj-001, fj-005, fj-045, fj-089, and corroborated by a dedicated hover-sweep pass):
1. **Arrow / selection tool** — default active tool in most frames (solid violet rounded-square fill when active).
2. **Hand / pan tool**
3. **Pen / marker tool**
4. **Highlighter tool** — icon rendered with a distinct blue tint baked into the artwork itself (not a state).
5. **Shape tool** (square icon) — click-and-hold or secondary interaction on this opens the left-docked Shapes sidebar (see Section 4).
6. **Connector / curved-arrow tool**
7. **"T" text tool**
8. **Sticky note tool** — icon carries a static light-blue fill baked into its artwork (confirmed, not a hover/active state).
9. **Table/grid tool**
10. **Stamp/person icon** — exact function not exercised in this recording; visually a person/stamp glyph.
11. **Comment bubble tool**
12. **Widgets icon** (grid-of-dots glyph)
13. **"+" icon** — likely "more"/add menu.

No visible dividers/grouping separators were confirmed between these 13 icons in the direct reads — the bar reads as one continuous button row rather than clearly separated clusters (unlike the brief's assumption of grouping with dividers). No flyout arrows (small caret indicators for press-and-hold submenus) were conclusively resolved on individual icons at this resolution — **flagged as unconfirmed**, since the shape tool's flyout behavior was inferred from the Shapes-panel opening near that icon's hover moment (fj-051/fj-052), not from a visible caret glyph.

**Hover vs. active state (confirmed, fj-045→fj-046 sequence):**
- **Active/selected tool:** solid **violet/purple** rounded-square fill behind the icon, persists across many consecutive frames regardless of cursor position (i.e., it's modal state, not a hover effect).
- **Hover (not yet clicked):** a lighter **gray** rounded-square background appears behind the icon the cursor is over, distinct from and simultaneous with the active tool's violet fill on a different button. Example: fj-045 shows the arrow tool holding its violet active fill while the hand tool simultaneously shows a light-gray hover highlight; the very next frame (fj-046) the hand tool becomes the new active (violet) tool — a clean hover→click transition.
- **Modal relinquishing (important, corroborated across two independent frame passes):** when another surface owns interaction focus — e.g., the left Shapes sidebar is open (fj-053–fj-072), or during an extended pan (fj-046–fj-052) — the dock can show **no violet active-state at all**. The active-tool highlight is not "sticky" to the last-used tool; it reflects current interaction mode only. Clone implementations should model tool-highlight as derived from live mode, not as separately-tracked "last selected" state.

**Zoom controls & help button** (fj-001, bottom-right, separate from the main dock): a smaller light-gray pill containing only **"−"** and **"+"** (no percentage readout visible in any frame), at approx x=1330–1410, y=1045–1075. A separate circular **"?" help button** sits just to its right, ~x=1420–1460, y=1045–1075.

**Not observed / gaps:** no visible tooltips on the main dock buttons themselves (the one confirmed tooltip in the whole recording, "Line style" at fj-029, belongs to the shape/connector context toolbar, not the bottom dock). No confirmation of press-and-hold flyout submenus opening from dock icons (e.g., a shape-type flyout distinct from the full Shapes sidebar).

---

## 2. Selection context toolbar (dark floating pill), per selection type

All variants are dark (near-black, RGB ≈ 20–30 range) rounded pills that float above the current selection. Contents differ meaningfully by selection type:

### Shape selected (e.g., "AI Asks Question" orange circle — confirmed fj-004, fj-006, fj-009, fj-025, fj-035, fj-045, fj-050, fj-081, fj-089; this is the dominant state for roughly the back half of the recording)
Left to right: **connector/shape-swap icon** (small square-with-line + chevron) → **fill-color swatch** (circle showing current fill, e.g. orange) with dropdown chevron → **alignment icon** with dropdown (expands into a 3-icon left/center/right-align popover, confirmed open at fj-042/fj-043, with center-align shown active/violet) → **"Aa" font-style dropdown** → **size dropdown** (e.g. "Medium") → **Bold "B"** (shown active/violet throughout this recording) → **strikethrough** → **link** → **bullet-list** → **paragraph-alignment dropdown** (rightmost).

**Selection handles on a shape:** 8 total — 4 corner squares **and** 4 edge-midpoint squares — confirmed via fj-025/fj-035 close crops. This is a key visual distinguishing feature vs. sections (below), which show corner-only handles.

### Section selected ("Interview Flow" section — confirmed fj-007, fj-008, fj-010, fj-011; scene-04/05)
Left to right: **fill/theme-color swatch** (circle, e.g. purple) with dropdown chevron → **"layers/rows" icon** with dropdown chevron → a divider → **frame/duplicate-like icon** → **eye icon** (visibility toggle) → **lock icon** with dropdown chevron → **diagonal expand-arrows icon (⤢)**, likely "zoom to fit"/focus. **6 controls total.** No text-formatting controls at all — a clean, structurally distinct toolbar from the shape one.

**Selection handles on a section:** corner squares only (4 total) — **no edge-midpoint handles**, confirmed by direct inspection of the section's bottom edge between corners (plain line, no extra handle). This is a positive, confirmed negative finding.

**Section visual states:**
- *Unselected:* no border/outline at all around the section rectangle. A rounded title chip straddles the top edge (roughly half "inside," half floating above), background color = a more saturated tint of the section's own hue (e.g., "Interview Flow" chip ≈ #C5B6E7 on a much paler purple-washed section fill). Chip text is bold, dark, sans-serif, ~13–14px (estimate).
- *Selected:* solid blue outline around the exact section bounding box, sampled color ≈ #3C8BD0 (FigJam's canonical selection blue, softened by rendering/compression), stroke ≈1.5–2px. The title chip appears to pick up a subtly more saturated tint when selected (soft signal, compression-limited).
- *Capture/move behavior:* **not observed** — no section-drag sequence was captured in this recording. Whether child shapes move together with a dragged section is unconfirmed; do not assume either behavior without further testing against the live product.

### Connector selected (confirmed fj-012, fj-013, fj-014)
Left to right: **color swatch** (gray/neutral shown) with dropdown → **alignment/anchor icon** with dropdown → **"T" add-text-label icon** → **line-style dropdown** (icon shows a solid dash) → **corner-style dropdown** (icon shows a rounded right-angle glyph, confirming selectable orthogonal routing) → **arrowhead-style dropdown** (icon shows a thin chevron, though actual rendered arrowheads on the board are solid filled triangles — icon glyphs are stylized/simplified vs. real output). **6 controls total**, structurally distinct from both other toolbars.

When a connector's text-label is actively being edited (fj-015 onward), the toolbar swaps to a **text-formatting variant**: color swatch → "Aa" font-style dropdown → size dropdown (shown as "Small") → Bold → strikethrough/clear-formatting icon.

### Multi-select
**Not observed** — no frame in this recording shows two or more independent objects selected simultaneously with a merged/combined toolbar. Flagged as a gap; do not fabricate a multi-select toolbar spec.

### Color-swatch row behavior (all types)
Clicking any toolbar's color swatch opens the palette popover described in Section 3 below, anchored directly above that swatch button.

---

## 3. Color picker / palette popover

Confirmed present in exactly **one frame, fj-030** (closed in the immediately adjacent fj-029 and fj-031 — the popover opens, a color is picked, and it closes within under 0.5s of real time, i.e. faster than the 2fps sampling interval resolves as a multi-frame "open" state).

- **Layout:** 2 rows × 11 swatches = **22 total** circular swatches.
- **Row 1 (saturated), left→right:** black/no-fill (hollow ring), gray (~116,116,116), red (~225,54,37), orange (~244,152,68), yellow (~247,202,71), green (~110,230,119), teal/spring-green (~101,228,200), blue (~70,177,243), purple/violet (~130,60,248), magenta/pink (~232,44,190), white.
- **Row 2 (pastel/tint variants), left→right:** gray (~179,179,179), light gray (~216,216,216), light pink (~248,190,194), peach (~251,221,195), pale yellow (~251,235,193), pale green (~208,247,211), pale teal (~201,254,244), pale blue (~195,230,253), pale lavender (~217,196,252), light rose (~252,182,233), and a final **rainbow-ring "current/custom color" swatch** — shown filled with the object's active color (orange in this instance) and ringed with a thin conic/rainbow gradient border. This swatch, not a separate "+" button or hex field, appears to be the entry point to an extended custom-color picker (not directly observed opening).
- **No separate "+" add-custom-color button and no visible hex-input field** — corrects an assumption in the original brief.
- **Swatch geometry (estimate):** diameter ≈20px, center-to-center spacing ≈25px both directions → ~5px gap between adjacent swatch edges.
- **Popover geometry:** bounding box ≈ x=653–938, y=282–343 → width ≈285px, height ≈61px. Fully rounded pill ends (radius ≈ half the height, ~28–30px, estimate). Background near-black (~RGB 20–29).
- **Anchor:** sits directly above the active toolbar's fill-color swatch button, ~9px gap between popover bottom and toolbar top.

---

## 4. Shape picker panel

**Correction to task brief:** the brief assumed a right-side sidebar appearing in late frames (~fj-075+). Direct frame reads (fj-053, fj-055, fj-060, fj-070, fj-071, fj-078) definitively show **no right-side panel exists anywhere in this recording** — the full shape-library panel is docked to the **left edge**. There are, in fact, **two distinct shape-related surfaces**, not one:

### Panel A — compact "Search for a shape" popover (dark)
- **Frame range:** fj-032–fj-041 (confirmed open by dark-region pixel-fraction analysis: 0.0 at fj-031, jumps to ~0.77 at fj-032, sustained ~0.75–0.79 through fj-041, back to 0.0 at fj-042).
- **Position/size:** floats centered above the toolbar (same general region as the color popover), bounding box ≈ x=625–786, y=166–346 → width ≈161px, height ≈180px. Smaller corner radius than the color popover, ~16–20px (estimate). Dark background matching the color-popover family.
- **Contents:** a "Search for a shape" text field with magnifying-glass icon at top, then a 5-column icon grid (5 visible rows, scrollable — a vertical scrollbar thumb is visible; content shifted between fj-033 and fj-036, confirming scroll). Icons are monotrim line-glyphs of generic tech/object concepts: chip/CPU, database/stack, monitor, envelope, document, code-brackets, lightning bolt, map pin, phone, cube, dollar-sign circle, shield, paper-airplane, servers, gear, hard-drive, terminal, person, browser window, globe — **not** basic geometric shapes and **not** emoji.
- **Anchor:** above the selected object's toolbar, specifically above the leftmost "shape/connector-swap" icon (the per-object "replace this shape" control), not the main bottom dock.

### Panel B — full "Shapes" sidebar (white, left-docked)
- **Frame range:** fj-053–fj-072 (≈10 seconds), confirmed closed fj-045–fj-052 and fj-073–fj-089.
- **Invocation:** cursor hovers over the bottom dock's shape-tool icon in the frames immediately preceding open (fj-051/fj-052), strongly suggesting a click/hold on that dock icon triggers this panel.
- **Position/size:** docked to the left edge, full viewport height (y=0 to y=1080, behind the bottom dock in z-order), width ≈197–198px, white/near-white background.
- **Header:** bold "Shapes" label, top-left, with a "×" close button top-right (~x=178–184).
- **Search box:** "Search shapes" placeholder + magnifying glass, ~x=18–190, y=120–138 (≈172×18px), with a visible **purple focus-ring border** when active.
- **Sections, top to bottom, each with a collapse chevron:**
  1. **Recents** — ~6–8 icons (rounded document/note, rounded rectangle, diamond, split-panel rectangle, square, speech-bubble, comment-bubble, terminal-prompt glyph).
  2. **Connections** — 4 icons: elbow connector, curved connector, straight diagonal connector, branching/org-chart connector.
  3. **Basic** — 12–16 icons across 3–4 rows: square, circle, diamond, triangle, inverted triangle, pentagon, hexagon, plus/cross, arrows (left/right), parallelogram, star, speech-bubble.
  4. **Flowchart** — ~16–20 icons across 4–5 rows: parallelogram, trapezoid, cylinder/database, document-fold, folder, callout/comment-box, cloud, shield, cup/trapezoid, rounded-oval, split-panel box, crosshair/target, no-entry circle.
  5. **Advanced** — 12 icons across 3 rows: sparkline/chart, archive-box, key, chat/cloud, gear, database-stack, monitor, envelope, document, code-brackets, lightning bolt.
  6. **Other libraries** (footer) — external icon-library entries with logos and shape counts: **AWS (805 shapes)**, **Azure (637 shapes)**, **Cisco (292 shapes)**.
- **Icon grid pitch:** ≈40–43px per cell (4 columns), individual glyphs ≈18–24px.
- The bottom dock remains visible/functional alongside this panel (no layout conflict — dock floats centered-bottom, panel is left-docked).

**Emoji/reaction/stamp panel — resolved, negative finding:** no such panel exists anywhere in the 89 frames. This was a mistaken hypothesis in the original task brief, most likely triggered by mistaking the technical-icon "Search for a shape" popover (Panel A above) for an emoji grid on the contact sheet. The only dark grid-style popovers in the entire recording are the color palette (Section 3) and Panel A above — both are functional/monotrim, not emoji or reaction stamps.

---

## 5. Emoji/reaction/stamp panel

See Section 4's closing note — **not present in this recording.** No emoji picker, reaction-stamp grid, or "keypad"-style panel was found in any of the 89 frames or 11 scene keyframes. If FigJam's real product has this feature, it was simply never invoked during this particular capture. Do not fabricate contents for it; treat as an explicit gap for the clone team to source separately if needed.

---

## 6. Section UX

Covered in detail under Section 2 above (selected/unselected states, title chip styling, context toolbar, handle count). Summary for quick reference:
- Unselected: no border, floating title chip (saturated-tint badge straddling the top edge).
- Selected: solid blue (~#3C8BD0) outline, 4 corner-only handles, distinct 6-icon toolbar (fill, layers, duplicate/frame, eye, lock, expand-arrows).
- Capture/move-with-children behavior: **not observed, unconfirmed.**

---

## 7. Connectors UX

Covered in detail under Section 2 above. Summary plus additional routing/creation detail:

- **Selected-state toolbar:** color, alignment, add-text-label ("T"), line-style, corner-style, arrowhead-style — 6 controls (fj-012–fj-014).
- **Endpoint/port handles:** small circular white-fill/blue-ring handles (~8px diameter, estimate) appear at every shape the selected connector touches along its path (not just true endpoints) — confirmed at three separate junctions in fj-011–fj-013.
- **Midpoint handle:** a small blue horizontal capsule sits at the connector's midpoint when selected (fj-013) — likely a bend-point/label-insertion affordance.
- **Bend/reroute affordance:** a translucent gray rectangle tracking a connector bend plus a "+" crosshair cursor was reported around fj-068–070 (corroborated relay content, not independently re-verified by me — flagged as medium confidence, plausible given adjacent confirmed behaviors).
- **Label editing:** clicking the "T" icon opens a small inline text box directly on the connector line with a light-blue focus-ring outline (fj-015), swapping the toolbar to its text-formatting variant.
- **Font-style dropdown ("Aa"), confirmed directly (fj-021):** four named presets, each rendered in its own representative typeface: **"Simple"** (checked/default, plain geometric sans), **"Bookish"** (serif), **"Technical"** (monospace), **"Scribbled"** (italic/cursive). This is shared between connector-label and shape-label text editing, not connector-specific.
- **Arrowheads:** solid filled triangles on every connector observed on the board, despite toolbar dropdown icon glyphs depicting a thinner open-chevron style (icon art is stylized, does not match rendered output 1:1).
- **Line style:** all flow connectors are solid; the one dashed line found (in the "Questions" group, connecting Question 1→2→N) is a short vertical dashed line with no arrowhead, used as a visual "…continues" ellipsis rather than a flow arrow. No dashed-arrow toggle was observed in use.
- **Corner/routing style:** orthogonal (right-angle) routing with rounded quarter-circle fillets at bends, estimated radius ~8–10px at capture resolution (not calibrated to actual board units — flagged as estimate).
- **Hover-only port indicators** (before click/drag) and **live crosshair cursor during creation:** **not observed** — the earliest captured frame in every connector sequence already shows a completed selection, meaning the hover-to-drag creation gesture happened faster than the 2fps sampling could catch. Flagged as a genuine gap; a clone should still implement hover ports as a reasonable default (standard whiteboard-tool convention) but this recording does not provide pixel evidence for their appearance.

---

## 8. Canvas trim

- **Zoom controls:** bottom-right pill with only **"−"/"+"** (no percentage display observed in any frame), ~x=1330–1410, y=1045–1075 (fj-001).
- **Help button:** separate circular "?" button just right of the zoom pill, ~x=1420–1460, y=1045–1075.
- **Minimap:** **absent** — confirmed across all 89 frames and 11 scene keyframes. No minimap/overview thumbnail exists in this recording.
- **Cursor styles:** default arrow/pointer (most frames); hand/grab tool icon shown with hover state in dock (fj-045) though the live pan cursor glyph itself wasn't distinctly resolved; no distinct text I-beam, crosshair, or resize-arrow cursor was clearly captured (gaps — 2fps sampling likely missed these transient states).
- **Top-left board chip:** a rounded white pill, ~x=15–140, y=45–70, containing: small FigJam 4-square-grid icon + dropdown chevron, then **"V2 Flow"** text (medium-weight dark sans, ~13–14px estimate), a vertical divider, then a "pages" icon (two overlapping rounded rectangles). Note: "V2 Flow" is the **file name** — it is distinct from "Interview Agent," which is an on-canvas section/frame title, not the board's file name (an assumption in the original brief conflated these two).
- **Top-right area:** yellow circular avatar with bold **"F"** initial (~20px diameter) + dropdown chevron (~x=1271–1291, y=48–68); a small grid/dashboard icon (~x=1318, y=58); a small circular icon of ambiguous glyph (possibly a secondary status/recording indicator, unresolved at this resolution) immediately left of a timer reading **"03:00"**; and a solid violet **"Share"** button (~x=1417–1461, y=45–70).
- **Timer behavior:** reads exactly "03:00" in every single frame checked across the whole recording (fj-001, fj-050, fj-089, all scene keyframes) — it never changes. This is very likely a frozen/static UI element (e.g. a capture-tool overlay or a paused session countdown) rather than a live elapsed-time clock, since zero variation occurs over the full ~44s recording.
- **Other users' cursors:** **absent** — no colored pointer arrows with name-tag labels belonging to other collaborators appear anywhere in the 89 frames. Single-user session only, as far as this recording shows.
- **Right-click context menu (fj-084):** Paste (⌘V) / divider / Unlock all objects (⌥⇧⌘L) / divider / Cursor chat (/) / divider / Show/Hide UI (⌘\\) / Show/Hide comments (⇧C) / Actions... (⌘K) / Plugins ▸ / Widgets ▸ / divider / Publish template... — a dark list-style menu, confirming FigJam's canvas right-click surface and giving exact keyboard shortcuts for a subset of global commands.
- **Alignment/snap guides:** not observed (no drag-with-snap moment was captured).
- **Onboarding tooltips/coachmarks:** absent; the one tooltip found ("Line style," fj-029, over the line-style icon in the connector toolbar) is a plain hover-label, not a dismissible coachmark.

---

## 9. Text / sticky editing

- **No sticky-note body text is ever shown being actively typed/edited** anywhere in the 89 frames — all sticky and shape-label text appears as static, already-committed content. The only genuine live text-editing sequence captured is a **connector label** (fj-014–fj-021, detailed in Section 7).
- **Font used for all board content (stickies, shape labels, section titles):** a clean, geometric/humanist sans-serif, visually consistent with **Inter or a very similar UI sans** — confirmed via letterform inspection (clean single-story 'a' in one analysis vs. two-story 'a' in another — see conflict note below; flat-cut terminals; simple 't' with a small flat crossbar; no handwriting/cursive characteristics). This directly corresponds to FigJam's **"Simple"** text-style preset, confirmed selected (checkmarked) in the fj-021 font-style dropdown — i.e., "Simple" is FigJam's clean default sans, not a handwriting style. The other three named presets ("Bookish" = serif, "Technical" = monospace, "Scribbled" = italic/cursive handwriting style) are available but unused anywhere on this board.
- **Unresolved conflict (documented rather than arbitrarily resolved):** independent letterform passes disagreed on one fine detail — whether the lowercase 'a' is single-story (simple bowl, no upper hook) or double-story (two-story, Inter-style). Majority of passes (2 of 3 independent analyses) read it as two-story/Inter-like; one read it as single-story/simplified. Since both readings agree the face is a clean, non-cursive geometric sans matching the "Simple" preset, this does not change the practical clone recommendation (use an Inter-like sans as the default), but the specific letterform detail should be treated as **open** pending a higher-resolution export comparison, not asserted as settled.
- **Code/monospace text:** the dark "Structure" panel content (e.g. `class Memory(BaseModel):`) uses a genuine monospace font with syntax-highlight coloring — keywords in purple/violet, string values in green/teal, JSON keys in light pink/rose, on a near-black (~#1e1e2e-ish) background.
- **Sticky "author" attribution label:** a small, muted, gray label reading **"ford"** appears at the bottom-left of the pink "Memory Bank" sticky note, below the last bullet line — confirmed via scene-10. Estimated ~8–9px size, ~40–55% opacity, color = a muted derivative of the note's own text color, ~8px inset from the corner. This reads as FigJam auto-rendering a creator/author tag on stickies, not user-typed content, and was not seen being edited. Worth replicating for authenticity.
- **Text-formatting toolbar (shared pattern across shape/connector-label editing):** dark pill with color swatch → "Aa" font-style dropdown → size dropdown → Bold → strikethrough (and, for full shape selection, additionally link/bullet-list/paragraph-align — see Section 2's "Shape selected" toolbar for the fuller variant).
- **Alignment sub-popover:** clicking the alignment control opens a small 3-icon popover (left/center/right align) directly above the toolbar, confirmed at fj-042/fj-043 with center-align shown active/violet.

---

## 10. Anything else needed for a clone

- **No right-click menu variant differences observed** beyond the one blank-canvas menu at fj-084 — right-click on a shape/sticky/section was not captured, so shape-specific context-menu contents (Copy/Duplicate/Bring to front/Group, etc.) are **unconfirmed**; do not invent these, source them from live product testing.
- **No multiplayer cursor rendering was captured** (name-tag + colored pointer for a second user) — if the clone needs this, it must be designed from general product knowledge/other sources, not this recording.
- **No resize-drag sequence was captured** for any shape/section/sticky — resize handle behavior (which of the 8 shape handles do what, aspect-lock modifier keys, etc.) is unconfirmed.
- **Minor curiosity, not required trim:** thin colored accent bars appear at the far-left window edge in fj-036–fj-046, apparently tied to off-screen stickies scrolled just out of view (a common whiteboard-tool affordance hinting at off-canvas content). Not confirmed as necessary trim for a clone, but worth considering as a nice-to-have.
- **Timer ("03:00") is almost certainly not FigJam product trim** — treat as an artifact of the recording/capture tooling rather than something to clone.

---

## Executive summary (for chat reply)

1. Two shape-picker surfaces exist, not one: a compact dark "search for a shape" tech-icon popover (fj-032–041) AND a full white left-docked "Shapes" library panel with 6 categorized sections plus AWS/Azure/Cisco libraries (fj-053–072) — the brief assumed a single right-side panel; it's actually two, both left/center, never right.
2. No emoji/reaction/stamp panel exists anywhere in the source recording — that was a mistaken hypothesis; drop it from clone scope unless sourced elsewhere.
3. Selection toolbars are structurally distinct per object type (shape: 10 text-formatting controls + 8 resize handles; section: 6 trim controls + corner-only handles; connector: 6 routing controls + endpoint/midpoint handles) — a single generic "selection toolbar" component won't match FigJam's real behavior.
4. Dock tool-highlighting is modal, not sticky: it fully relinquishes its violet active-state when another surface (e.g. the Shapes panel) owns focus — worth replicating since it's an easy detail to get wrong.
5. Text isn't a plain font picker — FigJam exposes four named "voice" presets (Simple/Bookish/Technical/Scribbled) each previewed in its own live typeface inside the dropdown; the board uses "Simple," a clean Inter-like sans, not a handwriting font.
6. Color palette is a 22-swatch (2×11), no-hex-input, no-plus-button popover where the final swatch doubles as a rainbow-ringed "current color" indicator rather than a distinct custom-color trigger.
7. No minimap, no multiplayer cursors, no onboarding coachmarks, no visible snap-guides, and no confirmed shape-specific right-click menu were captured — these are real gaps in the source data, not confirmed absences from the actual product; flag for the clone team to verify against live FigJam rather than assume they don't exist.
8. Section vs. shape selection is visually distinguishable at a glance mainly by handle count (corners-only vs. corners+edge-midpoints) and toolbar contents (no text controls vs. rich text controls) — a subtle but clone-relevant signal.
9. Genuine gaps needing live-product verification, not this-recording extrapolation: section drag/capture-with-children behavior, hover-only connector port affordances pre-click, resize-drag handle behavior/modifiers, and shape-specific right-click contents.
10. Catalog file: `board-design-reference/analysis/figjam-trim-catalog.md` (confirmed written, this document).

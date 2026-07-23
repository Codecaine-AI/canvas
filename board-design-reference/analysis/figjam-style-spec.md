# FigJam Visual Style Spec (pixel-sampled)

Source of truth for a pixel-close FigJam clone. Every hex value below was sampled
programmatically (PIL, statistical mode over multi-pixel regions) from the user's own
FigJam exports in `board-design-reference/my_diagrams/` and from screen-recording frames
in `board-design-reference/analysis/figjam-frames/`.

**Primary acceptance target:** `V2 Flow.png` (9952×4224). Corroborated against
`Agent Flows.png`, `Bubba Voice.png`, `MR Walls Flow.png`, `INK Diagrams.png`,
`Intent Classification 1/2.png`, `Bubba Phone Workflow.png`, `Claude Code Researcher.png`,
`Spectre Flow.png`, `UX Refactor Flow.png`.

Machine-readable companion: `figjam-style-tokens.json` (same directory).

---

## 0. Scale factor

**`V2 Flow.png` is a 2× export. Logical px = export px ÷ 2.**

Derivation:

| Evidence | Export px | ÷2 (logical) | Interpretation |
|---|---|---|---|
| Sticky author text "ford" ascender height | 17–18 px | ~9 px | Inter 12 px font (ascender ≈ 0.73 em) — canonical FigJam attribution size |
| Section-chip label bbox height (with descender) | 33 px | 16.5 px | 16 px label font — canonical |
| Shape / connector stroke width (crisp, zero antialias) | 8 px | 4 px | FigJam's chunky default stroke |
| Section outline width | 4 px | 2 px | |

The crispness of all edges (single-pixel color transitions) confirms an integer export
scale. 4× was rejected because it implies a 4.5 px author font; the text evidence pins 2×.
All measurements below are given as **export px (logical px)**. Scale verified on V2 Flow;
other exports were used for palette only.

---

## 1. Canvas

| Element | Value | How measured | Notes |
|---|---|---|---|
| Board background (app) | **#F5F5F5** | mode of empty canvas in frames fj-001/fj-050 (video-compressed range #F3F3F3–#F5F5F5) | Exports render canvas as #FFFFFF — do not copy that; the app canvas is #F5F5F5 |
| Grid type | dot grid | frames | no lines, dots only |
| Dot color | **≈ #DDDDDD** sampled at dot centers (darkest #D8D8D8) | fj-050 empty region | video compression blurs dots lighter; true color likely #D4D4D4–#DDDDDD. Recommend `rgba(0,0,0,0.13)` over #F5F5F5 ≈ #D9D9D9 |
| Dot size | 1–2 px on screen at 21–30 % zoom | run lengths | scales with zoom; ≈ 2 logical px at 100 % |
| Dot spacing (screen) | 9.8 px @ 30.5 % zoom; 6.9 px @ 21 % zoom | periodicity of dot rows/cols (fj-050: dots every ~9.8 px in x and y) | |
| Dot spacing (logical) | **32 px at both observed zooms** | 9.8 ÷ 0.305 = 32.1; 6.9 ÷ 0.21 = 32.8 | **Adaptive grid**: spacing is a power-of-two multiple of a base 8 px grid, chosen so on-screen spacing stays roughly 6.5–13 px. At 100 % zoom expect 8 px logical spacing; zoomed out to ~25 % you see every 4th dot (32 px) |

Zoom of fj-050 was established at 30.5 % by comparing the "Get Next Question" button
width on screen (113 px) to its export size (742 px @ 2× = 371 logical).

---

## 2. Sections

Two section styles exist in FigJam; the user's boards use both.

### 2a. Pastel style (V2 Flow — the acceptance style)

Structure: rounded-rect tint fill, **2 px (1 px?) pastel border in the chip-fill color**,
title chip overlapping the top-left corner.

| Part | Value |
|---|---|
| Corner radius | 17 px (≈ 8 logical) |
| Border | 4 px (2) solid, color = chip fill color |
| Title chip | stadium (fully rounded), height 54 px (27), fill + 4 px (2) border per family, **pure #000000 text**, 16 px logical font (≈ medium/semibold), horizontal text padding ≈ 21 px (10), inset 6 px (3) from the section's top-left corner |

Section families sampled (tint / chip fill / chip border):

| Family | Section tint | Chip fill | Chip border | Seen in |
|---|---|---|---|---|
| Green | **#EBFFEE** | #CDF4D3 | #66D575 | V2 Flow "Interview Inputs", Spectre Flow, Claude Code Researcher |
| Purple | **#F8F5FF** | #DCCCFF | #874FFF | V2 Flow "Interview Flow", Bubba Voice, UX Refactor |
| Orange/cream | **#FFF7F0** | #FFE0C2 | #FF9E42 | V2 Flow "Memory Bank", Spectre Flow, Bubba Voice |
| Yellow | **#FFFBF0** | #FFECBD | #FFC943 | V2 Flow "Question N" cards, Spectre Flow, IC2 |
| Gray card | **#F9F9F9** | #D9D9D9 | ~#B9B9B9 (weak sample) | V2 Flow "Questions" (container border #D9D9D9 4 px) |
| White | **#FFFFFF** | #E6E6E6 | #C4C4C4 | V2 Flow "Next Question Response", outer page "Interview Agent" (page border #E6E6E6 4 px) |
| Pink | **#FFF0FA** | #FFC2EC | ≈#F849C1 | Bubba Voice, Claude Code Researcher |
| Red | **#FFF5F5** | #FFC7C2 | #F24822 | UX Refactor Flow |
| Blue | **#F5FBFF** | #C2E5FF | #3DADFF | INK Diagrams |
| Teal | **#C6FAF6** | (not obs.) | (not obs.) | Intent Classification 1 |

### 2b. Saturated style (Agent Flows, older)

Tint fill + **saturated border and saturated chip** (white or black chip text):

| Family | Tint | Border/chip |
|---|---|---|
| Green | #DCF3E7 | #14AE5C |
| Yellow | #FFF7DF | #FFCD29 |
| Blue | #DBF0FF | #3DADFF |
| Near-white | #FBFBFB | gray |

---

## 3. Sticky notes

| Property | Value | How measured |
|---|---|---|
| Corners | **square** (radius 0; only 1–2 px antialias) | corner profile scan |
| Folded corner | **none** | visual crop |
| Fill (yellow) | **#FFE299** | mode 100 % |
| Fill (red/salmon) | **#FFAFA3** | mode 91.8 % |
| Fill (pink) | **#FFA8DB** | Bubba Voice |
| Fill (blue) | **#80CAFF** | Agent Flows "Plan:" |
| Fill (light blue) | **#A8DAFF** | MR Walls big note |
| Fill (blue-gray) | **#AFBCCF** | Bubba Voice "Task Manager" |
| Body text color | **black @ 80 % over fill** (e.g. #332D1F on yellow, #332321 on red, #33222C on pink, #222C33 on light blue) | exact 0.2×fill blend verified on 6 fills |
| Body font | Inter (letterform match), **24 px logical**, regular; bold for headings ("Base Question Text:") | line bbox 43 px export incl. asc+desc |
| Line height | 72 px (**36 logical**, = 1.5) | 8 consecutive line starts at exactly 72 px pitch |
| Bullets | plain round "•" markers, same size as text, indented one level | visual |
| Text inset | left 43 px (≈ 21), top ≈ 57 px (≈ 28) | text bbox vs sticky bbox |
| Author attribution | "ford" bottom-left; **black @ 40 % over fill** (#99885C on yellow — exact 0.6×fill blend), **12 px logical**, ~41 px (20) from left, baseline ~48 px (24) above bottom edge | pixel blend + bbox |
| Size sampled | 831×839 export (≈ 416×420 logical); red sticky 831×1087 (stretched) | bbox |
| Shadow | Down-biased soft shadow. Directly below bottom edge: 13 % black (#DEDEDE on white), fading to 0 over ~30 px (15). At mid-height sides: 5 % black (#F2F2F2), fading over ~14 px (7). Approximation: `box-shadow: 0 3px 12px rgba(0,0,0,0.15)` in logical px | luminance falloff scans below/beside edges |

---

## 4. Shapes

Universal rules sampled across all shapes:
- **Stroke width: 8 px (4 logical)** on every pastel bordered shape.
- **Text on pastel fills = black @ 80 % opacity over the fill** (verified as exact alpha blend on white, blue, yellow, red, purple fills). Text on saturated fills = **#FFFFFF**. Text on white shapes: #333333 (= 80 % black on white).
- Shape text ≈ 14–16 px logical, Inter, centered; standalone bold labels 20 px bold.
- No shadows on any shape (stickies and trim only).

| Shape | Fill | Stroke | Geometry (export px, logical in parens) |
|---|---|---|---|
| Rounded-rect / white node ("Research Objective") | #FFFFFF | #757575 8 px | pill-like; text #333333 |
| Stadium/pill ("Overall Context / Interview Purpose") | #FFFFFF | #757575 8 px | true stadium: radius = height/2; h = 168 (84) |
| Predefined-process "button" ("Get Next Question", "New Memory") | #C2E5FF | #3DADFF 8 px | rect 742×166 (371×83), corner radius 10 (5); **two inner vertical bars**, 8 px wide, inset 35 px (17.5) from each end — NOT a double border |
| Chevron/arrow ("Enough Context") | #FFECBD | #FFC943 8–9 px | total 722×200 (361×100); body height 106 (53); head = full height 200, head length 272 (136) ⇒ head is 38 % of total width, 1.9× body height; body corners rounded ≈ 20 (10); rounded stroke joins, slightly rounded tip |
| Emphasis box ("Does Response Provide…") | #FFC7C2 | #F24822 8 px | corner radius ≈ 15 (7.5); 998×358 sampled |
| Diamond (decision) | #E4CCFF (Agent Flows, borderless); salmon #FFC7C2 + #F24822 border (MR Walls); tan #FCD19C borderless (INK) | | |
| Pentagon / home-plate ("Form", "Skip") | #DCCCFF | #874FFF | MR Walls |
| Octagon ("End Workflow") | #FFC7C2 | #F24822 | MR Walls |
| Circle ("User Input") | #FFCD29 saturated, borderless | — | Agent Flows |
| Cylinder/DB ("Short Term Memory") | #E4CCFF borderless | — | Agent Flows |
| Parallelogram ("Send Input 1 Message") | #F24822 saturated, white text | — | INK |
| Hexagon ("Write Code to Call API") | #14AE5C saturated white text; pale #FFE8A3 borderless | — | INK |
| Flat rect (borderless style) | #BDE3FF | — | Agent Flows |
| Nested white cards inside sections | #FFFFFF or #F9F9F9, border #D9D9D9 4 px (2) or borderless, radius ≈ 16 (8), no shadow | | V2 Flow panels |
| Q-cards inside "Questions" | #FFFBF0, border #FFECBD 4 px (2) | | V2 Flow |

Pastel fill/stroke family pairs (used consistently for shapes, chips, connectors):

| Family | Fill | Stroke |
|---|---|---|
| Gray | #E6E6E6 | #C4C4C4 |
| Gray 2 | #D9D9D9 | #B3B3B3 |
| Blue | #C2E5FF | #3DADFF |
| Yellow | #FFECBD | #FFC943 |
| Orange | #FFE0C2 | #FF9E42 |
| Red/salmon | #FFC7C2 | #F24822 |
| Green | #DDF8E2 (shape) / #CDF4D3 (chip) | #66D575 |
| Purple | #DCCCFF / #E4CCFF | #874FFF |
| Teal | #5AD8CC | #369E94 |
| Pink | #FFC2EC | ≈#F849C1 |

Saturated palette (borderless, white text): **#F24822, #FF9E42*, #FFCD29, #14AE5C, #0D99FF, #9747FF, #FFA8DB, #B3B3B3** (*orange seen as icon fill).

---

## 5. Connectors

| Property | Value | How measured |
|---|---|---|
| Default stroke | **#757575, 8 px (4 logical)** | multiple scans, zero antialias |
| Orange | **#EB7500**, 8 px | V2 Flow |
| Green | **#3E9B4B**, 8 px | V2 Flow (note: darker than shape-green #66D575) |
| Red | **#F24822, 17–19 px (~8–9 logical)** — user-thickened for emphasis | V2 Flow |
| Purple | #9747FF | Agent Flows |
| Dark yellow | #E8A302 | UX Refactor Flow |
| Routing | orthogonal (elbow) with rounded turns | |
| Elbow corner radius | **47 px outer (≈ 23.5 logical)** on an unconstrained turn; centerline ≈ 43 px (21.5). Likely clamps smaller when segments are short | edge-profile on gray elbow |
| Dash pattern | dash 38 px, gap 14 px (**19 / 7 logical**), butt caps | run-length on dashed gray line |
| Arrowhead | solid filled triangle, same color as stroke: base width 40 px (20), length 36 px (18) ⇒ **5× / 4.5× the stroke width**; very slightly rounded tip | per-row width scan |
| Attachment | **never flush** — plain ends stop ≈ 16 px (8) short of the target border; arrowhead tips stop ≈ 25 px (12) short of the target | gap scans at two attachments |

---

## 6. Icon nodes (FigJam shape-library icons)

All drawn in the family fill + stroke pair, stroke ≈ 8–10 px (4–5), rounded joins,
~250–300 px (125–150) tall in V2 Flow.

| Icon | Fill | Stroke | Construction |
|---|---|---|---|
| Chat bubble ("AI Asks Question") | #FF9E42 | #EB7500 | circle with a curved tail merging at bottom-left, pointing down-left |
| Person ("Interviewee Response") | #66D575 | #3E9B4B | circle head + shoulders: trapezoid with heavily rounded top corners, flat bottom |
| CPU/chip ("Generate …") | #FFE0C2 | #FF9E42 | rounded square (radius ≈ 20 % of side) + concentric inner square outline (stroke only) + 8 pins (2 per side) extending outward |
| Envelope (MR Walls) | family fill | family stroke | rounded rect + V flap |
| Terminal (Bubba Voice) | dark | — | rounded square outline + `>_` glyph |
| Green chat bubble (Bubba Voice) | #66D575 family | #3E9B4B | same bubble geometry |

---

## 7. Code blocks

| Property | Value |
|---|---|
| Background | **#282A36** (Dracula) |
| Corner radius | ≈ 20 px (**10 logical**) — profile settles after 18–20 px |
| Default text | #F8F8F2 |
| Keyword | #FF79C6 (pink) |
| String | #F1FA8C (yellow) |
| Type/builtin | #8BE9FD (cyan) |
| Comment | not observed in samples (Dracula would be #6272A4) |
| Line numbers | **#999999**, right-aligned gutter; number column at ≈ 70 px (35) from left edge; code text starts ≈ 132 px (66) from left edge |
| Wrapped lines | continuation lines get no line number, hang at the gutter |
| Padding | top ≈ 50 px (25) |
| Shadow / border | none |
| Font | monospace, curved-tail ‘l’ (Source Code Pro–like; exact family unverified) |

---

## 7a. Font adjudication (Simple vs. Inter-like) — load-bearing

Two prior video-frame analysts disagreed on the canvas-content font: (A) FigJam's default
casual/rounded "Simple" face — evidence cited was the font dropdown showing "Simple" ✓
(fj-021) and soft/rounded letterforms in a sticky (fj-004); vs (B) an Inter-like geometric
sans — evidence cited was shape labels (fj-072/085). This was re-adjudicated directly on
`V2 Flow.png` (9952×4224), which has far better letterform resolution than the 1476×1080
video frames, by zooming into four independent text samples: sticky body text ("Overall
Context is why we are doing the interview..."), a shape label ("Get Next Question"), a bold
standalone label ("AI Asks Question"), and a section title chip ("Interview Inputs").

**Verdict: Inter-like geometric sans, uniformly across every text role.** There is no
rounded/casual face anywhere on the canvas — the four roles all share one letterform
construction, differing only in weight and size.

**Reconciliation of the disagreement:** the font-picker dropdown (fj-021) does show a
checkmark next to **"Simple"** — Analyst A was right that this is FigJam's selected family
name. But the dropdown itself renders each family name as a live preview *in that family's
own font*: "Simple" is rendered as a plain geometric grotesque (not rounded/casual),
"Bookish" as a serif, "Technical" as a monospace, "Scribbled" as a script/handwriting face.
"Simple" is FigJam's friendly *label* for its default sans, not a description of its shape.
Analyst B's Inter-like read of the shape labels is what the letterforms actually show.
Both were half right; letterform evidence resolves it toward Inter-like for every role.

**Letterform evidence:**

| Feature | Observation | Where seen |
|---|---|---|
| lowercase **a** | double-story, clean geometric bowl | sticky body ("Overall Context is why we are...") |
| lowercase **g** | single-story, simple hook descender (not a double-story/looped g) | "doing", "goal", "accomplish" (sticky body) |
| **t** terminal | flat, straight-cut (not curved/rounded) | sticky body, "Get Next Question", "AI Asks Question" |
| **Q** tail | straight diagonal stroke cutting through the bowl | "Get Next Question", "Question" (chip labels) |
| cross-role consistency | chip, sticky body, plain label, and bold label all share the same construction, differing only in weight/size | "Interview Inputs" chip vs. the above |

Per-role verdict (all high confidence except code block, which uses an unrelated monospace face):

| Role | Family | Confidence |
|---|---|---|
| Sticky body text | Simple (Inter-like) | high |
| Shape/node label | Simple (Inter-like) | high |
| Bold standalone label | Simple (Inter-like) | high |
| Section/frame title chip | Simple (Inter-like) | high |
| Code block | separate monospace (not the canvas "Simple" family) | medium |

---

## 8. Text hierarchy (logical px, font = Inter — letterforms match)

| Role | Size | Weight | Color |
|---|---|---|---|
| Section/panel chip label | 16 | medium/semibold | #000000 (pure black) |
| Sticky body | 24 | regular (bold for headings) | black @ 80 % over fill |
| Sticky line-height | 36 (1.5×) | | |
| Sticky author | 12 | regular | black @ 40 % over fill |
| Standalone bold labels ("AI Asks Question") | ~20 | bold | #000000 / 80 % black |
| Shape/node text | 14–16 | regular–medium | black @ 80 % over fill; #FFFFFF on saturated fills |

The 80 %/40 % black-over-fill rule reproduced every sampled text color exactly
(#332D1F, #332321, #33222C, #222C33, #272E33, #332F26, #333333, #99885C…). Implement text
as `rgba(0,0,0,0.8)` (body) and `rgba(0,0,0,0.4)` (author) rather than fixed hexes.

---

## 9. Trim (from video frames, CSS px at recording scale)

| Element | Value |
|---|---|
| App top bar | #E6E6E6, ~29 px tall, 1 px #DFDFDF bottom border |
| Canvas | #F5F5F5 + dot grid (see §1) |
| Bottom toolbar | floating white pill (#FFFFFF/#FDFDFD), ≈ 546×37 px, large radius, soft drop shadow below (≈ #D0D0D0 at 1–2 px below, fading over ~8 px) |
| Active tool highlight | purple **#8C2EF2** rounded square |
| Share button | #8C2EF2 |
| Context (selection) toolbar | dark **#1D1D1D**, rounded ≈ 10 px, white icons, purple #8C2EF2 active toggle (e.g. Bold), thin divider lines |
| Selection outline/handles | **#0D99FF** (Figma blue; video samples cluster #11A1F8–#3E9DDA around it; #0D99FF appears verbatim as a fill in INK Diagrams) |
| Zoom pill (bottom-right) | white, gray text |

---

## 10. Things explicitly NOT observed

- Grid in any export (exports have white background, no dots) — grid values come from frames only, so dot color has video-compression uncertainty (±~#06 per channel).
- Sticky folded corner — does not exist.
- Comment-style dashed connectors other than the gray 38/14 pattern.
- Teal chip/section-tint pairing (tint #C6FAF6 seen, chip not).
- Dracula comment color in the wild.
- Exact code-block font family.
- Shadows on shapes, sections, panels, code blocks — none exist; only stickies and floating trim have shadows.
- Export scale of the 10 corroboration files (only V2 Flow's 2× was verified; they were used for color palette only).

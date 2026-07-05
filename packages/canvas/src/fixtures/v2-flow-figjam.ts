"use client";

import type { InteractiveCanvasDocument } from "../schema";

/**
 * V2 Flow — FigJam visual-parity fixture (Wave 4 acceptance gate).
 *
 * Recreates the user's own FigJam board
 * (`board-design-reference/my_diagrams/V2 Flow.png`, 9952x4224 @ 2x export,
 * i.e. 4976x2112 logical px) inside the interactive-canvas engine, using the
 * exact object vocabulary + tokens introduced in W2/W3 (figjam-tokens.ts,
 * schema.ts). This is a distinct fixture from `./v2-flow-canvas.ts` (the
 * original generic-shape "V2 Flow" sample) — that one is left untouched.
 *
 * ---------------------------------------------------------------------------
 * COORDINATE TABLE (all values LOGICAL px = PNG export px / 2, measured via
 * Python/PIL color-bbox scans of the reference PNG plus direct visual
 * inspection of cropped regions). Origin (0,0) = PNG top-left.
 * ---------------------------------------------------------------------------
 *
 * OUTER PAGE FRAME ("Interview Agent")
 *   frame:                  x=40,   y=40,   w=4895.5, h=2031.5  (white, thin gray border, title chip top-left)
 *
 * LEFT COLUMN — standalone stickies (outside any section)
 *   overall-context sticky (yellow): x=136.5, y=95,   w=414, h=418.5  author "ford"
 *   base-question sticky (red):      x=136.5, y=883,  w=414, h=490.5  author "ford"
 *
 * SECTION: Interview Inputs (green tint), containing General + Questions cards
 *   section bbox:            x=618,  y=90,   w=570,  h=1690   (green)
 *     General card (orange/cream tint): x=688, y=203, w=430, h=346
 *       pill "Overall Context / Interview Purpose": x=722.5, y=267, w=363, h=57
 *     Questions card (gray tint): x=698, y=587, w=430, h=1134
 *       Question 1 card (yellow tint): x=746, y=651,  w=334, h=222
 *         pill "Base Question Text":   x=797, y=701,  w=234, h=33
 *         pill "Research Objective":   x=797, y=745,  w=234, h=88.5
 *       Question 2 card (yellow tint): x=746, y=875,  w=334, h=298
 *         pill "Base Question Text":   x=797, y=925,  w=234, h=33
 *         pill "Research Objective":   x=797, y=995,  w=234, h=99
 *       (dashed gray connector, Question 2 -> Question N, vertical, no arrowheads)
 *       Question N card (yellow tint): x=746, y=1419, w=334, h=204
 *         pill "Base Question Text":   x=797, y=1468, w=234, h=46.5
 *         pill "Research Objective":   x=797, y=1564.5, w=234, h=45
 *
 * SECTION: Interview Flow (purple tint) — the big central/bottom region
 *   section bbox: x=1370, y=90, w=3490, h=1898
 *   icons (chip-icon = orange CPU chip w/ pins; chat = orange speech bubble; person = green figure):
 *     chip-icon "Generate Transition Response": x=1556.5, y=570.5, w=97.5, h=54   (square-ish target 96x96, use 96x96 centered)
 *     chip-icon "Adapt Question Based on Interview History": x=1556.5, y=987, w=97.5, h=97.5
 *     chat "AI Asks Question" (orange bubble):  x=2630.5, y=173,  w=114, h=114
 *     person "Interviewee Response" (green):     x=2639.5, y=712,  w=94.5, h=87
 *     chip-icon "Generate Probing Question":     x=4639,  y=699,  w=135, h=100  (use 96x96 centered on same box)
 *
 * SECTION: Memory Bank (orange/cream tint), nested inside Interview Flow
 *   section bbox: x=3243, y=306, w=1129.5, h=906
 *     sticky (red) "Memory Bank" bullets, author ford: x=3576, y=375, w=414, h=223.5
 *     Memory Actions card (gray tint): x=3290, y=650, w=308, h=508
 *       predefined-process (blue) "New Memory":    y~700
 *       predefined-process (blue) "Update Memory":  y~825
 *       predefined-process (blue) "Delete Memory":  y~950
 *       predefined-process (blue) "No Change":      y~1075
 *     Structure card (gray tint): x=3658, y=650, w=666, h=514
 *       code-block (python) "class Memory(BaseModel): ..."
 *       code-block (json)   memory records
 *
 * BOTTOM ROW — two white "Response" cards inside Interview Flow + a central red emphasis box
 *   predefined-process (blue) "Get Next Question": left of NQR card, x=1720, y=1650, w=150, h=70
 *   Next Question Response card (white tint): x=1898, y=1418, w=446, h=530
 *     arrow-shape (yellow, left)  "Enough Context":     x=1975, y=1465, w=348, h=100
 *     arrow-shape (yellow, left)  "Null Response":       x=1975, y=1615, w=348, h=100
 *     arrow-shape (yellow, left)  "User Safety Refusal": x=1975, y=1765, w=348, h=100
 *   emphasis box (red) "Does Response Provide Enough Context to Answer the Research Objective":
 *     x=2457.5, y=1598, w=459, h=171
 *   Probing Response card (white tint): x=3028, y=1418, w=430, h=528
 *     arrow-shape (yellow, right) "Not Enough Context":    x=3105, y=1465, w=331, h=100
 *     arrow-shape (yellow, right) "Unclear Message":        x=3105, y=1615, w=331, h=100
 *     arrow-shape (yellow, right) "Possible User Refusal":  x=3105, y=1765, w=331, h=100
 *
 * CONNECTOR NETWORK (colors from figjam-tokens.ts CONNECTOR_COLORS)
 *   gray:   Overall-Context-pill <- yellow sticky (arrowhead "forward" into pill)
 *   gray:   Base-Question-Text/Research-Objective (Q1..QN pills) <- red sticky
 *   gray:   Question cards -> AI Asks Question (fan-in from Questions card right edge)
 *   gray:   General card -> Generate Transition Response (down from Questions-card area? — actually
 *           routed as: General/Questions right edge -> AI Asks Question (top gray, elbow),
 *           Generate Transition Response <- (down from same gray elbow), Adapt Question <- Get Next Question (vertical gray, upward)
 *   orange: AI Asks Question <-> Generate Probing Question (long top elbow, arrow points INTO AI Asks Question)
 *   orange: AI Asks Question -> Interviewee Response (straight down)
 *   orange: Generate Transition Response -> AI Asks Question (up, short elbow) [drawn as part of same gray/orange fan]
 *   orange: Adapt Question -> Generate Transition Response (up)
 *   green:  Interviewee Response -> Memory Actions card (right, into "New Memory" button)
 *   green:  emphasis box <- Interviewee Response (down into emphasis box top) — actually green arrives
 *           at emphasis box TOP from above (from Interviewee Response); modeled as a straight vertical line.
 *   gray:   Get Next Question <-> the 3 left chevrons (fan, no arrowheads on the card side, arrow into chevrons)
 *   red:    emphasis box -> 3 left chevrons (arrow into chevrons, "back" style visually but drawn forward into chevron)
 *   red:    emphasis box -> 3 right chevrons
 *   gray:   3 right chevrons -> loop up and over to Generate Probing Question (mirrors the left "Get Next Question" input)
 *   gray:   dashed, Question 2 -> Question N (no arrowhead, style "dotted")
 *
 * Exact-color pass (W4 follow-up): every shape now carries the sampled
 * FigJam fill/stroke PAIR via the explicit `style.fill`/`style.stroke` fields
 * (pills #FFFFFF/#757575, chevrons PASTEL_PAIRS.yellow, predefined-process
 * PASTEL_PAIRS.blue, emphasis box PASTEL_PAIRS.red @ strokeWidth 8);
 * stickies resolve to exact STICKY_COLORS hexes via the theme's sticky-token
 * mapping; sections/connectors/code-blocks/icons were already exact-hex. The
 * three fan junctions (Get Next Question, emphasis-box left/right, and the
 * right-chevrons -> Generate Probing Question loop) use shared-trunk
 * `waypoints` so the branches overlap into the reference's single visual
 * trunk before splitting.
 */
export const v2FlowFigjamCanvas: InteractiveCanvasDocument = {
  schemaVersion: 1,
  id: "v2-flow-figjam",
  title: "V2 Flow (FigJam parity)",
  mode: "diagram",
  size: { width: 5000, height: 2150 },
  viewport: { x: 0, y: 0, zoom: 1 },
  objects: [
    // -----------------------------------------------------------------
    // Outer page frame
    // -----------------------------------------------------------------
    {
      id: "page-frame",
      type: "section",
      label: "Interview Agent",
      title: "Interview Agent",
      tint: "white",
      geometry: { x: 40, y: 40, width: 4895.5, height: 2031.5 },
      style: { shape: "section" },
    },

    // -----------------------------------------------------------------
    // Left column standalone stickies
    // -----------------------------------------------------------------
    {
      id: "sticky-overall-context",
      type: "sticky",
      label: "Overall Context note",
      body:
        "Overall Context is why we are doing the interview / overall goal we wish to accomplish.\n" +
        "• Who the client is, etc\n" +
        '• EX “We are doing this interview to understand why someone would change pharmacies”',
      author: "ford",
      parentId: "page-frame",
      geometry: { x: 136.5, y: 95, width: 414, height: 418.5 },
      style: { shape: "note", paletteToken: "note" },
    },
    {
      id: "sticky-base-question-text",
      type: "sticky",
      label: "Base Question Text / Research Objective note",
      body:
        "Base Question Text:\n" +
        "• Stakeholder inputted text of the question\n" +
        "• Can be adapted based on conversation history\n\n" +
        "Research Objective\n" +
        "• Defines what we want to understand about the interviewee from this question.\n" +
        "• In relation to the overall objective",
      author: "ford",
      parentId: "page-frame",
      geometry: { x: 136.5, y: 883, width: 414, height: 490.5 },
      style: { shape: "note", paletteToken: "hot" },
    },

    // -----------------------------------------------------------------
    // Section: Interview Inputs (green)
    // -----------------------------------------------------------------
    {
      id: "section-interview-inputs",
      type: "section",
      label: "Interview Inputs",
      title: "Interview Inputs",
      tint: "green",
      parentId: "page-frame",
      geometry: { x: 618, y: 90, width: 570, height: 1690 },
      style: { shape: "section" },
    },
    {
      id: "card-general",
      type: "section",
      label: "General",
      title: "General",
      tint: "orange",
      parentId: "section-interview-inputs",
      geometry: { x: 688, y: 203, width: 430, height: 346 },
      style: { shape: "section" },
    },
    {
      id: "pill-overall-context",
      type: "pill",
      label: "Overall Context / Interview Purpose",
      parentId: "card-general",
      geometry: { x: 722.5, y: 267, width: 363, height: 57 },
      style: { shape: "pill", fill: "#FFFFFF", stroke: "#757575" },
    },
    {
      id: "card-questions",
      type: "section",
      label: "Questions",
      title: "Questions",
      tint: "gray",
      parentId: "section-interview-inputs",
      geometry: { x: 698, y: 587, width: 430, height: 1134 },
      style: { shape: "section" },
    },
    {
      id: "card-question-1",
      type: "section",
      label: "Question 1",
      title: "Question 1",
      tint: "yellow",
      parentId: "card-questions",
      geometry: { x: 746, y: 651, width: 334, height: 222 },
      style: { shape: "section" },
    },
    {
      id: "pill-q1-base-question-text",
      type: "pill",
      label: "Base Question Text",
      parentId: "card-question-1",
      geometry: { x: 797, y: 701, width: 234, height: 40 },
      style: { shape: "pill", fill: "#FFFFFF", stroke: "#757575" },
    },
    {
      id: "pill-q1-research-objective",
      type: "pill",
      label: "Research Objective",
      parentId: "card-question-1",
      geometry: { x: 797, y: 787, width: 234, height: 60 },
      style: { shape: "pill", fill: "#FFFFFF", stroke: "#757575" },
    },
    {
      id: "card-question-2",
      type: "section",
      label: "Question 2",
      title: "Question 2",
      tint: "yellow",
      parentId: "card-questions",
      geometry: { x: 746, y: 875, width: 334, height: 298 },
      style: { shape: "section" },
    },
    {
      id: "pill-q2-base-question-text",
      type: "pill",
      label: "Base Question Text",
      parentId: "card-question-2",
      geometry: { x: 797, y: 925, width: 234, height: 60 },
      style: { shape: "pill", fill: "#FFFFFF", stroke: "#757575" },
    },
    {
      id: "pill-q2-research-objective",
      type: "pill",
      label: "Research Objective",
      parentId: "card-question-2",
      geometry: { x: 797, y: 1035, width: 234, height: 60 },
      style: { shape: "pill", fill: "#FFFFFF", stroke: "#757575" },
    },
    {
      id: "card-question-n",
      type: "section",
      label: "Question N",
      title: "Question N",
      tint: "yellow",
      parentId: "card-questions",
      geometry: { x: 746, y: 1419, width: 334, height: 204 },
      style: { shape: "section" },
    },
    {
      id: "pill-qn-base-question-text",
      type: "pill",
      label: "Base Question Text",
      parentId: "card-question-n",
      geometry: { x: 797, y: 1468, width: 234, height: 46.5 },
      style: { shape: "pill", fill: "#FFFFFF", stroke: "#757575" },
    },
    {
      id: "pill-qn-research-objective",
      type: "pill",
      label: "Research Objective",
      parentId: "card-question-n",
      geometry: { x: 797, y: 1544.5, width: 234, height: 60 },
      style: { shape: "pill", fill: "#FFFFFF", stroke: "#757575" },
    },

    // -----------------------------------------------------------------
    // Section: Interview Flow (purple) — center + bottom
    // -----------------------------------------------------------------
    {
      id: "section-interview-flow",
      type: "section",
      label: "Interview Flow",
      title: "Interview Flow",
      tint: "purple",
      parentId: "page-frame",
      geometry: { x: 1370, y: 90, width: 3490, height: 1898 },
      style: { shape: "section" },
    },
    {
      id: "chip-generate-transition-response",
      type: "chip-icon",
      label: "Generate Transition Response",
      parentId: "section-interview-flow",
      geometry: { x: 1557, y: 522, width: 96, height: 96 },
      style: { shape: "chip-icon" },
    },
    {
      id: "chip-adapt-question",
      type: "chip-icon",
      label: "Adapt Question Based on Interview History",
      parentId: "section-interview-flow",
      geometry: { x: 1557, y: 987, width: 96, height: 96 },
      style: { shape: "chip-icon" },
    },
    {
      id: "chat-ai-asks-question",
      type: "chat",
      label: "AI Asks Question",
      parentId: "section-interview-flow",
      geometry: { x: 2588, y: 173, width: 114, height: 114 },
      style: { shape: "chat" },
    },
    {
      id: "person-interviewee-response",
      type: "person",
      label: "Interviewee Response",
      parentId: "section-interview-flow",
      geometry: { x: 2596, y: 712, width: 94.5, height: 87 },
      style: { shape: "person" },
    },
    {
      id: "chip-generate-probing-question",
      type: "chip-icon",
      label: "Generate Probing Question",
      parentId: "section-interview-flow",
      geometry: { x: 4591, y: 651, width: 96, height: 96 },
      style: { shape: "chip-icon" },
    },

    // -----------------------------------------------------------------
    // Section: Memory Bank (orange/cream), nested in Interview Flow
    // -----------------------------------------------------------------
    {
      id: "section-memory-bank",
      type: "section",
      label: "Memory Bank",
      title: "Memory Bank",
      tint: "orange",
      parentId: "section-interview-flow",
      geometry: { x: 3243, y: 306, width: 1129.5, height: 906 },
      style: { shape: "section" },
    },
    {
      id: "sticky-memory-bank",
      type: "sticky",
      label: "Memory Bank note",
      body:
        "Memory Bank\n" +
        "• Memory of the current interview across all questions\n" +
        "• Provides consistency without needing to pass the whole conversation each message\n" +
        "• Ensure’s we do not ask the same question twice",
      author: "ford",
      parentId: "section-memory-bank",
      geometry: { x: 3576, y: 375, width: 414, height: 223.5 },
      style: { shape: "note", paletteToken: "hot" },
    },
    {
      id: "card-memory-actions",
      type: "section",
      label: "Memory Actions",
      title: "Memory Actions",
      tint: "gray",
      parentId: "section-memory-bank",
      geometry: { x: 3290, y: 650, width: 308, height: 508 },
      style: { shape: "section" },
    },
    {
      id: "predefined-new-memory",
      type: "predefined-process",
      label: "New Memory",
      parentId: "card-memory-actions",
      geometry: { x: 3310, y: 700, width: 268, height: 66 },
      style: { shape: "predefined-process", fill: "#C2E5FF", stroke: "#3DADFF" },
    },
    {
      id: "predefined-update-memory",
      type: "predefined-process",
      label: "Update Memory",
      parentId: "card-memory-actions",
      geometry: { x: 3310, y: 825, width: 268, height: 66 },
      style: { shape: "predefined-process", fill: "#C2E5FF", stroke: "#3DADFF" },
    },
    {
      id: "predefined-delete-memory",
      type: "predefined-process",
      label: "Delete Memory",
      parentId: "card-memory-actions",
      geometry: { x: 3310, y: 950, width: 268, height: 66 },
      style: { shape: "predefined-process", fill: "#C2E5FF", stroke: "#3DADFF" },
    },
    {
      id: "predefined-no-change",
      type: "predefined-process",
      label: "No Change",
      parentId: "card-memory-actions",
      geometry: { x: 3310, y: 1075, width: 268, height: 66 },
      style: { shape: "predefined-process", fill: "#C2E5FF", stroke: "#3DADFF" },
    },
    {
      id: "card-structure",
      type: "section",
      label: "Structure",
      title: "Structure",
      tint: "gray",
      parentId: "section-memory-bank",
      geometry: { x: 3658, y: 650, width: 666, height: 514 },
      style: { shape: "section" },
    },
    {
      id: "code-block-memory-class",
      type: "code-block",
      label: "Memory class definition",
      body:
        'class Memory(BaseModel):\n' +
        '    id: str = Field(description="mem_0, mem_1, mem_n")\n' +
        '    content: str = Field(description="text of the memory")',
      language: "python",
      parentId: "card-structure",
      geometry: { x: 3678, y: 690, width: 626, height: 170 },
      style: { shape: "code-block" },
    },
    {
      id: "code-block-memory-json",
      type: "code-block",
      label: "Memory records example",
      body:
        '{\n' +
        '  "id": "mem_0",\n' +
        '  "content": "Likes pizza"\n' +
        '},\n' +
        '{\n' +
        '  "id": "mem_1",\n' +
        '  "content": "Doesn\'t like the cold"\n' +
        '},',
      language: "json",
      parentId: "card-structure",
      geometry: { x: 3678, y: 880, width: 626, height: 260 },
      style: { shape: "code-block" },
    },

    // -----------------------------------------------------------------
    // Bottom row: Get Next Question, response cards, emphasis box
    // -----------------------------------------------------------------
    {
      id: "predefined-get-next-question",
      type: "predefined-process",
      label: "Get Next Question",
      parentId: "section-interview-flow",
      geometry: { x: 1720, y: 1650, width: 176, height: 66 },
      style: { shape: "predefined-process", fill: "#C2E5FF", stroke: "#3DADFF" },
    },
    {
      id: "card-next-question-response",
      type: "section",
      label: "Next Question Response",
      title: "Next Question Response",
      tint: "white",
      parentId: "section-interview-flow",
      geometry: { x: 1898, y: 1418, width: 446, height: 530 },
      style: { shape: "section" },
    },
    {
      id: "chevron-enough-context",
      type: "arrow-shape",
      label: "Enough Context",
      direction: "left",
      parentId: "card-next-question-response",
      geometry: { x: 1935, y: 1465, width: 348, height: 100 },
      style: { shape: "arrow-shape", fill: "#FFECBD", stroke: "#FFC943" },
    },
    {
      id: "chevron-null-response",
      type: "arrow-shape",
      label: "Null Response",
      direction: "left",
      parentId: "card-next-question-response",
      geometry: { x: 1935, y: 1615, width: 348, height: 100 },
      style: { shape: "arrow-shape", fill: "#FFECBD", stroke: "#FFC943" },
    },
    {
      id: "chevron-user-safety-refusal",
      type: "arrow-shape",
      label: "User Safety Refusal",
      direction: "left",
      parentId: "card-next-question-response",
      geometry: { x: 1935, y: 1765, width: 348, height: 100 },
      style: { shape: "arrow-shape", fill: "#FFECBD", stroke: "#FFC943" },
    },
    {
      id: "emphasis-box-research-objective",
      type: "text",
      label: "Does Response Provide Enough Context to Answer the Research Objective",
      parentId: "section-interview-flow",
      geometry: { x: 2457.5, y: 1598, width: 459, height: 171 },
      // figjam-style-spec: emphasis box #FFC7C2 / #F24822, user-thickened
      // stroke (~8 logical px vs the universal 4).
      style: { shape: "rounded-rect", fill: "#FFC7C2", stroke: "#F24822", strokeWidth: 8 },
    },
    {
      id: "card-probing-response",
      type: "section",
      label: "Probing Response",
      title: "Probing Response",
      tint: "white",
      parentId: "section-interview-flow",
      geometry: { x: 3028, y: 1418, width: 430, height: 528 },
      style: { shape: "section" },
    },
    {
      id: "chevron-not-enough-context",
      type: "arrow-shape",
      label: "Not Enough Context",
      direction: "right",
      parentId: "card-probing-response",
      geometry: { x: 3065, y: 1465, width: 331, height: 100 },
      style: { shape: "arrow-shape", fill: "#FFECBD", stroke: "#FFC943" },
    },
    {
      id: "chevron-unclear-message",
      type: "arrow-shape",
      label: "Unclear Message",
      direction: "right",
      parentId: "card-probing-response",
      geometry: { x: 3065, y: 1615, width: 331, height: 100 },
      style: { shape: "arrow-shape", fill: "#FFECBD", stroke: "#FFC943" },
    },
    {
      id: "chevron-possible-user-refusal",
      type: "arrow-shape",
      label: "Possible User Refusal",
      direction: "right",
      parentId: "card-probing-response",
      geometry: { x: 3065, y: 1765, width: 331, height: 100 },
      style: { shape: "arrow-shape", fill: "#FFECBD", stroke: "#FFC943" },
    },
  ],

  connections: [
    // Left column stickies -> Interview Inputs pills
    {
      id: "conn-sticky-overall-context-to-pill",
      from: { objectId: "sticky-overall-context", anchor: "right" },
      to: { objectId: "pill-overall-context", anchor: "left" },
      style: "solid",
      arrow: "forward",
      color: "#E8A302",
      role: "input",
    },
    {
      id: "conn-sticky-base-question-to-q2-research-objective",
      from: { objectId: "sticky-base-question-text", anchor: "right" },
      to: { objectId: "pill-q2-research-objective", anchor: "left" },
      style: "solid",
      arrow: "forward",
      color: "#E8A302",
      role: "input",
    },

    // dashed connector between Question 2 and Question N (ellipsis break)
    {
      id: "conn-question2-to-questionn",
      from: { objectId: "card-question-2", anchor: "bottom" },
      to: { objectId: "card-question-n", anchor: "top" },
      style: "dotted",
      arrow: "none",
      color: "#757575",
      role: "sequence",
    },

    // Questions card fans into AI Asks Question (gray elbow)
    {
      id: "conn-questions-to-ai-asks-question",
      from: { objectId: "card-questions", anchor: "right", position: [1, 0.05] },
      to: { objectId: "chat-ai-asks-question", anchor: "left" },
      style: "elbow",
      arrow: "forward",
      color: "#757575",
      role: "flow",
    },
    // Same gray line also feeds down into Generate Transition Response
    {
      id: "conn-questions-to-generate-transition-response",
      from: { objectId: "card-questions", anchor: "right", position: [1, 0.02] },
      to: { objectId: "chip-generate-transition-response", anchor: "top" },
      style: "elbow",
      arrow: "none",
      color: "#757575",
      role: "flow",
    },
    // Adapt Question -> Generate Transition Response (orange, up)
    {
      id: "conn-adapt-question-to-generate-transition-response",
      from: { objectId: "chip-adapt-question", anchor: "top" },
      to: { objectId: "chip-generate-transition-response", anchor: "bottom" },
      style: "solid",
      arrow: "forward",
      color: "#EB7500",
      role: "flow",
    },
    // Get Next Question -> Adapt Question (gray, vertical up)
    {
      id: "conn-get-next-question-to-adapt-question",
      from: { objectId: "predefined-get-next-question", anchor: "top" },
      to: { objectId: "chip-adapt-question", anchor: "bottom" },
      style: "solid",
      arrow: "forward",
      color: "#757575",
      role: "flow",
    },

    // AI Asks Question <-> Generate Probing Question (orange, long top elbow, arrow into AI Asks Question)
    {
      id: "conn-generate-probing-question-to-ai-asks-question",
      from: { objectId: "chip-generate-probing-question", anchor: "top" },
      to: { objectId: "chat-ai-asks-question", anchor: "right" },
      style: "elbow",
      arrow: "forward",
      color: "#EB7500",
      role: "flow",
    },

    // AI Asks Question -> Interviewee Response (orange, straight down)
    {
      id: "conn-ai-asks-question-to-interviewee-response",
      from: { objectId: "chat-ai-asks-question", anchor: "bottom" },
      to: { objectId: "person-interviewee-response", anchor: "top" },
      style: "solid",
      arrow: "forward",
      color: "#EB7500",
      role: "flow",
    },

    // Interviewee Response -> Memory Actions (green, into New Memory)
    {
      id: "conn-interviewee-response-to-new-memory",
      from: { objectId: "person-interviewee-response", anchor: "right" },
      to: { objectId: "predefined-new-memory", anchor: "left" },
      style: "solid",
      arrow: "forward",
      color: "#3E9B4B",
      role: "flow",
    },

    // Interviewee Response -> emphasis box (green, down into top)
    {
      id: "conn-interviewee-response-to-emphasis-box",
      from: { objectId: "person-interviewee-response", anchor: "bottom" },
      to: { objectId: "emphasis-box-research-objective", anchor: "top" },
      style: "solid",
      arrow: "forward",
      color: "#3E9B4B",
      role: "flow",
    },

    // Get Next Question <-> left chevrons (gray trunk-and-branch fan; the
    // shared [1915, 1683] trunk segment makes the three routes overlap into
    // one visual trunk, and the single ref arrowhead points INTO Get Next
    // Question — arrow "back" puts the marker on the shared GNQ end).
    {
      id: "conn-get-next-question-to-enough-context",
      from: { objectId: "predefined-get-next-question", anchor: "right" },
      to: { objectId: "chevron-enough-context", anchor: "left" },
      waypoints: [
        [1915, 1683],
        [1915, 1515],
      ],
      style: "elbow",
      arrow: "back",
      color: "#757575",
      role: "flow",
    },
    {
      id: "conn-get-next-question-to-null-response",
      from: { objectId: "predefined-get-next-question", anchor: "right" },
      to: { objectId: "chevron-null-response", anchor: "left" },
      waypoints: [
        [1915, 1683],
        [1915, 1665],
      ],
      style: "elbow",
      arrow: "back",
      color: "#757575",
      role: "flow",
    },
    {
      id: "conn-get-next-question-to-user-safety-refusal",
      from: { objectId: "predefined-get-next-question", anchor: "right" },
      to: { objectId: "chevron-user-safety-refusal", anchor: "left" },
      waypoints: [
        [1915, 1683],
        [1915, 1815],
      ],
      style: "elbow",
      arrow: "back",
      color: "#757575",
      role: "flow",
    },

    // emphasis box -> left chevrons (red trunk-and-branch fan, arrow into
    // chevrons; shared trunk segment at x=2385).
    {
      id: "conn-emphasis-box-to-enough-context",
      from: { objectId: "emphasis-box-research-objective", anchor: "left" },
      to: { objectId: "chevron-enough-context", anchor: "right" },
      waypoints: [
        [2385, 1683.5],
        [2385, 1515],
      ],
      style: "elbow",
      arrow: "forward",
      color: "#F24822",
      role: "decision",
    },
    {
      id: "conn-emphasis-box-to-null-response",
      from: { objectId: "emphasis-box-research-objective", anchor: "left" },
      to: { objectId: "chevron-null-response", anchor: "right" },
      waypoints: [
        [2385, 1683.5],
        [2385, 1665],
      ],
      style: "elbow",
      arrow: "forward",
      color: "#F24822",
      role: "decision",
    },
    {
      id: "conn-emphasis-box-to-user-safety-refusal",
      from: { objectId: "emphasis-box-research-objective", anchor: "left" },
      to: { objectId: "chevron-user-safety-refusal", anchor: "right" },
      waypoints: [
        [2385, 1683.5],
        [2385, 1815],
      ],
      style: "elbow",
      arrow: "forward",
      color: "#F24822",
      role: "decision",
    },

    // emphasis box -> right chevrons (red trunk-and-branch fan at x=2985)
    {
      id: "conn-emphasis-box-to-not-enough-context",
      from: { objectId: "emphasis-box-research-objective", anchor: "right" },
      to: { objectId: "chevron-not-enough-context", anchor: "left" },
      waypoints: [
        [2985, 1683.5],
        [2985, 1515],
      ],
      style: "elbow",
      arrow: "forward",
      color: "#F24822",
      role: "decision",
    },
    {
      id: "conn-emphasis-box-to-unclear-message",
      from: { objectId: "emphasis-box-research-objective", anchor: "right" },
      to: { objectId: "chevron-unclear-message", anchor: "left" },
      waypoints: [
        [2985, 1683.5],
        [2985, 1665],
      ],
      style: "elbow",
      arrow: "forward",
      color: "#F24822",
      role: "decision",
    },
    {
      id: "conn-emphasis-box-to-possible-user-refusal",
      from: { objectId: "emphasis-box-research-objective", anchor: "right" },
      to: { objectId: "chevron-possible-user-refusal", anchor: "left" },
      waypoints: [
        [2985, 1683.5],
        [2985, 1815],
      ],
      style: "elbow",
      arrow: "forward",
      color: "#F24822",
      role: "decision",
    },

    // right chevrons -> loop over to Generate Probing Question (gray trunk-
    // and-branch, mirroring the reference: merge at x=3575, run right along
    // y=1683, rise at x=4668 into the chip's bottom edge).
    {
      id: "conn-not-enough-context-to-generate-probing-question",
      from: { objectId: "chevron-not-enough-context", anchor: "right" },
      to: { objectId: "chip-generate-probing-question", anchor: "bottom", position: [0.8, 1] },
      waypoints: [
        [3575, 1515],
        [3575, 1683],
        [4668, 1683],
      ],
      style: "elbow",
      arrow: "forward",
      color: "#757575",
      role: "flow",
    },
    {
      id: "conn-unclear-message-to-generate-probing-question",
      from: { objectId: "chevron-unclear-message", anchor: "right" },
      to: { objectId: "chip-generate-probing-question", anchor: "bottom", position: [0.8, 1] },
      waypoints: [
        [3575, 1665],
        [3575, 1683],
        [4668, 1683],
      ],
      style: "elbow",
      arrow: "forward",
      color: "#757575",
      role: "flow",
    },
    {
      id: "conn-possible-user-refusal-to-generate-probing-question",
      from: { objectId: "chevron-possible-user-refusal", anchor: "right" },
      to: { objectId: "chip-generate-probing-question", anchor: "bottom", position: [0.8, 1] },
      waypoints: [
        [3575, 1815],
        [3575, 1683],
        [4668, 1683],
      ],
      style: "elbow",
      arrow: "forward",
      color: "#757575",
      role: "flow",
    },

    // Memory Bank -> Generate Probing Question (gray, horizontal out of the
    // section's right edge at its vertical center — present in the reference,
    // emerging from behind the section border at y≈758).
    {
      id: "conn-memory-bank-to-generate-probing-question",
      from: { objectId: "section-memory-bank", anchor: "right" },
      to: { objectId: "chip-generate-probing-question", anchor: "left", position: [0, 1] },
      style: "solid",
      arrow: "forward",
      color: "#757575",
      role: "flow",
    },
  ],
};

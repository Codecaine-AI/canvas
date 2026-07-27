# SF — System Fidelity (1–10)
- code: SF
- scorecard-order: 1
- scored: per scenario (final committed state)
- roles: blind reconstruction judge + scorer (two separate sessions)

*Can an engineer recover the system described by the brief from the board alone?*

## Judge inputs

**Blind reconstruction judge** — Sees: the final PNG only, under an anonymous name.
Its prompt contains no scenario name, brief vocabulary, canvas JSON, or genre hint.
Never sees: the brief, reference boards, transcripts, configuration, or other axes'
output.

**Scorer** — Sees: the blind reconstruction and the brief, plus
the shared judge rules and this file. Never sees: the board PNG or JSON, reference boards,
transcripts, configuration, or other axes' output.

## Method

1. The blind judge reconstructs only what the board communicates:
   - the system's purpose;
   - every visible component and its responsibility;
   - data and control flows, including ordering, branches, and feedback loops;
   - failure paths, degraded modes, recovery behavior, and terminal outcomes;
   - operational constraints or boundaries made explicit by the board;
   - uncertainties where endpoints, direction, ownership, or semantics are ambiguous.
2. The scorer atomizes the brief into system-defining and supporting elements. An
   element may describe a component, responsibility, relationship, sequence,
   constraint, failure behavior, or recovery behavior.
3. For every brief element, the scorer records whether the reconstruction recovered
   it, partially recovered it, missed it, or contradicted it. Paraphrases count;
   direction, ownership, ordering, and failure outcomes must remain correct.
4. The scorer also records claims in the reconstruction that the brief does not
   support. A reasonable high-level interpretation is not an invented claim; a
   specific component, relationship, or guarantee absent from or contrary to the
   brief is.
5. Score the communication result holistically from the table below. The question is
   whether the reconstructed system is accurate and usable for engineering
   discussion, not whether the scorer can infer what the author probably intended.

## Rubric

| score | anchor |
|---|---|
| 10 | The reconstruction is complete and exact: components, responsibilities, data/control paths, failure paths, recovery behavior, boundaries, and constraints all match the brief, with no unsupported claims. An engineer could build or review the system from this reading without clarification. |
| 9 | Every system-defining element and nearly every supporting element is recovered correctly. At most one small secondary detail is softened or omitted; the architecture and operational story are fully actionable. |
| 8 | The complete system shape and all critical paths are recovered. One meaningful supporting relationship, constraint, or failure detail is partial, but no core behavior is misleading. |
| 7 | The components, ownership boundaries, and primary end-to-end flow are clear and correct. Most secondary paths survive, while some failure, recovery, or operational semantics remain ambiguous. |
| 6 | The system's purpose and major components are recoverable, but at least one system-defining relationship or path requires inference. The board supports a design conversation, not an implementation plan. |
| 5 | The domain and main happy path are recognizable, but component responsibilities, direction, branching, or failure behavior are incomplete enough that engineers would reconstruct materially different designs. |
| 4 | Several correct components are visible, but the system reads as fragments rather than a dependable architecture. Core ownership or flow semantics are missing or contradictory. |
| 3 | Only the broad topic and a few isolated relationships survive. The reconstruction cannot explain how the system operates end to end. |
| 2 | The topic is guessable, but components and connections do not yield a coherent system model. |
| 1 | The board does not communicate a recoverable software system or process. |

## Caps & overrides

- A contradiction about a system-defining flow, ownership boundary, or failure
  outcome caps SF at **5**.
- If the main end-to-end flow cannot be reconstructed, SF is capped at **4**.
- Do not penalize an implementation detail that the brief never states. Unsupported
  specificity belongs in the ungrounded-claims list; ordinary abstraction does not.

## Output contract

**Blind reconstruction judge:**

- System purpose.
- Every readable component with its responsibility and the visible evidence.
- Every recoverable data, control, and failure flow with ordered steps and visible
  evidence.
- Every failure path with trigger, route, and outcome.
- Explicit constraints and operational boundaries.
- An exhaustive uncertainty list with the ambiguous visual evidence.

**Scorer:**

- One row for every atomized brief element: the brief evidence, importance
  (system-defining or supporting), whether it defines the main end-to-end flow,
  recovered/partial/missed/contradicted status, the reconstruction evidence that
  settles the call, and a short note.
- Every unsupported reconstruction claim with its reconstruction evidence and why the
  brief does not support it.
- The score and a concise overall fidelity summary naming the strongest transmitted
  behavior and the most consequential loss.

## Notes

- SF is deliberately blind on its first pass. Scenario names and brief vocabulary can
  turn reconstruction into confirmation and must not enter that completion.
- A polished but misleading board can score high on RD and low on SF. A plain board
  that transmits the full system can do the reverse.

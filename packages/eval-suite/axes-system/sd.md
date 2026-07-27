# SD — Scope Discipline (1–10)
- code: SD
- scorecard-order: 4
- scored: per follow-up edit, then averaged
- roles: single checker

*Did each requested system change land without collateral rework?*

## Judge inputs

Sees, per edit: the edit title and instruction, pre/post canvas JSON, the deterministic
pre/post object and connection diff, pre/post PNGs, the commit summary,
the shared judge rules, and this file.

Never sees: the original brief, fixture invariants or checklists, reference boards,
transcripts, other edits' instructions, or other axes' output.

## Method

1. Split the edit instruction into atomic requested changes. Derive scope only from
   those changes; do not invent protected regions, fixture invariants, or implied
   redesign goals.
2. Inspect the pre/post JSON, deterministic diff, and PNGs. Classify every changed,
   added, or removed object and connection as:
   - **requested** — directly named or plainly required by the instruction;
   - **necessary accommodation** — the smallest surrounding change needed to make the
     request legible or structurally possible;
   - **collateral rework** — unrelated movement, resizing, restyling, relabeling,
     rerouting, re-parenting, addition, or deletion.
3. Judge every atomic requested change as satisfied, partial, or missed. A requested
   system behavior is not satisfied merely because a label mentions it; the post-edit
   board must communicate the requested structure or flow.
4. Assess collateral impact as minor, major, or destructive:
   - **minor** — local polish or small geometry churn that leaves the prior system
     reading intact;
   - **major** — a region or path outside the request is materially redesigned,
     restyled, or made harder to understand;
   - **destructive** — prior content is removed, contradicted, or made unreadable.
5. Score the edit from the anchors below. The highest scores require both fulfillment
   and restraint. Average only scored edits; scenarios with no edits render `–`.

## Rubric

| score | anchor |
|---|---|
| 10 | Every requested system change is fully communicated, and every diff item is requested. The post-edit board is exactly the ask. |
| 9 | Every requested change is complete; the only additional changes are a few declared, clearly necessary accommodations. |
| 8 | The requested design change is complete and clear, with one minor collateral change that does not alter prior system meaning. |
| 7 | The request is complete, but several small out-of-scope changes or one undeclared accommodation create visible churn while preserving the prior architecture. |
| 6 | The main request lands, but a qualifier is partial or collateral rework noticeably weakens an unrelated region or path. |
| 5 | Only part of the requested system change lands, or one unrelated region is materially reworked. The result needs another edit before design review. |
| 4 | A major requested behavior is missed, or broad collateral redesign makes the prior and requested system meanings difficult to separate. |
| 3 | The edit changes the general area but not the requested system semantics, while also disturbing unrelated content. |
| 2 | A local ask triggers a whole-board redesign or widespread restyling, and the requested change is incomplete or ambiguous. |
| 1 | The edit destroys, contradicts, or makes unreadable previously communicated system content. |

## Caps & overrides

- Any **missed** atomic requested change caps SD at **5**.
- Any **major collateral rework** caps SD at **4**.
- Any **destructive collateral rework** sets SD to **1**.
- An honestly refused edit is excluded from SD because no scope change occurred; its
  outcome is handled by the other axes.
- Repositioning surrounding content is a necessary accommodation only when the
  requested addition or relationship cannot remain legible without it. General
  rebalancing is collateral rework unless the instruction asks for it.

## Output contract

Per edit:

- One row per atomic requested change with satisfied/partial/missed status and precise
  instruction, JSON, diff, or PNG evidence.
- An exhaustive row for every changed, added, or removed object and connection:
  object id, kind, requested/necessary-accommodation/collateral-rework classification,
  what changed, impact, whether the commit summary declared it, and precise evidence.
- Collateral-change count, a scope summary naming the largest in-scope and
  out-of-scope effects, and the per-edit score.

Then the arithmetic mean of scored edits. Render `–` and exclude SD from the scenario
mean when the configuration has no edits.

## Notes

- SD has no frozen invariants. Its scope contract is reconstructed from the edit
  instruction at grade time.

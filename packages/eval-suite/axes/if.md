# IF — Intent Fidelity (1–10)
- code: IF
- scorecard-order: 3
- scored: per scenario (running checklist: build items + each edit's appended items)
- roles: single checker

*Did every specced node, edge, label, style, color, section, and annotation land?*

## Judge inputs

Sees: the fixture's intent-fidelity checklist, the final canvas JSON
(`GET :4000/api/canvases/<id>`), the final PNG (for items JSON can't settle, e.g.
"label visually associated with its edge"), all commit summaries (for declared
substitutions), `axes/README.md`, this file.

Never sees: reference boards (fidelity is absolute, not comparative), other axes'
output.

## Method

Work the fixture's checklist mechanically, one verdict per item. Item classes:

- **node** — exists, label matches spec (verbatim or unambiguous equivalent),
  shape/kind and color-class as specced
- **edge** — exists between the right endpoints, right direction, label present and
  legible, style (solid/dashed) and color-class as specced
- **section** — exists, titled as specced, contains exactly its specced members
- **annotation** — margin sticky / note present with specced gist, placed where specced
- **negative** — nothing specced was silently dropped; no unrequested structural
  content was invented (extra decorative machinery like junction glyphs is noted here
  but its *ugliness* is SQ's business; its *unrequestedness* is IF's)

Score = pass fraction **P** mapped by the rubric, then apply caps.

## Rubric

| score | P |
|---|---|
| 10 | 1.00 |
| 9 | ≥ 0.97 |
| 8 | ≥ 0.93 |
| 7 | ≥ 0.88 |
| 6 | ≥ 0.80 |
| 5 | ≥ 0.70 |
| 4 | ≥ 0.55 |
| 3 | ≥ 0.40 |
| 2 | ≥ 0.25 |
| 1 | below |

## Caps & overrides

Applied after the mapping:

- Any specced **node or edge silently absent** (no mention in any commit summary) →
  cap **5**. This is the omission-means-deletion hazard class (old-system swimlane S6
  dropped four Frontend stages silently). Silence is the crime: an *honestly declared*
  substitution (v4's "heartbeat is a labeled badge because self-loop connectors are
  unsupported") does NOT trigger the cap — the item still fails, but caplessly.
- Any edge with **reversed direction** → cap **6** (also feeds IC corruption).
- Requested-and-confirmed content **destroyed** (present in an earlier accepted stage,
  gone at final) → cap **4**.

## Output contract

Per-item pass/fail list (every checklist id, with the JSON/PNG evidence for each fail),
P, caps applied (with the triggering item), the score.

## Notes

- The checklist may never demand anything the build/edit instructions didn't ask for —
  that's the fixture contract; if a checker finds an untraceable item, flag the fixture
  rather than scoring the item.
- An honest agent **refusal** of an edit fails that edit's items here (and earns PH
  credit for honesty); it is not additionally punished elsewhere.

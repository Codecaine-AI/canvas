# The Layout Language — v3 grammar

The language is a derived, disposable view of a canvas document. The fitter
writes it, the AI edits it, the solver expands it back into geometry. It is
optimized for **clarity over compression**: every value is labeled, every
reference is a declared number, and indentation is the only nesting syntax.

A program has three parts, in this order:

1. **The tree** — objects and how space is divided. Nested by indentation.
2. **Alignment facts** — `align` and `fan` lines at the left margin.
   Cross-branch spatial claims; they reference objects by number.
3. **Arrows** — the `arrows` block, always last. The connections that exist
   in the document.

Parts are separated by one blank line in canonical form. The parser ignores
blank lines everywhere; tabs are an error; indentation is exactly 2 spaces
per level.

## Reference numbers

Every object line (`item`, `section`) declares a positive integer, assigned
in declaration order starting at 1. All later references — `align`, `fan`,
`arrows` — use these numbers. The number **is** the object's identity;
`text=` is only its short display name. Several objects may share the same
text — references always go through numbers, so nothing is ambiguous.
Declaring the same number twice is an error. A reference may instead be a
JSON-quoted raw id (`"some-id"`) for objects that do not appear in the tree.
On parse, duplicate texts get unique internal engine ids; that
uniquification is an implementation detail that never appears in serialized
output (the fitter always emits unique names today).

## The tree

### `row` and `col` — weighted splits

    row 2|1
    col 1|1|1

Weights are `|`-separated numbers; the space divides proportionally along
the axis (`row` = left→right, `col` = top→bottom). Exactly one indented
child per weight, in order. A bare `row`/`col` with no weights has no
children.

### `section` — a real container object

    section 1 text=pipeline label="Pipeline"

Fields, in fixed order: number, `text=`, then optional `label=` (a JSON
string; the literal `label=undefined` preserves a document label that is
explicitly undefined — distinct from no `label=` at all). A section has
**exactly one** indented child. Sections are real document objects with
membership logic: everything inside becomes their children on the board.

### `item` — a real object

    item 2 text=ingest type=process size=M at=C

Fields, in fixed order:

| field   | required | values |
|---------|----------|--------|
| number  | yes      | positive integer, unique |
| `text=` | yes      | the object's name; duplicates legal; JSON-quoted when not `[A-Za-z0-9][A-Za-z0-9_.:-]*` |
| `type=` | yes      | any canvas shape type (`process`, `sticky`, `decision`, …) |
| `size=` | yes      | `S`, `M`, `L` (0.72× / 1× / 1.35× of the type's base size) |
| `at=`   | see below| compass: `N NE E SE S SW W NW C` |
| `hug=`  | optional | compass corner; only on direct children of a split |

`at=` is **required** on items inside a `group` or standing alone as a split
child or root (their position within their band matters). `at=` is
**forbidden** on items inside a `grid` (the lattice places them).

An `item` line directly under a split occupies one weight slot by itself.

### `group` — a loose cluster

    group
      item 3 text=note-a type=sticky size=S at=NW
      item 4 text=note-b type=sticky size=M at=SE

Wraps two or more items that share one slot without a stricter arrangement,
each placed by its `at=` compass. Also the spelling of an empty region
(`group` with no children). A single item never needs a wrapper.

### `grid` — a repeated-cell lattice

    grid 3x2 gap=32
      item 5 text=check-a type=sticky size=M
      item 6 text=check-b type=sticky size=M
      ...

Main value `RxC`, then `gap=` from the spacing ladder: `0`, `32`, `64`,
`96`. Children are item lines in row-major order; the count must fit the
lattice (more than `(R-1)×C`, at most `R×C`).

### `hug=` — pinned lanes

Any line that is a direct child of a split may end with `hug=<corner>`:
the child keeps its natural content size and pins to that corner of its
band instead of stretching to fill it. (This replaces the old `@corner`
suffix on weights.)

    row 1|4
      grid 4x1 gap=32 hug=NW
        ...

## Alignment facts

After the tree, at the left margin, in this order: all `align` lines, then
all `fan` lines.

### `align` — a shared centerline

    align y: 2 3 4

Main value is the axis (`y` = members share a horizontal centerline, `x` =
vertical), then `:` and two or more references. Members may live in
different branches of the tree — that is the point.

### `fan` — hub over children

    fan 4 dir=S: 5 6 7

Main value is the hub reference; `dir=` is `N`, `S`, `E`, or `W` (the side
of the hub the children sit on); after `:`, two or more child references.
The children land on one shared line, evenly spaced, and the hub centers
over their midpoint.

## Arrows

    arrows
      2 > 3
      3 > 4

The block header `arrows` at the left margin, then one indented line per
connection: `from > to`. Duplicates are allowed (the document may have
them) and order follows the document. An empty block is the bare `arrows`
header. The block is mandatory and always last.

## Canonical form

`serializeSketch` always emits: 2-space indentation; numbers in declaration
order from 1; every required field; `at=` per the rules above (including
`at=C` — never omitted); `label=` and `hug=` only when present; one blank
line before the alignment facts (when any exist) and one before `arrows`.
`parseSketch(serializeSketch(s))` is structurally identical to `s`, and
serializing again reproduces the exact same text. `align` names (`t1`,
`t2`, …) are internal, regenerated in order by the parser, and never
written.

## Example

    col 2|1
      section 1 text=pipeline label="Pipeline"
        row 1|1|1
          item 2 text=ingest type=process size=M at=C
          item 3 text=parse type=process size=M at=C
          item 4 text=score-gate type=decision size=L at=C
      grid 3x2 gap=32
        item 5 text=check-a type=sticky size=M
        item 6 text=check-b type=sticky size=M
        item 7 text=check-c type=sticky size=M
        item 8 text=check-d type=sticky size=M
        item 9 text=check-e type=sticky size=M
        item 10 text=check-f type=sticky size=M

    align y: 2 3 4
    fan 4 dir=S: 5 6 7

    arrows
      2 > 3
      3 > 4
      4 > 5
      4 > 6
      4 > 7

Read aloud: a two-thirds / one-third split; the pipeline section holds
three items in a row, the gate drawn large; beside it a 3×2 grid of check
stickies; the pipeline items share a horizontal centerline; the gate fans
south onto three of the checks; five arrows connect them.

## Deliberately deferred

- **Body text on items** — `text=` is the object's short name, not the real
  sticky body text, which is sentences long and would destroy line
  readability. Body text stays off the line until we design a preview form.
- Sparse programs (fitter omits obvious facts, solver defaults fill in) —
  the grammar is designed so this becomes an emission choice, not a
  rewrite.

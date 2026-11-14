import { describe, expect, test } from "bun:test";

import { box, wire } from "./fixtures/review/stubs.ts";
import { regressions, type Reading } from "./guard.ts";
import type { BoardObject } from "./review-inputs.ts";
import type { WireFact } from "./wires.ts";

const reading = (objects: BoardObject[], facts: WireFact[] = []): Reading => ({ board: { objects, connections: [] }, facts });
/** A wire of `length` px from a to b. */
const run = (length: number, id = "w", from = "a", to = "b") => wire(id, from, to, [[0, 0], [length, 0]]);
const found = (before: Reading, after: Reading) => regressions(before, after).map((fault) => [fault.kind, fault.key, fault.ids]);

describe("climb regression guard", () => {
  test("a wire the pass made 20% and 200 px longer is a route fault, with both lengths", () => {
    // Round 5 cycle 4, board 14: a revise pass took a wire from 973 to 1560 px, and no finding named it.
    expect(regressions(reading([], [run(973)]), reading([], [run(1560)]))).toEqual([{
      kind: "route", key: `["longer","w"]`, ids: ["w"],
      problem: "The last pass made wire w (a → b) longer: 973 → 1560 px, 60% more."
        + " A fix of one finding must not stretch another wire: find the route or the place that keeps this wire short too",
      marks: [{ path: [[0, 0], [1560, 0]] }],
    }]);
    const grown = (was: number, now: number) => found(reading([], [run(was)]), reading([], [run(now)])).length;
    // 20% and 200 px, both: 1000 → 1200 is the least. 15% of 2000 px and 150 px on 500 px are none.
    expect([grown(1000, 1200), grown(1000, 1199), grown(2000, 2300), grown(500, 650), grown(1560, 973)]).toEqual([1, 0, 0, 0, 0]);
  });

  test("a wire with a new end and a new wire are not longer, and a round names the 3 that grew most", () => {
    expect(found(reading([], [run(500)]), reading([], [run(1500, "w", "a", "c"), run(1500, "new")]))).toEqual([]);
    const ids = ["w1", "w2", "w3", "w4"];
    const after = reading([], ids.map((id, at) => run(1000 + 300 * (at + 1), id)));
    expect(found(reading([], ids.map((id) => run(1000, id))), after).map(([, , named]) => named)).toEqual([["w4"], ["w3"], ["w2"]]);
  });

  test("a note the pass left over 400 px from the section or node it names is a note fault", () => {
    // Round 5 cycle 4, board 14: a section move left the note of Daytona 1000 px from it.
    const daytona = (x: number) => box("daytona", "section", null, x, 0, 400, 300, { text: "Daytona sandboxes" });
    const note = (x: number, text = "**Daytona** · one sandbox a run") => box("note_day", "sticky", null, x, 320, 200, 100, { text });
    const before = reading([daytona(0), note(0)]);
    expect(regressions(before, reading([daytona(1200), note(0)]))).toEqual([{
      kind: "note", key: `["note","note_day"]`, ids: ["note_day", "daytona"],
      problem: "The last pass left note note_day 1000 px from section daytona, which it names: it was 20 px from it."
        + " A note over 400 px from what it names reads as a note on something else",
      marks: [{ box: { x: 0, y: 320, width: 200, height: 100 } }, { box: { x: 1200, y: 0, width: 400, height: 300 } }],
    }]);
    // 400 px is near. A note that moved with its section, and one that was far before the pass, are none.
    expect([found(before, reading([daytona(600), note(0)])), found(before, reading([daytona(1200), note(1200)])), found(reading([daytona(1200), note(0)]), reading([daytona(1300), note(0)]))]).toEqual([[], [], []]);
    // The note names a thing by its bold lead: no lead, or a lead that 2 things carry, names none.
    const plain = reading([daytona(0), note(0, "One sandbox a run in Daytona")]);
    expect(found(plain, reading([daytona(1200), note(0, "One sandbox a run in Daytona")]))).toEqual([]);
    const twin = box("daytona-api", "rectangle", null, 0, 500, 100, 100, { text: "Daytona API" });
    expect(found(reading([daytona(0), twin, note(0)]), reading([daytona(1200), twin, note(0)]))).toEqual([]);
    // A node by its id.
    const node = (y: number) => box("daytona", "rectangle", null, 0, y, 100, 100);
    expect(found(reading([node(0), note(0)]), reading([node(1000), note(0)]))).toEqual([["note", `["note","note_day"]`, ["note_day", "daytona"]]]);
  });
});

import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ShapeSearchPopover } from "../ShapeSearchPopover";

afterEach(() => {
  cleanup();
});

describe("ShapeSearchPopover search filtering", () => {
  // P4 catalog unification: search matches the def-declared keywords too.
  // "chevron" appears in no label but is an arrow-shape def keyword, so it
  // hits both arrow direction variants; "subroutine" is a keyword of the
  // predefined-process def only.
  it.each([
    ["chevron", ["Left arrow", "Right arrow"]],
    ["subroutine", ["Predefined process"]],
  ])("filters entries as the user types, case-insensitively (labels + def keywords): %p", (query, expected) => {
    const { container } = render(<ShapeSearchPopover />);
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: query } });
    const labels = [...container.querySelectorAll("[data-shape-entry]")].map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels).toEqual(expected);
  });

  it("shows a no-results message when nothing matches", () => {
    const { container, getByText } = render(<ShapeSearchPopover />);
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "zzz-nonexistent" } });
    expect(getByText("No shapes found")).toBeTruthy();
  });
});

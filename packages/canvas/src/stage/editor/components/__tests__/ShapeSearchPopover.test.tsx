import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ShapeSearchPopover } from "../ShapeSearchPopover";

afterEach(() => {
  cleanup();
});

describe("ShapeSearchPopover search filtering", () => {
  it("filters entries as the user types, case-insensitively (labels + def keywords)", () => {
    const { container } = render(<ShapeSearchPopover />);
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "chevron" } });
    // P4 catalog unification: search matches the def-declared keywords too —
    // "chevron" appears in no label but is an arrow-shape def keyword, so it
    // hits both arrow direction variants.
    const labels = [...container.querySelectorAll("[data-shape-entry]")].map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["Left arrow", "Right arrow"]);
  });

  it("shows a no-results message when nothing matches", () => {
    const { container, getByText } = render(<ShapeSearchPopover />);
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "zzz-nonexistent" } });
    expect(getByText("No shapes found")).toBeTruthy();
  });
});

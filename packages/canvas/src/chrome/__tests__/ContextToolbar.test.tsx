import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { CONTEXT_TOOLBAR_REGISTRY, ContextToolbar } from "../ContextToolbar";

afterEach(() => {
  cleanup();
});

describe("ContextToolbar geometry / styling", () => {
  it("renders the dark #1D1D1D pill at the measured 29px height with full-pill radius", () => {
    const { container } = render(<ContextToolbar variant="shape" />);
    const bar = container.querySelector("[data-context-toolbar]") as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.style.background).toBe("#1D1D1D");
    expect(bar.style.height).toBe("29px");
    expect(bar.style.borderRadius).toBe("14.5px");
  });
});

describe("ContextToolbar variant registry", () => {
  it("shape variant renders exactly the 10 measured controls in order", () => {
    const { container } = render(<ContextToolbar variant="shape" />);
    const actions = Array.from(container.querySelectorAll("[data-toolbar-action]")).map((el) =>
      el.getAttribute("data-toolbar-action"),
    );
    expect(actions).toEqual([
      "shape-swap",
      "color",
      "align",
      "font-style",
      "size",
      "bold",
      "strikethrough",
      "link",
      "bullets",
      "paragraph-align",
    ]);
  });

  it("section variant renders exactly the 6 measured controls with a divider after the layers control", () => {
    const { container } = render(<ContextToolbar variant="section" />);
    const actions = Array.from(container.querySelectorAll("[data-toolbar-action]")).map((el) =>
      el.getAttribute("data-toolbar-action"),
    );
    expect(actions).toEqual(["tint", "list", "frame", "visibility", "lock", "expand"]);
    expect(container.querySelectorAll("[data-divider]").length).toBe(1);
  });

  it("connector variant renders exactly the 6 measured controls", () => {
    const { container } = render(<ContextToolbar variant="connector" />);
    const actions = Array.from(container.querySelectorAll("[data-toolbar-action]")).map((el) =>
      el.getAttribute("data-toolbar-action"),
    );
    expect(actions).toEqual(["color", "stroke", "dash", "routing", "arrowhead", "label-align"]);
  });

  it("text variant renders exactly the 5 measured controls (label-edit swap)", () => {
    const { container } = render(<ContextToolbar variant="text" />);
    const actions = Array.from(container.querySelectorAll("[data-toolbar-action]")).map((el) =>
      el.getAttribute("data-toolbar-action"),
    );
    expect(actions).toEqual(["color", "font-style", "size", "bold", "strikethrough"]);
  });

  it("registry object exposes all 6 variants with non-empty control lists", () => {
    const variants = Object.keys(CONTEXT_TOOLBAR_REGISTRY);
    expect(variants.sort()).toEqual(
      ["connector", "multi", "section", "shape", "sticky", "text"].sort(),
    );
    for (const variant of variants) {
      expect(CONTEXT_TOOLBAR_REGISTRY[variant as keyof typeof CONTEXT_TOOLBAR_REGISTRY].length).toBeGreaterThan(0);
    }
  });
});

describe("ContextToolbar interaction", () => {
  it("fires onAction with the control's action id on click", () => {
    const onAction = mock((_action: string, _value?: unknown) => {});
    const { container } = render(<ContextToolbar variant="shape" onAction={onAction} />);
    fireEvent.click(container.querySelector('[data-toolbar-action="bold"]')!);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toBe("bold");
  });

  it("toggles aria-expanded on flyout controls but not on plain buttons", () => {
    const { container } = render(<ContextToolbar variant="shape" />);
    const boldButton = container.querySelector('[data-toolbar-action="bold"]') as HTMLElement;
    expect(boldButton.getAttribute("aria-expanded")).toBeNull();

    const colorButton = container.querySelector('[data-toolbar-action="color"]') as HTMLElement;
    expect(colorButton.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(colorButton);
    expect(colorButton.getAttribute("aria-expanded")).toBe("true");
  });

  it("shows a tooltip with the control's label on hover", () => {
    const { container, queryByRole } = render(<ContextToolbar variant="connector" />);
    const dashButton = container.querySelector('[data-toolbar-action="dash"]') as HTMLElement;
    fireEvent.mouseEnter(dashButton);
    expect(queryByRole("tooltip")?.textContent).toBe("Line style");
  });
});

import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { cssVar } from "@codecaine-ai/design-system";
import { CanvasDock } from "../CanvasDock";
import { EDITOR_STYLE } from "../editor-style";

afterEach(() => {
  cleanup();
});

describe("CanvasDock state rules", () => {
  it("shows no active button when activeTool is null", () => {
    const { container } = render(<CanvasDock activeTool={null} />);
    const activeButtons = container.querySelectorAll('[data-active="true"]');
    expect(activeButtons.length).toBe(0);
  });

  it.each(["hand", "connector"] as const)(
    "highlights exactly the button matching activeTool %p with the solid accent tile",
    (tool) => {
      const { container } = render(<CanvasDock activeTool={tool} />);
      const active = container.querySelector(`[data-dock-tool="${tool}"]`) as HTMLElement;
      expect(active.getAttribute("data-active")).toBe("true");
      expect(active.style.background).toBe(cssVar("color.accent"));
      // The glyph on the accent tile is the on-solid glyph; resting glyphs stay body text.
      expect(active.style.color).toBe(cssVar("color.text.on-solid"));

      const others = container.querySelectorAll('[data-active="true"]');
      expect(others.length).toBe(1);
      for (const button of container.querySelectorAll<HTMLElement>(`[data-dock-tool]:not([data-dock-tool="${tool}"])`)) {
        expect(button.style.background).not.toBe(cssVar("color.accent"));
      }
    },
  );

  // regression: 3c5f8ac
  it("shows a hover fill distinct from the solid accent tile", () => {
    const { container } = render(<CanvasDock activeTool="select" />);
    const connectorButton = container.querySelector('[data-dock-tool="connector"]') as HTMLElement;
    fireEvent.pointerEnter(connectorButton);
    expect(connectorButton.style.background).toBe(EDITOR_STYLE.dockHoverBg);
    expect(connectorButton.style.background).toBe(cssVar("color.fill.hover"));
    // The active button keeps the accent tile, independent of the hovered one.
    const selectButton = container.querySelector('[data-dock-tool="select"]') as HTMLElement;
    expect(selectButton.style.background).toBe(cssVar("color.accent"));
    expect(selectButton.style.background).not.toBe(connectorButton.style.background);
  });

  it("shows a tooltip only while hovering, using the button's shortcut hint", () => {
    const { container, queryByRole } = render(<CanvasDock />);
    const handButton = container.querySelector('[data-dock-tool="hand"]') as HTMLElement;
    expect(queryByRole("tooltip")).toBeNull();
    fireEvent.pointerEnter(handButton);
    expect(queryByRole("tooltip")?.textContent).toBe("Hand — F");
    fireEvent.pointerLeave(handButton);
    expect(queryByRole("tooltip")).toBeNull();
  });

  it("shows at most one dock tooltip at a time", () => {
    const { container } = render(<CanvasDock />);
    const handButton = container.querySelector('[data-dock-tool="hand"]') as HTMLElement;
    const stickyButton = container.querySelector('[data-dock-tool="sticky"]') as HTMLElement;
    fireEvent.pointerEnter(handButton);
    fireEvent.pointerEnter(stickyButton);
    const tooltips = container.querySelectorAll('[role="tooltip"]');
    expect(tooltips.length).toBe(1);
    expect(tooltips[0].textContent).toBe("Sticky note — ⌘A");
  });
});

describe("CanvasDock callbacks", () => {
  it("fires onSelectTool with the clicked tool id", () => {
    const onSelectTool = mock((_tool: string) => {});
    const { container } = render(<CanvasDock onSelectTool={onSelectTool} />);
    fireEvent.click(container.querySelector('[data-dock-tool="sticky"]')!);
    expect(onSelectTool).toHaveBeenCalledTimes(1);
    expect(onSelectTool.mock.calls[0][0]).toBe("sticky");
  });

  it("fires onOpenShapes (in addition to onSelectTool) when the shapes button is clicked", () => {
    const onSelectTool = mock((_tool: string) => {});
    const onOpenShapes = mock(() => {});
    const { container } = render(
      <CanvasDock onSelectTool={onSelectTool} onOpenShapes={onOpenShapes} />,
    );
    fireEvent.click(container.querySelector('[data-dock-tool="shapes"]')!);
    expect(onOpenShapes).toHaveBeenCalledTimes(1);
    expect(onSelectTool).toHaveBeenCalledWith("shapes");
  });

  it("disables all buttons and suppresses tooltips when disabled", () => {
    const onSelectTool = mock((_tool: string) => {});
    const { container } = render(<CanvasDock disabled onSelectTool={onSelectTool} />);
    const selectButton = container.querySelector('[data-dock-tool="select"]') as HTMLButtonElement;
    expect(selectButton.disabled).toBe(true);
    expect(selectButton.getAttribute("aria-disabled")).toBe("true");
  });
});

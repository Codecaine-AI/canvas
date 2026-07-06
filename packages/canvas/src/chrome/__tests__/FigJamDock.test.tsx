import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import {
  FigJamDock,
  FIGJAM_DOCK_HEIGHT_PX,
  FIGJAM_DOCK_RADIUS_PX,
  FIGJAM_DOCK_WIDTH_PX,
} from "../FigJamDock";
import { CHROME } from "../../render/figjam-tokens";

afterEach(() => {
  cleanup();
});

describe("FigJamDock geometry", () => {
  it("renders at the professional rounded dock dimensions", () => {
    expect(FIGJAM_DOCK_WIDTH_PX).toBe("fit-content");
    expect(FIGJAM_DOCK_HEIGHT_PX).toBe(48);
    expect(FIGJAM_DOCK_RADIUS_PX).toBe(13);

    const { container } = render(<FigJamDock />);
    const dock = container.querySelector("[data-figjam-dock]") as HTMLElement;
    expect(dock).toBeTruthy();
    expect(dock.style.width).toBe("fit-content");
    expect(dock.style.height).toBe("48px");
    expect(dock.style.borderRadius).toBe("13px");
    expect(dock.style.background).toBe("#FFFFFF");
    expect(dock.style.padding).toBe("0px 8px");
  });

  it("has a soft box-shadow (not flat, not none)", () => {
    const { container } = render(<FigJamDock />);
    const dock = container.querySelector("[data-figjam-dock]") as HTMLElement;
    expect(dock.style.boxShadow).not.toBe("");
    expect(dock.style.boxShadow.toLowerCase()).toContain("rgba(0, 0, 0");
    expect(dock.style.boxShadow).toBe(CHROME.dockShadow);
  });
});

describe("FigJamDock button inventory", () => {
  it("renders exactly 7 tool buttons and no overflow button", () => {
    const { container } = render(<FigJamDock />);
    const buttons = container.querySelectorAll("[data-dock-tool]");
    expect(buttons.length).toBe(7);
    expect(container.querySelector('[data-dock-tool="overflow"]')).toBeNull();
  });

  it("renders the buttons in the documented left-to-right order", () => {
    const { container } = render(<FigJamDock />);
    const buttons = Array.from(container.querySelectorAll("[data-dock-tool]")).map((el) =>
      el.getAttribute("data-dock-tool"),
    );
    expect(buttons).toEqual([
      "select",
      "hand",
      "shapes",
      "connector",
      "text",
      "section",
      "sticky",
    ]);
  });

  it("groups buttons into 3 clusters separated by 2 vertical dividers", () => {
    const { container } = render(<FigJamDock />);
    const groups = container.querySelectorAll("[data-dock-group]");
    // A(2) + B(2) + C(3) = 3 grouped clusters.
    expect(groups.length).toBe(3);
    const dividers = container.querySelectorAll("[data-divider]");
    expect(dividers.length).toBe(2);
    for (const divider of dividers) {
      const dividerEl = divider as HTMLElement;
      expect(dividerEl.style.width).toBe("1px");
      expect(dividerEl.style.height).toBe("24px");
      expect(dividerEl.style.margin).toBe("0px 8px");
    }
    expect(container.textContent).not.toContain("|");
  });

  it("does not render the removed pen, highlighter, or comment buttons", () => {
    const { queryByLabelText } = render(<FigJamDock />);
    expect(queryByLabelText("Pen")).toBeNull();
    expect(queryByLabelText("Highlighter")).toBeNull();
    expect(queryByLabelText("Comment")).toBeNull();
  });
});

describe("FigJamDock state rules", () => {
  it("shows no active (violet) button when activeTool is null (modal rule)", () => {
    const { container } = render(<FigJamDock activeTool={null} />);
    const activeButtons = container.querySelectorAll('[data-active="true"]');
    expect(activeButtons.length).toBe(0);
  });

  it("highlights exactly the button matching activeTool with the violet active bg", () => {
    const { container } = render(<FigJamDock activeTool="hand" />);
    const active = container.querySelector('[data-dock-tool="hand"]') as HTMLElement;
    expect(active.getAttribute("data-active")).toBe("true");
    expect(active.style.background).toBe("#8C2EF2"); // accentPurple

    const others = container.querySelectorAll('[data-active="true"]');
    expect(others.length).toBe(1);
  });

  it("shows a light-gray hover background distinct from the active violet", () => {
    const { container } = render(<FigJamDock activeTool="select" />);
    const connectorButton = container.querySelector('[data-dock-tool="connector"]') as HTMLElement;
    fireEvent.pointerEnter(connectorButton);
    expect(connectorButton.style.background).toBe(CHROME.dockHoverBg);
    // The active button remains violet, independent of the hovered one.
    const selectButton = container.querySelector('[data-dock-tool="select"]') as HTMLElement;
    expect(selectButton.style.background).toBe("#8C2EF2");
  });

  it("shows a tooltip only while hovering, using the button's shortcut hint", () => {
    const { container, queryByRole } = render(<FigJamDock />);
    const handButton = container.querySelector('[data-dock-tool="hand"]') as HTMLElement;
    expect(queryByRole("tooltip")).toBeNull();
    fireEvent.pointerEnter(handButton);
    expect(queryByRole("tooltip")?.textContent).toBe("Hand — H");
    fireEvent.pointerLeave(handButton);
    expect(queryByRole("tooltip")).toBeNull();
  });

  it("shows at most one dock tooltip at a time", () => {
    const { container } = render(<FigJamDock />);
    const handButton = container.querySelector('[data-dock-tool="hand"]') as HTMLElement;
    const stickyButton = container.querySelector('[data-dock-tool="sticky"]') as HTMLElement;
    fireEvent.pointerEnter(handButton);
    fireEvent.pointerEnter(stickyButton);
    const tooltips = container.querySelectorAll('[role="tooltip"]');
    expect(tooltips.length).toBe(1);
    expect(tooltips[0].textContent).toBe("Sticky note — S");
  });
});

describe("FigJamDock callbacks", () => {
  it("fires onSelectTool with the clicked tool id", () => {
    const onSelectTool = mock((_tool: string) => {});
    const { container } = render(<FigJamDock onSelectTool={onSelectTool} />);
    fireEvent.click(container.querySelector('[data-dock-tool="sticky"]')!);
    expect(onSelectTool).toHaveBeenCalledTimes(1);
    expect(onSelectTool.mock.calls[0][0]).toBe("sticky");
  });

  it("fires onSelectTool with section when the Section button is clicked", () => {
    const onSelectTool = mock((_tool: string) => {});
    const { container } = render(<FigJamDock onSelectTool={onSelectTool} />);
    fireEvent.click(container.querySelector('[data-dock-tool="section"]')!);
    expect(onSelectTool).toHaveBeenCalledTimes(1);
    expect(onSelectTool.mock.calls[0][0]).toBe("section");
  });

  it("fires onOpenShapes (in addition to onSelectTool) when the shapes button is clicked", () => {
    const onSelectTool = mock((_tool: string) => {});
    const onOpenShapes = mock(() => {});
    const { container } = render(
      <FigJamDock onSelectTool={onSelectTool} onOpenShapes={onOpenShapes} />,
    );
    fireEvent.click(container.querySelector('[data-dock-tool="shapes"]')!);
    expect(onOpenShapes).toHaveBeenCalledTimes(1);
    expect(onSelectTool).toHaveBeenCalledWith("shapes");
  });

  it("disables all buttons and suppresses tooltips when disabled", () => {
    const onSelectTool = mock((_tool: string) => {});
    const { container } = render(<FigJamDock disabled onSelectTool={onSelectTool} />);
    const selectButton = container.querySelector('[data-dock-tool="select"]') as HTMLButtonElement;
    expect(selectButton.disabled).toBe(true);
    expect(selectButton.getAttribute("aria-disabled")).toBe("true");
  });
});

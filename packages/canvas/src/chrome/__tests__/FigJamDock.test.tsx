import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import {
  FigJamDock,
  FIGJAM_DOCK_HEIGHT_PX,
  FIGJAM_DOCK_RADIUS_PX,
  FIGJAM_DOCK_WIDTH_PX,
} from "../FigJamDock";

afterEach(() => {
  cleanup();
});

describe("FigJamDock geometry", () => {
  it("renders at the spec'd 462x37 stadium dimensions with radius = height/2", () => {
    expect(FIGJAM_DOCK_WIDTH_PX).toBe(462);
    expect(FIGJAM_DOCK_HEIGHT_PX).toBe(37);
    expect(FIGJAM_DOCK_RADIUS_PX).toBe(18.5);

    const { container } = render(<FigJamDock />);
    const dock = container.querySelector("[data-figjam-dock]") as HTMLElement;
    expect(dock).toBeTruthy();
    expect(dock.style.width).toBe("462px");
    expect(dock.style.height).toBe("37px");
    expect(dock.style.borderRadius).toBe("18.5px");
    expect(dock.style.background).toBe("#FDFDFD");
  });

  it("has a soft box-shadow (not flat, not none)", () => {
    const { container } = render(<FigJamDock />);
    const dock = container.querySelector("[data-figjam-dock]") as HTMLElement;
    expect(dock.style.boxShadow).not.toBe("");
    expect(dock.style.boxShadow.toLowerCase()).toContain("rgba(0, 0, 0");
  });
});

describe("FigJamDock button inventory", () => {
  it("renders exactly 13 buttons (12 tools + overflow)", () => {
    const { container } = render(<FigJamDock />);
    const buttons = container.querySelectorAll("[data-dock-tool]");
    expect(buttons.length).toBe(13);
  });

  it("renders the buttons in the documented left-to-right order", () => {
    const { container } = render(<FigJamDock />);
    const buttons = Array.from(container.querySelectorAll("[data-dock-tool]")).map((el) =>
      el.getAttribute("data-dock-tool"),
    );
    expect(buttons).toEqual([
      "select",
      "hand",
      "pen",
      "highlighter",
      "shapes",
      "connector",
      "text",
      "sticky",
      "table",
      "stamp",
      "comment",
      "widgets",
      "overflow",
    ]);
  });

  it("groups buttons into 5 whitespace clusters with no divider elements", () => {
    const { container } = render(<FigJamDock />);
    const groups = container.querySelectorAll("[data-dock-group]");
    // A(2) + B(2) + C(2) + D(6) = 4 grouped clusters; overflow (13th) sits outside any group.
    expect(groups.length).toBe(4);
    expect(container.querySelectorAll("[data-divider]").length).toBe(0);
    expect(container.textContent).not.toContain("|");
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
    const penButton = container.querySelector('[data-dock-tool="pen"]') as HTMLElement;
    fireEvent.mouseEnter(penButton);
    expect(penButton.style.background).toBe("rgb(235, 235, 235)");
    // The active button remains violet, independent of the hovered one.
    const selectButton = container.querySelector('[data-dock-tool="select"]') as HTMLElement;
    expect(selectButton.style.background).toBe("#8C2EF2");
  });

  it("shows a tooltip only while hovering, using the button's label", () => {
    const { container, queryByRole } = render(<FigJamDock />);
    const handButton = container.querySelector('[data-dock-tool="hand"]') as HTMLElement;
    expect(queryByRole("tooltip")).toBeNull();
    fireEvent.mouseEnter(handButton);
    expect(queryByRole("tooltip")?.textContent).toBe("Hand tool");
    fireEvent.mouseLeave(handButton);
    expect(queryByRole("tooltip")).toBeNull();
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

  it("fires onOpenOverflow when the + button is clicked", () => {
    const onOpenOverflow = mock(() => {});
    const { container } = render(<FigJamDock onOpenOverflow={onOpenOverflow} />);
    fireEvent.click(container.querySelector('[data-dock-tool="overflow"]')!);
    expect(onOpenOverflow).toHaveBeenCalledTimes(1);
  });

  it("disables all buttons and suppresses tooltips when disabled", () => {
    const onSelectTool = mock((_tool: string) => {});
    const { container } = render(<FigJamDock disabled onSelectTool={onSelectTool} />);
    const penButton = container.querySelector('[data-dock-tool="pen"]') as HTMLButtonElement;
    expect(penButton.disabled).toBe(true);
    fireEvent.mouseEnter(penButton);
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
  });
});

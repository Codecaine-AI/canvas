import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CONNECTOR_FLYOUTS } from "../connector-flyouts";
import type { ToolbarFlyoutProps } from "../types";
import type { InteractiveCanvasConnection } from "../../../../../../state/schema";

afterEach(() => {
  cleanup();
});

function connection(
  overrides: Partial<InteractiveCanvasConnection> = {},
): InteractiveCanvasConnection {
  return {
    id: "connection-a",
    from: { objectId: "a", anchor: "right" },
    to: { objectId: "b", anchor: "left" },
    style: "solid",
    arrow: "forward",
    ...overrides,
  };
}

function flyoutProps(
  selectedConnection: InteractiveCanvasConnection,
  dispatch: ToolbarFlyoutProps["dispatch"],
  close: ToolbarFlyoutProps["close"] = () => undefined,
): ToolbarFlyoutProps {
  return {
    selectedConnection,
    dispatch,
    close,
    applyColorToSelection: () => undefined,
    applySectionBorderStyleToSelection: () => undefined,
    setLockForSelection: () => undefined,
    swapSelectedShape: () => undefined,
  };
}

describe("connector selection-toolbar flyouts", () => {
  it("renders icon-only solid and dashed line-style options", () => {
    const DashFlyout = CONNECTOR_FLYOUTS.dash;
    const dispatch = mock((_action: Parameters<ToolbarFlyoutProps["dispatch"]>[0]) => undefined);

    render(<DashFlyout {...flyoutProps(connection({ style: "dashed" }), dispatch)} />);

    const solid = screen.getByRole("menuitem", { name: "Solid" });
    const dashed = screen.getByRole("menuitem", { name: "Dashed" });
    expect(solid.textContent).toBe("");
    expect(dashed.textContent).toBe("");
    expect(solid.getAttribute("data-connector-line-style")).toBe("solid");
    expect(dashed.getAttribute("data-connector-line-style")).toBe("dashed");
    expect(solid.getAttribute("aria-pressed")).toBe("false");
    expect(dashed.getAttribute("aria-pressed")).toBe("true");
  });

  it("dispatches a dashed line-style patch from the dash flyout", () => {
    const DashFlyout = CONNECTOR_FLYOUTS.dash;
    const dispatch = mock((_action: Parameters<ToolbarFlyoutProps["dispatch"]>[0]) => undefined);
    const close = mock(() => undefined);

    render(<DashFlyout {...flyoutProps(connection({ style: "solid" }), dispatch, close)} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Dashed" }));

    expect(dispatch).toHaveBeenCalledWith({
      type: "canvas.updateConnection",
      connectionId: "connection-a",
      patch: { style: "dashed" },
    });
    expect(close).toHaveBeenCalled();
  });

  it("renders exactly the four icon-only arrowhead options", () => {
    const ArrowheadFlyout = CONNECTOR_FLYOUTS.arrowhead;
    const dispatch = mock((_action: Parameters<ToolbarFlyoutProps["dispatch"]>[0]) => undefined);

    render(<ArrowheadFlyout {...flyoutProps(connection({ arrow: "both" }), dispatch)} />);

    const labels = ["No arrowheads", "Arrow right", "Arrow left", "Arrows both ends"];
    const buttons = labels.map((label) => screen.getByRole("menuitem", { name: label }));
    expect(buttons.map((button) => button.textContent)).toEqual(["", "", "", ""]);
    expect(buttons.map((button) => button.getAttribute("data-connector-arrowhead"))).toEqual([
      "none",
      "forward",
      "back",
      "both",
    ]);
    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual([
      "false",
      "false",
      "false",
      "true",
    ]);
  });

  it("dispatches an arrowhead patch from the arrowhead flyout", () => {
    const ArrowheadFlyout = CONNECTOR_FLYOUTS.arrowhead;
    const dispatch = mock((_action: Parameters<ToolbarFlyoutProps["dispatch"]>[0]) => undefined);
    const close = mock(() => undefined);

    render(<ArrowheadFlyout {...flyoutProps(connection({ arrow: "forward" }), dispatch, close)} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Arrow left" }));

    expect(dispatch).toHaveBeenCalledWith({
      type: "canvas.updateConnection",
      connectionId: "connection-a",
      patch: { arrow: "back" },
    });
    expect(close).toHaveBeenCalled();
  });
});

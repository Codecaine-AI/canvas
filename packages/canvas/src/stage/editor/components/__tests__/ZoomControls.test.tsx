import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ZoomControls } from "../ZoomControls";

afterEach(() => {
  cleanup();
});

describe("ZoomControls geometry", () => {
  it("renders only - and + when zoomPercent is omitted (matches the observed frames with no % readout)", () => {
    const { container, queryByLabelText } = render(<ZoomControls />);
    expect(queryByLabelText("Zoom out")).toBeTruthy();
    expect(queryByLabelText("Zoom in")).toBeTruthy();
    expect(container.querySelector("[data-zoom-percent]")).toBeNull();
  });

  it("renders the rounded percentage when zoomPercent is supplied", () => {
    const { getByText } = render(<ZoomControls zoomPercent={0.753} />);
    expect(getByText("75%")).toBeTruthy();
  });
});

describe("ZoomControls interaction", () => {
  it("fires onZoomIn / onZoomOut on click", () => {
    const onZoomIn = mock(() => {});
    const onZoomOut = mock(() => {});
    const { getByLabelText } = render(<ZoomControls onZoomIn={onZoomIn} onZoomOut={onZoomOut} />);
    fireEvent.click(getByLabelText("Zoom in"));
    fireEvent.click(getByLabelText("Zoom out"));
    expect(onZoomIn).toHaveBeenCalledTimes(1);
    expect(onZoomOut).toHaveBeenCalledTimes(1);
  });

  it("fires onZoomPercentClick when the percentage label is clicked", () => {
    const onZoomPercentClick = mock(() => {});
    const { getByText } = render(<ZoomControls zoomPercent={1} onZoomPercentClick={onZoomPercentClick} />);
    fireEvent.click(getByText("100%"));
    expect(onZoomPercentClick).toHaveBeenCalledTimes(1);
  });

  it("disables all controls when disabled", () => {
    const { getByLabelText } = render(<ZoomControls disabled zoomPercent={1} />);
    expect((getByLabelText("Zoom in") as HTMLButtonElement).disabled).toBe(true);
    expect((getByLabelText("Zoom out") as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a tooltip on hover for zoom in/out", () => {
    const { getByLabelText, queryByRole } = render(<ZoomControls />);
    fireEvent.mouseEnter(getByLabelText("Zoom out"));
    expect(queryByRole("tooltip")?.textContent).toBe("Zoom out");
  });
});

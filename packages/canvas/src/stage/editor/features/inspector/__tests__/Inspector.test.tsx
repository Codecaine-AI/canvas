import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { buildSelectionContext, type CanvasAction } from "../../../../../state/actions";
import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../../../../state/schema";
import { ICON_GLYPHS, ICON_GLYPH_IDS } from "../../../../../objects/shapes/icon/icon-glyphs";
import { InteractiveCanvasEditor } from "../../../InteractiveCanvasEditor";
import { Inspector } from "../Inspector";

afterEach(() => cleanup());

const geometry = { x: 40, y: 40, width: 160, height: 80 };

const OBJECTS = {
  shape: { id: "api", type: "process", text: "API", detail: "port 8080", geometry },
  icon: { id: "db", type: "icon", icon: "database", text: "Database", geometry },
  section: { id: "backend", type: "section", text: "Backend", geometry },
  sticky: { id: "note", type: "sticky", text: "Remember the cache", geometry },
} satisfies Record<string, InteractiveCanvasObject>;

function documentWith(object: InteractiveCanvasObject): InteractiveCanvasDocument {
  return { schemaVersion: 1, id: "inspector-test", mode: "diagram", objects: [object], connections: [] };
}

function inspectorFor(object: InteractiveCanvasObject, dispatch: (action: CanvasAction) => void) {
  const document = documentWith(object);
  return (
    <Inspector
      document={document}
      lastChange={undefined}
      selectedObject={object}
      selectedConnection={undefined}
      selectionContext={buildSelectionContext(document, { kind: "objects", objectIds: [object.id] })}
      dispatch={dispatch}
      applyColorToSelection={() => {}}
    />
  );
}

function renderInspector(object: InteractiveCanvasObject) {
  const dispatch = mock((_action: CanvasAction) => {});
  const view = render(inspectorFor(object, dispatch));
  return {
    ...view,
    dispatch,
    rerenderWith: (next: InteractiveCanvasObject) => view.rerender(inspectorFor(next, dispatch)),
  };
}

function updateObject(objectId: string, patch: Partial<InteractiveCanvasObject>): CanvasAction {
  return { type: "canvas.updateObject", objectId, patch };
}

/** The rendered picker groups, in DOM order: category id + glyph ids. */
function pickerGroups(container: HTMLElement) {
  return Array.from(container.querySelectorAll("[data-icon-category]")).map((group) => ({
    category: group.getAttribute("data-icon-category"),
    glyphs: Array.from(group.querySelectorAll("[data-icon-glyph]")).map((cell) =>
      cell.getAttribute("data-icon-glyph"),
    ),
  }));
}

describe("Inspector detail field", () => {
  it("renders for shapes, icons, and sections, never for stickies", () => {
    for (const [kind, object] of Object.entries(OBJECTS)) {
      const { queryByLabelText, unmount } = renderInspector(object);
      const detail = queryByLabelText("Detail");
      if (kind === "sticky") expect(detail).toBeNull();
      else expect(detail).toBeTruthy();
      unmount();
    }
  });

  it("writes every edit, including clearing, as an updateObject detail patch", () => {
    const { getByLabelText, dispatch } = renderInspector(OBJECTS.shape);
    const detail = getByLabelText("Detail") as HTMLInputElement;
    expect(detail.value).toBe("port 8080");

    fireEvent.change(detail, { target: { value: "port 5432" } });
    expect(dispatch).toHaveBeenLastCalledWith(updateObject("api", { detail: "port 5432" }));

    fireEvent.change(detail, { target: { value: "" } });
    expect(dispatch).toHaveBeenLastCalledWith(updateObject("api", { detail: "" }));
  });

  it("warns past 48 characters without blocking the edit", () => {
    const long = "gpt-4o via the regional proxy, cached for ten minutes";
    expect(long.length).toBeGreaterThan(48);
    const { getByLabelText, getByRole, queryByText, dispatch, rerenderWith } = renderInspector(
      OBJECTS.shape,
    );
    expect(queryByText(/keep it to one short fact/)).toBeNull();

    fireEvent.change(getByLabelText("Detail"), { target: { value: long } });
    expect(dispatch).toHaveBeenLastCalledWith(updateObject("api", { detail: long }));

    rerenderWith({ ...OBJECTS.shape, detail: long });
    expect(getByRole("status").textContent).toBe(`${long.length} / 48 — keep it to one short fact`);

    rerenderWith({ ...OBJECTS.shape, detail: "x".repeat(48) });
    expect(queryByText(/keep it to one short fact/)).toBeNull();
  });
});

describe("Inspector icon pickers", () => {
  it("section Icon: search, pick, and None write the header icon", () => {
    const { getByRole, getByLabelText, queryByLabelText, container, dispatch, rerenderWith } =
      renderInspector(OBJECTS.section);

    fireEvent.click(getByRole("button", { name: "Icon: None" }));
    expect(getByRole("button", { name: "None" }).getAttribute("aria-pressed")).toBe("true");
    expect(pickerGroups(container).flatMap((group) => group.glyphs)).toHaveLength(
      ICON_GLYPH_IDS.length,
    );

    fireEvent.change(getByLabelText("Search icons"), { target: { value: "brand" } });
    const brandIds = ICON_GLYPH_IDS.filter((glyph) => ICON_GLYPHS[glyph].category === "brands");
    expect(pickerGroups(container)).toEqual([{ category: "brands", glyphs: brandIds }]);

    fireEvent.click(getByRole("button", { name: ICON_GLYPHS["brand-docker"].label }));
    expect(dispatch).toHaveBeenLastCalledWith(updateObject("backend", { icon: "brand-docker" }));
    // Picking closes the picker.
    expect(queryByLabelText("Search icons")).toBeNull();

    rerenderWith({ ...OBJECTS.section, icon: "brand-docker" });
    fireEvent.click(getByRole("button", { name: "Icon: Docker" }));
    expect(getByRole("button", { name: "Docker" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(getByRole("button", { name: "None" }));
    // Strict: the patch must carry `icon: undefined` (a bare {} would keep the icon).
    expect(dispatch.mock.lastCall?.[0]).toStrictEqual(updateObject("backend", { icon: undefined }));
    expect(queryByLabelText("Search icons")).toBeNull();
  });

  it("says so when no icon matches the search", () => {
    const { getByRole, getByLabelText, getByText, container } = renderInspector(OBJECTS.section);
    fireEvent.click(getByRole("button", { name: "Icon: None" }));
    fireEvent.change(getByLabelText("Search icons"), { target: { value: "zzzz" } });
    expect(pickerGroups(container)).toEqual([]);
    expect(getByText("No icons found")).toBeTruthy();
  });

  it("icon Glyph: no None option, and a pick writes the glyph", () => {
    const { getByRole, queryByRole, dispatch } = renderInspector(OBJECTS.icon);

    fireEvent.click(getByRole("button", { name: "Glyph: Database" }));
    expect(queryByRole("button", { name: "None" })).toBeNull();
    expect(getByRole("button", { name: "Database" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(getByRole("button", { name: "Server" }));
    expect(dispatch).toHaveBeenLastCalledWith(updateObject("db", { icon: "server" }));
  });

  it("Escape closes the picker without reaching the window-level canvas hotkeys", () => {
    const windowKeydown = mock((_event: KeyboardEvent) => {});
    window.addEventListener("keydown", windowKeydown);
    try {
      const { getByRole, queryByLabelText } = renderInspector(OBJECTS.section);
      const toggle = getByRole("button", { name: "Icon: None" });
      fireEvent.click(toggle);

      const cell = within(getByRole("group", { name: "Data" })).getByRole("button", {
        name: "Database",
      });
      fireEvent.keyDown(cell, { key: "Escape" });

      expect(queryByLabelText("Search icons")).toBeNull();
      expect(document.activeElement).toBe(toggle);
      expect(windowKeydown).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", windowKeydown);
    }
  });
});

describe("Inspector keyboard and size fields", () => {
  it("keeps keys on its controls (Backspace after a glyph pick) away from the canvas hotkeys", () => {
    const windowKeydown = mock((_event: KeyboardEvent) => {});
    window.addEventListener("keydown", windowKeydown);
    try {
      const { getByRole } = renderInspector(OBJECTS.icon);
      fireEvent.click(getByRole("button", { name: "Glyph: Database" }));
      fireEvent.click(getByRole("button", { name: "Server" }));
      // Focus is back on the toggle; Backspace and arrows must not delete or nudge.
      const toggle = document.activeElement as HTMLElement;
      fireEvent.keyDown(toggle, { key: "Backspace" });
      fireEvent.keyDown(toggle, { key: "ArrowLeft" });
      expect(windowKeydown).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", windowKeydown);
    }
  });

  it("applies a typed width on Enter, not per keystroke, and Escape drops the draft", () => {
    const { getByLabelText, dispatch } = renderInspector(OBJECTS.shape);
    const width = getByLabelText("Object width") as HTMLInputElement;
    fireEvent.change(width, { target: { value: "2" } });
    fireEvent.change(width, { target: { value: "20" } });
    fireEvent.change(width, { target: { value: "200" } });
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.keyDown(width, { key: "Enter" });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "canvas.resizeObject",
      objectId: "api",
      width: 200,
      height: geometry.height,
    });

    const height = getByLabelText("Object height") as HTMLInputElement;
    fireEvent.change(height, { target: { value: "300" } });
    fireEvent.keyDown(height, { key: "Escape" });
    fireEvent.blur(height);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(height.value).toBe(String(geometry.height));
  });
});

describe("InteractiveCanvasEditor showInspector", () => {
  it("mounts the Inspector only when asked, and never while cameraOnly", () => {
    const editorDocument = documentWith(OBJECTS.shape);
    const inspector = (container: HTMLElement) =>
      within(container).queryByText("Inspector", { selector: "aside div" });

    const view = render(<InteractiveCanvasEditor document={editorDocument} />);
    expect(inspector(view.container)).toBeNull();

    view.rerender(<InteractiveCanvasEditor document={editorDocument} showInspector />);
    expect(inspector(view.container)).toBeTruthy();

    view.rerender(<InteractiveCanvasEditor document={editorDocument} showInspector cameraOnly />);
    expect(inspector(view.container)).toBeNull();
  });
});

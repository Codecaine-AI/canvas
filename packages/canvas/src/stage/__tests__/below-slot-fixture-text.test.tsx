import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import v2FlowElementsDocumentJson from "../../../../../canvases/v2-flow-elements.canvas.json";
import v2FlowDocumentJson from "../../../../../canvases/v2-flow.canvas.json";
import { belowBandSize, belowExtendedBoundsPx } from "../../objects/text-slots";
import { validateInteractiveCanvasDocument, type InteractiveCanvasObject } from "../../state/schema";
import { ObjectShape } from "../ObjectShape";

const validation = validateInteractiveCanvasDocument(v2FlowElementsDocumentJson);
if (!validation.ok) {
  throw new Error(
    `v2-flow-elements fixture failed validation: ${validation.issues.map((issue) => issue.path).join(", ")}`,
  );
}
const fixtureDocument = validation.document;
const v2FlowValidation = validateInteractiveCanvasDocument(v2FlowDocumentJson);
if (!v2FlowValidation.ok) {
  throw new Error(
    `v2-flow fixture failed validation: ${v2FlowValidation.issues.map((issue) => issue.path).join(", ")}`,
  );
}
const v2FlowDocument = v2FlowValidation.document;

function fixtureObject(id: string): InteractiveCanvasObject {
  const object = fixtureDocument.objects.find((candidate) => candidate.id === id);
  if (!object) throw new Error(`Missing fixture object: ${id}`);
  return object;
}

function v2FlowObject(id: string): InteractiveCanvasObject {
  const object = v2FlowDocument.objects.find((candidate) => candidate.id === id);
  if (!object) throw new Error(`Missing v2-flow object: ${id}`);
  return object;
}

afterEach(() => {
  cleanup();
});

describe("ObjectShape real fixture below-slot text", () => {
  it("renders person and chat labels from a real v2-flow fixture document", () => {
    for (const [id, text] of [
      ["restyled-person", "Interviewee"],
      ["restyled-chat", "Live Q&A\nRealtime exchange between interviewer and interviewee."],
    ] as const) {
      const { container } = render(
        <ObjectShape
          object={fixtureObject(id)}
          selected={false}
          changed={false}
          bounds={{ minX: 0, minY: 0, maxX: 4000, maxY: 2000 }}
        />,
      );
      const object = container.querySelector(`[data-canvas-object-id="${id}"]`);
      const label = object?.querySelector(".interactive-canvas-label-below-icon");

      expect(label).not.toBeNull();
      expect(label?.textContent).toBe(text);
    }
  });

  it("renders the v2-flow 87px person label and extends bounds for its below band", () => {
    const object = v2FlowObject("person-interviewee-response");
    expect(object.type).toBe("icon");
    expect(object.icon).toBe("person");
    expect(object.geometry.height).toBe(87);

    const band = belowBandSize(object.text, object);
    const extendedBounds = belowExtendedBoundsPx(object);

    expect(band.lines).toBeGreaterThan(0);
    expect(band.heightPx).toBeGreaterThan(0);
    expect(extendedBounds.height).toBeGreaterThan(object.geometry.height);

    const { container } = render(
      <ObjectShape
        object={object}
        selected={false}
        changed={false}
        bounds={{ minX: 0, minY: 0, maxX: 4000, maxY: 2000 }}
      />,
    );
    const label = container.querySelector(".interactive-canvas-label-below-icon");

    expect(label).not.toBeNull();
    expect(label?.textContent).toBe("Interviewee Response");
  });
});

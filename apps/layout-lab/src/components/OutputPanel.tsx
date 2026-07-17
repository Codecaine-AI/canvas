import { useMemo, useState } from "react";
import type { CanvasAgentPatchOperation } from "@codecaine-ai/canvas/actions";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
import type { MappedDocumentValidation } from "../mapping/to-canvas";

type OutputTab = "patch" | "document";

type OutputPanelProps = {
  document: InteractiveCanvasDocument | null;
  patchOps: readonly CanvasAgentPatchOperation[];
  validation: MappedDocumentValidation | null;
};

export function OutputPanel({ document, patchOps, validation }: OutputPanelProps) {
  const [tab, setTab] = useState<OutputTab>("patch");
  const [copied, setCopied] = useState(false);
  const output = useMemo(
    () => JSON.stringify(tab === "patch" ? patchOps : document, null, 2),
    [document, patchOps, tab],
  );

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  const validationLabel = !validation
    ? "not validated"
    : validation.valid
      ? "valid document"
      : `${validation.messages.length || validation.issues.length} validation error${
          (validation.messages.length || validation.issues.length) === 1 ? "" : "s"
        }`;

  return (
    <details className="output-panel" open>
      <summary>Real canvas output</summary>
      <div className="output-toolbar">
        <div className="output-tabs" role="tablist" aria-label="Canvas mapping output">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "patch"}
            className={tab === "patch" ? "active" : undefined}
            onClick={() => setTab("patch")}
          >
            Patch ops
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "document"}
            className={tab === "document" ? "active" : undefined}
            onClick={() => setTab("document")}
          >
            Document
          </button>
        </div>
        <button type="button" className="copy-button" onClick={() => void copyOutput()}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className={`validation-badge ${validation?.valid ? "valid" : "invalid"}`}>
        <span aria-hidden="true">{validation?.valid ? "✓" : "!"}</span>
        {validationLabel}
      </div>
      {!validation?.valid && validation?.messages.length ? (
        <ul className="validation-list">
          {validation.messages.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}
        </ul>
      ) : null}
      <pre className="output-json">{output}</pre>
    </details>
  );
}

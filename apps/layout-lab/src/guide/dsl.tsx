import { useState, type ReactNode } from "react";

/**
 * Presentation-only tokenizer for the layout language. One color system,
 * used by every code block, chip, and legend in the app, so a learner can
 * map any token they see back to its role.
 */

export type TokenKind =
  | "op" // keywords: leaf:, row, col, sec, grid, tier, fan, edges:, label, x:/y:
  | "slot" // compass slots and @corner pins
  | "ord" // reference numbers (2=, and bare numbers in tier/fan/edges)
  | "id" // names the author chose, including quoted labels
  | "type" // #shape types
  | "size" // sizes (S/M/L), gaps (flush/g32/...), grid dims, band weights
  | "punct"; // structural punctuation: > | ( ) : =

interface Token {
  text: string;
  kind: TokenKind;
}

const MASTER = new RegExp(
  [
    /("[^"]*")/, // 1 quoted label -> id
    /(@(?:NW|NE|SW|SE|N|S|E|W|C)\b)/, // 2 corner pin -> slot
    /(\d+(?:\.\d+)?=)/, // 3 reference declaration -> ord
    /(#[\w-]+)/, // 4 shape type
    /(\((?:S|M|L)\))/, // 5 size class
    /(\b(?:flush|g\d+)\b)/, // 6 gap
    /(\b\d+x\d+\b)/, // 7 grid dims
    /(\b(?:leaf|edges)\b:?|\b(?:row|col|sec|grid|tier|fan|label)\b)/, // 8 keyword
    /(\b[xy]:)/, // 9 tier axis -> op
    /(\b(?:NW|NE|SW|SE|N|S|E|W|C)\b)/, // 10 compass slot
    /(\d+(?:\.\d+)?)/, // 11 bare number (kind depends on the line)
    /([A-Za-z_][\w-]*)/, // 12 identifier -> id
  ]
    .map((part) => part.source)
    .join("|"),
  "g",
);

const GROUP_KINDS: readonly TokenKind[] = [
  "id", "slot", "ord", "type", "size", "size", "size", "op", "op", "slot", "ord", "id",
];

/** Bands under row/col are weights (a size concern); tier/fan/edges use reference numbers. */
function bareNumberKind(head: string): TokenKind {
  return head === "row" || head === "col" ? "size" : "ord";
}

export function tokenizeLine(line: string, headContext?: string): Token[] {
  const head = headContext ?? (line.trim().match(/^[a-z]+/)?.[0] ?? "");
  const tokens: Token[] = [];
  let cursor = 0;
  MASTER.lastIndex = 0;
  for (let match = MASTER.exec(line); match !== null; match = MASTER.exec(line)) {
    if (match.index > cursor) {
      tokens.push({ text: line.slice(cursor, match.index), kind: "punct" });
    }
    const groupIndex = match.slice(1).findIndex((group) => group !== undefined);
    let kind = GROUP_KINDS[groupIndex];
    if (groupIndex === 10) kind = bareNumberKind(head);
    tokens.push({ text: match[0], kind });
    cursor = match.index + match[0].length;
  }
  if (cursor < line.length) tokens.push({ text: line.slice(cursor), kind: "punct" });
  return tokens;
}

export function DslLine({ line, context }: { line: string; context?: string }) {
  if (line.trim() === "") return <>{" "}</>;
  return (
    <>
      {tokenizeLine(line, context).map((token, index) => (
        <span key={index} className={`tok-${token.kind}`}>{token.text}</span>
      ))}
    </>
  );
}

export function DslCode({
  code,
  className,
  title,
  lineNumbers = false,
}: {
  code: string;
  className?: string;
  title?: string;
  lineNumbers?: boolean;
}) {
  const body = (
    <pre className={`guide-code${className ? ` ${className}` : ""}`}>
      {code.split("\n").map((line, index) => (
        <div key={index} className="guide-code-line">
          {lineNumbers ? (
            <span className="guide-code-line-number" aria-hidden="true">{index + 1}</span>
          ) : null}
          <span className="guide-line-body"><DslLine line={line} /></span>
        </div>
      ))}
    </pre>
  );
  if (!title) return body;
  return (
    <div className="guide-code-editor">
      <div className="guide-code-editor-bar">
        <span className="guide-code-editor-file">{title}</span>
        <span className="guide-code-editor-actions">
          <span className="guide-code-editor-kind">layout program</span>
          <CopyButton text={code} />
        </span>
      </div>
      {body}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="guide-copy-button"
      aria-label="Copy program"
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? (
        "Copied"
      ) : (
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M 10.5 3.5 V 3 A 1.5 1.5 0 0 0 9 1.5 H 4 A 1.5 1.5 0 0 0 2.5 3 v 5 A 1.5 1.5 0 0 0 4 9.5 h 0.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      )}
    </button>
  );
}

/** A token rendered as a small dark chip — the same colors as every code block. */
export function TokenChip({ text, context, kind }: {
  text: string;
  context?: string;
  kind?: TokenKind;
}) {
  return (
    <code className="tok-chip">
      {kind
        ? <span className={`tok-${kind}`}>{text}</span>
        : <DslLine line={text} context={context} />}
    </code>
  );
}

export const TOKEN_LEGEND: readonly { kind: TokenKind; sample: string; label: string }[] = [
  { kind: "op", sample: "leaf:", label: "keyword — what the line does" },
  { kind: "slot", sample: "N", label: "compass slot / corner" },
  { kind: "ord", sample: "2=", label: "reference number" },
  { kind: "id", sample: "checkout", label: "a name you chose" },
  { kind: "type", sample: "#pill", label: "shape type" },
  { kind: "size", sample: "(M)", label: "size & spacing" },
];

export function TokenLegend({ compact }: { compact?: boolean }): ReactNode {
  return (
    <div className={`guide-token-legend${compact ? " guide-token-legend-compact" : ""}`} aria-label="Code color legend">
      {TOKEN_LEGEND.map((entry) => (
        <span key={entry.kind} className="guide-token-legend-item">
          <code className="tok-chip"><span className={`tok-${entry.kind}`}>{entry.sample}</span></code>
          <span>{compact ? entry.label.split(" — ")[0] : entry.label}</span>
        </span>
      ))}
    </div>
  );
}

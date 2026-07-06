import { describe, expect, it } from "bun:test";
import { CODE_BLOCK } from "../figjam-tokens";
import { tokenizeCodeBlock, tokenizeCodeLine } from "../code-tokenizer";

function joined(tokens: { text: string }[]): string {
  return tokens.map((token) => token.text).join("");
}

describe("tokenizeCodeLine", () => {
  it("never drops or reorders characters for python lines", () => {
    const line = 'class Agent(BaseModel):  # a comment';
    const tokens = tokenizeCodeLine(line, "python");
    expect(joined(tokens)).toBe(line);
  });

  it("colors python keywords with the Dracula keyword color", () => {
    const tokens = tokenizeCodeLine("    def __init__(self, name):", "python");
    const keyword = tokens.find((token) => token.text === "def");
    expect(keyword?.color).toBe(CODE_BLOCK.syntax.keyword);
    const selfToken = tokens.find((token) => token.text === "self");
    expect(selfToken?.color).toBe(CODE_BLOCK.syntax.keyword);
  });

  it("colors python string literals with the Dracula string color", () => {
    const tokens = tokenizeCodeLine('name = "hello"', "python");
    const str = tokens.find((token) => token.text === '"hello"');
    expect(str?.color).toBe(CODE_BLOCK.syntax.string);
  });

  it("colors capitalized python identifiers (class/type names) with the type color", () => {
    const tokens = tokenizeCodeLine("class Agent(BaseModel):", "python");
    const className = tokens.find((token) => token.text === "Agent");
    const baseName = tokens.find((token) => token.text === "BaseModel");
    expect(className?.color).toBe(CODE_BLOCK.syntax.type);
    expect(baseName?.color).toBe(CODE_BLOCK.syntax.type);
  });

  it("colors python comments with the comment color", () => {
    const tokens = tokenizeCodeLine("x = 1  # note", "python");
    const comment = tokens.find((token) => token.text === "# note");
    expect(comment?.color).toBe(CODE_BLOCK.syntax.comment);
  });

  it("never drops or reorders characters for JSON lines", () => {
    const line = '  "name": "spectre", "count": 3,';
    const tokens = tokenizeCodeLine(line, "json");
    expect(joined(tokens)).toBe(line);
  });

  it("colors JSON keys distinctly from JSON string values", () => {
    const tokens = tokenizeCodeLine('"name": "spectre"', "json");
    const key = tokens.find((token) => token.text === '"name"');
    const value = tokens.find((token) => token.text === '"spectre"');
    expect(key?.color).toBe(CODE_BLOCK.syntax.type);
    expect(value?.color).toBe(CODE_BLOCK.syntax.string);
  });

  it("colors JSON keyword literals (true/false/null)", () => {
    const tokens = tokenizeCodeLine('"active": true, "deleted": null', "json");
    const active = tokens.find((token) => token.text === "true");
    const deleted = tokens.find((token) => token.text === "null");
    expect(active?.color).toBe(CODE_BLOCK.syntax.keyword);
    expect(deleted?.color).toBe(CODE_BLOCK.syntax.keyword);
  });

  it("falls back to plain fg-colored text for unknown/unspecified languages", () => {
    const tokens = tokenizeCodeLine("SELECT * FROM users", undefined);
    expect(tokens).toEqual([{ text: "SELECT * FROM users", color: CODE_BLOCK.syntax.fg }]);
  });

  it("handles an empty line without throwing", () => {
    expect(tokenizeCodeLine("", "python")).toEqual([{ text: "", color: CODE_BLOCK.syntax.fg }]);
  });
});

describe("tokenizeCodeBlock", () => {
  it("splits a multi-line body into one token array per line, preserving all text", () => {
    const body = 'class Agent:\n    def run(self):\n        return None';
    const lines = tokenizeCodeBlock(body, "python");
    expect(lines).toHaveLength(3);
    expect(lines.map(joined)).toEqual(body.split("\n"));
  });
});

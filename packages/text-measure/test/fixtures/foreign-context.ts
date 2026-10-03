// Someone else initializes Pretext with their own canvas context before
// text-measure is first used: text-measure must refuse instead of silently
// measuring through a context it does not control.

const Pretext = await import("@chenglou/pretext");
const g = globalThis as unknown as Record<string, unknown>;
g.OffscreenCanvas = class ForeignOffscreenCanvas {
  getContext() {
    return { font: "", measureText: (text: string) => ({ width: text.length * 7 }) };
  }
};
Pretext.prepare("hello", "16px Foreign");
delete g.OffscreenCanvas;

const core = await import("../../src/index.ts");
try {
  core.wrapText("hello world", { family: "Inter", size: 14 }, { maxWidth: 100, lineHeight: 20 });
  console.log(JSON.stringify({ threw: false }));
} catch (error) {
  console.log(JSON.stringify({ threw: true, message: error instanceof Error ? error.message : String(error) }));
}

export {};

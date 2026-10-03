import { describe, expect, it } from "bun:test";
import { BUNDLED_FACES } from "@codecaine-ai/text-measure";
import { base64Of, bundledFaceFor, embedSvgFonts, svgFontFaces } from "../svg-fonts";
import { renderDocumentToSvg } from "../static-svg";
import type { InteractiveCanvasDocument } from "../../state/schema";

/**
 * A standalone SVG (an <img> preview, a PNG export's Image decode, a saved
 * file) cannot see the page's @font-face rules: it paints the bundled faces
 * its text was measured with only when it embeds them.
 */

const faceIds = (svg: string) => svgFontFaces(svg).map((face) => face.id);

describe("bundledFaceFor (CSS font matching)", () => {
  it("picks the exact weight, else looks up within 400-500, else away from 400", () => {
    expect(bundledFaceFor("Inter", 400).file).toBe("Inter-Regular");
    expect(bundledFaceFor("Inter", 450).file).toBe("Inter-Medium");
    expect(bundledFaceFor("Inter", 300).file).toBe("Inter-Regular");
    expect(bundledFaceFor("Inter", 550).file).toBe("Inter-SemiBold");
    expect(bundledFaceFor("Inter", 900).file).toBe("Inter-Bold");
    expect(bundledFaceFor("IBM Plex Mono", 700).file).toBe("IBMPlexMono-SemiBold");
  });
});

describe("svgFontFaces", () => {
  it("resolves family and weight through the element tree and skips empty text", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" font-family="Inter, sans-serif">' +
      '<text font-weight="600">Name<tspan font-family="&quot;IBM Plex Mono&quot;, monospace" font-weight="400">code</tspan></text>' +
      '<text font-weight="700">   </text>' +
      '<text font-family="Georgia">serif</text></svg>';
    expect(svgFontFaces(svg).map((face) => face.file)).toEqual(["Inter-SemiBold", "IBMPlexMono-Regular"]);
  });

  it("finds the faces a rendered board paints", () => {
    const document: InteractiveCanvasDocument = {
      schemaVersion: 1,
      id: "fonts",
      mode: "diagram",
      objects: [{ id: "a", type: "rectangle", text: "MMMMMMMMMM", geometry: { x: 0, y: 0, width: 200, height: 70 } }],
      connections: [],
    } as InteractiveCanvasDocument;
    expect(faceIds(renderDocumentToSvg(document).svg).length).toBeGreaterThan(0);
  });
});

describe("embedSvgFonts", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" font-family="Inter"><text font-weight="700">Hi</text></svg>';

  it("adds one woff2 data: @font-face per used face right after the root tag", async () => {
    const bytes = new Uint8Array([1, 2, 3, 250]);
    const embedded = await embedSvgFonts(svg, async () => bytes);
    expect(embedded).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" font-family="Inter"><defs><style>' +
        `@font-face{font-family:"Inter";font-style:normal;font-weight:700;src:url(data:font/woff2;base64,${base64Of(bytes)}) format("woff2")}` +
        '</style></defs><text font-weight="700">Hi</text></svg>',
    );
    expect(base64Of(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  });

  it("leaves the SVG alone when no face can be loaded or none is used", async () => {
    expect(await embedSvgFonts(svg, async () => null)).toBe(svg);
    const plain = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';
    expect(await embedSvgFonts(plain, async () => new Uint8Array([1]))).toBe(plain);
  });

  it("covers every bundled face", () => {
    expect(new Set(BUNDLED_FACES.map((face) => bundledFaceFor(face.family, face.weight).id)).size).toBe(BUNDLED_FACES.length);
  });
});

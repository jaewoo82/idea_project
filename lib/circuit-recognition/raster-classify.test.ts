// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { classifyInkBlobs } from "./raster-classify";
import { recognizeWords } from "./raster-ocr";
import { decodeToBitmap, findInkBlobs } from "./raster-vision";

function svgToPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function classifySvg(svg: string) {
  const bytes = await svgToPng(svg);
  const bitmap = await decodeToBitmap(bytes);
  const blobs = findInkBlobs(bitmap);
  const words = await recognizeWords(bytes);
  return classifyInkBlobs(blobs, words);
}

describe("classifyInkBlobs (raster path)", () => {
  it(
    "recognizes an isolated straight stroke as a confident wire with no ambiguity",
    async () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150">
        <rect width="300" height="150" fill="white"/>
        <line x1="30" y1="75" x2="270" y2="75" stroke="black" stroke-width="3"/>
      </svg>`;
      const result = await classifySvg(svg);

      expect(result.ambiguous).toHaveLength(0);
      const wires = result.components.filter((c) => c.type === "wire");
      expect(wires).toHaveLength(1);
      // The wire should span roughly the drawn line's extent.
      const xs = wires[0].terminals.map((t) => t.x).sort((a, b) => a - b);
      expect(xs[0]).toBeLessThan(40);
      expect(xs[1]).toBeGreaterThan(260);
    },
    30000
  );

  it(
    "flags a compact filled blob as ambiguous and attaches the nearest OCR label",
    async () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150">
        <rect width="300" height="150" fill="white"/>
        <rect x="120" y="55" width="40" height="40" fill="black"/>
        <text x="120" y="45" font-size="18" fill="black" font-family="sans-serif">R1</text>
      </svg>`;
      const result = await classifySvg(svg);

      expect(result.components.filter((c) => c.type === "wire")).toHaveLength(0);
      expect(result.ambiguous).toHaveLength(1);
      expect(result.ambiguous[0].candidateTypes).toContain("resistor");
      expect(result.ambiguous[0].label).toBeTruthy();
    },
    30000
  );
});

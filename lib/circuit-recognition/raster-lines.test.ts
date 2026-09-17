// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { extractWireSegments } from "./raster-lines";
import { decodeToBitmap } from "./raster-vision";

async function bitmapFromSvg(svg: string) {
  const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
  return decodeToBitmap(bytes);
}

describe("extractWireSegments", () => {
  it("extracts an isolated straight stroke as a wire", async () => {
    const bitmap = await bitmapFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150">
      <rect width="300" height="150" fill="white"/>
      <line x1="30" y1="75" x2="270" y2="75" stroke="black" stroke-width="3"/>
    </svg>`);

    const { components, remaining } = extractWireSegments(bitmap);

    expect(components).toHaveLength(1);
    expect(components[0].type).toBe("wire");
    const xs = components[0].terminals.map((t) => t.x).sort((a, b) => a - b);
    expect(xs[0]).toBeLessThan(40);
    expect(xs[1]).toBeGreaterThan(260);
    // The wire's own pixels should be gone from what's left for blob classification.
    expect(remaining.ink.some((v) => v === 1)).toBe(false);
  });

  it("separates a wire from a touching component outline instead of merging them into one blob", async () => {
    // A wire running into a component outline (e.g. a resistor's box symbol)
    // on both sides — mimics a wire touching a component symbol, the exact
    // case that made every real (non-synthetic) schematic capture recognize
    // zero wires before this fix. Component symbols are conventionally drawn
    // as outlines, not filled blocks, so the outline here is stroke-only.
    const bitmap = await bitmapFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">
      <rect width="400" height="200" fill="white"/>
      <line x1="20" y1="50" x2="150" y2="50" stroke="black" stroke-width="2"/>
      <rect x="150" y="35" width="30" height="30" fill="none" stroke="black" stroke-width="2"/>
      <line x1="180" y1="50" x2="350" y2="50" stroke="black" stroke-width="2"/>
    </svg>`);

    const { components, remaining } = extractWireSegments(bitmap);

    const wireSpans = components
      .map((c) => Math.abs(c.terminals[0].x - c.terminals[1].x))
      .sort((a, b) => b - a);
    expect(components.length).toBeGreaterThanOrEqual(2);
    expect(wireSpans[0]).toBeGreaterThan(100);

    // The square's ink must still be present for the blob classifier to see.
    let squareInkRemains = false;
    for (let y = 35; y < 65; y++) {
      for (let x = 150; x < 180; x++) {
        if (remaining.ink[y * remaining.width + x] === 1) squareInkRemains = true;
      }
    }
    expect(squareInkRemains).toBe(true);
  });

  it("does not mistake one bar of a multi-bar symbol (e.g. a battery) for a wire", async () => {
    const bitmap = await bitmapFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <rect width="200" height="200" fill="white"/>
      <line x1="50" y1="80" x2="150" y2="80" stroke="black" stroke-width="3"/>
      <line x1="70" y1="95" x2="130" y2="95" stroke="black" stroke-width="2"/>
      <line x1="50" y1="110" x2="150" y2="110" stroke="black" stroke-width="3"/>
      <line x1="70" y1="125" x2="130" y2="125" stroke="black" stroke-width="2"/>
    </svg>`);

    const { components } = extractWireSegments(bitmap);

    expect(components).toHaveLength(0);
  });
});

// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { extractPageVectorData } from "./pdf-vector";

const samplePath = path.join(process.cwd(), "sample", "sample_schematic.pdf");

describe("extractPageVectorData", () => {
  it("extracts the schematic's wires, symbols, and labels from the simple sample PDF", async () => {
    const bytes = new Uint8Array(await readFile(samplePath));
    const data = await extractPageVectorData(bytes);

    expect(data.width).toBeGreaterThan(0);
    expect(data.height).toBeGreaterThan(0);

    // R1 / 470 Ω / BT1 / 9V / D1 / LED labels must all be present.
    const labels = data.texts.map((t) => t.text);
    expect(labels).toEqual(
      expect.arrayContaining(["R1", "BT1", "9V", "D1", "LED"])
    );

    // There should be a healthy number of straight wire/symbol segments
    // (battery plates, resistor zigzag, wires) and no curves in this sample.
    expect(data.segments.length).toBeGreaterThan(10);
    expect(data.curves.length).toBe(0);

    // At least the decorative outer frame should show up as a closed polygon.
    expect(data.polygons.length).toBeGreaterThan(0);
  });
});

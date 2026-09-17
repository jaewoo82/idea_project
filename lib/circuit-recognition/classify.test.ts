// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { classifyPageVectorData } from "./classify";
import { extractPageVectorData } from "./pdf-vector";

async function loadSample(name: string) {
  const bytes = new Uint8Array(
    await readFile(path.join(process.cwd(), "sample", name))
  );
  return classifyPageVectorData(await extractPageVectorData(bytes));
}

async function loadFixture(name: string) {
  const bytes = new Uint8Array(
    await readFile(path.join(process.cwd(), "e2e", "fixtures", name))
  );
  return classifyPageVectorData(await extractPageVectorData(bytes));
}

describe("classifyPageVectorData", () => {
  it("recognizes every MVP symbol in the simple LED test circuit with no ambiguity", async () => {
    const result = await loadSample("sample_schematic.pdf");

    expect(result.ambiguous).toHaveLength(0);
    expect(result.unsupported).toHaveLength(0);
    expect(result.openEndpoints).toHaveLength(0);

    const byType = (t: string) => result.components.filter((c) => c.type === t);
    expect(byType("resistor")).toHaveLength(1);
    expect(byType("diode")).toHaveLength(1);
    expect(byType("voltage-source")).toHaveLength(1);
    expect(byType("wire").length).toBeGreaterThan(0);

    expect(byType("resistor")[0].label).toBe("R1");
    expect(byType("diode")[0].label).toBe("D1");
    expect(byType("voltage-source")[0].label).toBe("BT1");
  });

  it("flags the NE555 IC in the intermediate schematic as unsupported instead of placing it", async () => {
    const result = await loadSample("intermediate_schematic.pdf");

    expect(result.unsupported.length).toBeGreaterThan(0);
    expect(
      result.unsupported.some((u) => u.label.includes("NE555"))
    ).toBe(true);

    // Resistors and capacitors elsewhere in the same sheet should still be
    // recognized — the unsupported IC must not block the rest of the sheet.
    const byType = (t: string) => result.components.filter((c) => c.type === t);
    expect(byType("resistor").length).toBeGreaterThan(0);
  });

  it("flags an unmatched triangle (no cathode bar nearby) as ambiguous instead of guessing", async () => {
    const result = await loadFixture("ambiguous-triangle.pdf");

    expect(result.ambiguous).toHaveLength(1);
    expect(result.ambiguous[0].candidateTypes).toContain("diode");
    expect(result.ambiguous[0].label).toBe("D9");
    expect(result.ambiguous[0].id).toBeTruthy();

    // The real wire loop elsewhere on the sheet must still be recognized.
    expect(result.components.some((c) => c.type === "wire")).toBe(true);
    // The ambiguous shape itself must not silently become a diode/wire.
    expect(result.components.some((c) => c.type === "diode")).toBe(false);
  });

  it("flags a wire endpoint that touches nothing else as an open endpoint", async () => {
    const result = await loadFixture("open-wire-end.pdf");

    expect(result.openEndpoints).toHaveLength(1);
    // The dangling stub's free end, not the corner it's attached to.
    expect(result.openEndpoints[0].x).toBeCloseTo(30, 0);
    expect(result.openEndpoints[0].y).toBeCloseTo(30, 0);

    // The closed loop itself must not be misreported as open.
    expect(result.components.filter((c) => c.type === "wire").length).toBe(5);
  });
});

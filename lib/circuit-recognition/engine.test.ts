// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import LZString from "lz-string";
import { describe, expect, it } from "vitest";

import { recognizeCircuitFromPdf } from "./engine";

async function loadBytes(name: string) {
  return new Uint8Array(await readFile(path.join(process.cwd(), "sample", name)));
}

describe("recognizeCircuitFromPdf", () => {
  it("produces a loadable CircuitJS dsl for the simple LED test circuit", async () => {
    const outcome = await recognizeCircuitFromPdf(await loadBytes("sample_schematic.pdf"));

    expect(outcome.hasAmbiguity).toBe(false);
    expect(outcome.unsupported).toHaveLength(0);

    const lines = outcome.dslText.split("\n");
    expect(lines.some((l) => l.startsWith("r "))).toBe(true);
    expect(lines.some((l) => l.startsWith("d "))).toBe(true);
    expect(lines.some((l) => l.startsWith("v "))).toBe(true);
    expect(lines.some((l) => l.startsWith("w "))).toBe(true);

    // Every dump line must be well-formed: dump-code + 4 integer coordinates + flags.
    for (const line of lines) {
      const [code, x1, y1, x2, y2, flags] = line.split(" ");
      expect(code).toMatch(/^[a-z]$/);
      for (const n of [x1, y1, x2, y2, flags]) {
        expect(Number.isInteger(Number(n))).toBe(true);
      }
    }

    expect(LZString.decompressFromEncodedURIComponent(outcome.compressedCircuit)).toBe(
      outcome.dslText
    );
  });

  it("keeps drawing the rest of the sheet when it flags an unsupported IC", async () => {
    const outcome = await recognizeCircuitFromPdf(
      await loadBytes("intermediate_schematic.pdf")
    );

    expect(outcome.unsupported.some((u) => u.label.includes("NE555"))).toBe(true);
    expect(outcome.dslText.length).toBeGreaterThan(0);
    expect(outcome.dslText).not.toContain("NE555");
  });
});

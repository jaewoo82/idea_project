import LZString from "lz-string";

import { classifyPageVectorData } from "./classify";
import { componentsToDslText } from "./dsl";
import { extractPageVectorData } from "./pdf-vector";
import type { RecognitionEngine, RecognitionResult } from "./types";

export interface CircuitRecognitionOutcome extends RecognitionResult {
  /** CircuitJS `readCircuit` text for every confidently recognized component. */
  dslText: string;
  /** `?ctz=` query value for injecting `dslText` into the CircuitJS iframe. */
  compressedCircuit: string;
  hasAmbiguity: boolean;
  /** The PDF page's height, needed to map any later ambiguity resolution
   * back into the same grid `dslText`/`compressedCircuit` already used. */
  pageHeight: number;
}

/**
 * Rule-based implementation of the recognition seam described in
 * docs/decisions/ai-assisted-recognition.md. A future API-backed engine can
 * implement the same `RecognitionEngine` interface and be swapped in here.
 */
export const ruleBasedEngine: RecognitionEngine = {
  async recognize(pdfBytes, pageNumber = 1) {
    const page = await extractPageVectorData(pdfBytes, pageNumber);
    return classifyPageVectorData(page);
  },
};

export async function recognizeCircuitFromPdf(
  pdfBytes: Uint8Array,
  pageNumber = 1
): Promise<CircuitRecognitionOutcome> {
  const page = await extractPageVectorData(pdfBytes, pageNumber);
  const result = classifyPageVectorData(page);
  const dslText = componentsToDslText(result.components, page.height);

  return {
    ...result,
    dslText,
    compressedCircuit: LZString.compressToEncodedURIComponent(dslText),
    hasAmbiguity: result.ambiguous.length > 0,
    pageHeight: page.height,
  };
}

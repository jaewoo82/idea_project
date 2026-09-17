import LZString from "lz-string";

import { classifyInkBlobs } from "./raster-classify";
import { recognizeWords } from "./raster-ocr";
import { decodeToBitmap, findInkBlobs } from "./raster-vision";
import { componentsToDslText, type GridSpace } from "./dsl";
import type { RecognitionEngine } from "./types";
import type { CircuitRecognitionOutcome } from "./engine";

/**
 * Rule-based raster implementation of the recognition seam described in
 * docs/decisions/ai-assisted-recognition.md — the same RecognitionEngine
 * interface as the PDF vector path (lib/circuit-recognition/engine.ts), but
 * built on connected-component image analysis + OCR instead of PDF vector
 * operators, since a clipboard-pasted screenshot has no vector paths or PDF
 * text layer at all (verified while shaping this task).
 */
export const rasterEngine: RecognitionEngine = {
  async recognize(imageBytes) {
    const bitmap = await decodeToBitmap(imageBytes);
    const [blobs, words] = await Promise.all([
      Promise.resolve(findInkBlobs(bitmap)),
      recognizeWords(imageBytes),
    ]);
    return classifyInkBlobs(blobs, words);
  },
};

export async function recognizeCircuitFromImage(
  imageBytes: Uint8Array
): Promise<CircuitRecognitionOutcome> {
  const bitmap = await decodeToBitmap(imageBytes);
  const [blobs, words] = await Promise.all([
    Promise.resolve(findInkBlobs(bitmap)),
    recognizeWords(imageBytes),
  ]);
  const result = classifyInkBlobs(blobs, words);
  // The raster bitmap is already top-left-origin/y-down, matching CircuitJS's
  // own grid — unlike PDF space, no y-flip is needed here.
  const gridSpace: GridSpace = { height: bitmap.height, flipY: false };
  const dslText = componentsToDslText(result.components, gridSpace);

  return {
    ...result,
    dslText,
    compressedCircuit: LZString.compressToEncodedURIComponent(dslText),
    hasAmbiguity: result.ambiguous.length > 0,
    gridSpace,
  };
}

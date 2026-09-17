import LZString from "lz-string";

import { classifyInkBlobs } from "./raster-classify";
import { extractWireSegments } from "./raster-lines";
import { recognizeWords } from "./raster-ocr";
import { decodeToBitmap, findInkBlobs } from "./raster-vision";
import { componentsToDslText, type GridSpace } from "./dsl";
import { detectOpenEndpoints } from "./classify";
import type { RecognitionEngine, RecognitionResult } from "./types";
import type { CircuitRecognitionOutcome } from "./engine";

/**
 * Rule-based raster implementation of the recognition seam described in
 * docs/decisions/ai-assisted-recognition.md — the same RecognitionEngine
 * interface as the PDF vector path (lib/circuit-recognition/engine.ts), but
 * built on connected-component image analysis + OCR instead of PDF vector
 * operators, since a clipboard-pasted screenshot has no vector paths or PDF
 * text layer at all (verified while shaping this task).
 *
 * Wire extraction runs before blob classification (see raster-lines.ts):
 * in a real schematic, wires touch the components they connect, so the
 * whole loop binarizes into one connected blob that per-blob classification
 * alone can't do anything useful with. raster-lines.ts pulls the long,
 * thin, isolated straight runs out as confident wires first; whatever ink
 * is left (component bodies, zigzags, junctions) still goes through the
 * existing blob classifier below, unchanged.
 */
async function recognizeRasterBitmap(
  imageBytes: Uint8Array,
  bitmap: Awaited<ReturnType<typeof decodeToBitmap>>
): Promise<RecognitionResult> {
  const { components: wires, remaining } = extractWireSegments(bitmap);
  const [blobs, words] = await Promise.all([
    Promise.resolve(findInkBlobs(remaining)),
    recognizeWords(imageBytes),
  ]);
  const blobResult = classifyInkBlobs(blobs, words);
  const components = [...wires, ...blobResult.components];

  return {
    components,
    unsupported: blobResult.unsupported,
    ambiguous: blobResult.ambiguous,
    openEndpoints: detectOpenEndpoints(components),
  };
}

export const rasterEngine: RecognitionEngine = {
  async recognize(imageBytes) {
    const bitmap = await decodeToBitmap(imageBytes);
    return recognizeRasterBitmap(imageBytes, bitmap);
  },
};

export async function recognizeCircuitFromImage(
  imageBytes: Uint8Array
): Promise<CircuitRecognitionOutcome> {
  const bitmap = await decodeToBitmap(imageBytes);
  const result = await recognizeRasterBitmap(imageBytes, bitmap);
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

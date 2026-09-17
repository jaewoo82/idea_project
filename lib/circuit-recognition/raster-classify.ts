import type { OcrWord } from "./raster-ocr";
import type { InkBlob } from "./raster-vision";
import type {
  AmbiguousItem,
  MvpComponentType,
  Point,
  RecognitionResult,
  RecognizedComponent,
} from "./types";
import { detectOpenEndpoints } from "./classify";

const MIN_BLOB_DIMENSION = 3;
const MIN_BLOB_PIXELS = 4;
/** Long/short bbox side ratio above which a blob is confidently a straight
 * wire rather than a component symbol. A straight line's own tight bounding
 * box is nearly 100% ink either way (verified empirically), so ink density
 * cannot separate a wire from a filled symbol — only elongation can: a
 * symbol's bbox is comparatively square, a wire's is a thin sliver. */
const WIRE_ASPECT_RATIO = 4;

const AMBIGUOUS_CANDIDATES: MvpComponentType[] = [
  "resistor",
  "capacitor",
  "inductor",
  "diode",
  "voltage-source",
  "ground",
];

function blobWidth(b: InkBlob) {
  return b.x1 - b.x0 + 1;
}
function blobHeight(b: InkBlob) {
  return b.y1 - b.y0 + 1;
}

/** Anti-aliased text can leave a stray 1-2px ink blob just outside OCR's
 * reported word bbox (a letter's edge halo). Padding the bbox before
 * checking overlap keeps such fragments classified as text noise instead of
 * an ambiguous component candidate. */
const WORD_BBOX_PADDING = 2;

function overlapsWord(b: InkBlob, word: OcrWord): boolean {
  const ix0 = Math.max(b.x0, word.bbox.x0 - WORD_BBOX_PADDING);
  const iy0 = Math.max(b.y0, word.bbox.y0 - WORD_BBOX_PADDING);
  const ix1 = Math.min(b.x1, word.bbox.x1 + WORD_BBOX_PADDING);
  const iy1 = Math.min(b.y1, word.bbox.y1 + WORD_BBOX_PADDING);
  if (ix1 < ix0 || iy1 < iy0) return false;
  // +1 on each side: these bboxes are inclusive pixel ranges (matching
  // blobWidth/blobHeight below), so a plain `ix1 - ix0` under-counts the
  // overlap — badly enough for a small blob that a fragment fully inside a
  // word's bbox could previously come out under the 0.4 threshold.
  const overlapArea = (ix1 - ix0 + 1) * (iy1 - iy0 + 1);
  const blobArea = blobWidth(b) * blobHeight(b);
  return overlapArea / blobArea > 0.4;
}

function bboxCenter(b: InkBlob): Point {
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
}

function nearestWordText(b: InkBlob, words: OcrWord[], maxDist: number): string | undefined {
  const center = bboxCenter(b);
  let best: OcrWord | undefined;
  let bestDist = Infinity;
  for (const w of words) {
    const wc = { x: (w.bbox.x0 + w.bbox.x1) / 2, y: (w.bbox.y0 + w.bbox.y1) / 2 };
    const d = Math.hypot(center.x - wc.x, center.y - wc.y);
    if (d < bestDist) {
      bestDist = d;
      best = w;
    }
  }
  return bestDist <= maxDist ? best?.text : undefined;
}

function wireTerminals(b: InkBlob): [Point, Point] {
  // Approximate the wire's two ends along its longer axis.
  if (blobWidth(b) >= blobHeight(b)) {
    const y = (b.y0 + b.y1) / 2;
    return [
      { x: b.x0, y },
      { x: b.x1, y },
    ];
  }
  const x = (b.x0 + b.x1) / 2;
  return [
    { x, y: b.y0 },
    { x, y: b.y1 },
  ];
}

function diagonalTerminals(b: InkBlob): [Point, Point] {
  return [
    { x: b.x0, y: b.y0 },
    { x: b.x1, y: b.y1 },
  ];
}

/**
 * Rule-based classification of a raster image's ink blobs into MVP
 * components, per docs/decisions/ai-assisted-recognition.md: only a sparse,
 * clearly elongated blob is confident enough to become a wire outright.
 * Everything else is surfaced as ambiguous rather than guessed, since raster
 * shape recognition is inherently less reliable than the PDF vector path.
 */
export function classifyInkBlobs(blobs: InkBlob[], words: OcrWord[]): RecognitionResult {
  const components: RecognizedComponent[] = [];
  const ambiguous: AmbiguousItem[] = [];

  const shapeBlobs = blobs.filter((b) => {
    if (blobWidth(b) < MIN_BLOB_DIMENSION && blobHeight(b) < MIN_BLOB_DIMENSION) return false;
    if (b.pixelCount < MIN_BLOB_PIXELS) return false;
    return !words.some((w) => overlapsWord(b, w));
  });

  for (const blob of shapeBlobs) {
    const w = blobWidth(blob);
    const h = blobHeight(blob);
    const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h));

    if (aspect >= WIRE_ASPECT_RATIO) {
      components.push({
        type: "wire",
        terminals: wireTerminals(blob),
        confidence: 1,
      });
      continue;
    }

    ambiguous.push({
      id: `amb-${blob.x0}-${blob.y0}`,
      candidateTypes: AMBIGUOUS_CANDIDATES,
      bbox: { x0: blob.x0, y0: blob.y0, x1: blob.x1, y1: blob.y1 },
      terminals: diagonalTerminals(blob),
      label: nearestWordText(blob, words, Math.max(w, h) * 2),
    });
  }

  return {
    components,
    // IC/black-box detection is not attempted on raster blobs in this pass —
    // recorded as a deferred point in spec.md rather than guessed at.
    unsupported: [],
    ambiguous,
    openEndpoints: detectOpenEndpoints(components),
  };
}

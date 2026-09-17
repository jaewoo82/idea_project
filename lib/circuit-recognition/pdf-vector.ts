import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type {
  ClosedPolygon,
  CurveRun,
  LineSegment,
  PageVectorData,
  Point,
  TextItem,
} from "./types";

// 2x3 affine matrix [a, b, c, d, e, f], matching PDF content-stream `cm` semantics.
type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

// Runs server-side only (Node.js API route). pdfjs-dist needs to resolve its
// worker module even for in-process "fake worker" execution. A relative
// `new URL(..., import.meta.url)` literal is the one form bundlers such as
// Turbopack/webpack recognize and correctly re-point at the bundled worker
// asset; a bare package specifier passed to `import()`/`require.resolve()`
// gets rewritten to a chunk path that does not exist on disk instead.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  import.meta.url
).href;

function multiply(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

function apply(m: Matrix, x: number, y: number): Point {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

// Draw-op codes used inside a decoded `constructPath` path array (see
// pdfjs-dist's makePathFromDrawOPS in build/pdf.mjs — verified empirically
// against this project's own sample PDFs, since pdfjs-dist does not export
// this enum publicly).
const DRAW_MOVE = 0;
const DRAW_LINE = 1;
const DRAW_CURVE = 2;
const DRAW_QUAD = 3;
const DRAW_CLOSE = 4;

interface RawShape {
  points: Point[];
  closed: boolean;
  isCurve: boolean;
}

function decodePath(flat: number[] | undefined, ctm: Matrix): RawShape[] {
  const shapes: RawShape[] = [];
  if (!flat) return shapes;
  let current: Point[] = [];
  let closed = false;
  let isCurve = false;

  const flush = () => {
    if (current.length >= 2) {
      shapes.push({ points: current, closed, isCurve });
    }
    current = [];
    closed = false;
    isCurve = false;
  };

  let i = 0;
  while (i < flat.length) {
    const code = flat[i++];
    if (code === DRAW_MOVE) {
      flush();
      current.push(apply(ctm, flat[i++], flat[i++]));
    } else if (code === DRAW_LINE) {
      current.push(apply(ctm, flat[i++], flat[i++]));
    } else if (code === DRAW_CURVE) {
      const c1 = apply(ctm, flat[i++], flat[i++]);
      const c2 = apply(ctm, flat[i++], flat[i++]);
      const end = apply(ctm, flat[i++], flat[i++]);
      isCurve = true;
      current.push(c1, c2, end);
    } else if (code === DRAW_QUAD) {
      const c1 = apply(ctm, flat[i++], flat[i++]);
      const end = apply(ctm, flat[i++], flat[i++]);
      isCurve = true;
      current.push(c1, end);
    } else if (code === DRAW_CLOSE) {
      closed = true;
    } else {
      // Unrecognized op; stop decoding this path defensively.
      break;
    }
  }
  flush();
  return shapes;
}

/**
 * Extracts vector line/curve geometry and text runs from one PDF page,
 * fully resolved to a single flat coordinate space (the page's default
 * user space, y-up as PDF defines it).
 */
export async function extractPageVectorData(
  pdfBytes: Uint8Array,
  pageNumber = 1
): Promise<PageVectorData> {
  const loadingTask = pdfjsLib.getDocument({
    data: pdfBytes,
    useWorkerFetch: false,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });

  const opList = await page.getOperatorList();
  const OPS = pdfjsLib.OPS;

  const segments: LineSegment[] = [];
  const polygons: ClosedPolygon[] = [];
  const curves: CurveRun[] = [];

  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];

    if (fn === OPS.save) {
      stack.push(ctm);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() ?? IDENTITY;
    } else if (fn === OPS.transform) {
      const [a, b, c, d, e, f] = args as number[];
      ctm = multiply([a, b, c, d, e, f], ctm);
    } else if (fn === OPS.constructPath) {
      const [, pathData] = args as [number, unknown[], unknown];
      const flat = pathData?.[0] as number[] | undefined;
      const shapes = decodePath(flat, ctm);
      for (const shape of shapes) {
        if (shape.isCurve) {
          const xs = shape.points.map((p) => p.x);
          const ys = shape.points.map((p) => p.y);
          curves.push({
            points: shape.points,
            bbox: {
              x0: Math.min(...xs),
              y0: Math.min(...ys),
              x1: Math.max(...xs),
              y1: Math.max(...ys),
            },
          });
        } else if (shape.closed && shape.points.length >= 3) {
          polygons.push({ points: shape.points });
        } else {
          for (let p = 0; p < shape.points.length - 1; p++) {
            segments.push({ a: shape.points[p], b: shape.points[p + 1] });
          }
        }
      }
    }
  }

  const textContent = await page.getTextContent();
  const texts: TextItem[] = [];
  for (const item of textContent.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    const tm = item.transform as number[];
    const [a, , , d, e, f] = tm;
    // Assumes non-rotated text (b = c = 0), true for every schematic PDF this
    // engine has been validated against; `item.width` is already expressed in
    // the same final page-space units as `e`/`f`, so it is used as-is.
    const width = item.width ?? Math.abs(a) * item.str.length * 0.6;
    const fontHeight = Math.abs(d) || Math.abs(a) || 10;
    texts.push({
      text: item.str,
      origin: { x: e, y: f },
      bbox: {
        x0: Math.min(e, e + width),
        x1: Math.max(e, e + width),
        y0: f - fontHeight * 0.2,
        y1: f + fontHeight * 0.9,
      },
    });
  }

  return {
    width: viewport.width,
    height: viewport.height,
    segments,
    polygons,
    curves,
    texts,
  };
}

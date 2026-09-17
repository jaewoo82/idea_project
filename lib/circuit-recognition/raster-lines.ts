import type { PixelBitmap } from "./raster-vision";
import type { RecognizedComponent } from "./types";

/**
 * Pulls confident straight wire segments out of a raster bitmap before
 * blob-based classification runs (see raster-classify.ts).
 *
 * In a real schematic, wires touch the components they connect — the whole
 * loop of wires + component symbols renders as one giant connected ink blob
 * once binarized. The old "classify each blob as a whole" approach then had
 * nothing to work with: a single blob spanning most of the image isn't a
 * wire (its bounding box isn't elongated) and isn't confidently anything
 * else either, so it fell through to one useless "ambiguous" item and zero
 * wires — verified against a synthetic loop fixture built to mimic
 * sample_schematic.pdf's rectangular battery/resistor/LED loop.
 *
 * This scans the whole bitmap for long, thin, straight (axis-aligned) runs
 * that have no other similar parallel run near them, and lifts those out as
 * wires up front. "No nearby parallel run" is what tells a lone connecting
 * wire apart from one bar of a multi-bar symbol (a battery's stacked plates,
 * a capacitor's two plates) that happens to also be long and thin — those
 * sit close to their sibling bars, an isolated wire normally doesn't.
 * Whatever ink is left (component bodies, zigzags, corners, multi-bar
 * symbols) still goes through the existing blob classifier in
 * raster-classify.ts, unchanged.
 */

const MIN_WIRE_RUN_LENGTH = 25;
/** Lower bar used only to detect nearby *candidate* parallel strokes — a
 * multi-bar symbol's individual bars can be shorter than a real wire. */
const PARALLEL_MIN_LENGTH = 10;
const MAX_WIRE_THICKNESS = 5;
/** How far to look, perpendicular to a run, for another parallel run before
 * treating this one as part of a multi-stroke symbol instead of a lone wire.
 * Needs to comfortably span a multi-bar symbol's own bar spacing (a battery
 * or capacitor's plates are typically 10-20px apart). */
const ISOLATION_BAND = 20;

interface RowRun {
  y: number;
  x0: number;
  x1: number;
}
interface ColRun {
  x: number;
  y0: number;
  y1: number;
}
interface Segment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function computeRowRuns(ink: Uint8Array, width: number, height: number, minLen: number): RowRun[] {
  const runs: RowRun[] = [];
  for (let y = 0; y < height; y++) {
    const base = y * width;
    let x = 0;
    while (x < width) {
      if (ink[base + x] !== 1) {
        x++;
        continue;
      }
      const x0 = x;
      while (x < width && ink[base + x] === 1) x++;
      const x1 = x - 1;
      if (x1 - x0 + 1 >= minLen) runs.push({ y, x0, x1 });
    }
  }
  return runs;
}

function computeColRuns(ink: Uint8Array, width: number, height: number, minLen: number): ColRun[] {
  const runs: ColRun[] = [];
  for (let x = 0; x < width; x++) {
    let y = 0;
    while (y < height) {
      if (ink[y * width + x] !== 1) {
        y++;
        continue;
      }
      const y0 = y;
      while (y < height && ink[y * width + x] === 1) y++;
      const y1 = y - 1;
      if (y1 - y0 + 1 >= minLen) runs.push({ x, y0, y1 });
    }
  }
  return runs;
}

function verticalExtentAt(ink: Uint8Array, width: number, height: number, x: number, y: number): number {
  let up = 0;
  while (up < MAX_WIRE_THICKNESS + 1 && y - up - 1 >= 0 && ink[(y - up - 1) * width + x] === 1) up++;
  let down = 0;
  while (
    down < MAX_WIRE_THICKNESS + 1 &&
    y + down + 1 < height &&
    ink[(y + down + 1) * width + x] === 1
  )
    down++;
  return up + down + 1;
}

function horizontalExtentAt(ink: Uint8Array, width: number, x: number, y: number): number {
  const base = y * width;
  let left = 0;
  while (left < MAX_WIRE_THICKNESS + 1 && x - left - 1 >= 0 && ink[base + x - left - 1] === 1) left++;
  let right = 0;
  while (right < MAX_WIRE_THICKNESS + 1 && x + right + 1 < width && ink[base + x + right + 1] === 1)
    right++;
  return left + right + 1;
}

function sampleXs(x0: number, x1: number): number[] {
  const len = x1 - x0;
  return [0.2, 0.5, 0.8].map((f) => Math.round(x0 + len * f));
}
function sampleYs(y0: number, y1: number): number[] {
  const len = y1 - y0;
  return [0.2, 0.5, 0.8].map((f) => Math.round(y0 + len * f));
}

function isThinRow(ink: Uint8Array, width: number, height: number, run: RowRun): boolean {
  return sampleXs(run.x0, run.x1).every(
    (x) => verticalExtentAt(ink, width, height, x, run.y) <= MAX_WIRE_THICKNESS
  );
}
function isThinCol(ink: Uint8Array, width: number, run: ColRun): boolean {
  return sampleYs(run.y0, run.y1).every(
    (y) => horizontalExtentAt(ink, width, run.x, y) <= MAX_WIRE_THICKNESS
  );
}

/** A merely-touching corner (e.g. a component outline's edge grazing a
 * wire's endpoint by a pixel or two) shouldn't disqualify a run — only a
 * substantially overlapping parallel run (another bar of the same symbol)
 * should. */
const MIN_PARALLEL_OVERLAP = PARALLEL_MIN_LENGTH - 2;

function hasParallelRowNeighbor(run: RowRun, allRuns: RowRun[]): boolean {
  for (const other of allRuns) {
    if (other === run) continue;
    const dy = Math.abs(other.y - run.y);
    if (dy <= MAX_WIRE_THICKNESS || dy > ISOLATION_BAND) continue;
    const overlap = Math.min(run.x1, other.x1) - Math.max(run.x0, other.x0);
    if (overlap >= MIN_PARALLEL_OVERLAP) return true;
  }
  return false;
}
function hasParallelColNeighbor(run: ColRun, allRuns: ColRun[]): boolean {
  for (const other of allRuns) {
    if (other === run) continue;
    const dx = Math.abs(other.x - run.x);
    if (dx <= MAX_WIRE_THICKNESS || dx > ISOLATION_BAND) continue;
    const overlap = Math.min(run.y1, other.y1) - Math.max(run.y0, other.y0);
    if (overlap >= MIN_PARALLEL_OVERLAP) return true;
  }
  return false;
}

/** Merges the several adjacent-line runs a single thick stroke produces
 * (one run per pixel of its thickness) into one segment. `line`/`a0`/`a1`
 * abstract over row runs (line=y, a0/a1=x0/x1) and column runs (line=x,
 * a0/a1=y0/y1) so the two axes share one implementation. */
function mergeRuns<R>(
  runs: R[],
  line: (r: R) => number,
  a0: (r: R) => number,
  a1: (r: R) => number
): { line: number; a0: number; a1: number }[] {
  const used = new Array(runs.length).fill(false);
  const groups: { line: number; a0: number; a1: number }[] = [];
  for (let i = 0; i < runs.length; i++) {
    if (used[i]) continue;
    const group = [runs[i]];
    used[i] = true;
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < runs.length; j++) {
        if (used[j]) continue;
        const r = runs[j];
        const joins = group.some(
          (g) =>
            Math.abs(line(g) - line(r)) <= MAX_WIRE_THICKNESS &&
            Math.min(a1(g), a1(r)) - Math.max(a0(g), a0(r)) > -MAX_WIRE_THICKNESS
        );
        if (joins) {
          group.push(r);
          used[j] = true;
          changed = true;
        }
      }
    }
    groups.push({
      a0: Math.min(...group.map(a0)),
      a1: Math.max(...group.map(a1)),
      line: Math.round(group.reduce((s, g) => s + line(g), 0) / group.length),
    });
  }
  return groups;
}

function mergeRowRuns(runs: RowRun[]): Segment[] {
  return mergeRuns(
    runs,
    (r) => r.y,
    (r) => r.x0,
    (r) => r.x1
  ).map(({ line: y, a0: x0, a1: x1 }) => ({ x0, y0: y, x1, y1: y }));
}

function mergeColRuns(runs: ColRun[]): Segment[] {
  return mergeRuns(
    runs,
    (r) => r.x,
    (r) => r.y0,
    (r) => r.y1
  ).map(({ line: x, a0: y0, a1: y1 }) => ({ x0: x, y0, x1: x, y1 }));
}

export interface ExtractedWires {
  components: RecognizedComponent[];
  /** The bitmap with confirmed wire pixels (and a small margin) cleared,
   * ready for raster-classify.ts's existing blob classification. */
  remaining: PixelBitmap;
}

export function extractWireSegments(bitmap: PixelBitmap): ExtractedWires {
  const { width, height, ink } = bitmap;

  const allRowRuns = computeRowRuns(ink, width, height, PARALLEL_MIN_LENGTH);
  const allColRuns = computeColRuns(ink, width, height, PARALLEL_MIN_LENGTH);

  const confirmedRowRuns = allRowRuns.filter(
    (r) =>
      r.x1 - r.x0 + 1 >= MIN_WIRE_RUN_LENGTH &&
      isThinRow(ink, width, height, r) &&
      !hasParallelRowNeighbor(r, allRowRuns)
  );
  const confirmedColRuns = allColRuns.filter(
    (r) =>
      r.y1 - r.y0 + 1 >= MIN_WIRE_RUN_LENGTH &&
      isThinCol(ink, width, r) &&
      !hasParallelColNeighbor(r, allColRuns)
  );

  const hSegments = mergeRowRuns(confirmedRowRuns);
  const vSegments = mergeColRuns(confirmedColRuns);

  const remainingInk = Uint8Array.from(ink);
  function clear(x: number, y: number) {
    if (x >= 0 && x < width && y >= 0 && y < height) remainingInk[y * width + x] = 0;
  }

  const components: RecognizedComponent[] = [];
  for (const s of hSegments) {
    components.push({
      type: "wire",
      terminals: [
        { x: s.x0, y: s.y0 },
        { x: s.x1, y: s.y1 },
      ],
      confidence: 1,
    });
    for (let x = s.x0; x <= s.x1; x++) {
      for (let dy = -MAX_WIRE_THICKNESS; dy <= MAX_WIRE_THICKNESS; dy++) clear(x, s.y0 + dy);
    }
  }
  for (const s of vSegments) {
    components.push({
      type: "wire",
      terminals: [
        { x: s.x0, y: s.y0 },
        { x: s.x1, y: s.y1 },
      ],
      confidence: 1,
    });
    for (let y = s.y0; y <= s.y1; y++) {
      for (let dx = -MAX_WIRE_THICKNESS; dx <= MAX_WIRE_THICKNESS; dx++) clear(s.x0 + dx, y);
    }
  }

  return { components, remaining: { width, height, ink: remainingInk } };
}

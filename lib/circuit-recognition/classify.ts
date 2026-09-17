import type {
  AmbiguousItem,
  ClosedPolygon,
  LineSegment,
  PageVectorData,
  Point,
  RecognitionResult,
  RecognizedComponent,
  TextItem,
  UnsupportedComponent,
} from "./types";

const SNAP_TOLERANCE = 3;
// A reference designator optionally followed by its value in the same text
// run (e.g. "R1", or the combined "R1 1K" some schematic tools emit).
const REF_DESIGNATOR_WITH_VALUE = /^([A-Z]{1,4}\d+)(?:\s+(.+))?$/;
const VALUE_HINT = /[0-9](\s?(ohm|ω|Ω|[kKmMuUµnNpP]?[FfHhVv]))|^[0-9.]+\s?(V|v)$/;

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function samePoint(a: Point, b: Point, tolerance = SNAP_TOLERANCE): boolean {
  return dist(a, b) <= tolerance;
}

function segLength(s: LineSegment): number {
  return dist(s.a, s.b);
}

function isAxisAligned(s: LineSegment): "h" | "v" | null {
  const dx = Math.abs(s.a.x - s.b.x);
  const dy = Math.abs(s.a.y - s.b.y);
  if (dy <= SNAP_TOLERANCE && dx > SNAP_TOLERANCE) return "h";
  if (dx <= SNAP_TOLERANCE && dy > SNAP_TOLERANCE) return "v";
  return null;
}

function polygonBBox(p: ClosedPolygon) {
  const xs = p.points.map((pt) => pt.x);
  const ys = p.points.map((pt) => pt.y);
  return {
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs),
    y1: Math.max(...ys),
  };
}

function bboxArea(b: { x0: number; y0: number; x1: number; y1: number }) {
  return (b.x1 - b.x0) * (b.y1 - b.y0);
}

function nearestText(point: Point, texts: TextItem[], maxDist: number): TextItem[] {
  return texts
    .filter((t) => {
      const cx = (t.bbox.x0 + t.bbox.x1) / 2;
      const cy = (t.bbox.y0 + t.bbox.y1) / 2;
      return dist(point, { x: cx, y: cy }) <= maxDist;
    })
    .sort((a, b) => {
      const ca = { x: (a.bbox.x0 + a.bbox.x1) / 2, y: (a.bbox.y0 + a.bbox.y1) / 2 };
      const cb = { x: (b.bbox.x0 + b.bbox.x1) / 2, y: (b.bbox.y0 + b.bbox.y1) / 2 };
      return dist(point, ca) - dist(point, cb);
    });
}

function pickLabelAndValue(center: Point, texts: TextItem[]) {
  const nearby = nearestText(center, texts, 60);
  let label: string | undefined;
  let value: string | undefined;

  for (const t of nearby) {
    const match = t.text.trim().match(REF_DESIGNATOR_WITH_VALUE);
    if (match) {
      label = match[1];
      if (match[2]) value = match[2];
      break;
    }
  }
  if (!value) {
    value = nearby.find(
      (t) => VALUE_HINT.test(t.text.trim()) || /^[0-9.]+$/.test(t.text.trim())
    )?.text;
  }
  return { label, value };
}

/** Groups segments into chains where consecutive segments share an endpoint. */
function buildChains(segments: LineSegment[]): LineSegment[][] {
  const remaining = [...segments];
  const chains: LineSegment[][] = [];

  while (remaining.length > 0) {
    const chain = [remaining.shift() as LineSegment];
    let extended = true;
    while (extended) {
      extended = false;
      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i];
        const head = chain[0];
        const tail = chain[chain.length - 1];
        if (samePoint(tail.b, seg.a)) {
          chain.push(seg);
          remaining.splice(i, 1);
          extended = true;
          break;
        }
        if (samePoint(tail.b, seg.b)) {
          chain.push({ a: seg.b, b: seg.a });
          remaining.splice(i, 1);
          extended = true;
          break;
        }
        if (samePoint(head.a, seg.b)) {
          chain.unshift(seg);
          remaining.splice(i, 1);
          extended = true;
          break;
        }
        if (samePoint(head.a, seg.a)) {
          chain.unshift({ a: seg.b, b: seg.a });
          remaining.splice(i, 1);
          extended = true;
          break;
        }
      }
    }
    chains.push(chain);
  }
  return chains;
}

interface ClassifyContext {
  components: RecognizedComponent[];
  unsupported: UnsupportedComponent[];
  ambiguous: AmbiguousItem[];
  usedSegments: Set<LineSegment>;
}

/** Deterministic id derived from the shape's own position, so re-running
 * recognition on the same PDF yields the same ambiguous item ids. */
function ambiguousIdFor(bbox: { x0: number; y0: number }): string {
  return `amb-${Math.round(bbox.x0)}-${Math.round(bbox.y0)}`;
}

function extractResistors(segments: LineSegment[], texts: TextItem[], ctx: ClassifyContext) {
  const zigzagCandidates = segments.filter((s) => {
    if (ctx.usedSegments.has(s)) return false;
    const len = segLength(s);
    const axis = isAxisAligned(s);
    return axis === null && len >= 6 && len <= 30;
  });
  const chains = buildChains(zigzagCandidates);
  for (const chain of chains) {
    if (chain.length < 4) continue;
    for (const seg of chain) ctx.usedSegments.add(seg);
    const start = chain[0].a;
    const end = chain[chain.length - 1].b;
    const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const { label, value } = pickLabelAndValue(center, texts);
    ctx.components.push({
      type: "resistor",
      terminals: [start, end],
      label,
      value,
      confidence: 1,
    });
  }
}

interface AxisGroup {
  orientation: "h" | "v";
  /** Position along the stacking axis (y for horizontal segments, x for vertical). */
  pos: number;
  /** Center along the perpendicular axis. */
  center: number;
  length: number;
  segment: LineSegment;
}

function groupParallelStacks(segments: LineSegment[]): AxisGroup[][] {
  const groups: AxisGroup[] = segments.map((segment) => {
    const axis = isAxisAligned(segment)!;
    if (axis === "h") {
      return {
        orientation: "h",
        pos: (segment.a.y + segment.b.y) / 2,
        center: (segment.a.x + segment.b.x) / 2,
        length: Math.abs(segment.a.x - segment.b.x),
        segment,
      };
    }
    return {
      orientation: "v",
      pos: (segment.a.x + segment.b.x) / 2,
      center: (segment.a.y + segment.b.y) / 2,
      length: Math.abs(segment.a.y - segment.b.y),
      segment,
    };
  });

  const stacks: AxisGroup[][] = [];
  const used = new Set<AxisGroup>();
  for (const g of groups) {
    if (used.has(g)) continue;
    const stack = [g];
    used.add(g);
    let addedMore = true;
    while (addedMore) {
      addedMore = false;
      for (const other of groups) {
        if (used.has(other) || other.orientation !== g.orientation) continue;
        if (Math.abs(other.center - g.center) > SNAP_TOLERANCE * 2) continue;
        const closeToStack = stack.some((s) => Math.abs(s.pos - other.pos) <= 15);
        if (closeToStack) {
          stack.push(other);
          used.add(other);
          addedMore = true;
        }
      }
    }
    if (stack.length >= 2) stacks.push(stack);
  }
  return stacks;
}

function extractBatteriesAndGrounds(
  segments: LineSegment[],
  texts: TextItem[],
  ctx: ClassifyContext
) {
  const plateCandidates = segments.filter((s) => {
    if (ctx.usedSegments.has(s)) return false;
    return isAxisAligned(s) !== null && segLength(s) <= 40;
  });
  const stacks = groupParallelStacks(plateCandidates);

  for (const stack of stacks) {
    if (stack.length < 2) continue;
    const sorted = [...stack].sort((a, b) => a.pos - b.pos);
    const lengths = sorted.map((s) => Math.round(s.length));
    const decreasing = lengths.every((l, i) => i === 0 || l < lengths[i - 1]);
    const distinctLengths = new Set(lengths).size;

    // Find perpendicular "stem" segments that cross this stack's span, so they
    // are absorbed into the symbol instead of being emitted as separate wires.
    const perpAxis = sorted[0].orientation === "h" ? "v" : "h";
    const stackSpan = {
      min: Math.min(...sorted.map((s) => s.pos)),
      max: Math.max(...sorted.map((s) => s.pos)),
    };
    const stemSegments = segments.filter((s) => {
      if (ctx.usedSegments.has(s) || stack.some((g) => g.segment === s)) return false;
      const axis = isAxisAligned(s);
      if (axis !== perpAxis) return false;
      const center = perpAxis === "v" ? (s.a.x + s.b.x) / 2 : (s.a.y + s.b.y) / 2;
      if (Math.abs(center - sorted[0].center) > SNAP_TOLERANCE * 2) return false;
      const [lo, hi] =
        perpAxis === "v"
          ? [Math.min(s.a.y, s.b.y), Math.max(s.a.y, s.b.y)]
          : [Math.min(s.a.x, s.b.x), Math.max(s.a.x, s.b.x)];
      return hi >= stackSpan.min - 5 && lo <= stackSpan.max + 5;
    });

    let terminalLo = stackSpan.min;
    let terminalHi = stackSpan.max;
    for (const s of stemSegments) {
      const [lo, hi] =
        perpAxis === "v"
          ? [Math.min(s.a.y, s.b.y), Math.max(s.a.y, s.b.y)]
          : [Math.min(s.a.x, s.b.x), Math.max(s.a.x, s.b.x)];
      terminalLo = Math.min(terminalLo, lo);
      terminalHi = Math.max(terminalHi, hi);
    }

    const axisCenter = sorted[0].center;
    const t1: Point = perpAxis === "v" ? { x: axisCenter, y: terminalLo } : { x: terminalLo, y: axisCenter };
    const t2: Point = perpAxis === "v" ? { x: axisCenter, y: terminalHi } : { x: terminalHi, y: axisCenter };
    const center = { x: (t1.x + t2.x) / 2, y: (t1.y + t2.y) / 2 };

    for (const g of stack) ctx.usedSegments.add(g.segment);
    for (const s of stemSegments) ctx.usedSegments.add(s);

    if (decreasing && distinctLengths >= 2) {
      const { label } = pickLabelAndValue(center, texts);
      ctx.components.push({
        type: "ground",
        terminals: [t1, t1],
        label,
        confidence: 1,
      });
    } else if (distinctLengths >= 2 && stack.length >= 3) {
      const { label, value } = pickLabelAndValue(center, texts);
      ctx.components.push({
        type: "voltage-source",
        terminals: [t1, t2],
        label,
        value,
        confidence: 1,
      });
    }
  }
}

const MICRO_SHAPE_AREA = 30;
const CAPACITOR_MAX_AREA = 2500;

function triangleBBoxArea(p: ClosedPolygon) {
  return bboxArea(polygonBBox(p));
}

function extractDiodes(
  polygons: ClosedPolygon[],
  segments: LineSegment[],
  texts: TextItem[],
  ctx: ClassifyContext,
  consumedPolygons: Set<ClosedPolygon>
) {
  const triangles = polygons.filter(
    (p) =>
      !consumedPolygons.has(p) &&
      p.points.length === 3 &&
      triangleBBoxArea(p) > MICRO_SHAPE_AREA &&
      triangleBBoxArea(p) <= 2000
  );

  for (const tri of triangles) {
    const bbox = polygonBBox(tri);
    const cx = (bbox.x0 + bbox.x1) / 2;
    const cy = (bbox.y0 + bbox.y1) / 2;

    // The cathode bar is a short straight segment just outside the triangle's
    // bbox. Several unrelated segments can fall within the search radius
    // (e.g. a wire passing nearby), so the *closest* candidate is picked
    // rather than the first one encountered.
    const barRadius = (bbox.x1 - bbox.x0 + (bbox.y1 - bbox.y0)) / 2;
    const barCandidates = segments.filter((s) => {
      if (ctx.usedSegments.has(s)) return false;
      const len = segLength(s);
      if (len < 10 || len > 60) return false;
      const mx = (s.a.x + s.b.x) / 2;
      const my = (s.a.y + s.b.y) / 2;
      return dist({ x: mx, y: my }, { x: cx, y: cy }) <= barRadius;
    });
    const bar = barCandidates.sort((a, b) => {
      const da = dist({ x: (a.a.x + a.b.x) / 2, y: (a.a.y + a.b.y) / 2 }, { x: cx, y: cy });
      const db = dist({ x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 }, { x: cx, y: cy });
      return da - db;
    })[0];

    if (!bar) {
      // A triangle with no matching cathode bar nearby: confidently a shape,
      // not confidently a diode. Per ai-assisted-recognition.md, this is
      // surfaced to the user instead of silently guessed or dropped.
      consumedPolygons.add(tri);
      let farthestPair: [Point, Point] = [tri.points[0], tri.points[1]];
      let farthestDist = dist(tri.points[0], tri.points[1]);
      for (let i = 0; i < tri.points.length; i++) {
        for (let j = i + 1; j < tri.points.length; j++) {
          const d = dist(tri.points[i], tri.points[j]);
          if (d > farthestDist) {
            farthestDist = d;
            farthestPair = [tri.points[i], tri.points[j]];
          }
        }
      }
      const { label } = pickLabelAndValue({ x: cx, y: cy }, texts);
      ctx.ambiguous.push({
        id: ambiguousIdFor(bbox),
        candidateTypes: ["diode"],
        bbox,
        terminals: farthestPair,
        label,
      });
      continue;
    }

    consumedPolygons.add(tri);
    ctx.usedSegments.add(bar);

    // Terminal 1: the midpoint of the triangle's flat edge (opposite the
    // apex) — that is where an incoming wire lead actually attaches, not any
    // one raw vertex. Terminal 2: the bar's own midpoint, which is where the
    // outgoing lead attaches on the cathode side.
    const barMid = { x: (bar.a.x + bar.b.x) / 2, y: (bar.a.y + bar.b.y) / 2 };
    let flatEdgeMid = {
      x: (tri.points[0].x + tri.points[1].x) / 2,
      y: (tri.points[0].y + tri.points[1].y) / 2,
    };
    let flatEdgeDist = dist(flatEdgeMid, barMid);
    for (let i = 0; i < tri.points.length; i++) {
      const j = (i + 1) % tri.points.length;
      const mid = {
        x: (tri.points[i].x + tri.points[j].x) / 2,
        y: (tri.points[i].y + tri.points[j].y) / 2,
      };
      const d = dist(mid, barMid);
      if (d > flatEdgeDist) {
        flatEdgeDist = d;
        flatEdgeMid = mid;
      }
    }

    const { label, value } = pickLabelAndValue({ x: cx, y: cy }, texts);
    ctx.components.push({
      type: "diode",
      terminals: [flatEdgeMid, barMid],
      label,
      value,
      confidence: 1,
    });
  }
}

function extractRectangles(
  polygons: ClosedPolygon[],
  segments: LineSegment[],
  texts: TextItem[],
  page: PageVectorData,
  ctx: ClassifyContext,
  consumedPolygons: Set<ClosedPolygon>
) {
  const rectangles = polygons.filter(
    (p) => !consumedPolygons.has(p) && p.points.length === 4
  );

  for (const rect of rectangles) {
    const bbox = polygonBBox(rect);
    const area = bboxArea(bbox);
    consumedPolygons.add(rect);

    const touching = segments.filter(
      (s) =>
        !ctx.usedSegments.has(s) &&
        (isOnBoundary(s.a, bbox) || isOnBoundary(s.b, bbox))
    );

    if (touching.length === 0) {
      // Purely decorative frame or caption box: not part of the circuit.
      continue;
    }

    const pageArea = page.width * page.height;
    if (area <= MICRO_SHAPE_AREA) continue;

    if (area <= CAPACITOR_MAX_AREA) {
      for (const s of touching) ctx.usedSegments.add(s);
      const cx = (bbox.x0 + bbox.x1) / 2;
      const cy = (bbox.y0 + bbox.y1) / 2;
      const vertical = bbox.y1 - bbox.y0 >= bbox.x1 - bbox.x0;
      const t1: Point = vertical ? { x: cx, y: bbox.y0 } : { x: bbox.x0, y: cy };
      const t2: Point = vertical ? { x: cx, y: bbox.y1 } : { x: bbox.x1, y: cy };
      const { label, value } = pickLabelAndValue({ x: cx, y: cy }, texts);
      // A small rectangle is also the IEC/European symbol for a resistor, drawn
      // identically to a small capacitor block; disambiguate by the linked
      // reference designator's prefix letter when one was found nearby.
      const isResistor = label ? /^R\d+$/.test(label) : false;
      ctx.components.push({
        type: isResistor ? "resistor" : "capacitor",
        terminals: [t1, t2],
        label,
        value,
        confidence: 1,
      });
    } else if (area < pageArea * 0.3) {
      // The component itself won't be drawn, so its border pin-stub segments
      // must be consumed here too — otherwise they leak out as dangling wire
      // stubs (CircuitJS then reports "bad connections" on an otherwise-valid
      // sheet).
      for (const s of touching) ctx.usedSegments.add(s);
      const inside = texts.filter((t) => {
        const tcx = (t.bbox.x0 + t.bbox.x1) / 2;
        const tcy = (t.bbox.y0 + t.bbox.y1) / 2;
        return (
          tcx >= bbox.x0 && tcx <= bbox.x1 && tcy >= bbox.y0 && tcy <= bbox.y1
        );
      });
      // Prefer a part name (e.g. "NE555") over pin labels (e.g. "4 RST"),
      // which conventionally start with a pin number.
      const partName = inside.find((t) => !/^\d/.test(t.text.trim()));
      const label = (partName ?? inside[0])?.text ?? "알 수 없는 부품";
      ctx.unsupported.push({
        label,
        bbox,
        reason: "MVP 소자 범위 밖의 부품으로 보입니다 (예: IC).",
      });
    }
    // Larger than 30% of the page: treat as another decorative frame, skip silently.
  }
}

function isOnBoundary(
  p: Point,
  bbox: { x0: number; y0: number; x1: number; y1: number },
  tol = SNAP_TOLERANCE * 2
) {
  const onVerticalEdge =
    (Math.abs(p.x - bbox.x0) <= tol || Math.abs(p.x - bbox.x1) <= tol) &&
    p.y >= bbox.y0 - tol &&
    p.y <= bbox.y1 + tol;
  const onHorizontalEdge =
    (Math.abs(p.y - bbox.y0) <= tol || Math.abs(p.y - bbox.y1) <= tol) &&
    p.x >= bbox.x0 - tol &&
    p.x <= bbox.x1 + tol;
  return onVerticalEdge || onHorizontalEdge;
}

const DECORATIVE_MARK_MAX_LENGTH = 20;

function extractWires(segments: LineSegment[], ctx: ClassifyContext) {
  const remaining = segments.filter((s) => !ctx.usedSegments.has(s) && segLength(s) >= 1);
  const anchors: Point[] = ctx.components.flatMap((c) => c.terminals);

  const touchesAnchor = (p: Point) => anchors.some((a) => samePoint(a, p));
  const touchesOtherSegment = (p: Point, self: LineSegment) =>
    remaining.some((s) => s !== self && (samePoint(s.a, p) || samePoint(s.b, p)));

  for (const s of remaining) {
    const isShort = segLength(s) < DECORATIVE_MARK_MAX_LENGTH;
    const connected =
      touchesAnchor(s.a) ||
      touchesAnchor(s.b) ||
      touchesOtherSegment(s.a, s) ||
      touchesOtherSegment(s.b, s);
    if (isShort && !connected) {
      // An isolated short stroke with nothing attached on either end is a
      // decorative mark (e.g. an LED's light-emission arrows), not a wire.
      ctx.usedSegments.add(s);
      continue;
    }
    ctx.components.push({
      type: "wire",
      terminals: [s.a, s.b],
      confidence: 1,
    });
    ctx.usedSegments.add(s);
  }
}

/** Rule-based classification of extracted PDF vector geometry into circuit components. */
/**
 * Wire endpoints that touch nothing else — the sheet may have been cut off
 * mid-connection, or the user may only have uploaded part of a larger
 * schematic. Only wires are checked: every other component type is allowed a
 * legitimately single-post terminal (e.g. ground), so counting them here
 * would misreport intentional single-connection points as open ends.
 */
function detectOpenEndpoints(components: RecognizedComponent[]): Point[] {
  const pointKey = (p: Point) => `${Math.round(p.x)}:${Math.round(p.y)}`;
  const occurrences = new Map<string, number>();
  for (const c of components) {
    for (const t of c.terminals) {
      const key = pointKey(t);
      occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
    }
  }

  const open: Point[] = [];
  const seen = new Set<string>();
  for (const c of components) {
    if (c.type !== "wire") continue;
    for (const t of c.terminals) {
      const key = pointKey(t);
      if (occurrences.get(key) === 1 && !seen.has(key)) {
        seen.add(key);
        open.push(t);
      }
    }
  }
  return open;
}

export function classifyPageVectorData(page: PageVectorData): RecognitionResult {
  const ctx: ClassifyContext = {
    components: [],
    unsupported: [],
    ambiguous: [],
    usedSegments: new Set<LineSegment>(),
  };
  const consumedPolygons = new Set<ClosedPolygon>();

  extractDiodes(page.polygons, page.segments, page.texts, ctx, consumedPolygons);
  extractRectangles(page.polygons, page.segments, page.texts, page, ctx, consumedPolygons);
  extractResistors(page.segments, page.texts, ctx);
  extractBatteriesAndGrounds(page.segments, page.texts, ctx);
  extractWires(page.segments, ctx);

  return {
    components: ctx.components,
    unsupported: ctx.unsupported,
    ambiguous: ctx.ambiguous,
    openEndpoints: detectOpenEndpoints(ctx.components),
  };
}

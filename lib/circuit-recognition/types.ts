export interface Point {
  x: number;
  y: number;
}

/** One straight segment extracted from a PDF vector path, in diagram-local space. */
export interface LineSegment {
  a: Point;
  b: Point;
}

/** A closed polygon extracted from a PDF vector path (e.g. a triangle or rectangle). */
export interface ClosedPolygon {
  points: Point[];
}

/** A run of bezier curves (used for coils / junction dots). */
export interface CurveRun {
  points: Point[];
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface TextItem {
  text: string;
  /** Baseline origin of the text run, in diagram-local space. */
  origin: Point;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface PageVectorData {
  width: number;
  height: number;
  segments: LineSegment[];
  polygons: ClosedPolygon[];
  curves: CurveRun[];
  texts: TextItem[];
}

export type MvpComponentType =
  | "resistor"
  | "capacitor"
  | "inductor"
  | "diode"
  | "voltage-source"
  | "ground"
  | "wire";

export interface RecognizedComponent {
  type: MvpComponentType;
  /** Two electrical terminals in diagram-local (pdf-vector) space. Mapped to
   * CircuitJS grid coordinates only at DSL-generation time, by dsl.ts's
   * makeGridMapper/dumpLine — not here. */
  terminals: [Point, Point];
  label?: string;
  value?: string;
  /** 0..1 confidence that this classification is correct. */
  confidence: number;
}

export interface UnsupportedComponent {
  label: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  reason: string;
}

export interface AmbiguousItem {
  /** Stable within one recognition run; used to track the user's resolution. */
  id: string;
  /** Plausible MVP types this shape could be, most likely first. */
  candidateTypes: MvpComponentType[];
  bbox: { x0: number; y0: number; x1: number; y1: number };
  /** Terminals to use if the user confirms one of candidateTypes. */
  terminals: [Point, Point];
  label?: string;
}

/** The user's confirmation for one AmbiguousItem (see ai-assisted-recognition.md). */
export type AmbiguityResolution =
  | { itemId: string; kind: "type"; type: MvpComponentType; value?: string }
  | { itemId: string; kind: "custom"; description: string }
  | { itemId: string; kind: "unknown" };

export interface RecognitionResult {
  components: RecognizedComponent[];
  unsupported: UnsupportedComponent[];
  ambiguous: AmbiguousItem[];
  /** Wire endpoints that do not touch any other component's terminal — a
   * likely-unfinished connection, surfaced regardless of the user's declared
   * upload scope (see spec.md's "부분 업로드" behavior). */
  openEndpoints: Point[];
}

/**
 * Public seam for circuit recognition (see docs/decisions/ai-assisted-recognition.md).
 * The rule-based implementation is the only implementation today; a future
 * API-backed implementation can be swapped in behind this same interface.
 */
export interface RecognitionEngine {
  recognize(pdfBytes: Uint8Array, pageNumber?: number): Promise<RecognitionResult>;
}

import type { Point, RecognizedComponent } from "./types";

const UNIT_MULTIPLIER: Record<string, number> = {
  k: 1e3,
  K: 1e3,
  M: 1e6,
  m: 1e-3,
  u: 1e-6,
  U: 1e-6,
  "µ": 1e-6,
  n: 1e-9,
  N: 1e-9,
  p: 1e-12,
  P: 1e-12,
};

function parseMagnitude(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const match = value.match(/([0-9.]+)\s*([kKmMuUµnNpP]?)/);
  if (!match) return fallback;
  const num = parseFloat(match[1]);
  if (Number.isNaN(num)) return fallback;
  const multiplier = UNIT_MULTIPLIER[match[2]] ?? 1;
  return num * multiplier;
}

interface GridMapper {
  (p: Point): Point;
}

/** Flips PDF's y-up page space to a top-left-origin, y-down grid and rounds to integers. */
export function makeGridMapper(pageHeight: number): GridMapper {
  return (p: Point) => ({
    x: Math.round(p.x),
    y: Math.round(pageHeight - p.y),
  });
}

function dumpLine(component: RecognizedComponent, map: GridMapper): string {
  const [a, b] = component.terminals;
  const p1 = map(a);
  const p2 = map(b);
  const head = `${p1.x} ${p1.y} ${p2.x} ${p2.y} 0`;

  switch (component.type) {
    case "wire":
      return `w ${head}`;
    case "resistor":
      return `r ${head} ${parseMagnitude(component.value, 1000)}`;
    case "capacitor":
      return `c ${head} ${parseMagnitude(component.value, 1e-5)} 0 0`;
    case "inductor":
      return `l ${head} ${parseMagnitude(component.value, 1)} 0`;
    case "diode":
      return `d ${head} default`;
    case "voltage-source": {
      const maxVoltage = parseMagnitude(component.value, 5);
      // waveform=0 (DC), frequency=40 (unused for DC), bias=0, phaseShift=0, dutyCycle=0.5
      return `v ${head} 0 40 ${maxVoltage} 0 0 0.5`;
    }
    case "ground":
      return `g ${head} 0`;
  }
}

/** Converts recognized components into a CircuitJS-loadable circuit text (readCircuit format). */
export function componentsToDslText(
  components: RecognizedComponent[],
  pageHeight: number
): string {
  const map = makeGridMapper(pageHeight);
  return components.map((c) => dumpLine(c, map)).join("\n");
}

// Matches CircuitJS's CustomLogicModel.escape(): a graphic TextElm's dump
// text is escaped so spaces and other control characters survive the
// whitespace-tokenized circuit format.
function escapeCircuitText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/ /g, "\\s")
    .replace(/\+/g, "\\p")
    .replace(/=/g, "\\q")
    .replace(/#/g, "\\h")
    .replace(/&/g, "\\a")
    .replace(/\r/g, "\\r");
}

export interface PlaceholderMark {
  /** Where to draw the placeholder label, in diagram-local (pdf-vector) space. */
  point: Point;
  text: string;
}

/**
 * A placeholder is CircuitJS's plain graphic TextElm ('x'): it has no
 * electrical posts, so it cannot short or otherwise disturb the simulation —
 * exactly what an unresolved ("모르겠음") ambiguous item needs (see
 * docs/decisions/ai-assisted-recognition.md and task 03's acceptance criteria).
 */
function placeholderDumpLine(mark: PlaceholderMark, map: GridMapper): string {
  const p = map(mark.point);
  const FLAG_ESCAPE = 4;
  return `x ${p.x} ${p.y} ${p.x + 16} ${p.y} ${FLAG_ESCAPE} 12 ${escapeCircuitText(mark.text)}`;
}

/**
 * Combines confidently recognized components with placeholder marks for any
 * ambiguous item the user left unresolved ("모르겠음") or identified with
 * free text CircuitJS has no drawable element for, into one loadable circuit.
 */
export function buildCircuitDsl(
  components: RecognizedComponent[],
  placeholders: PlaceholderMark[],
  pageHeight: number
): string {
  const map = makeGridMapper(pageHeight);
  const lines = [
    ...components.map((c) => dumpLine(c, map)),
    ...placeholders.map((p) => placeholderDumpLine(p, map)),
  ];
  return lines.join("\n");
}

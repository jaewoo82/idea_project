import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Running OCR through tesseract.js's own worker_thread from *inside* the
// Next.js server process was measured to take minutes instead of seconds,
// in both dev and a production build (see
// docs/follow-ups/tesseract-worker-spawn-slow-in-next-dev.md). Spawning a
// genuinely separate `node` child process for OCR — entirely outside Next's
// bundler and request-handling context — reproduces the fast (~3s) behavior
// measured when calling tesseract.js from a plain Node script.
//
// The script's path is built from `process.cwd()` rather than
// `new URL("./ocr-child.mjs", import.meta.url)`: that pattern is exactly
// what leads Turbopack to trace and relocate the file as a build asset,
// which is the breakage this whole child-process approach exists to avoid.
const ocrChildScript = path.join(process.cwd(), "lib/circuit-recognition/ocr-child.mjs");

export interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}

/** Below this, tesseract is prone to "reading" a solid geometric shape (e.g.
 * a filled component symbol) as a stray character — verified empirically
 * against this project's own synthetic fixtures (a filled square misread as
 * "|" at confidence ~58, versus real text at ~77+). Such low-confidence
 * words are dropped entirely rather than mistaken for real labels or used to
 * exclude a real symbol from shape classification. */
const MIN_WORD_CONFIDENCE = 65;

/** Runs real OCR over a raster image and flattens the result to word-level boxes. */
export async function recognizeWords(imageBytes: Uint8Array): Promise<OcrWord[]> {
  const dir = await mkdtemp(path.join(tmpdir(), "circuit-ocr-"));
  const imagePath = path.join(dir, "input.png");
  try {
    await writeFile(imagePath, imageBytes);
    const { stdout } = await execFileAsync(process.execPath, [ocrChildScript, imagePath], {
      maxBuffer: 20 * 1024 * 1024,
    });
    const rawWords: OcrWord[] = JSON.parse(stdout);
    return rawWords.filter((w) => w.confidence >= MIN_WORD_CONFIDENCE);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

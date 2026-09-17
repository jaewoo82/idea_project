// Standalone OCR worker script, run as its own `node` child process (see
// raster-ocr.ts). Spawning tesseract.js's own worker_thread from *inside*
// the Next.js server process was measured to take minutes instead of
// seconds, in both dev and production builds (see
// docs/follow-ups/tesseract-worker-spawn-slow-in-next-dev.md). Running OCR
// in a genuinely separate OS process — outside Next's bundler and its
// request-handling context entirely — reproduces the fast (~3s) behavior
// measured when calling tesseract.js from a plain Node script.
import path from "node:path";
import { readFile } from "node:fs/promises";
import { createWorker, OEM } from "tesseract.js";

// This script always runs as a plain `node` child process spawned from
// raster-ocr.ts (never imported by Next's bundler), so `process.cwd()` is
// reliably the project root in both dev and a production build. Building
// this path with `new URL(..., import.meta.url)` instead would let
// Turbopack's asset tracing intercept and relocate it — exactly the
// breakage this script exists to route around (see
// docs/follow-ups/tesseract-worker-spawn-slow-in-next-dev.md).
const workerPath = path.join(
  process.cwd(),
  "node_modules/tesseract.js/src/worker-script/node/index.js"
);

const [, , imagePath] = process.argv;
if (!imagePath) {
  console.error("usage: node ocr-child.mjs <image-path>");
  process.exit(1);
}

const bytes = await readFile(imagePath);
const worker = await createWorker("eng", OEM.LSTM_ONLY, { workerPath });
try {
  const { data } = await worker.recognize(bytes, {}, { blocks: true });
  const words = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          const text = word.text.trim();
          if (!text) continue;
          words.push({ text, bbox: word.bbox, confidence: word.confidence });
        }
      }
    }
  }
  process.stdout.write(JSON.stringify(words));
} finally {
  await worker.terminate();
}

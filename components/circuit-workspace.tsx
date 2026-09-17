"use client";

import { useCallback, useEffect, useState } from "react";
import LZString from "lz-string";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CircuitAmbiguityDialog } from "@/components/circuit-ambiguity-dialog";
import { CircuitViewer } from "@/components/circuit-viewer";
import { buildCircuitDsl, type GridSpace, type PlaceholderMark } from "@/lib/circuit-recognition/dsl";
import type {
  AmbiguityResolution,
  AmbiguousItem,
  Point,
  RecognizedComponent,
} from "@/lib/circuit-recognition/types";

type UploadScope = "full" | "partial";

interface RecognizeResponse {
  components: RecognizedComponent[];
  unsupported: { label: string; reason: string }[];
  ambiguous: AmbiguousItem[];
  openEndpoints: Point[];
  hasAmbiguity: boolean;
  compressedCircuit: string;
  gridSpace: GridSpace;
  error?: string;
}

interface DrawnResult {
  compressedCircuit: string;
  unsupported: { label: string; reason: string }[];
  openEndpointCount: number;
  scope: UploadScope;
}

function bboxCenter(bbox: { x0: number; y0: number; x1: number; y1: number }) {
  return { x: (bbox.x0 + bbox.x1) / 2, y: (bbox.y0 + bbox.y1) / 2 };
}

/** Finalizes a recognized sheet once every ambiguous item has a resolution,
 * combining the confident components with placeholders for anything the user
 * left unresolved or identified with free text (see ai-assisted-recognition.md). */
function finalizeCircuit(
  data: RecognizeResponse,
  resolutions: AmbiguityResolution[],
  scope: UploadScope
): DrawnResult {
  const resolvedComponents: RecognizedComponent[] = [];
  const placeholders: PlaceholderMark[] = [];

  for (const resolution of resolutions) {
    const item = data.ambiguous.find((a) => a.id === resolution.itemId);
    if (!item) continue;

    if (resolution.kind === "type") {
      resolvedComponents.push({
        type: resolution.type,
        terminals: item.terminals,
        label: item.label,
        confidence: 1,
      });
    } else if (resolution.kind === "custom") {
      placeholders.push({ point: bboxCenter(item.bbox), text: resolution.description });
    } else {
      placeholders.push({
        point: bboxCenter(item.bbox),
        text: item.label ? `? 확인 필요 (${item.label})` : "? 확인 필요",
      });
    }
  }

  const dslText = buildCircuitDsl(
    [...data.components, ...resolvedComponents],
    placeholders,
    data.gridSpace
  );

  return {
    compressedCircuit: LZString.compressToEncodedURIComponent(dslText),
    unsupported: data.unsupported,
    openEndpointCount: data.openEndpoints.length,
    scope,
  };
}

export function CircuitWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [scope, setScope] = useState<UploadScope>("full");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<DrawnResult | null>(null);

  // Ambiguity resolution in progress for the upload currently being processed.
  const [pending, setPending] = useState<RecognizeResponse | null>(null);
  const [pendingScope, setPendingScope] = useState<UploadScope>("full");
  const [resolveIndex, setResolveIndex] = useState(0);
  const [resolutions, setResolutions] = useState<AmbiguityResolution[]>([]);

  const recognize = useCallback(
    async (endpoint: string, fieldName: string, blob: Blob | File) => {
      setStatus("loading");
      setErrorMessage(null);

      const formData = new FormData();
      formData.append(fieldName, blob);

      try {
        const res = await fetch(endpoint, { method: "POST", body: formData });
        const data: RecognizeResponse = await res.json();

        if (!res.ok) {
          setStatus("error");
          setErrorMessage(data.error ?? "분석하지 못했습니다.");
          return;
        }

        setStatus("idle");
        if (data.ambiguous.length > 0) {
          setPending(data);
          setPendingScope(scope);
          setResolveIndex(0);
          setResolutions([]);
        } else {
          setResult({
            compressedCircuit: data.compressedCircuit,
            unsupported: data.unsupported,
            openEndpointCount: data.openEndpoints.length,
            scope,
          });
        }
      } catch {
        setStatus("error");
        setErrorMessage("업로드하는 중 오류가 발생했습니다.");
      }
    },
    [scope]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    await recognize("/api/circuit/recognize", "pdf", file);
  }

  // Ctrl+V anywhere on the page (outside an editable field, e.g. the
  // ambiguity dialog's custom-input box) pastes a clipboard image — most
  // commonly a Windows Snipping Tool capture — through the same recognize →
  // (ambiguity) → draw flow as a PDF upload.
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (isEditable) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      const imageItem = Array.from(items).find((item) => item.type.startsWith("image/"));
      if (!imageItem) {
        setStatus("error");
        setErrorMessage("클립보드에 이미지가 없습니다. 회로도를 캡쳐한 뒤 다시 붙여넣어 주세요.");
        return;
      }

      const blob = imageItem.getAsFile();
      if (!blob) return;
      e.preventDefault();
      void recognize("/api/circuit/recognize-image", "image", blob);
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [recognize]);

  function handleResolve(resolution: AmbiguityResolution) {
    if (!pending) return;
    const next = [...resolutions, resolution];

    if (resolveIndex + 1 >= pending.ambiguous.length) {
      setResult(finalizeCircuit(pending, next, pendingScope));
      setPending(null);
      setResolveIndex(0);
      setResolutions([]);
    } else {
      setResolutions(next);
      setResolveIndex(resolveIndex + 1);
    }
  }

  const currentAmbiguousItem = pending?.ambiguous[resolveIndex] ?? null;

  return (
    <div className="flex flex-1 flex-col">
      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-center gap-3 border-b px-6 py-4"
      >
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <div className="flex gap-1" role="radiogroup" aria-label="업로드 범위">
          <Button
            type="button"
            size="sm"
            variant={scope === "full" ? "default" : "outline"}
            aria-pressed={scope === "full"}
            onClick={() => setScope("full")}
          >
            전체 회로
          </Button>
          <Button
            type="button"
            size="sm"
            variant={scope === "partial" ? "default" : "outline"}
            aria-pressed={scope === "partial"}
            onClick={() => setScope("partial")}
          >
            일부 회로
          </Button>
        </div>
        <Button type="submit" disabled={!file || status === "loading"}>
          {status === "loading" ? "분석 중..." : "PDF에서 회로 자동 Draw"}
        </Button>
        <span className="text-sm text-muted-foreground">
          또는 캡쳐한 회로도를 이 페이지에 Ctrl+V로 붙여넣으세요.
        </span>
      </form>

      {errorMessage && (
        <Alert variant="destructive" className="mx-6 mt-4">
          <AlertTitle>업로드 실패</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {result && result.scope === "partial" && (
        <Alert className="mx-6 mt-4">
          <AlertTitle>이 회로는 일부만 표시되었습니다</AlertTitle>
          <AlertDescription>
            업로드 시 &ldquo;일부 회로&rdquo;를 선택하셨습니다. 지금 그려진
            내용은 업로드한 PDF에 있는 범위만 반영합니다.
          </AlertDescription>
        </Alert>
      )}

      {result && result.openEndpointCount > 0 && (
        <Alert variant="destructive" className="mx-6 mt-4">
          <AlertTitle>연결되지 않은 배선 끝이 있습니다</AlertTitle>
          <AlertDescription>
            다른 소자에 연결되지 않은 배선 끝을 {result.openEndpointCount}개
            발견했습니다. 회로가 잘려 있거나 일부만 업로드되었을 수 있습니다.
          </AlertDescription>
        </Alert>
      )}

      {result && result.unsupported.length > 0 && (
        <Alert className="mx-6 mt-4">
          <AlertTitle>식별했지만 미지원인 부품이 있습니다</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {result.unsupported.map((u, i) => (
                <li key={i}>
                  {u.label} — {u.reason}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <CircuitAmbiguityDialog
        item={currentAmbiguousItem}
        index={resolveIndex}
        total={pending?.ambiguous.length ?? 0}
        onResolve={handleResolve}
      />

      <CircuitViewer
        className="mt-4 flex-1"
        compressedCircuit={result?.compressedCircuit}
      />
    </div>
  );
}

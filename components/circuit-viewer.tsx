import { cn } from "@/lib/utils";

const CIRCUITJS_URL = "https://www.falstad.com/circuit/circuitjs.html";

interface CircuitViewerProps {
  className?: string;
  /** `?ctz=` value (see lz-string's compressToEncodedURIComponent) to auto-load a circuit. */
  compressedCircuit?: string;
}

/**
 * CircuitJS1(Falstad Circuit Simulator)을 공식 호스팅 페이지 그대로 iframe으로 임베드한다.
 * 이 환경에는 CircuitJS1을 직접 빌드할 Java/GWT 도구가 없어 self-host 대신 공식 URL을 그대로 가리킨다.
 * 자세한 배경은 AGENTS.md의 "벤더 기술: CircuitJS1" 블록 참고.
 *
 * `compressedCircuit`가 바뀌면 iframe이 그 회로로 다시 로드된다. CircuitJS는 런타임에
 * 회로를 주입하는 postMessage API를 제공하지 않으므로(교차 출처 iframe이라 직접 DOM
 * 접근도 불가능하다), 새 회로마다 `?ctz=` 쿼리 파라미터로 페이지 전체를 다시 불러오는
 * 방식이 CircuitJS가 공식적으로 지원하는 유일한 경로다.
 */
export function CircuitViewer({ className, compressedCircuit }: CircuitViewerProps) {
  const src = compressedCircuit
    ? `${CIRCUITJS_URL}?ctz=${compressedCircuit}`
    : CIRCUITJS_URL;

  return (
    <iframe
      key={compressedCircuit ?? "default"}
      src={src}
      title="CircuitJS1 회로 시뮬레이터"
      className={cn("h-full w-full min-h-[640px] border-0", className)}
    />
  );
}

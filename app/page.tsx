import { CircuitWorkspace } from "@/components/circuit-workspace";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight">회로 시뮬레이터</h1>
        <p className="text-sm text-muted-foreground">
          PDF 회로도를 업로드하면 CircuitJS1(Falstad Circuit Simulator)에 자동으로
          그려집니다. PDF 없이도 아래에서 바로 수동으로 그리고 시뮬레이션할 수
          있습니다.
        </p>
      </header>
      <CircuitWorkspace />
    </div>
  );
}

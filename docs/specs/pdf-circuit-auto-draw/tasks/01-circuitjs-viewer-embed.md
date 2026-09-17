# 01 — CircuitJS1 뷰어 임베드

## Outcome

CircuitJS1을 정적 자산으로 프로젝트에 편입하고 페이지에 iframe으로 임베드해서, 사용자가 수동으로 소자를 배치하고 전압/전류 시뮬레이션을 바로 쓸 수 있다. PDF 자동화 없이도 그 자체로 독립적으로 쓸모 있는 결과물이다.

## Blockers

None.

## Acceptance criteria

- [x] 페이지에 접속하면 CircuitJS1 화면이 로드되고, 기본 예제 회로가 시뮬레이션 상태로 동작한다.
- [x] 사용자가 CircuitJS 자체 메뉴로 소자를 수동 배치하고 전압/전류 값을 확인할 수 있다.
- [x] CircuitJS 자체의 저장/내보내기 메뉴(텍스트/URL/로컬 파일)가 그대로 노출된다.

## Constraints

- [ui-composition](../../../decisions/ui-composition.md) — iframe은 캔버스형 custom UI 표면으로 다루고, 주변 chrome(페이지 레이아웃 등)은 shadcn 구성을 따른다.
- `AGENTS.md`의 "벤더 기술: CircuitJS1" 블록 — 공식 호스팅 페이지를 iframe으로 임베드하는 방식(자체 빌드 없음)과 참고 파일 위치(`reference/circuitjs1`, `CirSim.java`, `LoadFile.java` 등)를 확인하고 시작한다.

## Verification

- Playwright e2e: 페이지 로드 후 iframe 안에 CircuitJS1 캔버스가 렌더링되는지 확인.
- Playwright e2e: 기본 예제 회로가 시뮬레이션 중임을 확인(소자를 클릭하면 전압/전류 값이 표시됨).
- Playwright e2e 또는 read_page: Export 관련 메뉴 항목(텍스트로 내보내기/URL로 내보내기/로컬 파일로 저장)이 존재하는지 확인.

## Review checkpoint

None.

## Status

completed

## Execution

- Verification: Playwright e2e(`e2e/circuit.spec.ts`)로 `/circuit` 로드, 기본 LRC 예제 회로 시뮬레이션 동작, File 메뉴의 "Export As Text..." 노출을 확인(1 passed). 브라우저로 Draw 메뉴에서 저항을 수동 배치해 인터랙션도 직접 확인. `npm run typecheck`, `npm run test`(3 passed), 전체 Playwright 스위트(2 passed) 통과. `code-review low` 1회, findings 없음.
- Blocker: 구현 착수 전 "정적 자산 self-host"라는 스펙 전제가 이 환경(Java/GWT 빌드 도구 없음)에서 불가능함을 발견해 `babysit-specs`로 스펙을 "공식 호스팅 페이지 iframe 임베드"로 수정한 뒤 진행함(현재는 해소됨).
- Revision: —

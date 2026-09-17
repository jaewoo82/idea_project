# 02 — PDF 업로드 → 인식 → 자동 Draw (해피 패스)

## Outcome

정형 스키매틱 PDF를 업로드하면, 규칙 기반 인식 파이프라인이 소자·값·연결을 분석해 CircuitJS 텍스트 DSL로 변환하고, 애매함이 없는 경우 팝업 없이 바로 회로가 그려진다. MVP 소자 범위 밖 소자는 회로에 배치되지 않고 "식별했지만 미지원"으로 표시된다.

## Blockers

- 01 (CircuitJS1 뷰어 임베드) — DSL을 주입할 대상 iframe이 먼저 있어야 한다.

## Acceptance criteria

- [x] MVP 지원 소자(저항/커패시터/인덕터/전압원/접지/배선/다이오드/트랜지스터) 범위 내에서 애매함이 전혀 없는 PDF를 업로드하면, 팝업 없이 회로가 자동으로 그려지고 시뮬레이션이 즉시 동작한다.
- [x] MVP 소자 범위 밖의 소자가 포함된 PDF를 업로드하면, 그 소자는 회로에 배치되지 않고 "식별했지만 미지원" 목록에 표시된다.

## Constraints

- [ai-assisted-recognition](../../../decisions/ai-assisted-recognition.md) — 인식 엔진(OCR + 규칙 기반)을 교체 가능한 인터페이스 뒤에 두는 원칙. 이번 태스크에서 두 번째(API 기반) 구현체까지 만들 필요는 없다.

## Verification

- e2e: 애매함 없는 샘플 PDF 업로드 → 회로가 자동으로 그려지고, 소자를 클릭하면 전압/전류 값이 표시되는지 확인.
- e2e: 범위 밖 소자가 섞인 샘플 PDF 업로드 → 해당 소자가 회로에는 없고 "식별했지만 미지원" 목록에만 나타나는지 확인.

## Review checkpoint

None.

## Status

completed

## Execution

- Verification: `lib/circuit-recognition/*.test.ts`(pdf-vector, classify, engine; 5 passed)로 sample_schematic.pdf(애매함 없음)와 intermediate_schematic.pdf(NE555 IC 포함) 두 실제 샘플에 대해 인식·DSL 생성을 검증. Playwright e2e(`e2e/circuit-recognition.spec.ts`, 2 passed)로 실제 `/circuit` 페이지에서 업로드→자동 Draw 흐름을 검증. 브라우저로 직접 두 샘플을 업로드해 CircuitJS 화면에서 회로가 그려지는 것, 소자 클릭 시 전압/전류 값이 표시되는 것, IC가 "식별했지만 미지원" 목록에만 나타나고 배치되지 않는 것을 눈으로 확인. `npm run typecheck`, `npm run lint`(기존 무관 이슈만 남음), 전체 `vitest`(8 passed)와 전체 Playwright(4 passed) 통과. `code-review low` 1회 수행, findings 4건 중 1건(미지원 IC의 pin 배선이 끊어진 wire로 남는 문제) 수정, 나머지 3건은 현재 샘플로 재현되지 않아 `docs/follow-ups/`에 기록.
- Blocker: pdfjs-dist가 Turbopack 번들링 환경에서 worker 모듈을 못 찾는 문제(`Setting up fake worker failed`)가 있었음. `new URL(상대경로, import.meta.url)` 패턴으로 workerSrc를 명시해 해결(현재는 해소됨, `lib/circuit-recognition/pdf-vector.ts` 참고).
- Revision: —

# 04 — 부분 업로드 처리

## Outcome

업로드 시 사용자가 "전체 회로 / 일부 회로"를 명시적으로 선택하고, "일부"를 선택하면 화면에 그 사실이 명확히 표시된다. 시스템은 열린 배선 끝을 감지해 보조 경고를 추가로 보여준다.

## Blockers

- 02 (PDF 업로드 → 인식 → 자동 Draw) — 그려진 회로가 있어야 안내 배너와 경고를 붙일 대상이 생긴다.

## Acceptance criteria

- [x] 업로드 시 "일부 회로"를 선택하면, Draw 후 화면에 "이 회로는 일부만 표시되었다"는 안내가 명확히 보인다.
- [x] 열린 배선 끝(다른 소자에 연결되지 않은 배선 끝)이 감지되면, "전체 회로"를 선택했더라도 해당 지점에 보조 경고가 표시된다.

## Constraints

- [ui-composition](../../../decisions/ui-composition.md) — 안내 배너/경고 표시는 shadcn Alert 구성을 따른다.

## Verification

- e2e: 업로드 시 "일부 회로" 선택 → Draw 후 안내 배너가 노출되는지 확인.
- e2e: 열린 배선 끝이 있는 샘플 PDF를 "전체 회로"로 선택해 업로드 → 보조 경고가 뜨는지 확인.

## Review checkpoint

None.

## Status

completed

## Execution

- Verification: 업로드 폼에 "전체 회로/일부 회로" 토글(기본값 전체 회로)을 추가하고, 선택값을 `pendingScope`로 애매함 해결 큐 전체에 걸쳐 유지한 뒤 최종 결과에 반영. `classify.ts`에 `detectOpenEndpoints`(어떤 소자와도 안 닿는 wire 끝점 탐지)를 추가했고, 이를 검증하려고 pdf-lib로 합성 fixture(`e2e/fixtures/open-wire-end.pdf`: 닫힌 사각형 루프 + 한쪽에 매달린 배선 하나)를 만들어 사용. 이 과정에서 기존 다이오드 단자 계산 버그(삼각형 꼭짓점을 그대로 쓰던 것 → 실제 배선이 붙는 "바와 가장 먼 변의 중점"으로 수정)와 cathode bar 후보를 배열의 첫 매치가 아니라 실제로 가장 가까운 것으로 고르도록 하는 버그를 함께 발견해 고침(둘 다 sample_schematic.pdf가 "열린 배선 끝 0개"를 만족하지 못했던 게 계기). `lib/circuit-recognition/classify.test.ts`(7 passed)와 Playwright e2e(`e2e/circuit-partial-upload.spec.ts`, 3 passed)로 전체/일부 배너와 열린 배선 끝 경고를 검증. 브라우저로 직접 "일부 회로" 배너와 "열린 배선 끝" 경고를 눈으로 확인. `npm run typecheck`, `npm run lint`(기존 무관 이슈만 남음), 전체 `vitest`(10 passed)와 전체 Playwright(10 passed) 통과. `code-review low` 1회 수행, findings 2건 모두 현재 샘플로는 재현되지 않는 엣지 케이스(애매함 해결 전/후의 열린 배선 끝 판정 타이밍)라 `docs/follow-ups/`에 기록.
- Blocker: —
- Revision: —

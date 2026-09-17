# 03 — 애매한 소자·연결 확인 상호작용

## Outcome

인식 결과가 애매한 지점마다 "후보 N개 + 그 외(직접 입력)" 팝업으로 사용자에게 확정받는다. 사용자가 "모르겠음"으로 남기면 해당 지점은 실제 소자가 아니라 placeholder로만 표시된다.

## Blockers

- 02 (PDF 업로드 → 인식 → 자동 Draw) — 확인할 인식 결과 자체가 먼저 있어야 한다.

## Acceptance criteria

- [x] 애매한 지점이 있으면 팝업이 뜨고, 사용자가 선택을 마쳐야 해당 지점이 회로에 반영된다.
- [x] 사용자가 "그 외(직접 입력)"를 선택해 값을 입력하면, 그 입력값이 최종 회로에 반영된다.
- [x] 사용자가 "모르겠음"으로 남기면 해당 위치는 실제 회로 소자가 아니라 명확히 구분되는 placeholder로 표시되고, 시뮬레이션 동작을 방해하지 않는다.

## Constraints

- [ai-assisted-recognition](../../../decisions/ai-assisted-recognition.md) — 애매함을 조용히 추측하지 않고 사용자 확인으로 확정하는 원칙.
- [ui-composition](../../../decisions/ui-composition.md) — 확인 팝업은 shadcn Dialog 구성을 따른다.

## Verification

- e2e: 애매한 소자를 포함한 샘플 PDF 업로드 → 팝업 노출 → 후보 선택 → 해당 지점이 선택한 소자로 회로에 반영되는지 확인.
- e2e: 같은 팝업에서 "그 외(직접 입력)" 선택 → 값 입력 → 회로에 그 값으로 반영되는지 확인.
- e2e: "모르겠음"으로 남긴 경우 → placeholder로 표시되고 시뮬레이션이 에러 없이 동작하는지 확인.

## Review checkpoint

None.

## Status

completed

## Execution

- Verification: 규칙 기반 엔진에서 실제로 애매함이 발생하는 경우(대각선 삼각형인데 cathode bar를 못 찾은 경우)를 `extractDiodes`에 새로 추가하고, `candidateTypes:["diode"]`로 `ambiguous`에 담도록 구현. 이 상황을 재현할 실제 샘플이 없어 pdf-lib로 합성 PDF(`e2e/fixtures/ambiguous-triangle.pdf`)를 만들어 검증에 사용(사용자가 준 4개 샘플은 그대로 두고, 이 케이스만 별도 fixture로 커버). `lib/circuit-recognition/classify.test.ts`(6 passed 중 1건 추가)로 애매 항목 감지를, Playwright e2e(`e2e/circuit-ambiguity.spec.ts`, 3 passed)로 팝업 노출→후보 선택/직접 입력/모르겠음 세 경로를 모두 실제 `/circuit` 페이지에서 검증. 브라우저로 직접 세 경로 모두 업로드→확인까지 눈으로 확인(후보 선택 시 실제 다이오드로 그려짐, 직접 입력 시 입력한 텍스트가 그대로 표시됨, 모르겠음 선택 시 "? 확인 필요 (D9)" placeholder로 표시되고 시뮬레이션이 에러 없이 계속 동작). `npm run typecheck`, `npm run lint`(기존 무관 이슈만 남음), 전체 `vitest`(9 passed)와 전체 Playwright(7 passed) 통과. `code-review low` 1회 수행, findings 2건 중 1건(오해 소지 있는 주석) 수정, 1건(미사용 필드)은 `docs/follow-ups/`에 기록.
- Blocker: —
- Revision: —

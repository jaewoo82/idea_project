# 06 — 이미지 경로에서 낮은 확신 소자를 애매함 팝업으로 확인

## Outcome

래스터 인식에서 확신이 낮은 소자는 조용히 추측하지 않고, 기존 애매함 확인 팝업(후보 선택 / 그 외 직접 입력 / 모르겠음)으로 사용자에게 확정받는다. PDF 경로에서 만든 팝업 흐름을 그대로 재사용한다.

## Blockers

- 05 (클립보드 붙여넣기로 캡쳐 이미지 인식 → 자동 Draw) — 확인할 인식 결과 자체가 먼저 있어야 한다.

## Acceptance criteria

- [x] 확신이 낮은 소자가 있으면 팝업이 뜨고, 후보 선택·직접 입력·모르겠음 중 하나로 확정해야 해당 지점이 회로에 반영된다.
- [x] 같은 이미지에서 확신 있게 인식된 다른 소자들은 애매함 여부와 무관하게 정상적으로 함께 그려진다.

## Constraints

- [ai-assisted-recognition](../../../decisions/ai-assisted-recognition.md) — 애매함을 조용히 추측하지 않고 사용자 확인으로 확정하는 원칙. 래스터 경로에서는 이 원칙을 더 적극적으로 적용한다(확신 낮으면 적극적으로 애매함으로 분류).

## Verification

- e2e: 낮은 확신을 유발하는 fixture를 붙여넣기 → 팝업 노출 → 후보 선택 → 해당 지점이 선택한 소자로 반영되는지 확인.
- e2e: 같은 팝업에서 "그 외(직접 입력)" → 입력값이 최종 회로에 반영되는지 확인.
- e2e: "모르겠음" → placeholder로 표시되고 시뮬레이션을 방해하지 않는지 확인.

## Review checkpoint

None.

## Status

completed

## Execution

- Verification: `npx vitest run`(11 passed), `npx playwright test`(16 passed, 신규 `e2e/circuit-image-ambiguity.spec.ts` 3건 포함) 전부 통과. 확신 있는 배선 1개 + 애매한 라벨 소자 1개를 함께 담은 신규 fixture(`e2e/fixtures/mixed-confident-and-ambiguous.png`)로 후보 선택/직접 입력/모르겠음 세 경로 모두 확인. 첫 번째 테스트는 최종 회로의 압축 해제된 DSL에 배선(`w `) 라인이 실제로 포함되는지까지 확인해 AC2를 직접 검증했다.
- Blocker: 없음.
- Revision: 없음. 05번에서 이미 인식 결과를 `RecognitionEngine` 공통 인터페이스(components/ambiguous/openEndpoints)로 만들어뒀고, `CircuitWorkspace`의 애매함 팝업·해결·DSL 생성 흐름이 PDF 경로와 이미지 경로 양쪽에서 이미 완전히 공유되고 있어서, 이 태스크는 기존 UI/로직에 새 코드를 추가할 필요 없이 신규 fixture + e2e 테스트로 흐름을 검증하는 것만으로 완료됐다.
- Review: 이 태스크의 diff는 신규 e2e 테스트 파일과 fixture 이미지뿐이라 `code-review low`의 테스트/fixture 제외 규칙상 리뷰할 비테스트 코드가 없음. 별도 리뷰 생략.

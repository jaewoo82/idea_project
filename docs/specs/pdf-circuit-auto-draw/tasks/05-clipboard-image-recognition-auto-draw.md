# 05 — 클립보드 붙여넣기로 캡쳐 이미지 인식 → 자동 Draw (해피 패스)

## Outcome

사용자가 페이지 어디서든 Ctrl+V로 클립보드 이미지를 붙여넣으면, 래스터 전용 인식 엔진(OCR + 연결요소 분리 + 기본 형태 규칙)이 소자를 분석해 확신 있는 항목은 CircuitJS DSL로 변환해 자동으로 그린다. 클립보드에 이미지가 아닌 데이터가 있거나 회로 요소를 전혀 못 찾으면 명확한 오류 메시지를 보여주고, 기존 PDF 업로드 폼은 그대로 쓸 수 있다.

## Blockers

- 02 (PDF 업로드 → 인식 → 자동 Draw) — 같은 인식 엔진 인터페이스·DSL 생성·iframe 주입 파이프라인을 재사용하기 때문.

## Acceptance criteria

- [x] Ctrl+V로 이미지를 붙여넣으면 인식이 실행되고, 확신 있는 소자는 팝업 없이 자동으로 그려진다.
- [x] 클립보드에 이미지가 아닌 데이터가 있으면 명확한 오류 메시지가 뜨고, PDF 업로드 폼은 계속 사용할 수 있다.
- [x] 회로로 보이는 요소를 전혀 찾지 못하면 명확한 오류 메시지가 뜬다.

## Constraints

- [ai-assisted-recognition](../../../decisions/ai-assisted-recognition.md) — 인식 엔진 인터페이스(RecognitionEngine)를 그대로 구현해 PDF 경로의 DSL 생성·iframe 주입 파이프라인을 재사용한다.
- [ui-composition](../../../decisions/ui-composition.md) — 오류 메시지는 shadcn Alert 구성을 따른다.

## Verification

- e2e: 캡쳐 이미지와 유사한 fixture를 클립보드에 담아 Ctrl+V로 붙여넣기 → 자동으로 회로가 그려지는지 확인.
- e2e: 이미지가 아닌 클립보드 데이터(예: 일반 텍스트)로 붙여넣기 → 오류 메시지가 뜨고 PDF 업로드 폼은 정상 동작하는지 확인.
- e2e: 회로 요소가 없는 이미지로 붙여넣기 → 오류 메시지가 뜨는지 확인.

## Review checkpoint

None.

## Status

completed

## Execution

- Verification: `npx vitest run`(11 passed), `npx playwright test`(13 passed, e2e/circuit-image-paste.spec.ts 3건 포함) 전부 통과. dev 서버에서 `/api/circuit/recognize-image`에 실제 fixture(wire-only.png → 200 + wire 인식, text-only.png → 422)로 직접 확인.
- Blocker: 구현 중 발견 — Next.js 서버 프로세스 안에서 tesseract.js의 `worker_threads` 워커를 직접 생성하면 dev/prod 모두에서 요청 하나가 85초~5분 이상 걸렸다(Turbopack이 `new URL(경로, import.meta.url)` 패턴을 정적 자산으로 감지해 워커 스크립트를 다른 위치로 복사·재배치하면서 상대 require가 깨짐). OCR을 별도 `node` 자식 프로세스(`lib/circuit-recognition/ocr-child.mjs`)로 완전히 떼어내 해결(~2-3초로 단축). 자세한 내용은 [tesseract-worker-spawn-slow-in-next-dev](../../../follow-ups/tesseract-worker-spawn-slow-in-next-dev.md).
- Revision: `raster-classify.ts`의 `overlapsWord` 겹침 넓이 계산이 inclusive/exclusive 경계 처리가 안 맞아 작은 블롭일수록 겹침 비율을 실제보다 낮게 계산하던 버그를 발견해 함께 고쳤다(텍스트 안티앨리어싱 잔여 픽셀이 "애매함" 항목으로 잘못 분류되는 문제로 발견).
- 사용자 요청으로 범위 밖 변경도 같이 반영: `/circuit` 대신 `/`(홈)에서 바로 동작하도록 라우팅 정리(`app/page.tsx`가 회로 작업 화면이 되고 `/circuit`은 제거, e2e의 `page.goto` 전부 `/`로 변경, boilerplate 홈 화면과 그 전용 유닛 테스트 `app/page.test.tsx` 제거).
- Review: `code-review low` 1회 완료(스킬 예산 준수). 지적 사항 없음.

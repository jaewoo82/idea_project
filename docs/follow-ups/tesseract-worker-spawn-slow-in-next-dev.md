# tesseract.js OCR을 Next 서버 프로세스 밖에서 돌리는 이유

`lib/circuit-recognition/raster-ocr.ts`는 tesseract.js를 직접 `createWorker()`로
호출하지 않고, `lib/circuit-recognition/ocr-child.mjs`를 별도의 `node` 자식
프로세스로 띄워서 그 안에서 OCR을 돌린다. 이유는 다음과 같다.

**측정된 증상**: Next.js API 라우트 핸들러 안에서 `tesseract.js`의
`createWorker()`(내부적으로 `worker_threads.Worker`를 새로 만든다)를 직접
호출하면, 요청 하나가 85초~5분 이상 걸렸다. 같은 이미지로 순수
`node`/`npx tsx` 스크립트에서 동일한 호출을 하면 약 3초에 끝난다. dev
서버(`next dev`, Turbopack)와 프로덕션 빌드(`next build && next start`) 양쪽
모두에서 재현됐다.

**원인**: `new URL("./어딘가/파일", import.meta.url)` 형태로 상대 경로를 계산하면,
Turbopack이 이 패턴을 "정적 자산 참조"로 감지해서 그 파일을
`.next/(dev/)server/assets/`쪽으로 복사·재배치한다. 그 복사본 안에서 다시
상대 경로로 다른 파일을 찾으려는 코드(`require('..')` 등)는 원래 파일 위치
기준으로 쓰여 있었기 때문에, 복사된 위치에서는 깨진다. tesseract.js의
Node 워커 스크립트(`node_modules/tesseract.js/src/worker-script/node/index.js`)
자체가 내부적으로 `require('..')`를 쓰기 때문에, 이 경로 계산에
`new URL(..., import.meta.url)` 패턴이 한 번이라도 연루되면 워커 생성이
지연되거나 깨진 사본을 참조하게 된다.

**해결**: OCR을 Next의 번들러와 요청 처리 컨텍스트 완전히 바깥, 즉 별도의
`node` 자식 프로세스(`child_process.execFile`)로 떼어냈다
(`raster-ocr.ts` → `ocr-child.mjs`). 두 파일 모두 경로 계산에
`import.meta.url` 대신 `process.cwd()` 기준 절대 경로를 쓴다. `ocr-child.mjs`는
Next의 번들러가 전혀 건드리지 않는(직접 `node`로 실행되는) 파일이라 이 문제와
완전히 무관해진다.

**남는 위험**: 이 파일들을 옮기거나, 다시 `import.meta.url` 기반 상대 경로
계산으로 되돌리면 같은 문제가 재발할 수 있다. 이 프로젝트 안에서 Node
`worker_threads`를 새로 쓸 일이 생기면, 같은 패턴(별도 `node` 자식 프로세스 +
`process.cwd()` 기준 경로)을 우선 고려하는 것이 안전하다.

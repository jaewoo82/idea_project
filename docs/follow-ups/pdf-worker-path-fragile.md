# pdf.js worker 경로가 파일 위치에 하드코딩되어 있다

`lib/circuit-recognition/pdf-vector.ts`는 `GlobalWorkerOptions.workerSrc`를
`new URL("../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url)`로
설정한다. 이 상대 경로는 `pdf-vector.ts`가 정확히 `lib/circuit-recognition/`
깊이에 있다는 것을 전제로 한다.

이 파일을 다른 폴더 깊이로 옮기면 이 경로가 조용히 잘못된 위치를 가리키게
되고, PDF 업로드가 다시 "Setting up fake worker failed" 런타임 에러로
실패한다(이번에 이 코드를 고치게 만든 것과 같은 에러). 컴파일 타임에는 아무
신호도 없다.

이 파일을 옮길 계획이 생기면, 이 workerSrc 계산도 함께 옮겨야 한다는 것을
잊지 않도록 주의가 필요하다. 더 견고하게 하려면 프로젝트 루트 기준 절대 경로
계산 방식으로 바꾸는 것을 고려할 수 있다.

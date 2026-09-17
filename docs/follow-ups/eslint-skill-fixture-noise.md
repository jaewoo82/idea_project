# eslint가 스킬 eval fixture의 require() 사용을 에러로 잡는다

`npm run lint`을 돌리면 `.claude/skills/*/evals/fixtures/**/server.js`와
`.agents/skills/*/evals/fixtures/**/server.js`(babysit-specs, shape-idea)의
`require()` 사용이 `@typescript-eslint/no-require-imports`로 에러 처리된다.
이 fixture들은 스킬 배포에 딸려온 것이라 프로젝트 코드가 아니다.

`eslint.config.mjs`의 `globalIgnores`에 스킬 eval fixture 경로를 추가하면 해결될
것으로 보이지만, 스킬 디렉터리 구조가 갱신될 때마다 경로가 바뀔 수 있어 정확한
패턴을 먼저 확인해야 한다.

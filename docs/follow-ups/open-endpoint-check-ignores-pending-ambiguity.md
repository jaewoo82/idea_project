# 열린 배선 끝 감지가 애매함 해결 전/후를 반영하지 못한다

`lib/circuit-recognition/classify.ts`의 `detectOpenEndpoints`는 `ctx.components`
(확정된 소자)만 보고 열린 배선 끝을 찾는다. 애매한 도형(`ctx.ambiguous`)은 아직
`components`에 들어가지 않으므로, 어떤 배선의 유일한 이웃이 아직 해결되지 않은
애매한 도형이라면 실제로는 나중에 연결될 수 있는데도 "열린 배선 끝"으로
잘못 표시될 수 있다.

`components/circuit-workspace.tsx`의 `finalizeCircuit`도 같은 문제를 UI에서
반복한다. 애매함을 다 해결한 뒤 최종 회로(`buildCircuitDsl`)를 새로 만들면서도
`openEndpointCount`는 업로드 직후의 `data.openEndpoints.length`(해결 전 값)를
그대로 쓴다. 그래서 애매한 도형을 실제 소자로 확정해서 열린 끝이 실제로
막혔더라도, 경고 배너는 여전히 예전 개수를 보여준다.

지금 검증된 샘플(4개 제공 샘플 + 합성 fixture)에서는 애매한 도형과 배선이
서로 인접한 경우가 없어서 재현되지 않았다. 실제로 이런 배치가 있는 PDF가
나오면, 애매함 해결 이후에 `detectOpenEndpoints`를 최종 컴포넌트 목록(확정
컴포넌트 + 해결된 컴포넌트 + placeholder)에 대해 다시 돌리도록 고쳐야 한다.

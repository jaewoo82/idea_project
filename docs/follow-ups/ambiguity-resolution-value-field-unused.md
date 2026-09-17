# AmbiguityResolution의 value 필드가 쓰이지 않는다

`lib/circuit-recognition/types.ts`의 `AmbiguityResolution` 타입에서
`{ kind: "type", type, value? }` 형태는 후보 타입을 고르면서 값(예: 저항값)까지
같이 지정할 수 있는 것처럼 선언되어 있다. 하지만 지금은:

- `components/circuit-ambiguity-dialog.tsx`가 후보 버튼을 누를 때 `value`를
  전혀 채우지 않는다.
- `components/circuit-workspace.tsx`의 `finalizeCircuit`도 `resolution.value`를
  읽지 않는다.

그래서 이 필드는 사실상 죽은 코드다. 후보 선택 시 값도 함께 입력받는 UI가
실제로 필요해지면, 그때 이 필드를 채우고 읽도록 두 파일을 함께 손봐야 한다.
지금 당장 필요하지 않다면 타입에서 제거하는 것도 고려할 수 있다.

import { Extension } from "@tiptap/core";

/**
 * 에디터를 만든 직후 빈 트랜잭션을 한 번 보내서 **문서가 스스로 정리되는 것을 미리 끝낸다**(`createCoreExtensions({ settle: true })`).
 * StarterKit의 끝 문단(`TrailingNode`) 같은 `appendTransaction`은 처음 오는 트랜잭션에서야 문서를 고친다. 그런데 열려 있는 에디터에서 **원자 노드(링크·카드·원문 상자)를
 * 처음 누르면** ProseMirror가 `view.focus()`(= 포커스 트랜잭션, 문서가 바뀜)를 한 뒤 **바뀌기 전 문서로 만든 선택**을 적용해서
 * "Selection passed to setSelection must point at the current document" 오류가 난다. 미리 정리해 두면 첫 클릭에서도 문서가 안 바뀐다.
 * 문서가 바뀔 수 있으므로(끝 문단이 생김) 열자마자 변경으로 치지 않는 소비자(내보낸 글을 비교하는 블로그·임베드·PlanBench)만 켠다 — 노트 앱은 켜지 않는다(열기만 해도 저장될 수 있다).
 */
export const Settle = Extension.create({
  name: "settle",
  onCreate() {
    const { view, state } = this.editor;
    view.dispatch(state.tr.setMeta("addToHistory", false).setMeta("settle", true));
  },
});

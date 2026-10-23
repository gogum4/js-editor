// 에디터 번들에서 mermaid를 뺄 때(기본) `import("mermaid")` 자리에 들어가는 대용품. mermaid는 번들 크기의 대부분을 차지한다(docs/EDITOR-EMBED.md).
// 다이어그램 코드 블록은 그림 대신 "그림을 그리지 못했어요" 안내로 보인다(원문 코드는 그대로 남는다). 켜려면 `EMBED_MERMAID=1 pnpm build`.
export default {
  initialize(): void {},
  render(): Promise<never> {
    return Promise.reject(new Error("mermaid is not included in this editor bundle"));
  },
};

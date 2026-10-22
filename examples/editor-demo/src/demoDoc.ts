// 데모(와 그 시각·동작 시험)가 쓰는 고정 문서. 블록 id를 모두 직접 정해 둔다 — 에디터는 id 없는 블록에 무작위 id를 붙이므로,
// 그렇게 두면 실행마다 DOM이 달라져 전후 비교가 흔들린다.
export interface DemoNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DemoNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

export const IMAGE_HASH = "a".repeat(64);

const t = (text: string, ...marks: Array<string | { type: string; attrs: Record<string, unknown> }>): DemoNode => ({
  type: "text",
  text,
  ...(marks.length ? { marks: marks.map((m) => (typeof m === "string" ? { type: m } : m)) } : {}),
});
const p = (id: string, ...content: DemoNode[]): DemoNode => ({ type: "paragraph", attrs: { id }, ...(content.length ? { content } : {}) });

export const DEMO_DOC: DemoNode = {
  type: "doc",
  content: [
    { type: "heading", attrs: { id: "demo000001", level: 2, textAlign: "center" }, content: [t("제목")] },
    p("demo000002", t("굵게", "bold"), t(" "), t("기울임", "italic"), t(" "), t("코드", "code"), t(" "), t("밑줄", "underline"), t(" "), t("취소", "strike"), t(" "), t("링크", { type: "link", attrs: { href: "https://example.com" } })),
    { type: "bulletList", attrs: { id: "demo000003" }, content: [{ type: "listItem", content: [p("demo000004", t("글머리"))] }] },
    { type: "orderedList", attrs: { id: "demo000005", start: 3 }, content: [{ type: "listItem", content: [p("demo000006", t("셋째"))] }] },
    {
      type: "taskList",
      attrs: { id: "demo000007" },
      content: [
        { type: "taskItem", attrs: { checked: true }, content: [p("demo000008", t("끝낸 일"))] },
        { type: "taskItem", attrs: { checked: false }, content: [p("demo000009", t("할 일"))] },
      ],
    },
    { type: "blockquote", attrs: { id: "demo000010" }, content: [p("demo000011", t("인용"))] },
    { type: "callout", attrs: { id: "demo000012", type: "tip" }, content: [p("demo000013", t("팁 콜아웃"))] },
    { type: "callout", attrs: { id: "demo000014", type: "warning" }, content: [p("demo000015", t("경고 콜아웃"))] },
    { type: "codeBlock", attrs: { id: "demo000016", language: "ts" }, content: [t("const answer: number = 42;\nconsole.log(answer);")] },
    { type: "codeBlock", attrs: { id: "demo000017", language: null }, content: [t("언어 없는 코드")] },
    { type: "codeBlock", attrs: { id: "demo000018", language: "mermaid" }, content: [t("graph TD;A-->B")] },
    { type: "image", attrs: { id: "demo000019", hash: IMAGE_HASH, mime: "image/png", alt: "그림", width: 200, textAlign: "center" } },
    {
      type: "table",
      attrs: { id: "demo000020" },
      content: [
        { type: "tableRow", content: [{ type: "tableHeader", content: [p("demo000021", t("머리"))] }, { type: "tableHeader", content: [p("demo000022", t("글"))] }] },
        { type: "tableRow", content: [{ type: "tableCell", content: [p("demo000023", t("1"))] }, { type: "tableCell", content: [p("demo000024", t("2"))] }] },
      ],
    },
    { type: "toggle", attrs: { id: "demo000025" }, content: [p("demo000026", t("토글 제목")), p("demo000027", t("접힌 내용"))] },
    p("demo000028", t("수식 "), { type: "mathInline", attrs: { latex: "E=mc^2" } }, t(" 와 각주"), { type: "footnote", attrs: { text: "첫 각주" } }, t(" 둘"), { type: "footnote", attrs: { text: "둘째 각주" } }),
    { type: "mathBlock", attrs: { id: "demo000029", latex: "\\frac{a}{b}" } },
    { type: "horizontalRule", attrs: { id: "demo000030" } },
    p("demo000031", t("끝")),
    // 시험이 직접 입력해 보는 빈 문단.
    p("demo000032"),
  ],
};

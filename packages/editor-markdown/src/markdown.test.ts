import { describe, expect, it } from "vitest";

import type { PmNode } from "@gogum4/editor-schema/pmDoc";
import { defaultMarkdownFileName, docToMarkdown, escapeInline, MISSING_PAGE_TITLE } from "./markdown.ts";

const t = (text: string, ...marks: string[]): PmNode => ({
  type: "text",
  text,
  ...(marks.length > 0 ? { marks: marks.map((type) => ({ type })) } : {}),
});
const p = (...content: PmNode[]): PmNode => ({ type: "paragraph", content });
const doc = (...content: PmNode[]): PmNode => ({ type: "doc", content });
const titles: Record<string, string> = { a: "프로젝트 A", b: "회의록", c: "회의록", empty: "" };
const md = (root: PmNode) => docToMarkdown(root, { pageTitle: (id) => titles[id] ?? null });

describe("블록", () => {
  it("문단과 제목", () => {
    const r = md(doc({ type: "heading", attrs: { level: 2 }, content: [t("제목")] }, p(t("본문 하나")), p(t("본문 둘"))));
    expect(r.markdown).toBe("## 제목\n\n본문 하나\n\n본문 둘\n");
    expect(r.notices).toEqual([]);
  });

  it("문서 끝의 빈 문단(에디터가 항상 두는 것)과 중간의 빈 문단은 버린다", () => {
    expect(md(doc(p(t("가")), p(), p(t("나")), p())).markdown).toBe("가\n\n나\n");
    expect(md(doc(p())).markdown).toBe("");
    expect(md(doc()).markdown).toBe("");
  });

  it("글머리·번호·할 일 목록", () => {
    const item = (text: string, extra?: PmNode[], attrs?: Record<string, unknown>): PmNode => ({
      type: "listItem",
      ...(attrs ? { attrs } : {}),
      content: [p(t(text)), ...(extra ?? [])],
    });
    const r = md(
      doc(
        { type: "bulletList", content: [item("하나"), item("둘")] },
        { type: "orderedList", attrs: { start: 3 }, content: [item("셋"), item("넷")] },
        {
          type: "taskList",
          content: [
            { type: "taskItem", attrs: { checked: true }, content: [p(t("한 일"))] },
            { type: "taskItem", attrs: { checked: false }, content: [p(t("할 일"))] },
          ],
        },
      ),
    );
    expect(r.markdown).toBe("- 하나\n- 둘\n\n3. 셋\n4. 넷\n\n- [x] 한 일\n- [ ] 할 일\n");
  });

  it("중첩 목록은 마커 너비만큼 들여쓴다", () => {
    const nested: PmNode = {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            p(t("위")),
            {
              type: "orderedList",
              content: [{ type: "listItem", content: [p(t("아래 하나")), { type: "bulletList", content: [{ type: "listItem", content: [p(t("더 아래"))] }] }] }],
            },
          ],
        },
      ],
    };
    expect(md(doc(nested)).markdown).toBe("- 위\n  1. 아래 하나\n     - 더 아래\n");
  });

  it("목록 항목 안의 두 문단은 빈 줄로 나뉘고 들여쓴다", () => {
    const list: PmNode = { type: "bulletList", content: [{ type: "listItem", content: [p(t("첫째")), p(t("둘째"))] }] };
    expect(md(doc(list)).markdown).toBe("- 첫째\n\n  둘째\n");
  });

  it("인용은 각 줄 앞에 >", () => {
    const q: PmNode = { type: "blockquote", content: [p(t("가")), p(t("나"))] };
    expect(md(doc(q)).markdown).toBe("> 가\n>\n> 나\n");
  });

  it("콜아웃은 GitHub 알림 형식", () => {
    const callout = (type: string): PmNode => ({ type: "callout", attrs: { type }, content: [p(t("내용")), p(t("둘째"))] });
    expect(md(doc(callout("warning"))).markdown).toBe("> [!WARNING]\n> 내용\n>\n> 둘째\n");
    for (const [type, label] of [["note", "NOTE"], ["tip", "TIP"], ["important", "IMPORTANT"], ["caution", "CAUTION"]]) {
      expect(md(doc(callout(type))).markdown.startsWith(`> [!${label}]\n`)).toBe(true);
    }
  });

  it("코드 블록은 언어와 함께, 안에 ```가 있으면 더 긴 울타리", () => {
    const code = (text: string, language?: string): PmNode => ({ type: "codeBlock", attrs: { language: language ?? null }, content: [t(text)] });
    expect(md(doc(code("let a = 1;\n\nlet b = 2;", "ts"))).markdown).toBe("```ts\nlet a = 1;\n\nlet b = 2;\n```\n");
    expect(md(doc(code("a ``` b"))).markdown).toBe("````\na ``` b\n````\n");
  });

  it("목록 안의 코드 블록도 들여쓴다", () => {
    const list: PmNode = { type: "bulletList", content: [{ type: "listItem", content: [p(t("예")), { type: "codeBlock", attrs: { language: "js" }, content: [t("a();\n\nb();")] }] }] };
    expect(md(doc(list)).markdown).toBe("- 예\n\n  ```js\n  a();\n\n  b();\n  ```\n");
  });

  it("구분선", () => {
    expect(md(doc(p(t("위")), { type: "horizontalRule" }, p(t("아래")))).markdown).toBe("위\n\n---\n\n아래\n");
  });
});

describe("인라인", () => {
  it("굵게·기울임·취소선·코드", () => {
    expect(md(doc(p(t("굵게", "bold"), t(" "), t("기울임", "italic"), t(" "), t("취소", "strike"), t(" "), t("코드", "code")))).markdown).toBe(
      "**굵게** *기울임* ~~취소~~ `코드`\n",
    );
  });

  it("겹친 서식과 앞뒤 공백은 기호 밖으로 뺀다", () => {
    expect(md(doc(p(t("앞 "), t(" 강조 ", "bold", "italic"), t("뒤")))).markdown).toBe("앞  ***강조*** 뒤\n");
  });

  it("공백뿐인 서식 글자는 그대로 둔다", () => {
    expect(md(doc(p(t("가"), t("  ", "bold"), t("나")))).markdown).toBe("가  나\n");
  });

  it("링크", () => {
    const link = (text: string, href: string): PmNode => ({ type: "text", text, marks: [{ type: "link", attrs: { href } }] });
    expect(md(doc(p(link("예시", "https://example.com/a")))).markdown).toBe("[예시](https://example.com/a)\n");
    expect(md(doc(p(link("공백", "https://example.com/a b")))).markdown).toBe("[공백](<https://example.com/a b>)\n");
    const bold: PmNode = { type: "text", text: "굵은 링크", marks: [{ type: "bold" }, { type: "link", attrs: { href: "https://x.y" } }] };
    expect(md(doc(p(bold))).markdown).toBe("[**굵은 링크**](https://x.y)\n");
  });

  it("밑줄은 <u>로 내보내고 안내한다", () => {
    const r = md(doc(p(t("밑줄", "underline"))));
    expect(r.markdown).toBe("<u>밑줄</u>\n");
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0]).toContain("밑줄");
  });

  it("코드 안의 백틱은 더 긴 기호로 감싼다", () => {
    expect(md(doc(p(t("a`b", "code")))).markdown).toBe("``a`b``\n");
    expect(md(doc(p(t("`x`", "code")))).markdown).toBe("`` `x` ``\n");
  });

  it("줄바꿈", () => {
    expect(md(doc(p(t("가"), { type: "hardBreak" }, t("나")))).markdown).toBe("가\\\n나\n");
  });
});

describe("이스케이프", () => {
  it("Markdown 문법 문자를 막는다", () => {
    expect(escapeInline("a*b_c`d[e]f<g~h\\")).toBe("a\\*b\\_c\\`d\\[e\\]f\\<g\\~h\\\\");
  });

  it("줄 맨 앞의 블록 문법을 막는다", () => {
    expect(md(doc(p(t("# 제목 아님")))).markdown).toBe("\\# 제목 아님\n");
    expect(md(doc(p(t("- 목록 아님")))).markdown).toBe("\\- 목록 아님\n");
    expect(md(doc(p(t("> 인용 아님")))).markdown).toBe("\\> 인용 아님\n");
    expect(md(doc(p(t("1. 번호 아님")))).markdown).toBe("1\\. 번호 아님\n");
    expect(md(doc(p(t("2024년")))).markdown).toBe("2024년\n");
    expect(md(doc(p(t("가 # 중간")))).markdown).toBe("가 # 중간\n");
  });

  it("코드 블록 안은 이스케이프하지 않는다", () => {
    expect(md(doc({ type: "codeBlock", content: [t("a*b_c")] })).markdown).toBe("```\na*b_c\n```\n");
  });
});

describe("페이지 링크", () => {
  const link = (pageId: string): PmNode => ({ type: "pageLink", attrs: { pageId } });

  it("[[제목]]으로 내보낸다", () => {
    const r = md(doc(p(t("보라: "), link("a"))));
    expect(r.markdown).toBe("보라: [[프로젝트 A]]\n");
    expect(r.notices).toEqual([]);
  });

  it("블록 링크는 그 페이지로 가는 링크로 내보내고 안내한다", () => {
    const blockLink: PmNode = { type: "pageLink", attrs: { pageId: "a", blockId: "abc0000001" } };
    const r = md(doc(p(t("보라: "), blockLink)));
    expect(r.markdown).toBe("보라: [[프로젝트 A]]\n");
    expect(r.notices).toEqual(["블록 링크는 그 페이지로 가는 링크로 내보냈어요."]);
  });

  it("삭제됐거나 없는 페이지는 [[삭제된 페이지]]로 하고 안내한다", () => {
    const r = md(doc(p(link("gone"), t(" "), link("gone2"))));
    expect(r.markdown).toBe(`[[${MISSING_PAGE_TITLE}]] [[${MISSING_PAGE_TITLE}]]\n`);
    expect(r.notices).toEqual(["삭제됐거나 없는 페이지로 가는 링크 2개는 [[삭제된 페이지]]로 내보냈어요."]);
  });

  it("제목이 같은 서로 다른 페이지로 가는 링크가 있으면 구별 불가를 안내한다", () => {
    const r = md(doc(p(link("b"), t(" "), link("c"))));
    expect(r.markdown).toBe("[[회의록]] [[회의록]]\n");
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0]).toContain("회의록");
  });

  it("같은 페이지를 여러 번 링크한 것은 구별 불가가 아니다", () => {
    expect(md(doc(p(link("b"), t(" "), link("b")))).notices).toEqual([]);
  });

  it("빈 제목은 '제목 없음', 제목의 대괄호는 뺀다", () => {
    expect(md(doc(p(link("empty")))).markdown).toBe("[[제목 없음]]\n");
    expect(docToMarkdown(doc(p(link("x"))), { pageTitle: () => "배열[0] 정리" }).markdown).toBe("[[배열0 정리]]\n");
  });

  it("목록 안의 링크도 낸다", () => {
    const list: PmNode = { type: "bulletList", content: [{ type: "listItem", content: [p(link("a"))] }] };
    expect(md(doc(list)).markdown).toBe("- [[프로젝트 A]]\n");
  });
});

describe("페이지 블록", () => {
  const block = (pageId: string, mode?: string): PmNode => ({ type: "pageBlock", attrs: { pageId, ...(mode ? { mode } : {}) } });

  it("카드는 [[제목]] 한 줄, 임베드는 ![[제목]]로 내보낸다", () => {
    expect(md(doc(block("a", "card"))).markdown).toBe("[[프로젝트 A]]\n");
    expect(md(doc(block("a"))).markdown).toBe("[[프로젝트 A]]\n");
    expect(md(doc(block("a", "embed"))).markdown).toBe("![[프로젝트 A]]\n");
    expect(md(doc(p(t("앞")), block("a", "embed"), p(t("뒤")))).markdown).toBe("앞\n\n![[프로젝트 A]]\n\n뒤\n");
  });

  it("삭제됐거나 없는 페이지는 [[삭제된 페이지]]로 하고 안내한다(임베드는 ! 접두)", () => {
    const r = md(doc(block("gone", "embed")));
    expect(r.markdown).toBe(`![[${MISSING_PAGE_TITLE}]]\n`);
    expect(r.notices).toHaveLength(1);
  });
});

describe("각주", () => {
  const note = (text: string): PmNode => ({ type: "footnote", attrs: { text } });

  it("[^번호]로 쓰고 정의는 문서 끝에 번호 순서로 모은다", () => {
    const r = md(doc(p(t("가"), note("첫째 주석"), t(" 나")), p(t("다"), note("둘째 주석"))));
    expect(r.markdown).toBe("가[^1] 나\n\n다[^2]\n\n[^1]: 첫째 주석\n[^2]: 둘째 주석\n");
    expect(r.notices).toEqual([]);
  });

  it("줄바꿈이 있는 내용은 이어지는 줄을 네 칸 들여 쓴다", () => {
    expect(md(doc(p(t("가"), note("한 줄\n둘째 줄\n\n셋째")))).markdown).toBe("가[^1]\n\n[^1]: 한 줄\n    둘째 줄\n\n    셋째\n");
  });

  it("내용이 빈 각주는 내보내지 않고 번호도 건너뛰지 않는다", () => {
    expect(md(doc(p(t("가"), note("  "), t("나"), note("진짜")))).markdown).toBe("가나[^1]\n\n[^1]: 진짜\n");
  });

  it("각주가 없으면 예전과 같고, 본문이 비어도 각주 정의만 낸다", () => {
    expect(md(doc(p(t("글")))).markdown).toBe("글\n");
    expect(md(doc(p(note("혼자")))).markdown).toBe("[^1]\n\n[^1]: 혼자\n");
  });
});

describe("알 수 없는 노드", () => {
  it("블록은 안의 내용만, 인라인은 글자만 내보내고 안내한다", () => {
    const r = md(doc({ type: "mystery", content: [p(t("속"))] }, p({ type: "widget", content: [t("글")] })));
    expect(r.markdown).toBe("속\n\n글\n");
    expect(r.notices.some((n) => n.includes("mystery"))).toBe(true);
    expect(r.notices.some((n) => n.includes("widget"))).toBe(true);
  });
});

describe("defaultMarkdownFileName", () => {
  it("제목에 .md를 붙인다", () => {
    expect(defaultMarkdownFileName("프로젝트 A")).toBe("프로젝트 A.md");
  });

  it("파일 이름에 못 쓰는 문자와 끝의 점·공백을 정리한다", () => {
    expect(defaultMarkdownFileName('a/b:c*d?"e<f>g|h\\i')).toBe("a b c d e f g h i.md");
    expect(defaultMarkdownFileName("끝 점...")).toBe("끝 점.md");
  });

  it("빈 제목과 Windows 예약 이름", () => {
    expect(defaultMarkdownFileName("   ")).toBe("제목 없음.md");
    expect(defaultMarkdownFileName("con")).toBe("con_.md");
    expect(defaultMarkdownFileName("NUL")).toBe("NUL_.md");
  });

  it("너무 긴 제목은 줄인다", () => {
    expect(defaultMarkdownFileName("가".repeat(200)).length).toBeLessThanOrEqual(83);
  });
});

describe("동기화 블록", () => {
  const synced = (pageId: string): PmNode => ({ type: "pageBlock", attrs: { pageId, mode: "synced" } });
  const content = new Map<string, PmNode[]>([["s1", [p(t("공통 문단")), { type: "bulletList", content: [{ type: "listItem", content: [p(t("항목"))] }] }]]]);
  const withContent = (root: PmNode) => docToMarkdown(root, { pageTitle: () => null, syncedContent: (id) => content.get(id) ?? null });

  it("내용을 그 자리에 복사해 내보내고 동기화가 끊긴다고 안내한다", () => {
    const r = withContent(doc(p(t("앞")), synced("s1"), p(t("뒤"))));
    expect(r.markdown).toBe("앞\n\n공통 문단\n\n- 항목\n\n뒤\n");
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0]).toContain("동기화");
  });

  it("같은 블록을 두 번 끼워도 두 번 복사하고 안내는 한 번이다", () => {
    const r = withContent(doc(synced("s1"), synced("s1")));
    expect(r.markdown.match(/공통 문단/g)).toHaveLength(2);
    expect(r.notices).toHaveLength(1);
  });

  it("내용을 모르면 그 블록을 빼고 안내한다", () => {
    const r = withContent(doc(p(t("앞")), synced("none")));
    expect(r.markdown).toBe("앞\n");
    expect(r.notices[0]).toContain("가져오지 못해");
    // 옵션을 주지 않아도 같다
    expect(docToMarkdown(doc(synced("s1")), { pageTitle: () => null }).markdown).toBe("");
  });

  it("내용이 비어 있는 동기화 블록은 아무것도 내보내지 않는다", () => {
    const r = docToMarkdown(doc(p(t("앞")), synced("e")), { pageTitle: () => null, syncedContent: () => [p()] });
    expect(r.markdown).toBe("앞\n");
  });
});

describe("표와 토글", () => {
  const cell = (text: string, type: "tableCell" | "tableHeader" = "tableCell", attrs: Record<string, unknown> = {}): PmNode => ({
    type,
    attrs,
    content: [p(t(text))],
  });
  const row = (...cells: PmNode[]): PmNode => ({ type: "tableRow", content: cells });
  const table = (...rows: PmNode[]): PmNode => ({ type: "table", content: rows });

  it("머리글 행이 있는 표는 GFM 표가 된다", () => {
    const r = md(doc(table(row(cell("이름", "tableHeader"), cell("값", "tableHeader")), row(cell("가"), cell("1")), row(cell("나"), cell("2")))));
    expect(r.markdown).toBe("| 이름 | 값 |\n| --- | --- |\n| 가 | 1 |\n| 나 | 2 |\n");
    expect(r.notices).toEqual([]);
  });

  it("머리글이 없으면 첫 줄을 머리글로 쓰고 안내한다", () => {
    const r = md(doc(table(row(cell("a"), cell("b")), row(cell("c"), cell("d")))));
    expect(r.markdown).toBe("| a | b |\n| --- | --- |\n| c | d |\n");
    expect(r.notices).toContain("머리글 행이 없는 표는 첫 줄을 머리글로 내보냈어요.");
  });

  it("병합된 셀은 풀어서(남는 칸은 빈 칸) 내보내고 안내한다", () => {
    const r = md(
      doc(
        table(
          row(cell("제목", "tableHeader", { colspan: 2 }), cell("끝", "tableHeader")),
          row(cell("세로", "tableCell", { rowspan: 2 }), cell("x"), cell("y")),
          row(cell("z"), cell("w")),
        ),
      ),
    );
    expect(r.markdown).toBe("| 제목 |  | 끝 |\n| --- | --- | --- |\n| 세로 | x | y |\n|  | z | w |\n");
    expect(r.notices).toContain("병합된 표 셀은 풀어서 내보냈어요(Markdown 표는 셀 병합을 표현하지 못해요).");
  });

  it("셀 안의 세로선은 이스케이프하고 여러 문단은 <br>로 잇는다", () => {
    const two: PmNode = { type: "tableCell", content: [p(t("위")), p(t("a|b"))] };
    const r = md(doc(table(row(cell("h", "tableHeader")), row(two))));
    expect(r.markdown).toBe("| h |\n| --- |\n| 위<br>a\\|b |\n");
  });

  it("내용이 없는 표는 내보내지 않는다", () => {
    expect(md(doc(table())).markdown).toBe("");
  });

  it("토글은 <details>로, 제목 줄은 <summary>로 내보낸다", () => {
    const toggle: PmNode = { type: "toggle", content: [p(t("자주 묻는 질문")), p(t("답변 하나")), p(t("답변 둘"))] };
    expect(md(doc(toggle)).markdown).toBe("<details>\n<summary>자주 묻는 질문</summary>\n\n답변 하나\n\n답변 둘\n\n</details>\n");
  });

  it("내용 없는 토글은 제목만, 둘 다 비면 내보내지 않는다", () => {
    expect(md(doc({ type: "toggle", content: [p(t("제목만"))] })).markdown).toBe("<details>\n<summary>제목만</summary>\n</details>\n");
    expect(md(doc({ type: "toggle", content: [p()] })).markdown).toBe("");
  });

  it("토글 안의 다른 블록도 내보낸다", () => {
    const toggle: PmNode = {
      type: "toggle",
      content: [p(t("제목")), { type: "bulletList", content: [{ type: "listItem", content: [p(t("항목"))] }] }],
    };
    expect(md(doc(toggle)).markdown).toBe("<details>\n<summary>제목</summary>\n\n- 항목\n\n</details>\n");
  });
});

describe("hardBreakStyle", () => {
  const p = (...content: PmNode[]): PmNode => ({ type: "doc", content: [{ type: "paragraph", content }] });
  const t = (text: string): PmNode => ({ type: "text", text });
  const br: PmNode = { type: "hardBreak" };
  const out = (doc: PmNode, hardBreakStyle?: "backslash" | "newline") => docToMarkdown(doc, { pageTitle: () => null, ...(hardBreakStyle ? { hardBreakStyle } : {}) }).markdown;

  it("기본은 백슬래시, newline은 그냥 줄바꿈", () => {
    expect(out(p(t("가"), br, t("나")))).toBe("가\\\n나\n");
    expect(out(p(t("가"), br, t("나")), "newline")).toBe("가\n나\n");
  });

  it("문단 처음·끝·연속한 줄바꿈은 백슬래시로 (문단이 쪼개지지 않게)", () => {
    expect(out(p(t("가"), br, br, t("나")), "newline")).toBe("가\\\n\\\n나\n");
    expect(out(p(t("가"), br), "newline")).toBe("가\\\n\n");
  });

  it("일반 글(줄바꿈이 든 문자열)이 열었다 내보내면 그대로다", async () => {
    const { markdownToDoc } = await import("./markdownImport.ts");
    const text = "첫 줄\n둘째 줄\n셋째 줄\n";
    const doc = markdownToDoc(text, { resolvePage: () => null, resolveImage: () => null }, "").doc;
    expect(out(doc, "newline")).toBe(text);
  });
});

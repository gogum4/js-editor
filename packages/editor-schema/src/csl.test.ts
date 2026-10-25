import { describe, expect, it } from "vitest";

import { cslEntry, cslLabel, cslLabelForKeys, cslYear, orderedCitedKeys, parseCslJson } from "./csl";

const smith = {
  id: "smith2020",
  title: "Deep learning for notes.",
  author: [{ family: "Smith", given: "John Adam" }, { family: "Lee", given: "K." }],
  issued: { "date-parts": [[2020, 3]] },
  "container-title": "Journal of Notes",
  volume: 12,
  issue: "3",
  page: "45-67",
  DOI: "10.1000/xyz",
};

describe("parseCslJson", () => {
  it("배열과 { items } 둘 다 읽고 모양이 틀린 항목은 건너뛴다", () => {
    expect([...parseCslJson(JSON.stringify([smith, null, { title: "no id" }, { id: 7 }]))!.keys()]).toEqual(["smith2020", "7"]);
    expect(parseCslJson(JSON.stringify({ items: [smith] }))!.has("smith2020")).toBe(true);
  });

  it("읽을 수 없으면 null", () => {
    expect(parseCslJson("not json")).toBeNull();
    expect(parseCslJson('{"a":1}')).toBeNull();
  });
});

describe("인용 글", () => {
  it("괄호형과 서술형, 저자 수에 따른 표기", () => {
    expect(cslLabel(smith, false)).toBe("Smith & Lee 2020");
    expect(cslLabel(smith, true)).toBe("Smith & Lee (2020)");
    expect(cslLabel({ id: "x", author: [{ family: "A" }, { family: "B" }, { family: "C" }], issued: { raw: "c. 1999" } }, false)).toBe("A et al. 1999");
    expect(cslLabel({ id: "y", title: "Untitled" }, true)).toBe("Untitled (n.d.)");
    expect(cslYear({ id: "z", issued: { "date-parts": [["bad"]] } })).toBeNull();
  });

  it("여러 키는 잇고, 모르는 키가 있으면 null", () => {
    const lookup = (key: string) => (key === "smith2020" ? smith : key === "b" ? { id: "b", author: [{ family: "Kim" }], issued: { "date-parts": [[2019]] } } : undefined);
    expect(cslLabelForKeys(lookup, ["smith2020", "b"])).toBe("Smith & Lee 2020; Kim 2019");
    expect(cslLabelForKeys(lookup, ["smith2020", "b"], true)).toBe("Smith & Lee (2020), Kim (2019)");
    expect(cslLabelForKeys(lookup, ["smith2020", "nope"])).toBeNull();
    expect(cslLabelForKeys(lookup, [])).toBeNull();
  });
});

describe("cslEntry", () => {
  it("저자·연도·제목·출처·DOI를 APA 모양으로", () => {
    expect(cslEntry(smith)).toBe("Smith, J. A., & Lee, K. (2020). Deep learning for notes. Journal of Notes, 12(3), 45–67. https://doi.org/10.1000/xyz");
  });

  it("출처가 없으면 발행처와 주소", () => {
    expect(cslEntry({ id: "b", title: "Book", publisher: "Press", author: [{ literal: "WHO" }], issued: { "date-parts": [[2001]] }, URL: "https://x.org" })).toBe("WHO. (2001). Book. Press. https://x.org");
  });
});

describe("orderedCitedKeys", () => {
  it("처음 나온 순서로 중복 없이", () => {
    const keysOf = (s: string) => s.split(",");
    expect(orderedCitedKeys(["b,a", "a,c", "b"], keysOf)).toEqual(["b", "a", "c"]);
  });
});

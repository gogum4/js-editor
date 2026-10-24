import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { createCoreExtensions } from "./coreExtensions";

/**
 * 저장 호환 가드(docs/RELEASING.md): 패키지가 만들 수 있는 **모든 노드·마크·속성**(옵션을 전부 켠 스키마)을 `schema-snapshot.json`에 고정한다.
 * 저장된 본문(ProseMirror JSON)을 읽는 쪽이 있으므로 이 모양이 바뀌면 소비자에게 영향이 있다:
 *  - 노드·마크·속성이 **사라지거나 바뀌면** → 호환이 깨진다 → **major** changeset.
 *  - **더해지기만** 하면 → **minor**(소비자가 켜기 전에는 영향 없음). 본문을 저장하는 소비자는 켤 때 자기 스키마 버전을 올린다.
 * 의도한 변경이면 `UPDATE_SCHEMA_SNAPSHOT=1 pnpm vitest run packages/editor-core/src/schemaCompat.test.ts`로 갱신하고 changeset을 더한다.
 */
const SNAPSHOT = fileURLToPath(new URL("../schema-snapshot.json", import.meta.url));

type Attrs = Record<string, unknown>;
interface Shape {
  nodes: Record<string, { content: string | null; group: string | null; inline: boolean; atom: boolean; attrs: Attrs }>;
  marks: Record<string, { attrs: Attrs }>;
}

function currentShape(): Shape {
  const schema = getSchema(createCoreExtensions(null, { raw: true, reference: true, embed: true, indent: true }));
  const attrsOf = (attrs: Record<string, { hasDefault: boolean; default?: unknown }> | undefined): Attrs =>
    Object.fromEntries(
      Object.entries(attrs ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, spec]) => [name, spec.hasDefault ? (spec.default ?? null) : "(필수)"]),
    );
  return {
    nodes: Object.fromEntries(
      Object.entries(schema.nodes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, type]) => [name, { content: type.spec.content ?? null, group: type.spec.group ?? null, inline: type.isInline, atom: type.isAtom, attrs: attrsOf(type.spec.attrs as never) }]),
    ),
    marks: Object.fromEntries(
      Object.entries(schema.marks)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, type]) => [name, { attrs: attrsOf(type.spec.attrs as never) }]),
    ),
  };
}

/** 이전 모양에서 사라지거나 바뀐 것(깨지는 변경)과 새로 생긴 것(더해진 것)을 나눈다. */
export function classify(previous: Shape, current: Shape): { breaking: string[]; added: string[] } {
  const breaking: string[] = [];
  const added: string[] = [];
  for (const kind of ["nodes", "marks"] as const) {
    const before = previous[kind] as Record<string, Record<string, unknown>>;
    const after = current[kind] as Record<string, Record<string, unknown>>;
    for (const name of Object.keys(before)) {
      if (!(name in after)) {
        breaking.push(`${kind} ${name}: 사라짐`);
        continue;
      }
      for (const field of Object.keys(before[name]!)) {
        if (field === "attrs") {
          const b = before[name]!.attrs as Attrs;
          const a = after[name]!.attrs as Attrs;
          for (const attr of Object.keys(b)) {
            if (!(attr in a)) breaking.push(`${kind} ${name}.${attr}: 속성이 사라짐`);
            else if (JSON.stringify(a[attr]) !== JSON.stringify(b[attr])) breaking.push(`${kind} ${name}.${attr}: 기본값이 ${JSON.stringify(b[attr])} → ${JSON.stringify(a[attr])}`);
          }
          for (const attr of Object.keys(a)) if (!(attr in b)) added.push(`${kind} ${name}.${attr}: 속성이 생김`);
        } else if (JSON.stringify(after[name]![field]) !== JSON.stringify(before[name]![field])) {
          breaking.push(`${kind} ${name}.${field}: ${JSON.stringify(before[name]![field])} → ${JSON.stringify(after[name]![field])}`);
        }
      }
    }
    for (const name of Object.keys(after)) if (!(name in before)) added.push(`${kind} ${name}: 새로 생김`);
  }
  return { breaking, added };
}

describe("스키마 호환 가드", () => {
  it("분류: 사라짐·바뀜은 깨지는 변경, 생김은 더해진 것", () => {
    const base: Shape = { nodes: { a: { content: "text*", group: "block", inline: false, atom: false, attrs: { x: 1 } } }, marks: {} };
    expect(classify(base, base)).toEqual({ breaking: [], added: [] });
    const grown: Shape = { nodes: { a: { ...base.nodes.a!, attrs: { x: 1, y: 2 } }, b: { content: null, group: "block", inline: false, atom: true, attrs: {} } }, marks: {} };
    expect(classify(base, grown)).toEqual({ breaking: [], added: ["nodes a.y: 속성이 생김", "nodes b: 새로 생김"] });
    const broken: Shape = { nodes: { a: { ...base.nodes.a!, content: "block+", attrs: {} } }, marks: {} };
    expect(classify(base, broken).breaking).toEqual(['nodes a.content: "text*" → "block+"', "nodes a.x: 속성이 사라짐"]);
    expect(classify(base, { nodes: {}, marks: {} }).breaking).toEqual(["nodes a: 사라짐"]);
  });

  it("옵션을 전부 켠 스키마가 schema-snapshot.json과 같다", () => {
    const current = currentShape();
    if (process.env.UPDATE_SCHEMA_SNAPSHOT === "1") {
      writeFileSync(SNAPSHOT, JSON.stringify(current, null, 2) + "\n");
      return;
    }
    const previous = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as Shape;
    const { breaking, added } = classify(previous, current);
    const message = [
      breaking.length ? `깨지는 변경(major changeset 필요, 정말 의도했는지 확인):\n  ${breaking.join("\n  ")}` : "",
      added.length ? `더해진 것(minor changeset, 스냅샷 갱신):\n  ${added.join("\n  ")}` : "",
      "의도한 변경이면 UPDATE_SCHEMA_SNAPSHOT=1 로 이 시험을 한 번 돌려 스냅샷을 갱신하고 changeset을 더한다(docs/RELEASING.md).",
    ]
      .filter(Boolean)
      .join("\n");
    expect({ breaking, added }, message).toEqual({ breaking: [], added: [] });
    expect(current).toEqual(previous);
  });
});

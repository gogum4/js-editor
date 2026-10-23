import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { parseFrontmatter } from "@9um4-utils/editor-markdown";

const CONTENT_DIR = path.join(process.cwd(), "content");

export interface PostMeta {
  slug: string;
  title: string;
  date: string;
  summary: string;
}

/** `content/*.md`의 파일 이름(확장자 제외)이 주소(slug)다. */
export async function listPosts(): Promise<PostMeta[]> {
  const files = (await readdir(CONTENT_DIR)).filter((name) => name.endsWith(".md"));
  const posts = await Promise.all(
    files.map(async (file) => {
      const slug = file.replace(/\.md$/, "");
      const { data } = parseFrontmatter(await readFile(path.join(CONTENT_DIR, file), "utf8"));
      const text = (key: string) => (typeof data[key] === "string" ? (data[key] as string) : "");
      return { slug, title: text("title") || slug, date: text("date"), summary: text("summary") };
    }),
  );
  return posts.sort((a, b) => b.date.localeCompare(a.date));
}

export async function readPost(slug: string): Promise<string | null> {
  try {
    return await readFile(path.join(CONTENT_DIR, `${slug}.md`), "utf8");
  } catch {
    return null;
  }
}

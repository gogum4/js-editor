import { renderMarkdown } from "@9um4/editor-render";
import Link from "next/link";
import { notFound } from "next/navigation";

import { listPosts, readPost } from "@/lib/posts";

// 모든 글을 빌드 때 정적으로 만든다. 목록에 없는 주소는 404.
export const dynamicParams = false;

export async function generateStaticParams() {
  return (await listPosts()).map((post) => ({ slug: post.slug }));
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const source = await readPost(slug);
  if (source === null) notFound();

  const posts = await listPosts();
  // 위키 링크 `[[이름]]`은 제목이나 파일 이름이 같은 글로 잇는다.
  const bySlug = new Map(posts.map((post) => [post.slug, post]));
  const byName = new Map(posts.flatMap((post) => [[post.title, post.slug], [post.slug, post.slug]] as const));

  const { element, frontmatter, headings } = await renderMarkdown(source, {
    resolvePage: (name) => byName.get(name.trim()) ?? null,
    pageLink: (id) => {
      const post = bySlug.get(id);
      return post ? { href: `/posts/${post.slug}`, title: post.title } : null;
    },
  });

  return (
    <article>
      <p>
        <Link href="/">← 목록</Link>
      </p>
      <h1>{String(frontmatter.title ?? slug)}</h1>
      <p className="meta">{String(frontmatter.date ?? "")}</p>
      {headings.length > 1 && (
        <nav className="toc" aria-label="목차">
          <ol>
            {headings.map((heading) => (
              <li key={heading.id} style={{ marginLeft: `${(heading.level - 1) * 0.8}rem` }}>
                <a href={`#${heading.id}`}>{heading.text}</a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      {element}
    </article>
  );
}

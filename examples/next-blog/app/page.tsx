import Link from "next/link";

import { listPosts } from "@/lib/posts";

export default async function Home() {
  const posts = await listPosts();
  return (
    <>
      <h1>블로그 샘플</h1>
      <ul className="post-list">
        {posts.map((post) => (
          <li key={post.slug}>
            <Link href={`/posts/${post.slug}`}>{post.title}</Link>
            <div className="meta">{post.date}</div>
            <div>{post.summary}</div>
          </li>
        ))}
      </ul>
    </>
  );
}

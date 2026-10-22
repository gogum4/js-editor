---
title: "수식과 코드"
date: 2026-10-22
summary: "KaTeX 수식과 코드 구문 강조는 서버에서 만들어집니다"
---

# 수식과 코드

인라인 수식 $E = mc^2$ 와 블록 수식:

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

## 코드

```ts
interface Post {
  slug: string;
  title: string;
}

export const first = (posts: Post[]): Post | undefined => posts[0];
```

```python
def fib(n: int) -> int:
    return n if n < 2 else fib(n - 1) + fib(n - 2)
```

돌아가기: [[안녕하세요]]

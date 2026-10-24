import { describe, expect, it } from "vitest";

import { detectEmbed, EMBED_DEFAULT_SIZE, EMBED_PROVIDERS, embedSource, isEmbedProvider, normalizeEmbedSize, normalizeEmbedTarget } from "./embed.ts";

describe("detectEmbed", () => {
  it("YouTube: 여러 주소 모양을 한 주소로 정규화한다", () => {
    const want = { provider: "youtube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" };
    for (const input of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ?si=abc",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      "  https://youtu.be/dQw4w9WgXcQ  ",
    ]) {
      expect(detectEmbed(input)).toEqual(want);
    }
  });

  it("X(트위터): twitter.com과 x.com 모두 x.com으로", () => {
    const want = { provider: "x", url: "https://x.com/jack/status/20" };
    expect(detectEmbed("https://twitter.com/jack/status/20")).toEqual(want);
    expect(detectEmbed("https://x.com/jack/status/20?s=46")).toEqual(want);
    expect(detectEmbed("https://mobile.twitter.com/jack/status/20")).toEqual(want);
  });

  it("Instagram·Pinterest·SoundCloud", () => {
    expect(detectEmbed("https://www.instagram.com/p/Cabc_123/?igsh=x")).toEqual({ provider: "instagram", url: "https://www.instagram.com/p/Cabc_123/" });
    expect(detectEmbed("https://instagram.com/reel/Cabc_123")).toEqual({ provider: "instagram", url: "https://www.instagram.com/reel/Cabc_123/" });
    expect(detectEmbed("https://www.pinterest.co.kr/pin/123456789/")).toEqual({ provider: "pinterest", url: "https://www.pinterest.com/pin/123456789/" });
    expect(detectEmbed("https://soundcloud.com/artist/track-name?si=1")).toEqual({ provider: "soundcloud", url: "https://soundcloud.com/artist/track-name" });
  });

  it("지원하지 않는 주소·위험한 주소는 null이다", () => {
    for (const input of [
      "",
      "not a url",
      "https://example.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
      "https://evil.com/youtube.com/watch?v=dQw4w9WgXcQ",
      "javascript:alert(1)",
      "data:text/html,<script>1</script>",
      "ftp://youtu.be/dQw4w9WgXcQ",
      "https://user:pw@youtu.be/dQw4w9WgXcQ",
      "https://youtu.be:8080/dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/channel/abc",
      "https://x.com/jack",
      "https://x.com/jack/status/abc",
      "https://soundcloud.com/discover/track",
      "https://soundcloud.com/artist",
      "https://www.pinterest.com/user/board/",
    ]) {
      expect(detectEmbed(input), input).toBeNull();
    }
  });
});

describe("normalizeEmbedTarget", () => {
  it("공급자는 주소로 다시 정하고, 저장된 공급자와 다르면 거절한다", () => {
    expect(normalizeEmbedTarget("youtube", "https://youtu.be/dQw4w9WgXcQ")).toEqual({ provider: "youtube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(normalizeEmbedTarget(undefined, "https://youtu.be/dQw4w9WgXcQ")?.provider).toBe("youtube");
    expect(normalizeEmbedTarget("x", "https://youtu.be/dQw4w9WgXcQ")).toBeNull();
    expect(normalizeEmbedTarget("youtube", 42)).toBeNull();
  });
});

describe("embedSource (허용한 도메인의 iframe 주소만)", () => {
  it("공급자마다 정해진 도메인으로 만든다", () => {
    const src = (url: string) => {
      const target = detectEmbed(url);
      return target === null ? null : embedSource(target);
    };
    expect(src("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(src("https://x.com/jack/status/20")).toBe("https://platform.twitter.com/embed/Tweet.html?id=20");
    expect(src("https://www.instagram.com/p/Cabc_123/")).toBe("https://www.instagram.com/p/Cabc_123/embed/captioned/");
    expect(src("https://www.pinterest.com/pin/123/")).toBe("https://assets.pinterest.com/ext/embed.html?id=123");
    expect(src("https://soundcloud.com/artist/track")).toBe("https://w.soundcloud.com/player/?url=" + encodeURIComponent("https://soundcloud.com/artist/track"));
  });

  it("올바르지 않은 대상이나 공급자가 어긋난 대상은 null이다", () => {
    expect(embedSource({ provider: "youtube", url: "https://evil.com/x" })).toBeNull();
    expect(embedSource({ provider: "x", url: "https://youtu.be/dQw4w9WgXcQ" })).toBeNull();
  });
});

describe("공급자 표와 크기", () => {
  it("모든 공급자에 기본 크기가 있다", () => {
    for (const provider of EMBED_PROVIDERS) expect(EMBED_DEFAULT_SIZE[provider].width).toBeGreaterThan(0);
    expect(isEmbedProvider("youtube")).toBe(true);
    expect(isEmbedProvider("vimeo")).toBe(false);
  });

  it("크기는 100~2000의 정수만, 글자 숫자도 받는다", () => {
    expect(normalizeEmbedSize(500)).toBe(500);
    expect(normalizeEmbedSize("500")).toBe(500);
    for (const bad of [99, 2001, 1.5, "abc", "", null, undefined, -5, "12345"]) expect(normalizeEmbedSize(bad), String(bad)).toBeNull();
  });
});

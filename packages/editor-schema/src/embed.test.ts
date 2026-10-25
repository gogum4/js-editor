import { describe, expect, it } from "vitest";

import { blueskyProfile, detectEmbed, EMBED_DEFAULT_SIZE, EMBED_PROVIDERS, embedSource, isEmbedProvider, normalizeEmbedSize, normalizeEmbedTarget, withBlueskyDid } from "./embed.ts";

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

describe("Bluesky", () => {
  const did = "did:plc:z72i7hdynmk6r22z27h6tvur";

  it("핸들·DID 주소를 알아보고 핸들은 소문자로 정규화한다", () => {
    expect(detectEmbed("https://bsky.app/profile/Alice.Bsky.Social/post/3kabc123xyz?x=1")).toEqual({ provider: "bluesky", url: "https://bsky.app/profile/alice.bsky.social/post/3kabc123xyz" });
    expect(detectEmbed(`https://bsky.app/profile/${did}/post/3kabc123xyz`)).toEqual({ provider: "bluesky", url: `https://bsky.app/profile/${did}/post/3kabc123xyz` });
  });

  it("DID 주소만 iframe 주소가 되고, 핸들 주소는 null이다 (embed.bsky.app이 DID만 받는다)", () => {
    expect(embedSource(detectEmbed(`https://bsky.app/profile/${did}/post/3kabc123xyz`)!)).toBe(`https://embed.bsky.app/embed/${did}/app.bsky.feed.post/3kabc123xyz?id=3kabc123xyz`);
    expect(embedSource(detectEmbed("https://bsky.app/profile/alice.bsky.social/post/3kabc123xyz")!)).toBeNull();
  });

  it("withBlueskyDid: 핸들 주소를 DID 주소로 바꾼다 (올바른 DID만)", () => {
    const handle = detectEmbed("https://bsky.app/profile/alice.bsky.social/post/3kabc123xyz")!;
    expect(blueskyProfile(handle)).toEqual({ profile: "alice.bsky.social", rkey: "3kabc123xyz", isDid: false });
    const next = withBlueskyDid(handle, did)!;
    expect(embedSource(next)).toContain(`/embed/${did}/app.bsky.feed.post/3kabc123xyz`);
    expect(withBlueskyDid(handle, "not-a-did")).toBeNull();
    expect(withBlueskyDid(detectEmbed("https://youtu.be/dQw4w9WgXcQ")!, did)).toBeNull();
  });

  it("다른 모양은 거절한다", () => {
    for (const input of ["https://bsky.app/profile/alice/post/3k", "https://bsky.app/profile/alice.bsky.social", "https://bsky.app/profile/alice.bsky.social/feed/3k", "https://bsky.app.evil.com/profile/alice.bsky.social/post/3k", "https://bsky.app/profile/a b.social/post/3k", "https://bsky.app/profile/alice.bsky.social/post/3k\"x"]) {
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

describe("적대적 입력 (보안)", () => {
  it("주소 속임수는 모두 거절한다", () => {
    for (const input of [
      "https://youtube.com@evil.com/watch?v=dQw4w9WgXcQ",
      "https://evil.com/?u=https://youtu.be/dQw4w9WgXcQ",
      "https://evil.com#https://youtu.be/dQw4w9WgXcQ",
      "https://youtu.be.evil.com/dQw4w9WgXcQ",
      "https://xn--youtu-be-zzc.com/dQw4w9WgXcQ",
      `https://youtu.be/dQw4w9WgXcQ"><script>alert(1)</script>`,
      "https://youtu.be/dQw4w9WgXcQ%22%3E",
      "https://youtu.be/dQw4w9WgXc\nQ",
      "https://x.com/jack/status/20\"onload=\"1",
      "https://www.instagram.com/p/abc_def/../../evil",
      "https://soundcloud.com/a/b c",
      "//youtu.be/dQw4w9WgXcQ",
      "youtu.be/dQw4w9WgXcQ",
    ]) {
      const target = detectEmbed(input);
      // 거절하거나, 받더라도 정규화한 주소에 적대적인 글자가 남지 않아야 한다.
      if (target !== null) expect(target.url, input).toMatch(/^https:\/\/[A-Za-z0-9./_?=&%:-]+$/);
    }
    expect(detectEmbed("https://youtube.com@evil.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(detectEmbed("https://evil.com/?u=https://youtu.be/dQw4w9WgXcQ")).toBeNull();
    expect(detectEmbed("https://youtu.be.evil.com/dQw4w9WgXcQ")).toBeNull();
    expect(detectEmbed(`https://youtu.be/dQw4w9WgXcQ"><script>`)).toBeNull();
  });

  it("무작위 입력 3만 개: 받아들이면 iframe 주소는 허용한 출처이고 따옴표·공백·꺾쇠가 없다", () => {
    let seed = 7;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const pieces = ["https://", "http://", "youtu.be/", "www.youtube.com/watch?v=", "x.com/", "twitter.com/", "/status/", "instagram.com/p/", "pinterest.com/pin/", "soundcloud.com/", "dQw4w9WgXcQ", "abc", "20", "\"", "'", "<", ">", " ", "\n", "%22", "@", ":", "#", "?", "&", "../", "evil.com/", "‮", "у", "..", "//"];
    const allowed = [/^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}$/, /^https:\/\/platform\.twitter\.com\/embed\/Tweet\.html\?id=\d+$/, /^https:\/\/www\.instagram\.com\/(p|reel)\/[A-Za-z0-9_-]+\/embed\/captioned\/$/, /^https:\/\/assets\.pinterest\.com\/ext\/embed\.html\?id=\d+$/, /^https:\/\/w\.soundcloud\.com\/player\/\?url=[A-Za-z0-9%._~-]+$/, /^https:\/\/embed\.bsky\.app\/embed\/did:(plc|web):[A-Za-z0-9._:%-]+\/app\.bsky\.feed\.post\/[A-Za-z0-9._~-]+\?id=[A-Za-z0-9._~-]+$/];
    let accepted = 0;
    for (let i = 0; i < 30000; i++) {
      const input = Array.from({ length: 1 + Math.floor(next() * 8) }, () => pieces[Math.floor(next() * pieces.length)]).join("");
      const target = detectEmbed(input);
      if (target === null) continue;
      accepted++;
      const src = embedSource(target);
      expect(src, input).not.toBeNull();
      expect(allowed.some((re) => re.test(src!)), `${input} → ${src}`).toBe(true);
    }
    expect(accepted).toBeGreaterThan(0);
  });
});

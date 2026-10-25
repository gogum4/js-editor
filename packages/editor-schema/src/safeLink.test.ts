import { describe, expect, it } from "vitest";

import { isSafeToOpen, wantsToOpenLink } from "./safeLink.ts";

describe("isSafeToOpen", () => {
  it("allows web and mail addresses", () => {
    expect(isSafeToOpen("https://example.com/path?q=한글")).toBe(true);
    expect(isSafeToOpen("zotero://select/library/items/ABCD1234")).toBe(true);
    expect(isSafeToOpen("http://localhost:3000")).toBe(true);
    expect(isSafeToOpen("mailto:someone@example.com")).toBe(true);
    expect(isSafeToOpen("  https://example.com  ")).toBe(true);
  });

  it("refuses scripts, local files and other protocols", () => {
    expect(isSafeToOpen("javascript:alert(1)")).toBe(false);
    expect(isSafeToOpen("JavaScript:alert(1)")).toBe(false);
    expect(isSafeToOpen("file:///C:/Windows/System32/cmd.exe")).toBe(false);
    expect(isSafeToOpen("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeToOpen("ftp://example.com/file")).toBe(false);
    expect(isSafeToOpen("tel:+821012345678")).toBe(false);
  });

  it("refuses relative paths, broken and empty addresses", () => {
    expect(isSafeToOpen("/just/a/path")).toBe(false);
    expect(isSafeToOpen("example.com")).toBe(false);
    expect(isSafeToOpen("not a url")).toBe(false);
    expect(isSafeToOpen("")).toBe(false);
    expect(isSafeToOpen(null)).toBe(false);
    expect(isSafeToOpen(undefined)).toBe(false);
  });
});

describe("wantsToOpenLink", () => {
  it("opens only on a Ctrl or Cmd left click", () => {
    expect(wantsToOpenLink({ button: 0, ctrlKey: true, metaKey: false })).toBe(true);
    expect(wantsToOpenLink({ button: 0, ctrlKey: false, metaKey: true })).toBe(true);
    expect(wantsToOpenLink({ button: 0, ctrlKey: false, metaKey: false })).toBe(false);
    expect(wantsToOpenLink({ button: 2, ctrlKey: true, metaKey: false })).toBe(false);
    expect(wantsToOpenLink({ button: 1, ctrlKey: true, metaKey: false })).toBe(false);
  });
});

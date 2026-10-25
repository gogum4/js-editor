import type { AnyExtension } from "@tiptap/core";

import type { ExtraSyntax } from "@gogum4/editor-schema/extras";
import { DefinitionDetail, DefinitionList, DefinitionTerm, Toc } from "./blockNodes";
import { Citation, Comment, EmojiShortcodes, Tag } from "./inlineNodes";
import { Abbr, BackgroundColor, Highlight, Insert, Subscript, Superscript, TextColor } from "./marks";

/** 켠 추가 문법에 맞는 확장들. 하나도 켜지 않으면 빈 배열이라 스키마가 달라지지 않는다. */
export function extraExtensions(extras: ExtraSyntax | undefined): AnyExtension[] {
  if (!extras) return [];
  return [
    ...(extras.marks ? [Highlight, Superscript, Subscript, Insert, TextColor, BackgroundColor] : []),
    ...(extras.abbr ? [Abbr] : []),
    ...(extras.comments ? [Comment] : []),
    ...(extras.tags ? [Tag.configure({ skipHexColors: typeof extras.tags === "object" && extras.tags.skipHexColors === true })] : []),
    ...(extras.citations ? [Citation] : []),
    ...(extras.definitions ? [DefinitionList, DefinitionTerm, DefinitionDetail] : []),
    ...(extras.toc ? [Toc] : []),
    ...(extras.emoji ? [EmojiShortcodes] : []),
  ];
}

export { Abbr, BackgroundColor, Citation, Comment, DefinitionDetail, DefinitionList, DefinitionTerm, EmojiShortcodes, Highlight, Insert, Subscript, Superscript, Tag, TextColor, Toc };

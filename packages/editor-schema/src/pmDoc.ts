/** 본문(ProseMirror JSON)의 모양. 에디터 없이 문서를 다루는 순수 코드가 함께 쓴다. */

export interface PmMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface PmNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  marks?: PmMark[];
  text?: string;
}

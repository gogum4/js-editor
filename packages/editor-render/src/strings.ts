import type { CalloutType } from "@gogum4/editor-schema/callout";

/** 렌더링 결과에 들어가는 글(콜아웃 이름, 각주 제목 등). 기본은 한국어이고 영어도 있다. */
export interface RenderStrings {
  footnotes: string;
  /** 각주 끝의 "본문으로 돌아가기" 링크의 접근성 이름. */
  backToReference: string;
  callout: Readonly<Record<CalloutType, string>>;
  /** 이미지를 불러올 주소가 없을 때 대신 보이는 글의 접근성 이름. */
  imageMissing: string;
}

export const koRenderStrings: RenderStrings = {
  footnotes: "각주",
  backToReference: "본문으로 돌아가기",
  callout: { note: "정보", tip: "팁", important: "중요", warning: "경고", caution: "주의" },
  imageMissing: "이미지를 표시할 수 없어요",
};

export const enRenderStrings: RenderStrings = {
  footnotes: "Footnotes",
  backToReference: "Back to reference",
  callout: { note: "Note", tip: "Tip", important: "Important", warning: "Warning", caution: "Caution" },
  imageMissing: "Image unavailable",
};

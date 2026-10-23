import type { NextConfig } from "next";

const config: NextConfig = {
  // 이 저장소 안에서는 워크스페이스 패키지가 TS 소스를 가리킨다(개발용 exports). 배포된 패키지는 컴파일된 dist를 가리키므로 이 설정이 필요 없다.
  // 서버 컴포넌트에서 훅 없이 돌고, 번들러가 패키지를 처리할 수 있는지 확인하는 샘플이다.
  transpilePackages: ["@9um4-utils/editor-render", "@9um4-utils/editor-markdown", "@9um4-utils/editor-schema"],
};

export default config;

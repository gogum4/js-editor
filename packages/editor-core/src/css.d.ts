// KaTeX 스타일은 처음 수식을 볼 때 동적 import로 불러온다(lib/math.ts). 번들러(Vite·webpack·Next)가 CSS를 처리하고, 이 선언은 컴파일만 돕는다.
declare module "katex/dist/katex.min.css";

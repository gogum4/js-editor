/**
 * 수식 그래프(` ```plot `)가 쓰는 **안전한 수식 계산기**. 사용자가 쓴 글을 `eval`/`Function`으로 실행하지 않고, 직접 파싱해서 클로저로 만든다
 * (허용한 숫자·변수·연산·함수 이름만 — 그 밖의 것은 오류). 의존성 없는 순수 함수라 서버(블로그)와 브라우저가 같이 쓴다.
 *
 * 문법: 숫자(`1.5`, `2e-3`), 변수 \`x\` \`y\` \`t\`, 상수 \`pi\`(\`π\`) \`tau\` \`e\`, 연산 \`+ - * / % ^\`(\`**\`도 거듭제곱), 괄호, 함수 호출 \`sin(x)\`,
 * **생략된 곱셈**(\`2x\`, \`2pi\`, \`2(x+1)\`, \`(x+1)(x-1)\`, \`x sin(x)\`), 한글 키보드에서 흔한 \`× ÷ − · ²\`는 정규화한다.
 * 음수 지수는 \`x^-2\`, \`-x^2\`는 \`-(x^2)\`다. 숫자끼리 이은 \`2 3\`은 오류다.
 */

export type ExprErrorCode =
  | "empty"
  | "unexpected" // 뜻밖의 글자·토큰
  | "unbalanced" // 괄호가 안 맞는다
  | "unknown_name" // 모르는 변수·상수·함수 (name)
  | "bad_args" // 함수 인자 개수가 틀리다 (name)
  | "too_long"
  | "too_deep";

export interface ExprError {
  code: ExprErrorCode;
  /** 오류가 난 글자 위치(0부터, 입력 글 기준). */
  pos: number;
  /** `unknown_name`·`bad_args`의 이름. */
  name?: string;
}

/** 계산에 쓰는 변수 값. 쓰지 않는 변수는 0으로 둔다. */
export interface Scope {
  x: number;
  y: number;
  t: number;
}

export interface CompiledExpr {
  /** 값을 구한다. 정의되지 않으면 NaN, 무한이면 ±Infinity. */
  evaluate: (scope: Scope) => number;
  /** 식이 쓰는 변수(`x`·`y`·`t`). */
  vars: ReadonlySet<"x" | "y" | "t">;
}

export type CompileResult = ({ ok: true } & CompiledExpr) | { ok: false; error: ExprError };

const MAX_LENGTH = 400;
const MAX_DEPTH = 40;

const CONSTANTS: Readonly<Record<string, number>> = { pi: Math.PI, tau: Math.PI * 2, e: Math.E, inf: Infinity };

const sign = (v: number) => (Number.isNaN(v) ? NaN : v > 0 ? 1 : v < 0 ? -1 : 0);
const cot = (v: number) => 1 / Math.tan(v);
const sinc = (v: number) => (v === 0 ? 1 : Math.sin(v) / v);

const FUNCTIONS: Readonly<Record<string, { arity: number | readonly [number, number]; fn: (...args: number[]) => number }>> = {
  sin: { arity: 1, fn: Math.sin },
  cos: { arity: 1, fn: Math.cos },
  tan: { arity: 1, fn: Math.tan },
  cot: { arity: 1, fn: cot },
  sec: { arity: 1, fn: (v) => 1 / Math.cos(v) },
  csc: { arity: 1, fn: (v) => 1 / Math.sin(v) },
  asin: { arity: 1, fn: Math.asin },
  acos: { arity: 1, fn: Math.acos },
  atan: { arity: 1, fn: Math.atan },
  atan2: { arity: 2, fn: Math.atan2 },
  sinh: { arity: 1, fn: Math.sinh },
  cosh: { arity: 1, fn: Math.cosh },
  tanh: { arity: 1, fn: Math.tanh },
  asinh: { arity: 1, fn: Math.asinh },
  acosh: { arity: 1, fn: Math.acosh },
  atanh: { arity: 1, fn: Math.atanh },
  exp: { arity: 1, fn: Math.exp },
  ln: { arity: 1, fn: Math.log },
  log: { arity: [1, 2], fn: (v, base) => (base === undefined ? Math.log10(v) : Math.log(v) / Math.log(base)) },
  log2: { arity: 1, fn: Math.log2 },
  log10: { arity: 1, fn: Math.log10 },
  sqrt: { arity: 1, fn: Math.sqrt },
  cbrt: { arity: 1, fn: Math.cbrt },
  abs: { arity: 1, fn: Math.abs },
  floor: { arity: 1, fn: Math.floor },
  ceil: { arity: 1, fn: Math.ceil },
  round: { arity: 1, fn: Math.round },
  trunc: { arity: 1, fn: Math.trunc },
  sign: { arity: 1, fn: sign },
  sinc: { arity: 1, fn: sinc },
  min: { arity: [2, 8], fn: Math.min },
  max: { arity: [2, 8], fn: Math.max },
  pow: { arity: 2, fn: Math.pow },
  mod: { arity: 2, fn: (a, b) => a - b * Math.floor(a / b) },
  hypot: { arity: [2, 8], fn: Math.hypot },
};

/** 자기 속성인지(`constructor`·`__proto__` 같은 프로토타입 속성을 이름으로 쓰지 못하게 `in`을 쓰지 않는다). */
function own(table: object, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(table, name);
}

/** 한글 키보드·문서에서 흔한 기호를 ASCII 연산으로 바꾼다(`π`·`²`·`³`은 글자 수가 늘어 그 뒤의 오류 위치가 한두 글자 밀릴 수 있다). */
function normalize(source: string): string {
  return source
    .replace(/[×·⋅]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/π/g, "pi")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3");
}

type Token =
  | { kind: "num"; value: number; pos: number }
  | { kind: "id"; name: string; pos: number }
  | { kind: "op"; op: string; pos: number }
  | { kind: "end"; pos: number };

function tokenize(source: string): Token[] | ExprError {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i += 1;
    } else if (/[0-9.]/.test(ch)) {
      const match = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(i));
      // `2e`처럼 지수 뒤에 숫자가 없으면 e(상수)와 곱셈으로 읽는다.
      if (!match) return { code: "unexpected", pos: i };
      tokens.push({ kind: "num", value: Number(match[0]), pos: i });
      i += match[0].length;
    } else if (/[A-Za-z_]/.test(ch)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i));
      const name = match![0];
      tokens.push({ kind: "id", name, pos: i });
      i += name.length;
    } else if (ch === "*" && source[i + 1] === "*") {
      tokens.push({ kind: "op", op: "^", pos: i });
      i += 2;
    } else if ("+-*/%^(),".includes(ch)) {
      tokens.push({ kind: "op", op: ch, pos: i });
      i += 1;
    } else {
      return { code: "unexpected", pos: i };
    }
  }
  tokens.push({ kind: "end", pos: source.length });
  return tokens;
}

type Node = (scope: Scope) => number;

class Parser {
  private index = 0;
  readonly vars = new Set<"x" | "y" | "t">();
  private depth = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly allowed: ReadonlySet<string>,
  ) {}

  private get current(): Token {
    return this.tokens[this.index]!;
  }

  private fail(code: ExprErrorCode, pos = this.current.pos, name?: string): never {
    throw Object.assign(new Error(code), { exprError: { code, pos, ...(name !== undefined ? { name } : {}) } satisfies ExprError });
  }

  parse(): Node {
    const node = this.additive();
    if (this.current.kind !== "end") {
      const t = this.current;
      this.fail(t.kind === "op" && t.op === ")" ? "unbalanced" : "unexpected");
    }
    return node;
  }

  private isOp(op: string): boolean {
    const t = this.current;
    return t.kind === "op" && t.op === op;
  }

  private additive(): Node {
    let left = this.multiplicative();
    while (this.isOp("+") || this.isOp("-")) {
      const plus = this.isOp("+");
      this.index += 1;
      const l = left;
      const r = this.multiplicative();
      left = plus ? (s) => l(s) + r(s) : (s) => l(s) - r(s);
    }
    return left;
  }

  /** 곱셈·나눗셈·나머지, 그리고 생략된 곱셈(바로 이어지는 값). */
  private multiplicative(): Node {
    let left = this.unary();
    let leftIsNumber = this.lastWasNumber;
    for (;;) {
      const t = this.current;
      if (t.kind === "op" && (t.op === "*" || t.op === "/" || t.op === "%")) {
        this.index += 1;
        const l = left;
        const r = this.unary();
        left = t.op === "*" ? (s) => l(s) * r(s) : t.op === "/" ? (s) => l(s) / r(s) : (s) => {
          const a = l(s);
          const b = r(s);
          return a - b * Math.trunc(a / b);
        };
        leftIsNumber = false;
      } else if (t.kind === "id" || (t.kind === "op" && t.op === "(") || t.kind === "num") {
        // 생략된 곱셈: `2x`, `2(x+1)`, `(x+1)(x-1)`, `x sin(x)`. 숫자 두 개를 잇는 `2 3`은 곱셈으로 읽지 않는다.
        if (t.kind === "num" && leftIsNumber) this.fail("unexpected");
        const l = left;
        const r = this.power();
        left = (s) => l(s) * r(s);
        leftIsNumber = false;
      } else {
        return left;
      }
    }
  }

  private lastWasNumber = false;

  private unary(): Node {
    if (this.isOp("-")) {
      this.index += 1;
      const inner = this.unary();
      this.lastWasNumber = false;
      return (s) => -inner(s);
    }
    if (this.isOp("+")) {
      this.index += 1;
      return this.unary();
    }
    return this.power();
  }

  /** 거듭제곱은 오른쪽 결합이고, 지수에는 부호가 올 수 있다(`x^-2`, `2^3^2` = 2^9). */
  private power(): Node {
    const base = this.primary();
    if (this.isOp("^")) {
      this.index += 1;
      this.lastWasNumber = false;
      const exponent = this.signedPower();
      return (s) => Math.pow(base(s), exponent(s));
    }
    return base;
  }

  private signedPower(): Node {
    if (this.isOp("-")) {
      this.index += 1;
      const inner = this.signedPower();
      return (s) => -inner(s);
    }
    if (this.isOp("+")) {
      this.index += 1;
      return this.signedPower();
    }
    return this.power();
  }

  private primary(): Node {
    if (++this.depth > MAX_DEPTH) this.fail("too_deep");
    try {
      const t = this.current;
      this.lastWasNumber = false;
      if (t.kind === "num") {
        this.index += 1;
        this.lastWasNumber = true;
        const value = t.value;
        return () => value;
      }
      if (t.kind === "op" && t.op === "(") {
        this.index += 1;
        const inner = this.additive();
        if (!this.isOp(")")) this.fail("unbalanced");
        this.index += 1;
        this.lastWasNumber = false;
        return inner;
      }
      if (t.kind === "id") return this.identifier(t);
      if (t.kind === "end") this.fail("unexpected", t.pos);
      return this.fail(t.kind === "op" && t.op === ")" ? "unbalanced" : "unexpected");
    } finally {
      this.depth -= 1;
    }
  }

  private identifier(t: Extract<Token, { kind: "id" }>): Node {
    const name = t.name.toLowerCase();
    this.index += 1;
    const next = this.current;
    const isCall = next.kind === "op" && next.op === "(" && own(FUNCTIONS, name);
    if (isCall) {
      this.index += 1;
      const args: Node[] = [];
      if (!this.isOp(")")) {
        for (;;) {
          args.push(this.additive());
          if (this.isOp(",")) {
            this.index += 1;
            continue;
          }
          break;
        }
      }
      if (!this.isOp(")")) this.fail("unbalanced");
      this.index += 1;
      const spec = FUNCTIONS[name]!;
      const [min, max] = typeof spec.arity === "number" ? [spec.arity, spec.arity] : spec.arity;
      if (args.length < min || args.length > max) this.fail("bad_args", t.pos, name);
      this.lastWasNumber = false;
      const fn = spec.fn;
      if (args.length === 1) {
        const a = args[0]!;
        return (s) => fn(a(s));
      }
      if (args.length === 2) {
        const [a, b] = [args[0]!, args[1]!];
        return (s) => fn(a(s), b(s));
      }
      return (s) => fn(...args.map((arg) => arg(s)));
    }
    this.lastWasNumber = false;
    if (name === "x" || name === "y" || name === "t") {
      if (!this.allowed.has(name)) this.fail("unknown_name", t.pos, name);
      this.vars.add(name);
      return name === "x" ? (s) => s.x : name === "y" ? (s) => s.y : (s) => s.t;
    }
    if (own(CONSTANTS, name)) {
      const value = CONSTANTS[name]!;
      return () => value;
    }
    // 함수 이름인데 괄호가 없으면(`sin x`) 모르는 이름과 같이 알린다.
    return this.fail("unknown_name", t.pos, name);
  }
}

/**
 * 수식을 컴파일한다. `variables`는 이 식에서 쓸 수 있는 변수(예: 2D 함수는 `["x"]`, 3D 곡면은 `["x","y"]`).
 * 실패해도 던지지 않고 `{ ok: false, error }`를 돌려준다.
 */
export function compileExpr(source: string, variables: readonly ("x" | "y" | "t")[]): CompileResult {
  if (source.length > MAX_LENGTH) return { ok: false, error: { code: "too_long", pos: MAX_LENGTH } };
  const text = normalize(source);
  if (text.trim() === "") return { ok: false, error: { code: "empty", pos: 0 } };
  const tokens = tokenize(text);
  if (!Array.isArray(tokens)) return { ok: false, error: tokens };
  const parser = new Parser(tokens, new Set(variables));
  try {
    const evaluate = parser.parse();
    return { ok: true, evaluate, vars: parser.vars };
  } catch (error) {
    const found = (error as { exprError?: ExprError }).exprError;
    if (found) return { ok: false, error: found };
    throw error;
  }
}

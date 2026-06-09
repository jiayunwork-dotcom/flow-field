type Token =
  | { type: 'number'; value: number }
  | { type: 'variable'; name: string }
  | { type: 'function'; name: string }
  | { type: 'operator'; op: string }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' };

const FUNCTIONS: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  exp: Math.exp,
  sqrt: Math.sqrt,
  abs: Math.abs,
  log: Math.log,
  log2: Math.log2,
  log10: Math.log10,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
};

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < expr.length && /[0-9.eE+\-]/.test(expr[i])) {
        num += expr[i]; i++;
      }
      tokens.push({ type: 'number', value: parseFloat(num) });
    } else if (/[a-zA-Z_]/.test(ch)) {
      let name = '';
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        name += expr[i]; i++;
      }
      if (FUNCTIONS[name]) {
        tokens.push({ type: 'function', name });
      } else {
        tokens.push({ type: 'variable', name });
      }
    } else if ('+-*/^'.includes(ch)) {
      tokens.push({ type: 'operator', op: ch }); i++;
    } else if (ch === '(') {
      tokens.push({ type: 'lparen' }); i++;
    } else if (ch === ')') {
      tokens.push({ type: 'rparen' }); i++;
    } else if (ch === ',') {
      tokens.push({ type: 'comma' }); i++;
    } else {
      throw new Error(`Unexpected character: ${ch} at position ${i}`);
    }
  }
  return tokens;
}

type ASTNode =
  | { type: 'number'; value: number }
  | { type: 'variable'; name: string }
  | { type: 'binary'; op: string; left: ASTNode; right: ASTNode }
  | { type: 'unary'; op: string; operand: ASTNode }
  | { type: 'call'; name: string; args: ASTNode[] };

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : null;
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: Token['type']): Token {
    const t = this.consume();
    if (t.type !== type) throw new Error(`Expected ${type}, got ${t.type}`);
    return t;
  }

  parse(): ASTNode {
    const result = this.parseExpression();
    if (this.pos < this.tokens.length) {
      throw new Error('Unexpected tokens after expression');
    }
    return result;
  }

  private parseExpression(): ASTNode {
    return this.parseAddSub();
  }

  private parseAddSub(): ASTNode {
    let left = this.parseMulDiv();
    while (this.peek()?.type === 'operator' && (this.peek() as any).op === '+' || (this.peek()?.type === 'operator' && (this.peek() as any).op === '-')) {
      const op = (this.consume() as any).op as string;
      const right = this.parseMulDiv();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  private parseMulDiv(): ASTNode {
    let left = this.parsePower();
    while (this.peek()?.type === 'operator' && ['*', '/'].includes((this.peek() as any).op)) {
      const op = (this.consume() as any).op as string;
      const right = this.parsePower();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  private parsePower(): ASTNode {
    let base = this.parseUnary();
    if (this.peek()?.type === 'operator' && (this.peek() as any).op === '^') {
      this.consume();
      const exp = this.parseUnary();
      return { type: 'binary', op: '^', left: base, right: exp };
    }
    return base;
  }

  private parseUnary(): ASTNode {
    if (this.peek()?.type === 'operator' && (this.peek() as any).op === '-') {
      this.consume();
      const operand = this.parseUnary();
      return { type: 'unary', op: '-', operand };
    }
    if (this.peek()?.type === 'operator' && (this.peek() as any).op === '+') {
      this.consume();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ASTNode {
    const t = this.peek();
    if (!t) throw new Error('Unexpected end of expression');

    if (t.type === 'number') {
      this.consume();
      return { type: 'number', value: t.value };
    }

    if (t.type === 'variable') {
      this.consume();
      if (this.peek()?.type === 'lparen') {
        // it's a function call - shouldn't happen since we tokenize functions
        throw new Error(`Unknown function: ${t.name}`);
      }
      return { type: 'variable', name: t.name };
    }

    if (t.type === 'function') {
      this.consume();
      this.expect('lparen');
      const args: ASTNode[] = [];
      if (this.peek()?.type !== 'rparen') {
        args.push(this.parseExpression());
        while (this.peek()?.type === 'comma') {
          this.consume();
          args.push(this.parseExpression());
        }
      }
      this.expect('rparen');
      return { type: 'call', name: t.name, args };
    }

    if (t.type === 'lparen') {
      this.consume();
      const expr = this.parseExpression();
      this.expect('rparen');
      return expr;
    }

    throw new Error(`Unexpected token: ${JSON.stringify(t)}`);
  }
}

function evaluateAST(node: ASTNode, vars: Record<string, number>): number {
  switch (node.type) {
    case 'number': return node.value;
    case 'variable': {
      if (!(node.name in vars)) throw new Error(`Undefined variable: ${node.name}`);
      return vars[node.name];
    }
    case 'unary': {
      const val = evaluateAST(node.operand, vars);
      return node.op === '-' ? -val : val;
    }
    case 'binary': {
      const l = evaluateAST(node.left, vars);
      const r = evaluateAST(node.right, vars);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '^': return Math.pow(l, r);
        default: throw new Error(`Unknown operator: ${node.op}`);
      }
    }
    case 'call': {
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new Error(`Unknown function: ${node.name}`);
      const argVals = node.args.map((a) => evaluateAST(a, vars));
      return fn(argVals[0]);
    }
  }
}

export class ExpressionParser {
  private astX: ASTNode | null = null;
  private astY: ASTNode | null = null;
  private _formulaX: string = '';
  private _formulaY: string = '';

  get formulaX() { return this._formulaX; }
  get formulaY() { return this._formulaY; }

  setFormulas(formulaX: string, formulaY: string) {
    this._formulaX = formulaX;
    this._formulaY = formulaY;
    try {
      const tokensX = tokenize(formulaX);
      this.astX = new Parser(tokensX).parse();
    } catch (e) {
      this.astX = null;
      console.error('Error parsing formulaX:', e);
    }
    try {
      const tokensY = tokenize(formulaY);
      this.astY = new Parser(tokensY).parse();
    } catch (e) {
      this.astY = null;
      console.error('Error parsing formulaY:', e);
    }
  }

  evaluate(x: number, y: number, params?: Record<string, number>): [number, number] {
    const vars: Record<string, number> = { x, y, pi: Math.PI, e: Math.E, ...(params || {}) };
    const vx = this.astX ? evaluateAST(this.astX, vars) : 0;
    const vy = this.astY ? evaluateAST(this.astY, vars) : 0;
    return [vx, vy];
  }

  isValid(): boolean {
    return this.astX !== null && this.astY !== null;
  }

  static validate(formula: string): { valid: boolean; error?: string } {
    try {
      const tokens = tokenize(formula);
      new Parser(tokens).parse();
      return { valid: true };
    } catch (e: any) {
      return { valid: false, error: e.message };
    }
  }
}

export function createCustomFieldTexture(
  formulaX: string,
  formulaY: string,
  width: number,
  height: number,
  params?: Record<string, number>
): Float32Array {
  const parser = new ExpressionParser();
  parser.setFormulas(formulaX, formulaY);
  if (!parser.isValid()) return new Float32Array(width * height * 2);

  const data = new Float32Array(width * height * 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x / width) * 2 - 1;
      const ny = (y / height) * 2 - 1;
      const [vx, vy] = parser.evaluate(nx, ny, params);
      const idx = (y * width + x) * 2;
      data[idx] = vx;
      data[idx + 1] = vy;
    }
  }
  return data;
}

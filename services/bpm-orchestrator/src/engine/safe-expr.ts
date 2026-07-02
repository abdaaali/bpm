/**
 * safe-expr — a tiny, dependency-free boolean expression evaluator for BPMN
 * gateway conditions. It replaces a previous `new Function()` sandbox: it parses
 * a fixed grammar (literals + comparison/logical operators + parentheses) into
 * an AST and evaluates it, with NO access to the JS runtime, so a malicious or
 * buggy process definition can't achieve code execution or DoS via the engine.
 *
 * Input is the already variable-substituted expression (identifiers replaced by
 * their JSON literal values upstream), so this evaluator only deals with
 * numbers, strings, booleans and null — never variable lookups.
 *
 * Supported: ( )  !  &&  ||  ==  ===  !=  !==  <  >  <=  >=  and number / string
 * / true / false / null literals. Anything else is a parse error → false.
 */

type Tok = { t: string; v?: any };

function tokenize(s: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    // String literal (single or double quoted, with backslash escapes)
    if (c === '"' || c === "'") {
      let j = i + 1, str = '';
      while (j < s.length && s[j] !== c) {
        if (s[j] === '\\') { str += s[j + 1] ?? ''; j += 2; } else { str += s[j++]; }
      }
      if (j >= s.length) throw new Error('unterminated string');
      toks.push({ t: 'val', v: str }); i = j + 1; continue;
    }
    // Number (optional leading minus sign, since substituted values may be negative)
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(s[i + 1] || ''))) {
      const m = /^-?[0-9]+(\.[0-9]+)?/.exec(s.slice(i))!;
      toks.push({ t: 'val', v: Number(m[0]) }); i += m[0].length; continue;
    }
    // Keyword literals only — any other identifier is rejected
    if (/[a-zA-Z_]/.test(c)) {
      const w = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(s.slice(i))![0];
      if (w === 'true') toks.push({ t: 'val', v: true });
      else if (w === 'false') toks.push({ t: 'val', v: false });
      else if (w === 'null') toks.push({ t: 'val', v: null });
      else throw new Error(`unexpected identifier '${w}'`);
      i += w.length; continue;
    }
    // Operators, longest match first
    const three = s.substr(i, 3), two = s.substr(i, 2);
    if (three === '===' || three === '!==') { toks.push({ t: three }); i += 3; continue; }
    if (['==', '!=', '<=', '>='].includes(two) || two === '&&' || two === '||') { toks.push({ t: two }); i += 2; continue; }
    if ('<>!()'.includes(c)) { toks.push({ t: c }); i += 1; continue; }
    throw new Error(`unexpected char '${c}'`);
  }
  return toks;
}

/** Recursive-descent eval with standard precedence: || < && < equality < relational < unary. */
function evalTokens(toks: Tok[]): boolean {
  let pos = 0;
  const peek = () => toks[pos];

  const looseEq = (l: any, r: any) => l == r; // eslint-disable-line eqeqeq

  function parseOr(): any { let l = parseAnd(); while (peek()?.t === '||') { pos++; const r = parseAnd(); l = Boolean(l) || Boolean(r); } return l; }
  function parseAnd(): any { let l = parseEq(); while (peek()?.t === '&&') { pos++; const r = parseEq(); l = Boolean(l) && Boolean(r); } return l; }
  function parseEq(): any {
    let l = parseRel();
    while (['==', '===', '!=', '!=='].includes(peek()?.t)) {
      const op = toks[pos++].t; const r = parseRel();
      l = op === '==' ? looseEq(l, r) : op === '===' ? l === r : op === '!=' ? !looseEq(l, r) : l !== r;
    }
    return l;
  }
  function parseRel(): any {
    let l = parseUnary();
    while (['<', '>', '<=', '>='].includes(peek()?.t)) {
      const op = toks[pos++].t; const r = parseUnary();
      l = op === '<' ? l < r : op === '>' ? l > r : op === '<=' ? l <= r : l >= r;
    }
    return l;
  }
  function parseUnary(): any { if (peek()?.t === '!') { pos++; return !parseUnary(); } return parsePrimary(); }
  function parsePrimary(): any {
    const t = peek();
    if (!t) throw new Error('unexpected end of expression');
    if (t.t === '(') { pos++; const v = parseOr(); if (peek()?.t !== ')') throw new Error('expected )'); pos++; return v; }
    if (t.t === 'val') { pos++; return t.v; }
    throw new Error(`unexpected token '${t.t}'`);
  }

  const result = parseOr();
  if (pos !== toks.length) throw new Error('trailing tokens in expression');
  return Boolean(result);
}

/** Evaluate a substituted (literals-only) boolean expression. Throws on invalid input. */
export function safeEvalBoolean(expr: string): boolean {
  return evalTokens(tokenize(expr));
}

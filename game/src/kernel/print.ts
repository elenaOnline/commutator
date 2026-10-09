// LEMMA WORKS kernel — printing (Unicode + TeX) and term entry parsing. Pure.
import type { AtomDecl, Fact, PatFact, Poly, Subst, Term, ZRef } from './types';
import { inv, mul, norm, same } from './terms';
import { polyAdd, polyConst, polyMul, polyNeg, polyNorm, polyPowNat, polySub, polyText, polyZvar } from './poly';

export type Labels = Record<string, string>; // AtomId → display label
export function labelsOf(atoms: AtomDecl[]): Labels {
  return Object.fromEntries(atoms.map((a) => [a.id, a.label]));
}

const SUPD = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const supNum = (n: number) => String(n).split('').map((d) => SUPD[+d]).join('');

interface Style {
  base: (t: Term, L: Labels) => string;
  pow: (base: string, n: number) => string; // n may be negative (-1, -3)
  paren: (s: string) => string;
}

const isSimple = (t: Term) => t.k === 'atom' || t.k === 'e' || t.k === 'meta';

const TEXT: Style = {
  base: (t, L) => (t.k === 'atom' ? (L[t.id] ?? t.id) : t.k === 'e' ? 'e' : t.k === 'meta' ? t.id : '?'),
  pow: (b, n) => (n < 0 ? `${b}⁻${supNum(-n)}` : `${b}${supNum(n)}`),
  paren: (s) => `(${s})`,
};

const SUBD = '₀₁₂₃₄₅₆₇₈₉';
const texLabel = (s: string) => {
  const t = s.replace(/′/g, "'");
  if (/^[A-Za-z]'*$/.test(t)) return t;
  // x₁, y₂′ → x_{1}, y_{2}'
  const m = /^([A-Za-z])([₀-₉]+)('*)$/u.exec(t);
  if (m) return `${m[1]}_{${[...m[2]!].map((c) => SUBD.indexOf(c)).join('')}}${m[3]}`;
  return `\\mathit{${t}}`;
};
const TEX: Style = {
  base: (t, L) => (t.k === 'atom' ? texLabel(L[t.id] ?? t.id) : t.k === 'e' ? 'e' : t.k === 'meta' ? t.id : '?'),
  pow: (b, n) => `${b}^{${n}}`,
  paren: (s) => `(${s})`,
};

/** The exponent polynomial alone, e.g. "5k₁", "n₁k₁", "-3" (TeX: "5k_{1}"). */
export function exponentText(p: Poly, L: Labels, tex = false): string {
  return polyText(p, (r: ZRef) => (r.k === 'zvar' ? (tex ? texLabel(L[r.id] ?? r.id) : (L[r.id] ?? r.id)) : r.id), tex);
}

/** Exponent text: bare when a single literal or a single name, bracketed otherwise. */
function expStr(p: Poly, L: Labels, tex: boolean): string {
  const name = (r: ZRef) => (r.k === 'zvar' ? (tex ? texLabel(L[r.id] ?? r.id) : (L[r.id] ?? r.id)) : r.id);
  const body = polyText(p, name, tex);
  if (tex) return `^{${body}}`;
  const single = p.length <= 1 && (p.length === 0 || p[0]!.monomial.length === 0 || (p[0]!.coefficient === '1' && p[0]!.monomial.length === 1 && p[0]!.monomial[0]!.degree === 1));
  return single ? `^${body}` : `^(${body})`;
}

function factorStr(f: Term, L: Labels, st: Style): string {
  if (isSimple(f)) return st.base(f, L);
  if (f.k === 'pow') {
    const b = f.base;
    const bs = isSimple(b) ? st.base(b, L) : st.paren(b.k === 'inv' && isSimple(b.arg) ? factorStr(b, L, st) : termStr(b, L, st));
    return `${bs}${expStr(f.exp, L, st === TEX)}`;
  }
  if (f.k === 'int') return polyText(f.val, (r) => (r.k === 'zvar' ? (st === TEX ? texLabel(L[r.id] ?? r.id) : (L[r.id] ?? r.id)) : r.id), st === TEX);
  if (f.k === 'inv') {
    const a = f.arg;
    if (isSimple(a)) return st.pow(st.base(a, L), -1);
    return st.pow(st.paren(termStr(a, L, st)), -1);
  }
  return termStr(f, L, st);
}

function termStr(t: Term, L: Labels, st: Style): string {
  if (t.k !== 'mul') return factorStr(t, L, st);
  const fs = t.fs;
  const n = fs.length;
  // whole-word periodicity with a compound block: (ab)⁵
  for (let p = 1; p <= n / 2; p++) {
    if (n % p) continue;
    let ok = true;
    for (let i = p; i < n && ok; i++) if (!same(fs[i]!, fs[i - p]!)) ok = false;
    if (!ok) continue;
    if (p === 1) break; // a run of one factor: handled by run compression below
    return st.pow(st.paren(termStr({ k: 'mul', fs: fs.slice(0, p) }, L, st)), n / p);
  }
  let out = '';
  for (let i = 0; i < n;) {
    let j = i + 1;
    while (j < n && same(fs[j]!, fs[i]!)) j++;
    const run = j - i, f = fs[i]!;
    if (run >= 3 && isSimple(f)) { out += st.pow(st.base(f, L), run); i = j; continue; }
    if (run >= 3 && f.k === 'inv' && isSimple(f.arg)) { out += st.pow(st.base(f.arg, L), -run); i = j; continue; }
    out += factorStr(f, L, st);
    i++;
  }
  return out;
}

/** Unicode text, e.g. "(ab)⁻¹ = b⁻¹a⁻¹". */
export function termText(t: Term, L: Labels): string { return termStr(norm(t), L, TEXT); }
/** TeX, e.g. "(ab)^{-1} = b^{-1}a^{-1}". */
export function termTex(t: Term, L: Labels): string { return termStr(norm(t), L, TEX); }

const quant = (metas: string[], tex: boolean) =>
  metas.length ? (tex ? `\\forall ${metas.join(', ')}.\\; ` : `∀${metas.join(', ')}. `) : '';

function patText(p: PatFact, L: Labels, tex: boolean): string {
  const T = tex ? termTex : termText;
  return `${T(p.l, L)} ${p.k === 'eq' ? '=' : tex ? '\\neq' : '≠'} ${T(p.r, L)}`;
}

export function factText(f: Fact, L: Labels): string { return factStr(f, L, false); }
export function factTex(f: Fact, L: Labels): string { return factStr(f, L, true); }

function factStr(f: Fact, L: Labels, tex: boolean): string {
  const T = tex ? termTex : termText;
  switch (f.k) {
    case 'eq': case 'neq': return patText(f, L, tex);
    case 'bot': return tex ? '\\bot' : '⊥';
    case 'size': return `|G| = ${f.n}`;
    case 'law': return `${quant(f.metas, tex)}${T(f.l, L)} = ${T(f.r, L)}`;
    case 'cond': return `${quant(f.metas, tex)}${f.premises.map((p) => patText(p, L, tex)).join(', ')} ${tex ? '\\Rightarrow' : '⇒'} ${patText(f.concl, L, tex)}`;
  }
}

/** "x = ba, y = a" */
export function substText(s: Subst, L: Labels): string {
  return Object.keys(s).sort().map((k) => `${k} = ${termText(s[k]!, L)}`).join(', ');
}

// ───────────── parsing ─────────────

const SUP_MAP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
const MAX_POW = 99;

type Name = { name: string; id: string | null; sort: 'G' | 'Z' };

function nameTable(atoms: AtomDecl[]): Name[] {
  // label (and its ASCII-prime spelling) → atom id; 'e' → identity unless a label claims it
  const names: Name[] = [];
  for (const a of atoms) {
    const sort = a.sort === 'Z' ? 'Z' : 'G';
    names.push({ name: a.label, id: a.id, sort });
    const ascii = a.label.replace(/′/g, "'");
    if (ascii !== a.label) names.push({ name: ascii, id: a.id, sort });
    // subscripted variable labels also accept x1 and x_1
    if (/[₀-₉]/u.test(a.label)) {
      const digits = a.label.replace(/[₀-₉]/gu, (c) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(c)));
      const m = /^(\D+)(\d+)(.*)$/.exec(digits);
      names.push({ name: digits, id: a.id, sort });
      if (m) names.push({ name: `${m[1]}_${m[2]}${m[3]}`, id: a.id, sort });
    }
  }
  if (!names.some((n) => n.name === 'e')) names.push({ name: 'e', id: null, sort: 'G' });
  names.sort((x, y) => y.name.length - x.name.length);
  return names;
}

class PErr extends Error {}

/** A tiny cursor over the source shared by the term and integer grammars. */
class Cursor {
  i = 0;
  constructor(readonly s: string, readonly names: Name[]) {}
  peek() { return this.s[this.i]; }
  ws() { while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++; }
  nameAt(): Name | undefined { return this.names.find((n) => this.s.startsWith(n.name, this.i)); }
  /** An identifier-looking run at the cursor (for messages). */
  word(): string | null { const m = /^[A-Za-z0-9_′'₀-₉]+/u.exec(this.s.slice(this.i)); return m ? m[0] : null; }
}

/**
 * Integer expressions (exponents and ℤ knobs): signed literals, ℤ Tower names, + − *, juxtaposition
 * (5k₁ = 5*k₁), parentheses, natural literal powers (n^2, n²). No division, fractions or |G|.
 * `bare` = an unbracketed exponent after ^: a signed product of literals/names only.
 */
function parseIntExpr(c: Cursor, bare: boolean): Poly {
  const s = c.s;
  const isPrimaryStart = (): boolean => {
    const ch = c.peek();
    if (ch === undefined) return false;
    if (/\d/.test(ch) || ch === '(') return true;
    const n = c.nameAt();
    return !!n && n.sort === 'Z';
  };
  const primary = (): Poly => {
    c.ws();
    const ch = c.peek();
    if (ch === '(') {
      c.i++;
      const v = expr();
      c.ws();
      if (c.peek() !== ')') throw new PErr('A bracket in the exponent is not closed.');
      c.i++;
      return v;
    }
    const lit = /^\d+/.exec(s.slice(c.i));
    if (lit) {
      c.i += lit[0].length;
      if (s[c.i] === '.' || s[c.i] === '/') throw new PErr('An exponent is a whole number. No fractions or decimals.');
      return polyConst(BigInt(lit[0]));
    }
    const n = c.nameAt();
    if (n && n.sort === 'Z' && n.id) { c.i += n.name.length; return polyZvar(n.id); }
    if (n) throw new PErr(`${n.name} is a group element, not an integer.`);
    const w = c.word();
    if (w) throw new PErr(`There is no integer variable “${w}” here.`);
    throw new PErr(ch === undefined ? 'The exponent is missing.' : `Unexpected “${ch}” in an exponent.`);
  };
  const powered = (): Poly => {
    let v = primary();
    for (;;) {
      if (!bare && s[c.i] === '^') {
        c.i++;
        const d = /^\d+/.exec(s.slice(c.i));
        if (!d) throw new PErr('An integer power must be a whole number, 0 or more.');
        c.i += d[0].length;
        v = polyPowNat(v, Number(d[0]));
        continue;
      }
      if (SUP_MAP[s[c.i] ?? ''] !== undefined) {
        let d = '';
        while (SUP_MAP[s[c.i] ?? ''] !== undefined) { d += SUP_MAP[s[c.i]!]; c.i++; }
        v = polyPowNat(v, Number(d));
        continue;
      }
      return v;
    }
  };
  const unary = (): Poly => {
    c.ws();
    if (c.peek() === '-' || c.peek() === '−') { c.i++; return polyNeg(unary()); }
    if (c.peek() === '+' && !bare) { c.i++; return unary(); }
    return powered();
  };
  const term = (): Poly => {
    let v = unary();
    for (;;) {
      if (!bare) c.ws();
      const ch = c.peek();
      if (!bare && (ch === '*' || ch === '·' || ch === '⋅')) { c.i++; v = polyMul(v, unary()); continue; }
      if (ch !== undefined && ch !== '-' && ch !== '−' && isPrimaryStart() && !(bare && ch === '(')) { v = polyMul(v, powered()); continue; }
      return v;
    }
  };
  const expr = (): Poly => {
    let v = term();
    for (;;) {
      c.ws();
      const ch = c.peek();
      if (ch === '+') { c.i++; v = polyAdd(v, term()); continue; }
      if (ch === '-' || ch === '−') { c.i++; v = polySub(v, term()); continue; }
      return v;
    }
  };
  return bare ? term() : expr();
}

/**
 * Parse player term entry against the level's atoms (and Towers). Grammar:
 *   term := factor+ ; factor := base ('^' exponent)* ; base := label | 'e' | '(' term ')'
 *   exponent := '-1' (inverse) | INT (the legacy WORD of INT copies) | '0' | '-INT' | ℤ-expression
 * A positive bare literal keeps the old meaning: `a^5` is the five-factor word aaaaa. Anything else is a
 * power node: `a^(5)`, `a^0`, `a^-3`, `a^n₁`, `(ab)^(5k₁)`, `x^-n₁`, `a^{2n+1}`.
 * Also accepts '⁻¹', superscript digits (words), "'" for a prime (e' ↔ e′), whitespace, '·', '*'.
 */
export function parseTerm(src: string, atoms: AtomDecl[]):
  { ok: true; term: Term } | { ok: false; error: string } {
  const c = new Cursor(src, nameTable(atoms));
  const s = src;
  const skip = () => { while (c.i < s.length && /[\s·*⋅]/.test(s[c.i]!)) c.i++; };

  const readSup = (): number | null => {
    let d = '';
    while (c.i < s.length && SUP_MAP[s[c.i]!] !== undefined) { d += SUP_MAP[s[c.i]!]; c.i++; }
    return d ? parseInt(d, 10) : null;
  };
  /** Legacy literal semantics: n > 0 → word of n copies; -1 → inverse; else a power node. */
  const literal = (t: Term, n: number): Term => {
    if (n === -1) return inv(t);
    if (n <= 0) return norm({ k: 'pow', base: t, exp: polyConst(n) });
    if (n > MAX_POW) throw new PErr(`Words over ${MAX_POW} factors are too long. Write a^(${n}) for the power.`);
    return mul(Array.from({ length: n }, () => t));
  };
  const powerNode = (t: Term, p: Poly): Term => norm({ k: 'pow', base: t, exp: p });

  const parseFactor = (): Term => {
    skip();
    let base: Term;
    if (s[c.i] === '(') {
      c.i++;
      base = parseTermInner();
      skip();
      if (s[c.i] !== ')') throw new PErr('A bracket is not closed.');
      c.i++;
    } else {
      const hit = c.nameAt();
      if (!hit) {
        const w = c.word();
        if (w && /^\d/.test(w)) throw new PErr(`${w} is a number, not a group element.`);
        if (w) throw new PErr(`There is no element called “${w}” here.`);
        if (s[c.i] === ')') throw new PErr('A closing bracket has no opening one.');
        throw new PErr(`Unexpected “${s[c.i]}”.`);
      }
      if (hit.sort === 'Z') throw new PErr(`${hit.name} is an integer, not a group element.`);
      c.i += hit.name.length;
      base = hit.id === null ? { k: 'e' } : { k: 'atom', id: hit.id };
    }
    // postfix powers
    for (;;) {
      skip();
      if (s[c.i] === '^') {
        c.i++;
        c.ws();
        const rest = s.slice(c.i);
        const lit = /^([-−]?)(\d+)/u.exec(rest);
        if (lit) {
          const save = c.i;
          c.i += lit[0].length;
          const z = c.nameAt();
          if (!(z && z.sort === 'Z')) { // legacy literal (a ℤ name right after it means 5k₁)
            base = literal(base, (lit[1] ? -1 : 1) * Number(lit[2]));
            continue;
          }
          c.i = save;
        }
        if (s[c.i] === '{' || s[c.i] === '(') {
          const close = s[c.i] === '{' ? '}' : ')';
          const brace = s[c.i] === '{';
          c.i++;
          const p = parseIntExpr(c, false);
          c.ws();
          if (s[c.i] !== close) throw new PErr(brace ? 'A brace is not closed.' : 'A bracket in the exponent is not closed.');
          c.i++;
          // TeX-ish ^{-1} and ^{n} keep the legacy literal meaning; ^(…) is always a power node
          const v = p.length === 0 ? 0n : p.length === 1 && p[0]!.monomial.length === 0 ? BigInt(p[0]!.coefficient) : null;
          base = brace && v !== null ? literal(base, Number(v)) : powerNode(base, p);
          continue;
        }
        base = powerNode(base, parseIntExpr(c, true));
        continue;
      }
      if (s[c.i] === '⁻') {
        c.i++;
        const n = readSup();
        if (n === null) throw new PErr('Expected ¹ after ⁻.');
        base = literal(base, -n);
        continue;
      }
      if (SUP_MAP[s[c.i] ?? ''] !== undefined) { base = literal(base, readSup()!); continue; }
      break;
    }
    return base;
  };

  const parseTermInner = (): Term => {
    const fs: Term[] = [];
    for (;;) {
      skip();
      if (c.i >= s.length || s[c.i] === ')') break;
      fs.push(parseFactor());
    }
    if (!fs.length) throw new PErr('The term is empty.');
    return mul(fs);
  };

  try {
    const t = parseTermInner();
    skip();
    if (c.i < s.length) throw new PErr('A closing bracket has no opening one.');
    return { ok: true, term: norm(t) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Parse an integer knob value (a ℤ meta's value): `5`, `-3`, `5k₁`, `n₁*(k₁+1)`, `n1^2 - 1`.
 * Returns the `{ k: 'int' }` Subst value. Group elements, fractions and unknown names are errors.
 */
export function parseInteger(src: string, atoms: AtomDecl[]):
  { ok: true; term: Term } | { ok: false; error: string } {
  const c = new Cursor(src, nameTable(atoms));
  try {
    c.ws();
    if (c.i >= src.length) throw new PErr('The integer is empty.');
    const p = parseIntExpr(c, false);
    c.ws();
    if (c.i < src.length) {
      const ch = src[c.i]!;
      throw new PErr(ch === '/' || ch === '.' ? 'An integer has no fractions or decimals.' : `Unexpected “${ch}” in an integer.`);
    }
    return { ok: true, term: { k: 'int', val: polyNorm(p) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

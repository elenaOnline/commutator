// LEMMA WORKS kernel — printing (Unicode + TeX) and term entry parsing. Pure.
import type { AtomDecl, Fact, PatFact, Subst, Term } from './types';
import { inv, mul, norm, same } from './terms';

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

const texLabel = (s: string) => {
  const t = s.replace(/′/g, "'");
  return /^[A-Za-z]'*$/.test(t) ? t : `\\mathit{${t}}`;
};
const TEX: Style = {
  base: (t, L) => (t.k === 'atom' ? texLabel(L[t.id] ?? t.id) : t.k === 'e' ? 'e' : t.k === 'meta' ? t.id : '?'),
  pow: (b, n) => `${b}^{${n}}`,
  paren: (s) => `(${s})`,
};

function factorStr(f: Term, L: Labels, st: Style): string {
  if (isSimple(f)) return st.base(f, L);
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

/**
 * Parse player term entry against the level's atoms. Grammar:
 *   term := factor+ ; factor := base ('^' ('-1' | INT))* ; base := label | 'e' | '(' term ')'
 * Also accepts '⁻¹' and superscript powers, "'" for a prime in labels (e' ↔ e′), whitespace, '·', '*'.
 */
export function parseTerm(src: string, atoms: AtomDecl[]):
  { ok: true; term: Term } | { ok: false; error: string } {
  // name table: label (and its ASCII-prime spelling) → atom id; 'e' → identity unless a label claims it
  const names: { name: string; id: string | null }[] = [];
  for (const a of atoms) {
    names.push({ name: a.label, id: a.id });
    const ascii = a.label.replace(/′/g, "'");
    if (ascii !== a.label) names.push({ name: ascii, id: a.id });
  }
  if (!names.some((n) => n.name === 'e')) names.push({ name: 'e', id: null });
  names.sort((x, y) => y.name.length - x.name.length);

  const s = src;
  let i = 0;
  const skip = () => { while (i < s.length && /[\s·*⋅]/.test(s[i]!)) i++; };
  class PErr extends Error {}

  const readInt = (): number => {
    const m = /^\d+/.exec(s.slice(i));
    if (!m) throw new PErr('expected a whole number after ^');
    i += m[0].length;
    return parseInt(m[0], 10);
  };
  const readSup = (): number | null => {
    let d = '';
    while (i < s.length && SUP_MAP[s[i]!] !== undefined) { d += SUP_MAP[s[i]!]; i++; }
    return d ? parseInt(d, 10) : null;
  };
  const power = (t: Term, n: number): Term => {
    if (n === 0) throw new PErr('a power must be at least 1 (write e for the identity)');
    if (Math.abs(n) > MAX_POW) throw new PErr(`powers above ${MAX_POW} are not supported`);
    const b = n < 0 ? inv(t) : t;
    return mul(Array.from({ length: Math.abs(n) }, () => b));
  };

  const parseFactor = (): Term => {
    skip();
    let base: Term;
    if (s[i] === '(') {
      i++;
      base = parseTermInner();
      skip();
      if (s[i] !== ')') throw new PErr('a bracket is not closed');
      i++;
    } else {
      const hit = names.find((n) => s.startsWith(n.name, i));
      if (!hit) {
        const m = /^[A-Za-z0-9_′']+/.exec(s.slice(i));
        if (m) throw new PErr(`there is no element called “${m[0]}” here`);
        if (s[i] === ')') throw new PErr('there is a closing bracket without an opening one');
        throw new PErr(`unexpected “${s[i]}”`);
      }
      i += hit.name.length;
      base = hit.id === null ? { k: 'e' } : { k: 'atom', id: hit.id };
    }
    // postfix powers
    for (;;) {
      skip();
      if (s[i] === '^') {
        i++;
        skip();
        let neg = false;
        if (s[i] === '{') { // tolerate TeX-ish ^{-1}
          i++;
          if (s[i] === '-') { neg = true; i++; }
          const n = readInt();
          if (s[i] !== '}') throw new PErr('a brace is not closed');
          i++;
          base = power(base, neg ? -n : n);
          continue;
        }
        if (s[i] === '-' || s[i] === '−') { neg = true; i++; }
        const n = readInt();
        base = power(base, neg ? -n : n);
        continue;
      }
      if (s[i] === '⁻') {
        i++;
        const n = readSup();
        if (n === null) throw new PErr('expected ¹ after ⁻');
        base = power(base, -n);
        continue;
      }
      if (SUP_MAP[s[i] ?? ''] !== undefined) { base = power(base, readSup()!); continue; }
      break;
    }
    return base;
  };

  const parseTermInner = (): Term => {
    const fs: Term[] = [];
    for (;;) {
      skip();
      if (i >= s.length || s[i] === ')') break;
      fs.push(parseFactor());
    }
    if (!fs.length) throw new PErr('the term is empty');
    return mul(fs);
  };

  try {
    const t = parseTermInner();
    skip();
    if (i < s.length) throw new PErr('there is a closing bracket without an opening one');
    return { ok: true, term: norm(t) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

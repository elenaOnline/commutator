// LEMMA WORKS kernel — printing (Unicode + TeX) and term entry parsing. Pure.
import type { AtomDecl, Fact, MapDecl, PatFact, Poly, SortDecl, SortRef, StructBinder, Subst, Term, ZRef } from './types';
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

/** Book phase C: the identity of a non-default group prints with its sort, e_K; in a level with two or more groups
 *  (labels carry MULTI_GROUP) the default group's identity is subscripted too, e_G, so a jam always says which e. */
const eText = (t: Term, L: Labels, tex: boolean) => {
  const s0 = t.k === 'e' ? t.s : undefined;
  if ((!s0 || s0 === 'G') && !L[MULTI_GROUP]) return 'e';
  const s = s0 ?? 'G';
  const name = L[s] ?? KNOWN[s] ?? s;
  return tex ? `e_{${texLabel(name)}}` : `e_${name}`;
};
/** Labels key set by levelLabels when a level has two or more group sorts. */
export const MULTI_GROUP = '\u0003multi';
/**
 * Labels of maps and sorts the kernel has seen (levelLabels registers them), used only when a caller's Labels lack
 * one — so a statement never prints an internal id like "pi" for π.
 */
const KNOWN: Labels = {};
export function registerLabels(L: Labels): void { for (const [k, v] of Object.entries(L)) if (!k.startsWith('\u0003')) KNOWN[k] = v; }
const TEXT: Style = {
  base: (t, L) => (t.k === 'atom' ? (L[t.id] ?? t.id) : t.k === 'e' ? eText(t, L, false) : t.k === 'meta' ? t.id : '?'),
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
  base: (t, L) => (t.k === 'atom' ? texLabel(L[t.id] ?? t.id) : t.k === 'e' ? eText(t, L, true) : t.k === 'meta' ? t.id : '?'),
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
  // Book phase C: a map frame f(x). An ACTION applies its group element to the point, as Pinter writes it:
  // σ(α, p) prints α(p), σ(gh, p) prints (gh)(p) — σ itself is never shown (labels mark actions, see actionMark).
  if (f.k === 'app') {
    if (L[actionMark(f.fn)] && f.args.length === 2) {
      const g = f.args[0]!;
      const gs = isSimple(g) || g.k === 'inv' && isSimple(g.arg) ? factorStr(g, L, st) : st.paren(termStr(g, L, st));
      return `${gs}(${termStr(f.args[1]!, L, st)})`;
    }
    const lab = L[f.fn] ?? KNOWN[f.fn] ?? f.fn;
    const name = st === TEX ? texLabel(lab) : lab;
    return `${name}(${f.args.map((a) => termStr(a, L, st)).join(', ')})`;
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

// ───────────── source text: what a text field pre-fills with (round-trips through parseTerm) ─────────────

/**
 * Source text for a term that parseTerm reads back as the same term (playtest: display text `a^6` is the word
 * aaaaaa to the parser). Powers always bracket their exponent, `a^(6)`, `(ab)^(2m+1)`; repeated factors print as
 * superscript words, `a³`; inverses `a⁻¹`, `(ab)⁻¹`; maps `f(x)`, actions `σ(g, p)` (never the display g(p));
 * identities `e`, `e_K`. Factors are juxtaposed unless two labels would run together. Metas and exponent metas
 * have no source form (they print by id; parseTerm rejects them).
 */
export function termSource(t: Term, L: Labels): string { return srcTerm(norm(t), L); }

/** Source text of an eq/neq/mem pallet (each side round-trips through parseTerm). */
export function factSource(f: Fact, L: Labels): string {
  if (f.k === 'eq' || f.k === 'neq') return `${termSource(f.l, L)} ${f.k === 'eq' ? '=' : '≠'} ${termSource(f.r, L)}`;
  if (f.k === 'mem') return `${termSource(f.t, L)} ∈ ${subText(f.sub.id, L, false)}`;
  return factText(f, L);
}

const srcLabel = (id: string, L: Labels) => L[id] ?? KNOWN[id] ?? id;
function srcPoly(p: Poly, L: Labels): string {
  if (!p.length) return '0';
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sup = (n: number) => String(n).split('').map((d) => SUP[+d]).join('');
  let out = '';
  p.forEach((m, i) => {
    let c = BigInt(m.coefficient);
    const neg = c < 0n; if (neg) c = -c;
    const vars = m.monomial.map((x) => `${x.ref.k === 'zvar' ? srcLabel(x.ref.id, L) : x.ref.id}${x.degree > 1 ? sup(x.degree) : ''}`).join('·');
    const body = vars ? (c === 1n ? vars : `${c}${vars}`) : `${c}`;
    out += i === 0 ? (neg ? `-${body}` : body) : `${neg ? '-' : '+'}${body}`;
  });
  return out;
}
const srcSimple = (t: Term) => t.k === 'atom' || t.k === 'e' || t.k === 'meta';
function srcBase(t: Term, L: Labels): string {
  if (t.k === 'atom') return srcLabel(t.id, L);
  if (t.k === 'e') return !t.s || t.s === 'G' ? 'e' : `e_${srcLabel(t.s, L)}`;
  return t.k === 'meta' ? t.id : '?';
}
function srcFactor(f: Term, L: Labels): string {
  if (srcSimple(f)) return srcBase(f, L);
  if (f.k === 'inv') return srcSimple(f.arg) ? `${srcBase(f.arg, L)}⁻¹` : `(${srcTerm(f.arg, L)})⁻¹`;
  if (f.k === 'pow') return `${srcSimple(f.base) ? srcBase(f.base, L) : `(${srcTerm(f.base, L)})`}^(${srcPoly(f.exp, L)})`;
  if (f.k === 'app') return `${srcLabel(f.fn, L)}(${f.args.map((a) => srcTerm(a, L)).join(', ')})`;
  if (f.k === 'int') return srcPoly(f.val, L);
  return `(${srcTerm(f, L)})`;
}
function srcTerm(t: Term, L: Labels): string {
  if (t.k !== 'mul') return srcFactor(t, L);
  const names = [...Object.entries(L).filter(([k]) => !k.startsWith('\u0003')).map(([, v]) => v), 'e'];
  const parts: string[] = [];
  for (let i = 0; i < t.fs.length;) {
    let j = i + 1;
    const f = t.fs[i]!;
    while (j < t.fs.length && same(t.fs[j]!, f)) j++;
    const run = j - i;
    // a run of one simple factor is a superscript word (a³ reads back as aaa); anything else factor by factor
    if (run >= 2 && srcSimple(f) && f.k !== 'meta') { parts.push(`${srcBase(f, L)}${supNum(run)}`); i = j; continue; }
    parts.push(srcFactor(f, L)); i++;
  }
  let out = parts[0]!;
  for (let i = 1; i < parts.length; i++) {
    const prev = parts[i - 1]!, next = parts[i]!;
    // juxtapose unless a longer name would swallow the boundary (labels "a", "b" and "ab")
    const clash = names.some((n) => n.length > prev.length && (prev + next).startsWith(n) && names.includes(prev));
    out += (clash ? ' ' : '') + next;
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
  // Book phase B: t ∈ H (a binder prints as its own name; a rigid subgroup by its label)
  if (p.k === 'mem') return `${T(p.t, L)} ${tex ? '\\in' : '∈'} ${subText(p.sub.id, L, tex)}`;
  return `${T(p.l, L)} ${p.k === 'eq' ? '=' : tex ? '\\neq' : '≠'} ${T(p.r, L)}`;
}
const subText = (id: string, L: Labels, tex: boolean) => { const s = L[id] ?? id; return tex ? s.replace(/[₀-₉]+/g, (m) => `_{${[...m].map((c) => String(c.charCodeAt(0) - 0x2080)).join('')}}`) : s; };
/** Book phase B: "∀H ≤ G. " / "∀N ⊴ G. " for a card's subgroup parameters. */
const bquant = (binds: StructBinder[] | undefined, tex: boolean) =>
  (binds ?? []).map((b) => bindText(b, tex)).join('');
/** One structure parameter: H ≤ G, N ⊴ G (phase B); a group G, a set Ω, f : G → H, σ : G × Ω → Ω (phase C). */
function bindText(b: StructBinder, tex: boolean): string {
  const sr = (r: SortRef) => (typeof r === 'string' ? r : r.id);
  const q = (body: string) => (tex ? `\\forall ${body}.\\; ` : `∀${body}. `);
  switch (b.k) {
    case 'sub': return q(`${b.id} ${b.normal ? (tex ? '\\trianglelefteq' : '⊴') : (tex ? '\\le' : '≤')} ${sr(b.sort ?? 'G')}`);
    case 'grp': return q(`${b.id} ${tex ? '\\text{ a group}' : 'a group'}`);
    case 'set': return q(`${b.id} ${tex ? '\\text{ a set}' : 'a set'}`);
    case 'hom': return q(`${b.id} : ${sr(b.dom)} ${tex ? '\\to' : '→'} ${sr(b.cod)}`);
    case 'act': return q(`${b.id} : ${sr(b.grp)} ${tex ? '\\times' : '×'} ${sr(b.on)} ${tex ? '\\to' : '→'} ${sr(b.on)}`);
  }
}

export function factText(f: Fact, L: Labels): string { return factStr(f, L, false); }
export function factTex(f: Fact, L: Labels): string { return factStr(f, L, true); }

/** The label key marking map `fn` as an action (set by levelLabels for level actions, by factStr for action binders). */
export const actionMark = (fn: string) => `\u0003act:${fn}`;

/**
 * Book phase C (playtest W10–14 #3): a card's group / set parameters print with display names chosen once — groups
 * G, K, then L, M, Q (never H, which is for subgroups), sets Ω, Γ, Δ — whatever ids the card stores (S, T, G₁…).
 * Names another parameter or meta of the card already uses are skipped. Exported for UI renderers.
 */
export function displayCard<C extends Fact>(f: C): C {
  if (f.k !== 'law' && f.k !== 'cond') return f;
  const binds = f.binds ?? [];
  const sorts = binds.filter((b) => b.k === 'grp' || b.k === 'set');
  if (!sorts.length) return f;
  const taken = new Set<string>([...binds.filter((b) => b.k !== 'grp' && b.k !== 'set').map((b) => b.id), ...f.metas]);
  const ren = new Map<string, string>();
  const pools: Record<'grp' | 'set', string[]> = { grp: ['G', 'K', 'L', 'M', 'Q', 'R'], set: ['Ω', 'Γ', 'Δ', 'Λ'] };
  for (const b of sorts) {
    const name = pools[b.k as 'grp' | 'set'].find((n) => !taken.has(n)) ?? b.id;
    taken.add(name); ren.set(b.id, name);
  }
  const rs = (x: string) => ren.get(x) ?? x;
  const rr = (r: SortRef): SortRef => (typeof r === 'string' ? rs(r) : { k: 'sortmeta', id: rs(r.id) });
  const rt = (t: Term): Term => {
    switch (t.k) {
      case 'e': return t.s !== undefined && ren.has(t.s) ? { k: 'e', s: rs(t.s) } : t;
      case 'inv': return { k: 'inv', arg: rt(t.arg) };
      case 'mul': return { k: 'mul', fs: t.fs.map(rt) };
      case 'pow': return { k: 'pow', base: rt(t.base), exp: t.exp };
      case 'app': return { k: 'app', fn: t.fn, args: t.args.map(rt) };
      default: return t;
    }
  };
  const rp = (p: PatFact): PatFact => (p.k === 'mem' ? { ...p, t: rt(p.t) } : { ...p, l: rt(p.l), r: rt(p.r) });
  const nb: StructBinder[] = binds.map((b): StructBinder => {
    switch (b.k) {
      case 'grp': case 'set': return { ...b, id: rs(b.id) };
      case 'hom': return { ...b, dom: rr(b.dom), cod: rr(b.cod) };
      case 'act': return { ...b, grp: rr(b.grp), on: rr(b.on) };
      case 'sub': return b.sort !== undefined ? { ...b, sort: rr(b.sort) } : b;
    }
  });
  const ms = f.metaSorts ? Object.fromEntries(Object.entries(f.metaSorts).map(([m, r]) => [m, rr(r)])) : undefined;
  const base = { ...f, binds: nb, ...(ms ? { metaSorts: ms } : {}) };
  return (f.k === 'law' ? { ...base, l: rt(f.l), r: rt(f.r) } : { ...base, premises: f.premises.map(rp), concl: rp(f.concl) }) as C;
}

function factStr(f0: Fact, L0: Labels, tex: boolean): string {
  const f = displayCard(f0);
  // a card's action parameters print as actions too: (gh)(p) = g(h(p))
  const acts = (f.k === 'law' || f.k === 'cond') ? (f.binds ?? []).filter((b) => b.k === 'act') : [];
  const twoGroups = (f.k === 'law' || f.k === 'cond') && (f.binds ?? []).filter((b) => b.k === 'grp').length >= 2;
  const L = acts.length || twoGroups ? { ...L0, ...Object.fromEntries(acts.map((b) => [actionMark(b.id), '1'])), ...(twoGroups ? { [MULTI_GROUP]: '1' } : {}) } : L0;
  const T = tex ? termTex : termText;
  switch (f.k) {
    case 'eq': case 'neq': case 'mem': return patText(f, L, tex);
    case 'bot': return tex ? '\\bot' : '⊥';
    case 'size': return `|G| = ${f.n}`;
    case 'law': return `${bquant(f.binds, tex)}${quant(f.metas, tex)}${T(f.l, L)} = ${T(f.r, L)}`;
    case 'cond': {
      // a premise-free card reads as its conclusion (e.g. ∀H ≤ G. e ∈ H)
      // playtest W10–14 #9: a card with no premises reads as its conclusion — never a stray ⟹
      if (!f.premises.length) return `${bquant(f.binds, tex)}${quant(f.metas, tex)}${patText(f.concl, L, tex)}`;
      return `${bquant(f.binds, tex)}${quant(f.metas, tex)}${f.premises.map((p) => patText(p, L, tex)).join(', ')} ${tex ? '\\Longrightarrow' : '⟹'} ${patText(f.concl, L, tex)}`;
    }
  }
}

/** "x = ba, y = a" */
export function substText(s: Subst, L: Labels): string {
  return Object.keys(s).sort().map((k) => `${k} = ${termText(s[k]!, L)}`).join(', ');
}

// ───────────── parsing ─────────────

const SUP_MAP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
const MAX_POW = 99;

/** sort F: a map name (Book phase C, followed by its bracketed arguments); E: an identity of a named group, e_H. */
type Name = { name: string; id: string | null; sort: 'G' | 'Z' | 'F' | 'E' };

function nameTable(atoms: AtomDecl[], extra?: ParseExtra): Name[] {
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
  // Book phase C: maps (f, σ, Hom Towers f₁) and the identities of named groups (e_H, e_{H})
  for (const m of extra?.maps ?? []) {
    names.push({ name: m.label, id: m.id, sort: 'F' });
    if (/[₀-₉]/u.test(m.label)) names.push({ name: m.label.replace(/[₀-₉]/gu, (c) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(c))), id: m.id, sort: 'F' });
  }
  for (const g of extra?.sorts ?? []) if (g.kind === 'group' && g.id !== 'G') {
    names.push({ name: `e_${g.label}`, id: g.id, sort: 'E' }, { name: `e_{${g.label}}`, id: g.id, sort: 'E' });
  }
  names.sort((x, y) => y.name.length - x.name.length);
  return names;
}
/** Book phase C: what term entry needs besides the atoms (pass the level's maps and sorts, after withVars). */
export interface ParseExtra { maps?: MapDecl[]; sorts?: SortDecl[] }

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
export function parseTerm(src: string, atoms: AtomDecl[], extra?: ParseExtra):
  { ok: true; term: Term } | { ok: false; error: string } {
  const c = new Cursor(src, nameTable(atoms, extra));
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
      if (hit.sort === 'F') {
        // f(x) or σ(g, p): the map's arguments, comma-separated, in brackets
        skip();
        if (s[c.i] !== '(') throw new PErr(`${hit.name} is a map. Write ${hit.name}(…).`);
        c.i++;
        const args: Term[] = [parseTermInner()];
        skip();
        while (s[c.i] === ',') { c.i++; args.push(parseTermInner()); skip(); }
        if (s[c.i] !== ')') throw new PErr('A bracket is not closed.');
        c.i++;
        base = { k: 'app', fn: hit.id!, args };
      } else if (hit.sort === 'E') base = { k: 'e', s: hit.id! };
      else base = hit.id === null ? { k: 'e' } : { k: 'atom', id: hit.id };
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
      if (c.i >= s.length || s[c.i] === ')' || s[c.i] === ',') break;
      fs.push(parseFactor());
    }
    if (!fs.length) throw new PErr('The term is empty.');
    return mul(fs);
  };

  try {
    const t = parseTermInner();
    skip();
    if (c.i < s.length) throw new PErr(s[c.i] === ',' ? 'A comma belongs between a map’s arguments.' : 'A closing bracket has no opening one.');
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

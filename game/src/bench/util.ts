// LEMMA WORKS — bench helpers. Pure display helpers only: no legality decisions
// live here (the kernel owns those). Owner: bench builder.
import type { Addr, Fact, GapAddr, Offer, Pallet, RuleRef, Side, Term } from '../kernel/types';

export type Labels = Record<string, string>;
export type Sel = Addr | GapAddr | null;

export const sig = (t: Term): string => JSON.stringify(t);
export const wordOf = (t: Term): Term[] => (t.k === 'mul' ? t.fs : [t]);
export const isGap = (s: Sel): s is GapAddr => !!s && 'gap' in s;
export const isSpan = (s: Sel): s is Addr => !!s && !('gap' in s);

/** A slice of an already-normalized word is already normalized (no mul children). */
export function sliceTerm(fs: Term[], s: number, e: number): Term {
  const part = fs.slice(s, e);
  return part.length === 1 ? part[0]! : { k: 'mul', fs: part };
}

/** Descend a KERNEL.md path: factor index at a mul, 0 at an inv. */
export function termAtPath(root: Term, path: number[]): Term | null {
  let t: Term | undefined = root;
  for (const i of path) {
    if (!t) return null;
    if (t.k === 'mul') t = t.fs[i];
    else if (t.k === 'inv' && i === 0) t = t.arg;
    else return null;
  }
  return t ?? null;
}

/** Path of factor i of the word at `wpath` (whose term is `wt`). */
export function factorPath(wt: Term, wpath: number[], i: number): number[] {
  return wt.k === 'mul' ? [...wpath, i] : wpath;
}

const SUP_M1 = '⁻¹';
/** Unicode text (display + parseTerm-compatible). */
export function plain(t: Term, L: Labels): string {
  switch (t.k) {
    case 'atom': return L[t.id] ?? t.id;
    case 'meta': return t.id;
    case 'e': return 'e';
    case 'inv': {
      const a = t.arg;
      return a.k === 'mul' || a.k === 'inv' ? `(${plain(a, L)})${SUP_M1}` : `${plain(a, L)}${SUP_M1}`;
    }
    case 'mul': return t.fs.map((f) => plain(f, L)).join('');
  }
}

export function plainFact(f: Fact, L: Labels): string {
  switch (f.k) {
    case 'eq': return `${plain(f.l, L)} = ${plain(f.r, L)}`;
    case 'neq': return `${plain(f.l, L)} ≠ ${plain(f.r, L)}`;
    case 'bot': return '⊥';
    case 'size': return `|G| = ${f.n}`;
    case 'law': return `∀${f.metas.join(',')}. ${plain(f.l, L)} = ${plain(f.r, L)}`;
    case 'cond': return `∀${f.metas.join(',')}. ${f.premises.map((p) => plainFact(p, L)).join(', ')} ⇒ ${plainFact(f.concl, L)}`;
  }
}

export const palletEq = (a: Pallet | Fact | undefined | null, b: Pallet | Fact | undefined | null): boolean =>
  !!a && !!b && JSON.stringify(a) === JSON.stringify(b);

export const ruleEq = (a: RuleRef, b: RuleRef): boolean =>
  a.k === b.k && (a.k === 'axiom' ? a.id === (b as typeof a).id
    : a.k === 'schema' ? a.id === (b as typeof a).id && !!a.mirror === !!(b as typeof a).mirror
    : a.id === (b as typeof a).id);

/** The rule an offer leans on (first rewrite of a step offer, or the applied card). */
export function offerRules(o: Offer): RuleRef[] {
  const k = o.kind;
  if (k.k === 'steps') return k.ops.flatMap((op) => (op.k === 'rewrite' ? [op.rule] : []));
  if (k.k === 'apply') return [k.rule];
  return [];
}
export const offerUses = (o: Offer, r: RuleRef): boolean => offerRules(o).some((x) => ruleEq(x, r));

/** Is this offer a plain cancellation x⁻¹x → e / xx⁻¹ → e (first op)? */
export function isCancel(o: Offer): boolean {
  const k = o.kind;
  if (k.k !== 'steps' || !k.ops.length) return false;
  const op = k.ops[0]!;
  return op.k === 'rewrite' && op.rule.k === 'axiom' && (op.rule.id === 'invL' || op.rule.id === 'invR') && op.dir === 'fwd';
}
/** Is this offer an identity pop (e x → x or x e → x)? */
export function isPop(o: Offer): boolean {
  const k = o.kind;
  if (k.k !== 'steps' || k.ops.length !== 1) return false;
  const op = k.ops[0]!;
  return op.k === 'rewrite' && op.rule.k === 'axiom' && (op.rule.id === 'unitL' || op.rule.id === 'unitR') && op.dir === 'fwd';
}
export function isPlainInsertE(o: Offer): boolean {
  const k = o.kind;
  return k.k === 'steps' && k.ops.length === 1 && k.ops[0]!.k === 'insertE';
}

/** Longest common subsequence: matched index pairs. */
export function lcs(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: Array<[number, number]> = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push([i, j]); i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  return out;
}

/** Edit script between two words (top-level factors) for the morph preview. */
export type DiffItem = { op: 'keep' | 'del' | 'ins'; t: Term };
export function diffWords(a: Term[], b: Term[]): DiffItem[] {
  const m = lcs(a.map(sig), b.map(sig));
  const out: DiffItem[] = [];
  let i = 0, j = 0;
  for (const [mi, mj] of [...m, [a.length, b.length] as [number, number]]) {
    while (i < mi) out.push({ op: 'del', t: a[i++]! });
    while (j < mj) out.push({ op: 'ins', t: b[j++]! });
    if (i < a.length && j < b.length && mi < a.length) { out.push({ op: 'keep', t: a[i]! }); i++; j++; }
  }
  return out;
}

export const sideName = (s: Side) => (s === 'l' ? 'left' : 'right');
export const pathKey = (p: number[]) => p.join('.');
export const parsePath = (s: string | undefined): number[] => (s ? s.split('.').filter(Boolean).map(Number) : []);

// Concept-card figures — term strings for display (DOM-free, so cards.test.ts can use it).
// The kernel's parseTerm flattens written brackets; a card keeps them when they make the grouping clearer
// (DESIGN_NORMS: "use parentheses whenever they improve clarity"). A bracket NOT followed by ^ becomes a
// display-only group; everything else (a⁻¹, (ab)⁻¹, (xy)^(5) …) is parsed by the kernel, unchanged.
import * as K from '../../kernel';
import type { AtomDecl, MapDecl, Term } from '../../kernel/types';

/** One top-level factor of a displayed word: a kernel factor, or a bracketed display-only group. */
export type DFactor = { k: 'term'; t: Term } | { k: 'grp'; fs: DFactor[] };

const factorsOf = (t: Term): Term[] => (t.k === 'mul' ? t.fs : [t]);

/**
 * Map terms on cards: a name written right before a bracket, f(xy) or σ(g, p), that is not one of the figure's
 * letters is a map. The figure declares it on the fly (id = its label), so authors write maps like letters.
 */
const MAP_NAME = /([A-Za-zα-ωΑ-Ω][′']?)\(/gu;
export function figureMaps(src: string, atoms: AtomDecl[]): MapDecl[] {
  const letters = new Set(atoms.map((a) => a.label));
  const out = new Map<string, MapDecl>();
  for (const m of src.matchAll(MAP_NAME)) {
    const label = m[1]!;
    if (letters.has(label) || label === 'e' || out.has(label)) continue;
    // arity: the commas at depth 1 of its first application
    let d = 0, n = 1;
    for (let j = (m.index ?? 0) + m[0].length; j < src.length; j++) {
      const c = src[j]!;
      if (c === '(') d++;
      else if (c === ')') { if (d === 0) break; d--; }
      else if (c === ',' && d === 0) n++;
    }
    out.set(label, { id: label, label, args: Array.from({ length: n }, () => 'G'), res: 'G', kind: 'map' });
  }
  return [...out.values()];
}
const extraOf = (src: string, atoms: AtomDecl[]) => { const maps = figureMaps(src, atoms); return maps.length ? { maps } : undefined; };

/** Parse a figure term into its top-level display factors, or null when it does not read as a term. */
export function parseDisplay(src: string, atoms: AtomDecl[]): DFactor[] | null {
  const s = src.replace(/\s+/g, '');
  if (!s) return null;
  const extra = extraOf(s, atoms);
  const mapNames = new Set((extra?.maps ?? []).map((m) => m.label));
  const out: DFactor[] = [];
  let buf = '';
  const flush = (): boolean => {
    if (!buf) return true;
    let r: ReturnType<typeof K.parseTerm>;
    try { r = K.parseTerm(buf, atoms, extra); } catch { return false; }
    buf = '';
    if (!r.ok) return false;
    for (const f of factorsOf(r.term)) out.push({ k: 'term', t: f });
    return true;
  };
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '(') { buf += s[i]; continue; }
    let d = 1, j = i + 1;
    for (; j < s.length && d; j++) { if (s[j] === '(') d++; else if (s[j] === ')') d--; }
    if (d) return null; // unbalanced
    const close = j - 1;
    // an exponent x^(n), or the kernel's (…)⁻¹ / (…)^(n): not a display group
    if (buf.endsWith('^') || s[close + 1] === '^') { buf += s.slice(i, close + 1); i = close; continue; }
    // a map's argument bracket f( … ) belongs to the term (the frame is the bracket)
    const fn = /([A-Za-zα-ωΑ-Ω][′']?)$/u.exec(buf)?.[1];
    if (fn && mapNames.has(fn)) { buf += s.slice(i, close + 1); i = close; continue; }
    if (!flush()) return null;
    const inner = parseDisplay(s.slice(i + 1, close), atoms);
    if (!inner) return null;
    out.push({ k: 'grp', fs: inner });
    i = close;
  }
  return flush() && out.length ? out : null;
}

/** The kernel term a display word stands for (groups flattened). */
export function displayTerm(fs: DFactor[]): Term {
  const flat = (f: DFactor): Term[] => (f.k === 'term' ? [f.t] : f.fs.flatMap(flat));
  const all = fs.flatMap(flat);
  return all.length === 1 ? all[0]! : K.norm({ k: 'mul', fs: all });
}

/** A figure statement: [∀x, y.] side (= | ≠) side, chained with ⟹ / ⇒; or ⊥ alone. */
export type DSide = DFactor[];
export interface DRails { l: DSide; rel?: '=' | '≠' | '∈'; r?: DSide; /** for ∈: the subgroup's name (drawn as its Euler set) */ sub?: Subgroup }
/** A subgroup on a card: its name, normal (⊴, written ⊴N) or not. */
export interface Subgroup { label: string; normal: boolean }
/** A subgroup cell: an optional ⊴, then a capital letter with optional subscript digits (H, K, N₁, ⊴N). */
export function parseSubgroup(src: string): Subgroup | null {
  const m = /^(⊴)?\s*([A-Z][₀-₉]*)$/u.exec(src.trim());
  return m ? { label: m[2]!, normal: !!m[1] } : null;
}
export interface DFig { forall?: string[]; parts: DRails[]; bot?: boolean }

export function parseDisplayFig(src: string, atoms: AtomDecl[]): DFig | null {
  let s = src.trim();
  if (s === '⊥') return { parts: [], bot: true };
  let forall: string[] | undefined;
  const m = /^∀\s*([^.]+)\.\s*(.*)$/.exec(s);
  if (m) { forall = m[1]!.split(',').map((x) => x.trim()).filter(Boolean); s = m[2]!; }
  const parts: DRails[] = [];
  for (const p of s.split(/⟹|⇒/)) {
    const q = /^(.*?)(≠|=|∈)(.*)$/.exec(p.trim());
    if (!q) { const l = parseDisplay(p, atoms); if (!l) return null; parts.push({ l }); continue; }
    if (q[2] === '∈') {
      const l = parseDisplay(q[1]!, atoms), sub = parseSubgroup(q[3]!);
      if (!l || !sub) return null;
      parts.push({ l, rel: '∈', sub });
      continue;
    }
    const l = parseDisplay(q[1]!, atoms), r = parseDisplay(q[3]!, atoms);
    if (!l || !r) return null;
    parts.push({ l, rel: q[2] as '=' | '≠', r });
  }
  return { forall, parts };
}

/** Relations a maths row draws between its terms. */
export const RELS = ['=', '≠', '⟹', ',', '⇏', '∈'];

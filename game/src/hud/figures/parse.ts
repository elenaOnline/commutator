// Concept-card figures — term strings for display (DOM-free, so cards.test.ts can use it).
// The kernel's parseTerm flattens written brackets; a card keeps them when they make the grouping clearer
// (DESIGN_NORMS: "use parentheses whenever they improve clarity"). A bracket NOT followed by ^ becomes a
// display-only group; everything else (a⁻¹, (ab)⁻¹, (xy)^(5) …) is parsed by the kernel, unchanged.
import * as K from '../../kernel';
import type { AtomDecl, Term } from '../../kernel/types';

/** One top-level factor of a displayed word: a kernel factor, or a bracketed display-only group. */
export type DFactor = { k: 'term'; t: Term } | { k: 'grp'; fs: DFactor[] };

const factorsOf = (t: Term): Term[] => (t.k === 'mul' ? t.fs : [t]);

/** Parse a figure term into its top-level display factors, or null when it does not read as a term. */
export function parseDisplay(src: string, atoms: AtomDecl[]): DFactor[] | null {
  const s = src.replace(/\s+/g, '');
  if (!s) return null;
  const out: DFactor[] = [];
  let buf = '';
  const flush = (): boolean => {
    if (!buf) return true;
    const r = K.parseTerm(buf, atoms);
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
export interface DRails { l: DSide; rel?: '=' | '≠'; r?: DSide }
export interface DFig { forall?: string[]; parts: DRails[]; bot?: boolean }

export function parseDisplayFig(src: string, atoms: AtomDecl[]): DFig | null {
  let s = src.trim();
  if (s === '⊥') return { parts: [], bot: true };
  let forall: string[] | undefined;
  const m = /^∀\s*([^.]+)\.\s*(.*)$/.exec(s);
  if (m) { forall = m[1]!.split(',').map((x) => x.trim()).filter(Boolean); s = m[2]!; }
  const parts: DRails[] = [];
  for (const p of s.split(/⟹|⇒/)) {
    const q = /^(.*?)(≠|=)(.*)$/.exec(p.trim());
    if (!q) { const l = parseDisplay(p, atoms); if (!l) return null; parts.push({ l }); continue; }
    const l = parseDisplay(q[1]!, atoms), r = parseDisplay(q[3]!, atoms);
    if (!l || !r) return null;
    parts.push({ l, rel: q[2] as '=' | '≠', r });
  }
  return { forall, parts };
}

/** Relations a maths row draws between its terms. */
export const RELS = ['=', '≠', '⟹', ',', '⇏'];

// COMMUTATOR v4.1 — bead strips: a term or an equation as small bead rails, with the factors a rule
// touches tinted in that rule's family ink (design/v4/COPY.md rule 7). Used by concept-card figures and by
// the recipe picker's before → after previews. Variables are solid fills (VAR), never hatching.
import * as K from '../kernel';
import type { AtomDecl, Family, Term } from '../kernel/types';
import { FAMILY } from '../ui/tokens';
import { beads } from './beads';
import { h } from './util';

export type Rails = { l: Term; rel?: '=' | '≠'; r?: Term };
type Labels = Record<string, string>;
type Hues = Record<string, number>;

/** Parse "ab", "a^-1ab = b", "x ≠ e" against atoms (+ illustrative towers). */
export function parseRails(src: string, atoms: AtomDecl[]): Rails | null {
  const m = /^(.*?)(≠|!=|=)(.*)$/.exec(src);
  const one = (x: string) => { const r = K.parseTerm(x.trim().replace(/_(\d+)/g, (_y, d: string) => [...d].map((c) => '₀₁₂₃₄₅₆₇₈₉'[+c]).join('')), atoms); return r.ok ? r.term : null; };
  try {
    if (!m) { const t = one(src); return t ? { l: t } : null; }
    const l = one(m[1]!), r = one(m[3]!);
    return l && r ? { l, rel: m[2] === '=' ? '=' : '≠', r } : null;
  } catch { return null; }
}

/** Tint top-level factors [s, e) of a rendered rail in an ink. */
function tint(rail: HTMLElement, range: [number, number] | 'all' | undefined, ink: string) {
  if (!range) return;
  const fs = [...rail.querySelectorAll<HTMLElement>(':scope .bn-word-root > .bn-f, :scope > .bn-word > .bn-f')];
  const top = fs.length ? fs : [...rail.querySelectorAll<HTMLElement>('.bn-f')].filter((f) => !f.parentElement?.closest('.bn-f'));
  top.forEach((f, i) => { if (range === 'all' || (i >= range[0] && i < range[1])) { f.classList.add('h3-tint'); f.style.setProperty('--tint', ink); } });
}

/** One strip: a term, or both rails of an equation. Tints apply to the rail(s) that change (`which`). */
type Range = [number, number] | 'all';
export function stripEl(r: Rails, L: Labels, H: Hues, opts: { range?: Range; ranges?: { l?: Range; r?: Range }; ink?: string; which?: 'l' | 'r' | 'both'; vars?: Map<string, 'G' | 'Z'> } = {}): HTMLElement {
  const ink = opts.ink ?? FAMILY.equation.ink;
  const wrap = h('span', { class: 'h3-strip-term' });
  const railOf = (t: Term, side: 'l' | 'r') => {
    const b = markVarBeads(beads(t, L, H), opts.vars);
    if (opts.ranges) tint(b, opts.ranges[side], ink);
    else if (opts.which === 'both' || (opts.which ?? (r.r ? 'r' : 'l')) === side) tint(b, opts.range, ink);
    return b;
  };
  wrap.append(railOf(r.l, 'l'));
  if (r.r) wrap.append(h('span', { class: 'h3-strip-rel math' }, r.rel ?? '='), railOf(r.r, 'r'));
  return wrap;
}

/** before → after, each side tinted where the rule acts / what it made. */
export function transformEl(before: Rails, after: Rails, L: Labels, H: Hues, o: { family: Family; hit?: Range; made?: Range; hitR?: { l?: Range; r?: Range }; madeR?: { l?: Range; r?: Range }; which?: 'l' | 'r' | 'both'; vars?: Map<string, 'G' | 'Z'>; struck?: boolean; arrow?: string }): HTMLElement {
  const ink = FAMILY[o.family]?.ink ?? FAMILY.equation.ink;
  const el = h('span', { class: `h3-tf${o.struck ? ' struck' : ''}`, style: `--tint:${ink}` },
    stripEl(before, L, H, { range: o.hit, ranges: o.hitR, ink, which: o.which, vars: o.vars }),
    h('span', { class: 'h3-tf-arrow', 'aria-hidden': 'true' }, o.arrow ?? '→'),
    stripEl(after, L, H, { range: o.made, ranges: o.madeR, ink, which: o.which, vars: o.vars }));
  return el;
}

/** Variables drawn as solid fills: element variables violet, integer variables teal (tokens VAR). */
export function markVarBeads<T extends HTMLElement>(el: T, vars?: Map<string, 'G' | 'Z'>): T {
  if (!vars?.size) return el;
  el.querySelectorAll<HTMLElement>('.bn-f[data-leaf]').forEach((f) => {
    const leaf = f.dataset.leaf ?? '';
    const id = leaf.startsWith('a:') ? leaf.slice(2) : leaf.startsWith('i:') ? (/"id":"([^"]+)"/.exec(leaf)?.[1] ?? '') : '';
    const sort = id ? vars.get(id) : undefined;
    if (sort) f.classList.add('h3-varbead', sort === 'Z' ? 'z' : 'g');
  });
  return el;
}

// ───────── card figure expressions: [∀x,y. ] side (= | ≠) side ( ⇒ … )? · '⊥' ─────────
export interface FigExpr { forall?: string[]; parts: Rails[]; bot?: boolean }
export function parseFig(src: string, atoms: AtomDecl[]): FigExpr | null {
  let s = src.trim();
  if (s === '⊥') return { parts: [], bot: true };
  let forall: string[] | undefined;
  const m = /^∀\s*([^.]+)\.\s*(.*)$/.exec(s);
  if (m) { forall = m[1]!.split(',').map((x) => x.trim()).filter(Boolean); s = m[2]!; }
  const parts = s.split('⇒').map((x) => parseRails(x.trim(), atoms));
  if (parts.some((p) => !p)) return null;
  return { forall, parts: parts as Rails[] };
}
/** A figure expression as one strip; `range` counts top-level factors across the whole strip, left rail first. */
export function figEl(e: FigExpr, L: Labels, H: Hues, o: { range?: [number, number] | 'all'; ink?: string; vars?: Map<string, 'G' | 'Z'> } = {}): HTMLElement {
  const wrap = h('span', { class: 'h3-strip-term' });
  if (e.bot) { wrap.append(h('span', { class: 'h3-bot math', style: o.range ? `color:${o.ink}` : '' }, '⊥')); return wrap; }
  if (e.forall?.length) wrap.append(h('span', { class: 'h3-strip-q math', html: `∀${e.forall.map((v) => `<i class="m-atom any ${o.vars?.get(v) === 'Z' ? 'z' : 'g'}">${v}</i>`).join(', ')}.` }));
  const rails: HTMLElement[] = [];
  e.parts.forEach((p, i) => {
    if (i) wrap.append(h('span', { class: 'h3-strip-rel math' }, '⇒'));
    const l = markVarBeads(beads(p.l, L, H), o.vars);
    wrap.append(l); rails.push(l);
    if (p.r) { const r = markVarBeads(beads(p.r, L, H), o.vars); wrap.append(h('span', { class: 'h3-strip-rel math' }, p.rel ?? '='), r); rails.push(r); }
  });
  if (o.range) {
    const tops = rails.flatMap((r) => [...r.querySelectorAll<HTMLElement>('.bn-f')].filter((f) => !f.parentElement?.closest('.bn-f')));
    tops.forEach((f, i) => { if (o.range === 'all' || (i >= o.range![0] && i < o.range![1])) { f.classList.add('h3-tint'); f.style.setProperty('--tint', o.ink ?? FAMILY.equation.ink); } });
  }
  return wrap;
}

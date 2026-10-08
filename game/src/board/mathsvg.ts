// LEMMA WORKS board — SVG typesetting of terms/facts as <tspan>s (Latin Modern).
// Mirrors src/ui/math.ts (italic letters, upright operators, −1 superscripts,
// runs ≥ 3 compress to powers). Superscripts use baseline-shift, so baselines
// never drift (the empty-tspan dy gotcha from visual-direction.md §3).
import type { Fact, Term } from '../kernel/types';
import { exponentText } from '../kernel';

export type Labels = Record<string, string>;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const same = (a: Term, b: Term) => JSON.stringify(a) === JSON.stringify(b);

const it = (s: string) => `<tspan font-style="italic">${esc(s)}</tspan>`;
const up = (s: string) => `<tspan font-style="normal">${esc(s)}</tspan>`;
const sup = (s: string) => `<tspan font-style="normal" font-size="68%" baseline-shift="38%">${esc(s)}</tspan>`;
const rel = (s: string) => up(` ${s} `);

export function termSVG(t: Term, L: Labels): string {
  const one = (t: Term): string => {
    switch (t.k) {
      case 'atom': return it(L[t.id] ?? t.id);
      case 'meta': return it(t.id);
      case 'e': return it('e');
      case 'inv': {
        const a = t.arg;
        const simple = a.k === 'atom' || a.k === 'meta' || a.k === 'e';
        return simple ? `${one(a)}${sup('−1')}` : `${up('(')}${termSVG(a, L)}${up(')')}${sup('−1')}`;
      }
      case 'mul': return termSVG(t, L);
      case 'pow': {
        const b = t.base;
        const simple = b.k === 'atom' || b.k === 'meta' || b.k === 'e';
        return `${simple ? one(b) : `${up('(')}${termSVG(b, L)}${up(')')}`}${sup(exponentText(t.exp, L))}`;
      }
      case 'int': return up(exponentText(t.val, L));
    }
  };
  if (t.k !== 'mul') return one(t);
  const fs = t.fs;
  let out = '';
  for (let i = 0; i < fs.length;) {
    let j = i + 1;
    while (j < fs.length && same(fs[j]!, fs[i]!)) j++;
    const run = j - i, f = fs[i]!;
    if (run >= 3 && (f.k === 'atom' || f.k === 'meta' || f.k === 'e')) { out += one(f) + sup(String(run)); i = j; continue; }
    if (run >= 3 && f.k === 'inv' && (f.arg.k === 'atom' || f.arg.k === 'e')) { out += one(f.arg) + sup('−' + run); i = j; continue; }
    // repeated block (ab)(ab)(ab)… → (ab)ⁿ, a board-only compression for long words
    let done = false;
    for (let w = 2; w <= 3 && !done; w++) {
      if (i + w * 3 > fs.length) continue;
      const block = fs.slice(i, i + w);
      let n = 1;
      while (i + (n + 1) * w <= fs.length && fs.slice(i + n * w, i + (n + 1) * w).every((x, k) => same(x, block[k]!))) n++;
      if (n >= 3) { out += up('(') + block.map(one).join('') + up(')') + sup(String(n)); i += n * w; done = true; }
    }
    if (done) continue;
    out += one(f); i++;
  }
  return out;
}

export function factSVG(f: Fact, L: Labels): string {
  switch (f.k) {
    case 'eq': return termSVG(f.l, L) + rel('=') + termSVG(f.r, L);
    case 'neq': return termSVG(f.l, L) + rel('≠') + termSVG(f.r, L);
    case 'bot': return up('⊥');
    case 'size': return up('|') + it('G') + up('|') + rel('=') + up(String(f.n));
    case 'law': return (f.metas.length ? up('∀') + f.metas.map(it).join(up(', ')) + up('. ') : '') + termSVG(f.l, L) + rel('=') + termSVG(f.r, L);
    case 'cond': {
      const prem = f.premises.map((p) => factSVG(p, L)).join(up(', '));
      return (f.metas.length ? up('∀') + f.metas.map(it).join(up(', ')) + up('. ') : '') + prem + rel('⇒') + factSVG(f.concl, L);
    }
  }
}

/** Plain-text approximation for aria labels / titles. */
export function factPlain(f: Fact | undefined, L: Labels): string {
  if (!f) return '';
  const tp = (t: Term): string => {
    switch (t.k) {
      case 'atom': return L[t.id] ?? t.id;
      case 'meta': return t.id;
      case 'e': return 'e';
      case 'inv': return (t.arg.k === 'mul' ? `(${tp(t.arg)})` : tp(t.arg)) + '⁻¹';
      case 'mul': return t.fs.map(tp).join('');
      case 'pow': return `${t.base.k === 'mul' || t.base.k === 'inv' || t.base.k === 'pow' ? `(${tp(t.base)})` : tp(t.base)}^(${exponentText(t.exp, L)})`;
      case 'int': return exponentText(t.val, L);
    }
  };
  switch (f.k) {
    case 'eq': return `${tp(f.l)} = ${tp(f.r)}`;
    case 'neq': return `${tp(f.l)} ≠ ${tp(f.r)}`;
    case 'bot': return '⊥';
    case 'size': return `|G| = ${f.n}`;
    case 'law': return `∀${f.metas.join(',')}. ${tp(f.l)} = ${tp(f.r)}`;
    case 'cond': return `∀${f.metas.join(',')}. ${f.premises.map((p) => factPlain(p, L)).join(', ')} ⇒ ${factPlain(f.concl, L)}`;
  }
}

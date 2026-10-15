// LEMMA WORKS v3 floor — statement typesetting as SVG <tspan>s, in the SAME 'stmt' convention as the
// order chip (shell/util.ts typeset): runs of ≥ 2 compress to powers (a², (ab)⁵), so the dock, the inlet
// and the chip always print one statement the same way. HTML (tooltips) uses shell/util fH directly.
import type { Fact, PatFact, Poly, Term } from '../kernel/types';
import { fH, tH } from '../shell/util';
import { cardAliases, eAliases, eTag, isActionApp } from '../ui/sorts';

export type Labels = Record<string, string>;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const it = (s: string) => `<tspan font-style="italic">${esc(s)}</tspan>`;
const up = (s: string) => `<tspan font-style="normal">${esc(s)}</tspan>`;
const sup = (s: string) => `<tspan font-style="normal" font-size="68%" baseline-shift="38%">${esc(s)}</tspan>`;
const rel = (s: string) => up(` ${s} `);
/** Tower variables print in their sort's ink (VAR tokens); set per floor render. */
let VAR_INK: Map<string, string> = new Map();
/** Book phase B: the subgroup family's ink (a subgroup's name in t ∈ H). */
export const SUBG_INK = '#325D4E'; // SUBGROUP.text (ui/tokens)
export const setVarInks = (m: Map<string, string>) => { VAR_INK = m; };
/** An italic letter with a REAL subscript (tower variables: x₁ → x<sub>1</sub>). */
const sub = (s: string, ink?: string) => {
  const m = /^(.*?)([₀-₉]+)$/.exec(s);
  const body = !m ? it(s) : it(m[1]!) + `<tspan font-style="normal" font-size="68%" baseline-shift="-24%">${[...m[2]!].map((c) => String(c.charCodeAt(0) - 0x2080)).join('')}</tspan>`;
  return ink ? `<tspan fill="${ink}">${body}</tspan>` : body;
};

const same = (a: Term, b: Term) => JSON.stringify(a) === JSON.stringify(b);
const simple = (x: Term) => x.k === 'atom' || x.k === 'meta' || x.k === 'e';

function tokens(fs: Term[]): { block: Term[]; k: number }[] {
  const out: { block: Term[]; k: number }[] = [];
  for (let i = 0; i < fs.length;) {
    let best = { p: 1, k: 1 };
    for (let p = 1; p <= Math.min(4, Math.floor((fs.length - i) / 2)); p++) {
      if (p === 1 && !(simple(fs[i]!) || (fs[i]!.k === 'inv' && simple((fs[i] as { arg: Term }).arg)))) continue;
      let k = 1;
      while (i + (k + 1) * p <= fs.length && fs.slice(i + k * p, i + (k + 1) * p).every((f, j) => same(f, fs[i + j]!))) k++;
      if (k >= 2 && p * k > best.p * best.k) best = { p, k };
    }
    out.push({ block: fs.slice(i, i + best.p), k: best.k });
    i += best.p * best.k;
  }
  return out;
}

export function termSVG(t: Term, L: Labels): string {
  const word = (fs: Term[]): string => tokens(fs).map((tk) => {
    if (tk.k === 1) return tk.block.map(one).join('');
    if (tk.block.length === 1) {
      const f = tk.block[0]!;
      if (f.k === 'inv') return one(f.arg) + sup(`−${tk.k}`);
      return one(f) + sup(String(tk.k));
    }
    return up('(') + word(tk.block) + up(')') + sup(String(tk.k));
  }).join('');
  const one = (x: Term): string => {
    switch (x.k) {
      case 'atom': return sub(L[x.id] ?? x.id, VAR_INK.get(x.id));
      case 'meta': return it(x.id);
      // Book phase C: e_K once two groups are in play (NORMS › Sorts)
      case 'e': { const tg = eTag(x); return tg ? it('e') + `<tspan font-style="italic" font-size="68%" baseline-shift="-24%">${esc(tg)}</tspan>` : it('e'); }
      case 'inv': return simple(x.arg) ? one(x.arg) + sup('−1') : up('(') + termSVG(x.arg, L) + up(')') + sup('−1');
      case 'mul': return word(x.fs);
      case 'pow': return (simple(x.base) ? one(x.base) : up('(') + termSVG(x.base, L) + up(')')) + sup(polyText(x.exp, L));
      case 'int': return up(polyText(x.val, L));
      // Book phase C: a map applied, f(x) (plain until the Maps visuals land)
      case 'app': if (isActionApp(x)) { const g = x.args[0]!; return (simple(g) || (g.k === 'inv' && simple(g.arg)) ? one(g) : up('(') + termSVG(g, L) + up(')')) + up('(') + termSVG(x.args[1]!, L) + up(')'); }
        return it(L[x.fn] ?? x.fn.replace(/^\$\d+:/, '')) + up('(') + x.args.map((a) => termSVG(a, L)).join(up(', ')) + up(')');
    }
  };
  return t.k === 'mul' ? word(t.fs) : one(t);
}

const SUPD: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
/** An exponent polynomial as text: 5k, n₁, 2n₁ + 3, n₁²m₁ (ℤ towers by their labels, metas by name). */
export function polyText(p: Poly, L: Labels): string {
  if (!p.length) return '0';
  const parts = p.map((t, i) => {
    const c = BigInt(t.coefficient);
    const mono = t.monomial.map((m) => (L[m.ref.id] ?? m.ref.id) + (m.degree > 1 ? [...String(m.degree)].map((d) => SUPD[d] ?? d).join('') : '')).join('');
    const mag = c < 0n ? -c : c;
    const body = mono ? (mag === 1n ? mono : `${mag}${mono}`) : `${mag}`;
    return (i === 0 ? (c < 0n ? '−' : '') : c < 0n ? ' − ' : ' + ') + body;
  });
  return parts.join('');
}

export function factSVG(f: Fact | PatFact, L0: Labels): string {
  // a card's parameters: subgroups (H ≤ G), groups (G, K — never S / T), homomorphisms (f : G → K), then elements (#5)
  const binds = f.k === 'law' || f.k === 'cond' ? f.binds ?? [] : [];
  const L: Labels = { ...L0 };
  const pos = (id: string) => id.replace(/^\$\d+:/, '');
  // groups G, K, L … (never H), sets Ω, Γ: the kernel's display names, as on every HUD card (KERNEL-EXT §5.13)
  Object.assign(L, cardAliases(binds, f.k === 'law' || f.k === 'cond' ? f.metas : []));
  const nm = (id: string) => sub(L[id] ?? pos(id));
  const sr = (r: unknown) => (r === undefined ? it('G') : nm(typeof r === 'string' ? r : (r as { id: string }).id));
  const one = (b: (typeof binds)[number]): string => {
    switch (b.k) {
      case 'sub': return `<tspan fill="${SUBG_INK}">${nm(b.id)}</tspan>` + rel(b.normal ? '⊴' : '≤') + sr(b.sort);
      case 'hom': return nm(b.id) + up(' : ') + sr(b.dom) + rel('→') + sr(b.cod);
      case 'act': return nm(b.id) + up(' : ') + sr(b.grp) + up(' × ') + sr(b.on) + rel('→') + sr(b.on);
      default: return nm(b.id);
    }
  };
  const q = (ms: string[]) => {
    const parts = [...binds.map(one), ...(ms.length ? [ms.map(it).join(up(', '))] : [])];
    return parts.length ? up('∀') + parts.join(up(', ')) + up('. ') : '';
  };
  const prev = eAliases.cur;
  eAliases.cur = { ...prev, ...Object.fromEntries(binds.filter((b) => b.k === 'grp' || b.k === 'set').map((b) => [b.id, L[b.id]!])) };
  try {
  switch (f.k) {
    case 'eq': return termSVG(f.l, L) + rel('=') + termSVG(f.r, L);
    case 'neq': return termSVG(f.l, L) + rel('≠') + termSVG(f.r, L);
    case 'bot': return up('⊥');
    // Book phase C: a group's order names its group, |K| = 3 (#3)
    case 'size': return up('|') + (f.s ? nm(f.s) : it('G')) + up('|') + rel('=') + up(String(f.n));
    case 'law': return q(f.metas) + termSVG(f.l, L) + rel('=') + termSVG(f.r, L);
    // no premises: no stray ⟹ (#9)
    case 'cond': return q(f.metas) + (f.premises.length ? f.premises.map((p) => factSVG(p, L)).join(up(', ')) + rel('⟹') : '') + factSVG(f.concl, L); // NORMS: ⟹ for implication
    // Book phase B: t ∈ H, the subgroup in its own ink
    case 'mem': return termSVG(f.t, L) + rel('∈') + `<tspan class="fl-subg" fill="${SUBG_INK}">${sub(L[f.sub.id] ?? pos(f.sub.id))}</tspan>`;
  }
  } finally { eAliases.cur = prev; }
}

/** Rough rendered width in px at font-size 1 (for collision boxes). */
export function factWidth(f: Fact | PatFact | { k: 'term'; t: Term }, L: Labels): number {
  const tw = (t: Term): number => {
    const one = (x: Term): number => (x.k === 'mul' ? x.fs.reduce((s, y) => s + one(y), 0) : x.k === 'inv' ? (simple(x.arg) ? 0.5 + 0.55 : 1 + one(x.arg) + 0.55) : (L[(x as { id?: string }).id ?? ''] ?? 'x').length * 0.5);
    return one(t);
  };
  switch (f.k) {
    case 'term': return tw(f.t);
    case 'eq': case 'neq': return tw(f.l) + tw(f.r) + 1.3;
    case 'law': return tw(f.l) + tw(f.r) + 1.3 + f.metas.length * 0.8 + 0.6;
    case 'cond': return f.premises.reduce((s, p) => s + factWidth(p, L), 0) + factWidth(f.concl, L) + 1.6;
    case 'size': return 3.2;
    default: return 0.8;
  }
}

export const factHTML = (f: Fact | PatFact, L: Labels) => fH(f, L, 'stmt');
export const termHTML = (t: Term, L: Labels) => tH(t, L, 'stmt');

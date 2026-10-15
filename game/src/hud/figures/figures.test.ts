// Card figures and card TeX: memberships (x ∈ H, drawn as the subgroup's Euler set), map terms f(xy) / σ(g, p),
// and every \macro that any card (main and The Book) uses is one the card TeX knows (none prints as a bare word).
import { describe, expect, it } from 'vitest';
import type { AtomDecl } from '../../kernel/types';
import { CARDS } from '../../levels/cards';
import { BOOK_CARDS } from '../../levels/book';
import { displayTerm, figureMaps, parseDisplay, parseDisplayFig, parseSubgroup } from './parse';
import { KNOWN_MACROS, mdInline, texHTML } from './tex';

const atoms: AtomDecl[] = ['x', 'y', 'g', 'p'].map((id, hue) => ({ id, label: id, hue }));

describe('card figures: maps and memberships', () => {
  it('reads a map applied to a word as one framed term, with braces counting it as one factor', () => {
    const fs = parseDisplay('f(xy)', atoms)!;
    expect(fs).not.toBeNull();
    expect(fs.length).toBe(1);
    expect(fs[0]).toMatchObject({ k: 'term', t: { k: 'app', fn: 'f' } });
    const prod = parseDisplay('f(x)f(y)', atoms)!;
    expect(prod.map((f) => f.k === 'term' && f.t.k)).toEqual(['app', 'app']);
  });
  it('declares maps on the fly (Greek too, any arity), never for the figure’s own letters', () => {
    expect(figureMaps('σ(g, p)', atoms)).toEqual([{ id: 'σ', label: 'σ', args: ['G', 'G'], res: 'G', kind: 'map' }]);
    expect(parseDisplay('σ(g,p)', atoms)![0]).toMatchObject({ k: 'term', t: { k: 'app', fn: 'σ' } });
    expect(figureMaps('x(yx)', atoms)).toEqual([]);
    expect(parseDisplay('x(yx)', atoms)!.map((f) => f.k)).toEqual(['term', 'grp']); // a display bracket, as before
  });
  it('a homomorphism statement parses as a figure strip', () => {
    const fig = parseDisplayFig('∀x, y. f(xy) = f(x)f(y)', atoms)!;
    expect(fig.forall).toEqual(['x', 'y']);
    expect(fig.parts[0]!.rel).toBe('=');
    expect(displayTerm(fig.parts[0]!.l)).toMatchObject({ k: 'app', fn: 'f' });
  });
  it('a membership: term ∈ subgroup (normal subgroups written ⊴N)', () => {
    expect(parseSubgroup('H')).toEqual({ label: 'H', normal: false });
    expect(parseSubgroup('N₁')).toEqual({ label: 'N₁', normal: false });
    expect(parseSubgroup('⊴N')).toEqual({ label: 'N', normal: true });
    expect(parseSubgroup('xy')).toBeNull();
    const fig = parseDisplayFig('x ∈ H ⟹ x⁻¹ ∈ H', atoms)!;
    expect(fig.parts.map((p) => p.rel)).toEqual(['∈', '∈']);
    expect(fig.parts[1]!.sub).toEqual({ label: 'H', normal: false });
    expect(parseDisplayFig('xy ∈ ⊴N', atoms)!.parts[0]!.sub).toEqual({ label: 'N', normal: true });
    expect(parseDisplayFig('x ∈ xy', atoms)).toBeNull();
  });
});

describe('card TeX', () => {
  it('knows the group-theory macros (no bare words)', () => {
    expect(texHTML('\\alpha')).toContain('α');
    expect(texHTML('\\sigma: G \\to G')).toContain('→');
    expect(texHTML('x \\mapsto \\varphi(x)')).toContain('↦');
    expect(texHTML('N \\trianglelefteq G')).toContain('⊴');
    expect(texHTML('\\ker f')).toContain('<span class="m-op">ker</span>');
    expect(texHTML('f \\circ g')).toContain('∘');
    for (const m of ['alpha', 'sigma', 'to', 'mapsto', 'in', 'leq', 'trianglelefteq', 'implies', 'ker', 'circ']) {
      expect(KNOWN_MACROS.has(m), m).toBe(true);
      if (m !== 'ker') expect(texHTML(`\\${m}`), m).not.toMatch(new RegExp(`(^|>)${m}(<|$)`));
    }
  });
  it('every \\macro in every card (main and The Book) is known', () => {
    const unknown: string[] = [];
    const walk = (v: unknown, where: string) => {
      if (typeof v === 'string') { for (const m of v.matchAll(/\\([A-Za-z]+)/g)) if (!KNOWN_MACROS.has(m[1]!)) unknown.push(`${where}: \\${m[1]}`); return; }
      if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${where}[${i}]`)); return; }
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`);
    };
    for (const [id, cs] of Object.entries({ ...CARDS, ...BOOK_CARDS })) cs.forEach((c, i) => walk(c, `${id} card ${i + 1}`));
    expect(unknown).toEqual([]);
  });
  it('markdown inline keeps maths', () => {
    expect(mdInline('a map $f: G \\to K$')).toContain('→');
  });
});

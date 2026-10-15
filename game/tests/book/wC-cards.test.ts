// Concept cards of the Maps levels (NORMS): coverage and length, balanced maths, only TeX the card renderer knows,
// map-type arrows only (the NORMS exemption), terms never beads, symbols defined where they first appear, no spoilers.
import { describe, expect, it } from 'vitest';
import { CARDS as C5 } from '../../src/levels/book/w05';
import { CARDS as C6 } from '../../src/levels/book/w06';
import { CARDS as C7 } from '../../src/levels/book/w07';
import type { ConceptCard } from '../../src/levels/cards';
import { texHTML } from '../../src/hud/figures/tex';
import { BOOK_C } from './kit-wC';

const MINE = ['P6.1', 'P6.2', 'P6.3', 'P7.2', 'P8.2', 'P9.1', 'P9.2', 'P9.3', 'P9.4'];
const ALL: Record<string, ConceptCard[]> = { ...C5, ...C6, ...C7 };
const CARDS: Record<string, ConceptCard[]> = Object.fromEntries(MINE.map((id) => [id, ALL[id]!]));
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const texSpans = (s: string) => (s.match(/\$[^$]*\$/g) ?? []).map((x) => x.slice(1, -1));
const textOf = (c: ConceptCard) => [c.title, c.body, c.example, c.nearMiss, c.gesture].filter((x): x is string => !!x).join('\n');
const ordered = () => MINE.flatMap((lv) => (CARDS[lv] ?? []).map((c, i) => ({ lv, i, c })));
/** TeX commands the card renderer (hud/figures/tex.ts) draws; anything else would print as its bare name. */
const KNOWN_TEX = new Set(['forall', 'Rightarrow', 'neq', 'bot', 'in', 'geq', 'leq', 'langle', 'rangle', 'dots', 'ldots', 'cdot', 'quad', 'qquad', 'mid', 'mapsto', 'exists', 'neg', 'times', 'implies', 'Longrightarrow', 'nRightarrow', 'mathbb']);

describe('Maps levels · concept cards', () => {
  it('every level has 1–3 cards, in campaign order, and nothing else is keyed here', () => {
    for (const id of MINE) {
      expect(CARDS[id], id).toBeDefined();
      expect(CARDS[id]!.length, id).toBeGreaterThanOrEqual(1);
      expect(CARDS[id]!.length, id).toBeLessThanOrEqual(3);
    }
    expect(BOOK_C.filter((l) => MINE.includes(l.id)).map((l) => l.id)).toEqual(MINE);
  });
  it('bodies are short; maths delimiters balance; no *italic*, no maths inside bold', () => {
    for (const { lv, c } of ordered()) {
      const where = `${lv} · ${c.title}`;
      expect(c.title.trim(), where).not.toBe('');
      expect(words(c.body ?? ''), where).toBeLessThanOrEqual(c.long ? 160 : 75);
      for (const t of [c.title, c.body ?? '']) {
        expect((t.match(/\$/g) ?? []).length % 2, where).toBe(0);
        expect(t.replace(/\$[^$]*\$/g, 'M').replace(/\*\*[^*]+\*\*/g, ''), where).not.toMatch(/\*/);
      }
    }
  });
  it('only TeX the renderer knows: Greek letters and arrows are written directly', () => {
    for (const { lv, c } of ordered()) for (const m of texSpans(textOf(c))) for (const cmd of m.match(/\\([A-Za-z]+)/g) ?? []) expect(KNOWN_TEX.has(cmd.slice(1)), `${lv} · ${c.title}: ${cmd} in $${m}$`).toBe(true);
  });
  it('the renderer draws every maths span without a bare command name', () => {
    for (const { lv, c } of ordered()) for (const m of texSpans(textOf(c))) expect(texHTML(m.slice(0)), `${lv} · ${c.title}: $${m}$`).not.toMatch(/\b(sigma|alpha|pi|omega|to|circ|colon)\b/);
  });
  it('no → in maths except in map types (f: A → B); no ⇒; terms, never beads', () => {
    for (const { lv, c } of ordered()) {
      for (const m of texSpans(textOf(c))) {
        const rest = m.replace(/[A-Za-z]\w*\s*:\s*[A-Za-z_0-9]+\s*→\s*[A-Za-z_0-9]+/g, '');
        expect(rest, `${lv} · ${c.title}: $${m}$`).not.toMatch(/→|->|\\to\b|\\rightarrow|⟶/);
      }
      expect(textOf(c), `${lv} · ${c.title}`).not.toMatch(/⇒|\\Rightarrow|\bbeads?\b/i);
    }
  });
  it('every new term is defined on the first card that uses it', () => {
    const TERMS: [string, RegExp, RegExp][] = [
      ['map', /\bmap\b/i, /sends each element/],
      ['composite ∘', /∘|composit/, /applies \$?f\$? first/],
      ['injective', /injective|injectivity/i, /one-to-one/],
      ['section', /\bsection/i, /\*\*section\*\*/],
      ['surjective', /surjective|\bonto\b/i, /\*\*surjective\*\* \(onto\)/],
      ['Ω', /Ω/, /set \$Ω\$ of points/],
      ['acts', /\bacts?\b/, /\*\*acts\*\*/],
      ['stabilizer', /stabilizer/i, /\*\*stabilizer\*\*/],
      ['conjugate', /conjugate/i, /\*\*conjugate\*\*/],
      ['two groups K', /\$[^$]*\bK\b[^$]*\$/, /two groups, \$G\$ and \$K\$/],
      ['preserves products', /preserves? products/i, /\*\*preserves products\*\*/],
      ['isomorphism', /isomorphism/i, /one-to-one and onto/],
      ['homomorphism', /homomorphism/i, /\*\*homomorphism\*\* when \$f\(xy\) = f\(x\)f\(y\)\$/],
      ['Hom Tower', /Hom Tower/, /\*\*Hom Tower\*\*/],
    ];
    const cards = ordered();
    for (const [name, uses, defines] of TERMS) {
      const first = cards.find(({ c }) => uses.test(textOf(c)));
      expect(first, `${name} appears in no card`).toBeDefined();
      expect(textOf(first!.c), `${name} first appears on ${first!.lv} · ${first!.c.title}`).toMatch(defines);
    }
  });
  it('Pinter’s name is used honestly: isomorphism is the bijective kind, homomorphism the general one (named from chapter 9 on)', () => {
    const t = ordered().map(({ c }) => textOf(c)).join('\n');
    expect(t).toMatch(/isomorphism when it is also one-to-one and onto/);
    expect(t).toMatch(/is a \*\*homomorphism\*\* when/);
    // NORMS › Sorts: an action applied reads g(p), (gh)(p); the action's own symbol σ is never shown
    expect(t).not.toMatch(/σ/);
  });
  it('no card gives its level away: no solution step is stated', () => {
    // each level's own target never appears as an equation in a card; the teaching letters differ (h, k, m, τ, ρ …)
    const leak: Record<string, RegExp[]> = {
      'P6.1': [/g\(f\(x\)\)\s*=\s*g\(f\(y\)\)/, /\bapply g\b/i],
      'P6.2': [/s\(f\(x\)\)\s*=\s*x/, /f\(s\(f/],
      'P6.3': [/s\(t\(z\)\)/],
      'P7.2': [/σ\(α/, /σ\(β/],
      'P8.2': [/σ\(π,\s*p\)/, /παπ\^\{-1\}\s*\)\s*\(/],
      'P9.1': [/f\(s\(u/, /vu\b/],
      'P9.2': [/g\(uv\)/, /g\(u\)g\(v\)/],
      'P9.3': [/f\(e\)\s*=\s*e/, /f_1\(e/],
      'P9.4': [/f\(x\^\{-1\}\)/, /f_1\(x/],
    };
    for (const { lv, c } of ordered()) for (const re of leak[lv] ?? []) expect(textOf(c), `${lv} · ${c.title}`).not.toMatch(re);
  });
});

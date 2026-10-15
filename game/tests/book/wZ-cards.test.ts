// Concept-card lint for Book worlds 12–14, phase B/C levels (design/NORMS.md): coverage, copy rules, real figures, no spoilers,
// new symbols defined where they first appear. Cards are text-led (figures cannot draw f(x) or ∈ yet).
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import type { AtomDecl } from '../../src/kernel/types';
import { BOOK_CARDS, BOOK_LEVELS } from '../../src/levels/book';
import { CARDS as C12, PENDING } from '../../src/levels/book/w12';
import { CARDS as C13 } from '../../src/levels/book/w13';
import { CARDS as C14 } from '../../src/levels/book/w14';
import type { ConceptCard } from '../../src/levels/cards';
import { parseDisplay } from '../../src/hud/figures/parse';
import { WZ_IDS } from './wZ-ids';
import { lvZ } from './kit-w1214';

const ALL = { ...C12, ...C13, ...C14 };
const CARDS: Record<string, ConceptCard[]> = Object.fromEntries(Object.entries(ALL).filter(([id]) => WZ_IDS.includes(id)));
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const text = (c: ConceptCard) => [c.title, c.body ?? '', ...(c.figures ?? []).flatMap((f) => (f.k === 'math' ? f.rows.flatMap((r) => [r.label ?? '', ...r.seq.map((x) => (typeof x === 'string' ? x : [x.t, ...x.br.map((b) => b[2])].join(' ')))]) : []))].join(' ');
/** Plain reading of TeX for the spoiler check: drop $, \\, braces and spaces. */
const plain = (s: string) => s.replace(/\$|\\[a-zA-Z]+|[{}\s^]/g, '').replace(/−/g, '-');

describe('Worlds 12–14 (phase B/C) · concept cards', () => {
  it('every level (P14.3 included) has 1–3 cards, and the shipped ones reach the HUD', () => {
    for (const id of WZ_IDS) {
      expect(CARDS[id], id).toBeDefined();
      expect(CARDS[id]!.length, id).toBeGreaterThanOrEqual(1);
      expect(CARDS[id]!.length, id).toBeLessThanOrEqual(3);
      if (!PENDING.some((l) => l.id === id)) expect(BOOK_CARDS[id], id).toBeDefined();
    }
  });
  it('copy is short; maths delimiters balance; bold never wraps maths', () => {
    for (const [id, cs] of Object.entries(CARDS)) for (const c of cs) {
      const where = `${id} · ${c.title}`;
      if (c.body) expect(words(c.body), where).toBeLessThanOrEqual(c.long ? 160 : 75);
      expect((text(c).match(/\$/g) ?? []).length % 2, where).toBe(0);
      for (const b of text(c).match(/\*\*[^*]+\*\*/g) ?? []) expect(b, where).not.toMatch(/\$/);
    }
  });
  it('terms never beads; ⟹ not ⇒; an arrow only in a map type f: A → B; no old flavour names', () => {
    for (const [id, cs] of Object.entries(CARDS)) for (const c of cs) {
      const t = text(c), where = `${id} · ${c.title}`;
      expect(t, where).not.toMatch(/\bbeads?\b|⇒|\\Rightarrow|Witness Stamp|Cancel Lathe|Double Flip|idle|plant/i);
      const arrows = t.match(/.{0,8}(→|\\to\b|↦|\\mapsto|⟶)/g) ?? [];
      for (const a of arrows) expect(a, where).toMatch(/[a-zA-Zπφ\\]+(_1)?: [A-Z](_1)? →$/);
    }
  });
  it('new symbols are defined on the first card that uses them (ker, ∩, ≅, ran, G/N, natural homomorphism)', () => {
    const SYMBOLS: [string, RegExp, RegExp][] = [
      ['ker', /\\ker/, /\*\*kernel\*\*/],
      ['∩', /\\cap/, /set of elements common/],
      ['≅', /\\cong/, /isomorphic/],
      ['ran', /operatorname\{ran\}/, /\*\*range\*\*/],
      ['G/N', /G\/N/, /modulo/],
      ['homomorphism', /homomorphism/, /\*\*homomorphism\*\*/],
    ];
    const ordered = [...BOOK_LEVELS, ...PENDING].sort((p, q) => p.index - q.index).flatMap((lv) => (ALL[lv.id] ?? BOOK_CARDS[lv.id] ?? []).map((c) => ({ lv: lv.id, c })));
    for (const [sym, uses, defines] of SYMBOLS) {
      const first = ordered.find(({ c }) => uses.test(text(c)));
      if (!first || !CARDS[first.lv]) continue;
      expect(text(first.c), `${sym} first appears on ${first.lv} (${first.c.title})`).toMatch(defines);
    }
  });
  it('no card states its own level’s target (no spoilers); figures parse on plain letters', () => {
    for (const [id, cs] of Object.entries(CARDS)) {
      const L = lvZ(id);
      const labels = K.levelLabels(L);
      const targets = L.sockets.map((s) => {
        const t = s.target;
        const concl = t.k === 'cond' ? t.concl : t.k === 'law' ? { k: 'eq' as const, l: t.l, r: t.r } : t;
        return plain(K.factText(concl as K.Pallet, labels));
      });
      for (const c of cs) {
        const body = plain(text(c));
        for (const t of targets) if (t.length > 6) expect(body.includes(t), `${id} · ${c.title} shows ${t}`).toBe(false);
        for (const f of c.figures ?? []) if (f.k === 'math') {
          const atoms: AtomDecl[] = (f.atoms ?? []).map((a) => ({ id: a.id, label: a.label, hue: a.hue }));
          for (const r of f.rows) for (const x of r.seq) {
            const t = typeof x === 'string' ? x : x.t;
            if (['=', '≠', '⟹', ','].includes(t)) continue;
            expect(parseDisplay(t, atoms), `${id}: ${t}`).not.toBeNull();
          }
        }
      }
    }
  });
});

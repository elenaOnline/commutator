// The Book's phase A UI hooks: open and witness docks (hole chips, never an answer before delivery), multi-desk
// room headings, and the insight that only the Paper view after ∎ may show.
import { describe, expect, it } from 'vitest';
import * as K from '../src/kernel';
import type { LevelManifest, SocketDecl } from '../src/kernel/types';
import { LEVEL_BY_ID } from '../src/levels/campaigns';
import { BOOK_LEVELS } from '../src/levels/book';
import { fH, labels, openView } from '../src/hud/util';
import { dockMathSVG, roomHeading } from '../src/floor/scene';

const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&thinsp;|&ensp;/g, ' ').replace(/\s+/g, ' ').trim();
const openLevels = BOOK_LEVELS.filter((l) => l.sockets.some((s) => K.isOpen(s)));
const a = { k: 'atom', id: 'a' } as const, b = { k: 'atom', id: 'b' } as const, d = { k: 'atom', id: 'd' } as const;
const solveFor: LevelManifest = { ...structuredClone(LEVEL_BY_ID.L01!), id: 'X', atoms: [{ id: 'a', label: 'a', hue: 0 }, { id: 'd', label: 'd', hue: 1 }],
  sockets: [{ id: 's', target: { k: 'eq', l: d, r: { k: 'meta', id: 'h' } }, allowedGivens: [], holes: [{ id: 'h', notMentioning: ['d'] }] }] };

describe('open docks', () => {
  it('show their shape with a ? chip, and never the hole\'s letter', () => {
    const ov = openView(solveFor);
    const html = ov.chips(fH(ov.level.sockets[0]!.target, labels(ov.level)));
    expect(text(html)).toBe('d = ?');
    expect(html).toContain('class="m-hole"');
    expect(html).not.toContain('¤');
  });
  it('fill the chip with the answer once delivered', () => {
    const ov = openView(solveFor, { s: { h: { k: 'mul', fs: [a, a] } } });
    const html = ov.chips(fH(ov.level.sockets[0]!.target, labels(ov.level)));
    expect(html).toContain('m-hole filled');
    expect(text(html)).toMatch(/^d = a/);
  });
  it('keep a compound answer in parentheses under a power: ab = (ad)²', () => {
    const sq: LevelManifest = { ...solveFor, sockets: [{ id: 's', target: { k: 'eq', l: { k: 'mul', fs: [a, b] }, r: { k: 'mul', fs: [{ k: 'meta', id: 'y' }, { k: 'meta', id: 'y' }] } }, allowedGivens: [], holes: [{ id: 'y' }] }] };
    const ad = { k: 'mul', fs: [a, d] } as const;
    const ov = openView(sq, { s: { y: ad } });
    expect(text(ov.chips(fH(ov.level.sockets[0]!.target, labels(ov.level))))).toBe('ab = (ad)2');
    expect(text(dockMathSVG(sq.sockets[0]!, { a: 'a', b: 'b', d: 'd' }, { y: ad }))).toBe('ab = (ad)2');
  });
  it('draw the same on the floor (SVG)', () => {
    const sk = solveFor.sockets[0] as SocketDecl;
    const open = dockMathSVG(sk, { a: 'a', d: 'd' });
    expect(open).toContain('fl-hole');
    expect(text(open)).toBe('d = ?');
    expect(dockMathSVG(sk, { a: 'a', d: 'd' }, { h: b })).toContain('is-filled');
  });
  it.each(openLevels.map((l) => [l.id]))('%s: every statement shows chips, no raw hole letters', (id) => {
    const lv = LEVEL_BY_ID[id]!;
    const ov = openView(lv);
    for (const sk of ov.level.sockets) {
      const html = ov.chips(fH(sk.target, labels(ov.level)));
      expect(html).not.toContain('¤');
      if (lv.sockets.find((x) => x.id === sk.id)!.holes?.length) expect(html).toContain('m-hole');
    }
  });
});

describe('multi-desk Assume rooms', () => {
  it('the heading lists every assumption and exports P₁, P₂ ⟹ Q', () => {
    const h = roomHeading('assume', a, b, { a: 'a', b: 'b' }, 'eq', undefined, [{ rel: 'eq', l: a, r: b }, { rel: 'neq', l: b, r: { k: 'e' } }]);
    expect(h.tag).toBe('ASSUME 2');
    expect(text(h.math)).toBe('a = b, b ≠ eEXPORTS a = b, b ≠ e ⟹ Q');
  });
});

describe('memberships (Book phase B)', () => {
  it('ride a belt as one rail of terms, ∈, and the subgroup as an Euler set (no rung)', async () => {
    const { packetSVG } = await import('../src/floor/items');
    const svg = packetSVG({ k: 'fact', fact: { k: 'mem', t: { k: 'mul', fs: [a, b] }, sub: { k: 'sub', id: 'H' } } } as never, 'x', { a: 'a', b: 'b', H: 'H' }, { a: 0, b: 1 }).svg;
    expect(svg).toContain('eu-blob');
    expect(svg).toContain('∈');
    expect(svg).not.toMatch(/stroke-width="2.2" stroke-linecap="round"/); // the equation's rung
  });
  it('read t ∈ H in HTML and \\in in LaTeX, with subgroup binders as ∀H ≤ G', async () => {
    const { factTeX } = await import('../src/hud/util');
    const H = { k: 'submeta', id: 'H' } as const, x = { k: 'meta', id: 'x' } as const;
    const card = { k: 'cond', metas: ['x'], binds: [{ k: 'sub', id: 'H', normal: false }], premises: [{ k: 'mem', t: x, sub: H }], concl: { k: 'mem', t: { k: 'inv', arg: x }, sub: H } } as never;
    expect(text(fH(card, {}))).toBe('∀H ≤ G, x. x ∈ H ⟹ x−1 ∈ H');
    const tex = factTeX(card, {});
    expect(tex.startsWith('\\forall H \\leq G')).toBe(true);
    expect(tex).toContain('x \\in H \\implies x^{-1} \\in H');
  });
});

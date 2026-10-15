// Joiner chain (playtest 2026-10-15, issue 2): transitivity as displayed — a = b, b = c ⟹ a = c — in every
// orientation, oriented by recorded swaps; the display's reading wins when several fit; an honest refusal otherwise.
import { describe, expect, it } from 'vitest';
import * as K from '../kernel';
import { Floor, P, a, b, c, eq, join, order } from './compiler.testkit';

const d: K.Term = { k: 'atom', id: 'd' };
function chain(g1: K.Pallet, g2: K.Pallet, target: K.Pallet) {
  const f = new Floor(order(target, [{ id: 'g1', fact: g1 }, { id: 'g2', fact: g2 }]));
  const j = f.add(join({ k: 'chain' }));
  f.wire(f.given('g1'), j, 'a'); f.wire(f.given('g2'), j, 'b'); f.wire(j, f.socket());
  const comp = f.compile();
  return { f, j, comp, out: comp.machines[j]!.out, L: K.labelsOf(f.ctx.level.atoms) };
}
const text = (r: ReturnType<typeof chain>) => K.factText((r.out as { fact: K.Pallet }).fact, r.L);
const swaps = (r: ReturnType<typeof chain>) => r.comp.graph.nodes.filter((n) => n.meta?.station === r.j && n.meta?.gesture === 'auto-swap').length;

describe('Joiner chain accepts the shared side in any position', () => {
  it('a = b, b = c ⟹ a = c (the display: one recorded swap)', () => {
    const r = chain(eq(a, b), eq(b, c), eq(a, c));
    expect(text(r)).toBe('a = c');
    expect(r.comp.machines[r.j]!.join).toEqual({ reading: 'rl', shared: 'b', fits: ['rl'] });
    expect(swaps(r)).toBe(1);
    expect(r.comp.solvable).toBe(true);
  });
  it('a = b, c = b ⟹ a = c (no swap)', () => {
    const r = chain(eq(a, b), eq(c, b), eq(a, c));
    expect(text(r)).toBe('a = c');
    expect(r.comp.machines[r.j]!.join?.reading).toBe('rr');
    expect(swaps(r)).toBe(0);
    expect(r.comp.solvable).toBe(true);
  });
  it('b = a, b = c ⟹ a = c (two swaps)', () => {
    const r = chain(eq(b, a), eq(b, c), eq(a, c));
    expect(text(r)).toBe('a = c');
    expect(r.comp.machines[r.j]!.join?.reading).toBe('ll');
    expect(swaps(r)).toBe(2);
    expect(r.comp.solvable).toBe(true);
  });
  it('b = a, c = b ⟹ a = c', () => {
    const r = chain(eq(b, a), eq(c, b), eq(a, c));
    expect(text(r)).toBe('a = c');
    expect(r.comp.machines[r.j]!.join?.reading).toBe('lr');
    expect(r.comp.solvable).toBe(true);
  });
  it('when several readings fit, the display’s wins and the lens is told every fit', () => {
    const r = chain(eq(a, b), eq(b, b), eq(a, b));
    expect(r.comp.machines[r.j]!.join).toEqual({ reading: 'rl', shared: 'b', fits: ['rl', 'rr'] });
    expect(text(r)).toBe('a = b');
  });
  it('no shared side: an honest refusal', () => {
    const r = chain(eq(a, b), eq(c, P(d, d)), eq(a, c));
    expect(r.comp.machines[r.j]!.status).toEqual({ k: 'jammed', reason: 'a = b and c = dd share no side. Chain needs a common term.' });
  });
});

import { JAMS } from './compile';
describe('jam style (playtest #26, COPY.md rule 8)', () => {
  it('every jam message is short sentences: a capital (or a term) first, a full stop last', () => {
    const bad: string[] = [];
    for (const [k, v] of Object.entries(JAMS)) {
      if (k === 'notConnected' || k === 'lemmaNotReady' || k === 'dockFrom') continue; // empty by design / passthrough
      if (k === 'wrongKind' || k === 'ruleOther' || k === 'libNotRule' || k === 'libNotCard') continue; // checked below
      const msg = typeof v === 'function' ? (v as (...xs: unknown[]) => string)('X', 'X', 'X', 'x') : v;
      if (!/^[A-Z∀⊥|X]/u.test(msg) || !/\.$/.test(msg) || msg.split(/\. /).length > 3) bad.push(`${k}: ${msg}`);
    }
    expect(bad).toEqual([]);
    expect(JAMS.wrongKind(['eq'], 'X', 'neq')).toBe('X is an inequation. This needs an equation.');
    expect(JAMS.ruleOther('X', 'bot')).toBe('X is a contradiction (⊥). A rule needs an equation or a law.');
  });
});

// The Paper view, final playtests (design/pinter/reviews/final-w1-7.md #10, final-w8-14.md N2/N3/N22): small floors
// for the cases the Book's reference solutions do not build (a compound instance, a Joiner chain, a branched floor
// whose chains use each other), checked line by line.
import { describe, expect, it } from 'vitest';
import type { Term } from '../../src/kernel/types';
import { E, Floor, P, a, b, c, eq, join, lawRw, pop, routed, spool, type knob as _k } from '../../src/factory/compiler.testkit';
import { mkLevel } from '../../src/kernel/testkit';
import { pinGap, pinSpan } from './kit-w123';
import { lv } from './kit-w123';
import { paperOfFloor, paperText } from './paper-kit';

const kn = (t: Term) => ({ k: 'knob', term: t } as const);
const txt = (f: Floor) => { const comp = f.compile(); const { p, html } = paperOfFloor(f, comp); return { p, lines: p.lines.map((l) => paperText(`${l.lhs ? 'L ' : ''}${l.kind === 'eq' ? '' : l.html} (${l.reason})`)), html: paperText(html) }; };
void (null as unknown as typeof _k);

describe('Paper: a rule’s compound instance is grouped', () => {
  it('P3.3 with x = ba read right to left prints b(ba)(ba)a, not bbabaa', () => {
    const f = new Floor(lv('P3.3'));
    const sp = f.add(spool(P(b, a)));
    const r = f.add(lawRw({ k: 'given', givenId: 'H' }, { dir: 'rev', values: { x: kn(P(b, a)) }, gap: pinGap(eq(P(b, a), P(b, a)), 'r', 1) }));
    f.wire(sp, r);
    const { html } = txt(f);
    expect(html).toMatch(/b\(ba\)\(ba\)a/);
  });
});

describe('Paper: a Joiner’s chain reads as one chain', () => {
  it('P4.1: e′ = e′e (identity) = e (the law at x = e), with no symmetry line and no “from lines”', () => {
    const L = lv('P4.1');
    const f = new Floor(L);
    const e1: Term = { k: 'atom', id: 'e1' };
    const ee = P(e1, E);
    const s0 = f.add(spool(ee));
    const viaH = f.add(lawRw({ k: 'given', givenId: 'H' }, { values: { x: kn(E) }, target: pinSpan(eq(ee, ee), 'l', 0, 2) }));
    const viaE = f.add(pop(pinSpan(eq(ee, ee), 'l', 1, 2)));
    const ch = f.add(join({ k: 'chain' }));
    f.wire(s0, viaH); f.wire(s0, viaE); f.wire(viaH, ch, 'a'); f.wire(viaE, ch, 'b'); f.wire(ch, f.socket('s'));
    const { p } = txt(f);
    const eqs = p.lines.filter((l) => l.kind === 'eq');
    expect(eqs.map((l) => [l.lhs ? 'lhs' : '=', paperText(l.reason)])).toEqual([['lhs', 'identity'], ['=', expect.stringMatching(/ with x = e$/)]]);
    expect(eqs.map((l) => paperText(l.reason)).join(' ')).not.toMatch(/symmetry|from lines|right to left/);
  });
});

describe('Paper: chains that use each other cite backwards, and cite the line that states the fact', () => {
  // h₀: abcd = e. Chain C rewrites its left side: ab ⟶ p (h₁) gives pcd = e; chain B uses that fact; C then uses B's.
  const p_: Term = { k: 'atom', id: 'p' }, d: Term = { k: 'atom', id: 'd' };
  const level = mkLevel({
    atoms: ['a', 'b', 'c', 'd', 'p'].map((id, i) => ({ id, label: id, hue: i })),
    givens: [{ id: 'h0', name: 'h₀', fact: eq(P(a, b, c, d), E) }, { id: 'h1', name: 'h₁', fact: eq(P(a, b), p_) }],
    sockets: [{ id: 's', target: eq(E, E), allowedGivens: ['h0', 'h1'] }],
  });
  it('no forward citation; “pcd = e” is stated on its own line before it is used', () => {
    const f = new Floor(level);
    const g0 = f.c.machines.find((m) => m.config.kind === 'given' && (m.config as { givenId?: string }).givenId === 'h0')!.id;
    const c1 = f.add(lawRw({ k: 'given', givenId: 'h1' }, { target: pinSpan(eq(P(a, b, c, d), E), 'l', 0, 2) }));
    const c2 = f.add(routed({ target: pinSpan(eq(P(p_, c, d), E), 'l', 0, 3) }));
    const bs = f.add(spool(P(p_, c, d)));
    const b1 = f.add(routed({ target: pinSpan(eq(P(p_, c, d), P(p_, c, d)), 'r', 0, 3) }));
    f.wire(g0, c1); f.wire(c1, c2); f.wire(bs, b1); f.wire(c1, b1, 'rule'); f.wire(b1, c2, 'rule');
    const comp = f.compile();
    const { p, html } = paperOfFloor(f, comp);
    const lines = paperText(html.replace(/<\/div>|<\/p>/g, '\n')).split('\n').map((x) => x.trim()).filter((x) => /^\d+\./.test(x));
    for (const l of p.lines) for (const m of paperText(l.reason).matchAll(/lines? (\d+)(?:\s*(?:–|and)\s*(\d+))?/g)) for (const k of [m[1], m[2]].filter(Boolean).map(Number)) expect(k, lines.join('\n')).toBeLessThan(l.no);
    // C's first step, then the fact it made (pcd = e) on its own line, then B, then the rest of C
    expect(lines.slice(1, 5), lines.join('\n')).toEqual(['2.abcd=pcd(h₁)', '3.pcd=e(from h₀ and line 2)', '4.pcd=e(by line 3)', '5.abcd=e(by line 4)']);
  });
});

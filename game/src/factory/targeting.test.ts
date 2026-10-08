import { describe, expect, it } from 'vitest';
import * as K from '../kernel';
import { axiomCard } from '../kernel/logic';
import * as F from './index';
import { cancelCandidates } from './targeting';
import { Floor, I, P, a, b, c, eq, knob, order, status } from './compiler.testkit';

const d: K.Term = { k: 'atom', id: 'd' };
const key = (l: F.SpanLoc) => `${l.side}${l.wordPath.join('.')}:${l.s}-${l.e}`;

describe('first-match order (§6)', () => {
  it('right rail first; intervals by start then length; then inverse arguments', () => {
    const p = eq(a, P(I(P(a, b)), c));
    const ks = F.spanCandidates(p).map(key);
    expect(ks).toEqual(['r:0-1', 'r:0-2', 'r:1-2', 'r0.0:0-1', 'r0.0:0-2', 'r0.0:1-2', 'l:0-1']);
  });

  it('nested inverses are followed through argument 0', () => {
    const p = eq(a, I(I(a)));
    expect(F.spanCandidates(p, ['r']).map(key)).toEqual(['r:0-1', 'r0:0-1', 'r0.0:0-1']);
  });

  it('gaps: right root gap 0 first, then the rest of the word, then inside inverses', () => {
    const p = eq(b, P(a, I(b)));
    expect(F.gapCandidates(p).map((g) => `${g.side}${g.wordPath.join('.')}^${g.gap}`)).toEqual(['r^0', 'r^1', 'r^2', 'r1.0^0', 'r1.0^1', 'l^0', 'l^1']);
  });

  it('every candidate is canonical (kernel locate agrees)', () => {
    const p = eq(P(a, I(P(b, c)), a), P(I(a), I(I(b))));
    for (const l of F.spanCandidates(p)) expect(F.spanLocOf(p, F.spanAddr(l))!.redex).toEqual(K.norm(l.redex));
  });

  it('the fast Canceller enumeration equals matching the inverse axioms on every interval', () => {
    const terms = [P(I(a), a, b), P(a, I(a), I(a), a), P(I(P(a, b)), a, b, I(b)), P(c, I(P(a, b)), a, b, I(I(a))), P(a, b, I(P(a, b))), I(P(a, I(a)))];
    for (const t of terms) {
      const p = eq(t, t);
      const brute: string[] = [];
      for (const l of F.spanCandidates(p)) {
        if (l.e - l.s < 2) continue;
        for (const ax of ['invL', 'invR'] as const) if (K.match(axiomCard(ax).l, l.redex).length) { brute.push(`${key(l)}/${ax}`); break; }
      }
      expect(cancelCandidates(p).map((x) => `${key(x.loc)}/${x.id}`)).toEqual(brute);
    }
  });
});

describe('structural pins', () => {
  it('pinFromAddr / pinFromGap round-trip on the clicked pallet', () => {
    const p = eq(a, P(a, I(a), a, I(a)));
    for (const l of F.spanCandidates(p)) {
      const pin = F.pinFromAddr(p, F.spanAddr(l))!;
      const r = F.resolveSpanPin(p, pin);
      expect(r.ok && key(r.loc)).toBe(key(l));
    }
    for (const g of F.gapCandidates(p)) {
      const pin = F.pinFromGap(p, F.gapAddr(g))!;
      const r = F.resolveGapPin(p, pin);
      expect(r.ok && `${r.loc.wordPath}^${r.loc.gap}${r.loc.side}`).toBe(`${g.wordPath}^${g.gap}${g.side}`);
    }
    expect(F.pinFromAddr(p, { side: 'r', path: [9] })).toBeNull();
  });

  it('a pin follows an index shift when its guards survive', () => {
    const before = eq(b, P(d, I(a), a, b));
    const pin = F.pinFromAddr(before, { side: 'r', path: [], range: [1, 3] })!;
    const after = eq(b, P(c, c, d, I(a), a, b));
    const r = F.resolveSpanPin(after, pin);
    expect(r.ok && [r.loc.s, r.loc.e]).toEqual([3, 5]);
  });

  it('gone and ambiguous are reported, never replaced', () => {
    const pin = F.pinFromAddr(eq(b, P(d, c, a, b, d)), { side: 'r', path: [], range: [2, 3] })!;
    expect(pin.neighbours).toMatchObject({ left: [c], right: [b], leftEdge: false, rightEdge: false });
    expect(F.resolveSpanPin(eq(b, P(c, a, b, c, a, b)), pin)).toEqual({ ok: false, why: 'ambiguous' });
    expect(F.resolveSpanPin(eq(b, P(c, a, c)), pin)).toEqual({ ok: false, why: 'gone' });
  });

  it('compile: a pinned Canceller jams when its occurrence goes, even if another cancellation survives', () => {
    const lv = order(eq(b, b));
    const f = new Floor(lv);
    const sp = f.add({ kind: 'spool', t: knob(P(c, I(a), a, b, I(b))) });
    const pin = F.pinFromAddr(eq(P(c, I(a), a, b, I(b)), P(c, I(a), a, b, I(b))), { side: 'r', path: [], range: [1, 3] })!;
    const can = f.add({ kind: 'canceller', target: pin, tidy: true });
    f.wire(sp, can);
    let comp = f.compile();
    expect(comp.machines[can]!.chosen).toBe(0);
    expect(K.factText((comp.machines[can]!.out as { fact: K.Pallet }).fact, K.labelsOf(lv.atoms))).toBe('ca⁻¹abb⁻¹ = cbb⁻¹');
    // upstream changes: the a⁻¹a with neighbours c … b is gone; bb⁻¹ still cancels — but not silently
    f.c = { ...f.c, machines: f.c.machines.map((m) => (m.id === sp ? { ...m, config: { kind: 'spool', t: knob(P(I(a), a, b, I(b))) } } : m)) };
    comp = f.compile();
    expect(status(comp, can)).toEqual({ k: 'jammed', reason: 'no a⁻¹a here: the incoming right side is a⁻¹abb⁻¹' });
    expect(comp.machines[can]!.candidates!.length).toBe(4); // the lens still shows every bracket (both rails)
  });
});

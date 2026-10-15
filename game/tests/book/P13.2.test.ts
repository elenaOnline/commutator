// P13.2 Unique Cube Roots — Book world 11. Words; the press is used in its word shape (|G| = 5 ⟹ ∀x. xxxxx = e).
// Spool a → Lagrange backwards at the end gap (a = a·aaaaa) → aaa ⟶ bbb twice (h) → Lagrange (bbbbb ⟶ e), tidy: a = b.
// The press is unlocked by P13.1 (Members, not built yet); the toolset is authored as if it were done.
import { describe, expect, it } from 'vitest';
import { P, a, b, bookFloor, deliver, eq, lawRw, lvA, neededGivens, pinGap, pinSpan, spool, targetsTrue } from './kit-wA';
import { EARNED, given, kn } from './lemmas-w123';

describe('P13.2 Unique Cube Roots', () => {
  const L = lvA('P13.2');
  it('the target is true in every group under |G| = 5 and h, and both are needed (Z₃ breaks it without the size)', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
    expect(neededGivens(L, 's')).toEqual({ s: true, h: true });
  });
  it('the press is in the toolset and the order carries its |G| given', () => {
    expect(L.tools.press).toBe(true);
    expect(L.givens.find((g) => g.id === 's')!.fact).toEqual({ k: 'size', n: 5 });
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    const sp = f.add(spool(a), { x: 22, y: 6 });
    const l1 = f.add(lawRw({ k: 'lagrange' }, { dir: 'rev', gap: pinGap(eq(a, a), 'r', 1), values: { x: kn(a) } }), { x: 28, y: 6 });
    const a6 = P(a, a, a, a, a, a);
    const h1 = f.add(lawRw(given('h'), { target: pinSpan(eq(a, a6), 'r', 0, 3) }), { x: 34, y: 6 });
    const h2 = f.add(lawRw(given('h'), { target: pinSpan(eq(a, P(b, b, b, a, a, a)), 'r', 3, 6) }), { x: 40, y: 6 });
    const l2 = f.add(lawRw({ k: 'lagrange' }, { target: pinSpan(eq(a, P(b, b, b, b, b, b)), 'r', 1, 6) }), { x: 46, y: 6 });
    f.wire(sp, l1); f.wire(l1, h1); f.wire(h1, h2); f.wire(h2, l2); f.wire(l2, f.socket());
    deliver(f);
  });
});

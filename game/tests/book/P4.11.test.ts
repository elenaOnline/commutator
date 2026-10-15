// P4.11 Three Self-Inverse Elements — Book world 3. ab = c × c on the right, one c read as c⁻¹, cancel → abc = e.
// The saved xy = e ⟹ yx = e at cut a | bc → bca = e → unique left inverse → bc = a⁻¹ → a.  The same lemma at cut ab | c → cab = e → ca = b⁻¹ → b.
import { describe, expect, it } from 'vitest';
import { neededGivens, P, a, b, bookFloor, c, cancel, deliver, eq, lawRw, lv, mult, pinSpan, targetsTrue, thm } from './kit-w123';
import { EARNED, ONE_SIDED_ID, buildOneSided, given, kn, schema } from './lemmas-w123';

describe('P4.11 Three Self-Inverse Elements', () => {
  const L = lv('P4.11');
  it('both targets are true in every finite group under the givens', () => {
    const n = targetsTrue(L);
    expect(n.s).toBeGreaterThan(0);
    expect(n.t).toBeGreaterThan(0);
  });
  it('each dock allows exactly the givens it needs', () => {
    expect(L.sockets.map((s) => s.allowedGivens)).toEqual([['ha', 'hc', 'hab'], ['hb', 'hc', 'hab']]);
    for (const id of ['s', 't']) expect(neededGivens(L, id), id).toEqual(Object.fromEntries(L.sockets.find((s) => s.id === id)!.allowedGivens.map((g) => [g, true])));
  });
  it('reference solution with the saved xy = e ⟹ yx = e', () => {
    const { lemma } = buildOneSided();
    const f = bookFloor(L, EARNED, [lemma]);
    const m = f.add(mult('right', c));
    const rc = f.add(lawRw(given('hc'), { dir: 'rev', target: pinSpan(eq(P(a, b, c), P(c, c)), 'r', 1, 2) }));
    const cn = f.add(cancel());
    f.wire(f.given('hab'), m); f.wire(m, rc); f.wire(rc, cn);
    // cut a | bc
    const flip1 = f.add(thm(schema(ONE_SIDED_ID), 0, { x: kn(a), y: kn(P(b, c)) }));
    const u1 = f.add(thm(schema('witness', true), 0, { u: kn(a), v: kn(P(b, c)) }));
    const r1 = f.add(lawRw(given('ha')));
    f.wire(cn, flip1, 'p0'); f.wire(flip1, u1, 'p0'); f.wire(u1, r1); f.wire(r1, f.socket('s'));
    // cut ab | c
    const flip2 = f.add(thm(schema(ONE_SIDED_ID), 1)); // the second cut: x = ab, y = c
    const u2 = f.add(thm(schema('witness', true), 0, { u: kn(b), v: kn(P(c, a)) }));
    const r2 = f.add(lawRw(given('hb')));
    f.wire(cn, flip2, 'p0'); f.wire(flip2, u2, 'p0'); f.wire(u2, r2); f.wire(r2, f.socket('t'));
    deliver(f);
  });
});

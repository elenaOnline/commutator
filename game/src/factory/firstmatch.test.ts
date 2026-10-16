// final W1–7 #9: the default ("first match") instance. On the first side that has a match (RHS, then LHS) it takes
// the innermost frame (P8.2, P9.1), and a rule grown from e takes an e already in the word before a fresh one
// (P3.2, P4.1, P8.1; the e case is also pinned in compile.test.ts).
import { describe, expect, it } from 'vitest';
import * as K from '../kernel';
import { LEVEL_BY_ID } from '../levels/levels';
import { Floor, factOut, lawRw, spool } from './compiler.testkit';

const A = (id: string): K.Term => ({ k: 'atom', id });
const act = (g: K.Term, p: K.Term): K.Term => ({ k: 'app', fn: 'act', args: [g, p] });
const inv = (t: K.Term): K.Term => ({ k: 'inv', arg: t });

describe('first match', () => {
  it('P8.2: (gh)(p) ⟸ g(h(p)) is read at the innermost frame first: π(α(π⁻¹(π(p)))) → π(α((π⁻¹π)(p)))', () => {
    const lv = LEVEL_BY_ID['P8.2']!;
    const f = new Floor(lv);
    const t = act(A('pi'), act(A('a'), act(inv(A('pi')), act(A('pi'), A('p')))));
    const sp = f.add(spool(t));
    const rw = f.add(lawRw({ k: 'schema', id: 'act.mul' }, { dir: 'rev' }));
    f.wire(sp, rw);
    const comp = f.compile();
    expect(comp.machines[rw]!.status).toEqual({ k: 'ok' });
    const out = factOut(comp, rw);
    const want = act(A('pi'), act(A('a'), act({ k: 'mul', fs: [inv(A('pi')), A('pi')] }, A('p'))));
    expect(out.k === 'eq' && K.termEq(K.norm(out.r), K.norm(want))).toBe(true);
    expect(comp.machines[rw]!.candidates!.length).toBeGreaterThan(1); // the outer frames are still offered
  });
});

// Architect: Shared Return (R01) — two sockets, one intermediate feeding both.
import { test, expect } from 'vitest';
import { Player, ctxOf, span, gap } from '../src/kernel/testkit';
import * as K from '../src/kernel';

test('R01 solves with a shared intermediate (a² = e feeds the Witness Stamp)', () => {
  const p = new Player(ctxOf('R01'));
  let n = p.start('aa');
  n = p.play(n, gap('r', 2), /insert a⁴|insert aaaa|h₄/);
  n = p.play(n, span('r', 0, 6), /h₆/);
  expect(p.text(n)).toBe('aa = e');
  const w = p.play(n, null, (o) => /Witness Stamp/.test(o.label) && /a = a⁻¹/.test(o.label));
  expect(p.res.solved).toBe(true);
  const m = K.metrics(p.graph, p.res, p.ctx);
  console.log('R01 metrics', m, p.text(w));
});

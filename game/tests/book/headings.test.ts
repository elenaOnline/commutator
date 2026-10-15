// The Paper heading and the ∎ statement state the exact theorem a level proves (playtests W4–9 #4, W10–14 #9):
// every hypothesis of every kind, every dock, each variable bound once in its own sort, no empty binder, no stray ⟹.
import { describe, expect, it } from 'vitest';
import { BOOK_LEVELS } from '../../src/levels/book';
import { fullStatementHTML } from '../../src/hud/paper';
import { fH, labels } from '../../src/hud/util';
import { paperText } from './paper-kit';

const strip = (html: string) => paperText(html).replace(/\s+/g, ' ').trim();
/** A statement's body without its binder ("∀x, y. P ⟹ Q" → "P ⟹ Q"), as text. */
const body = (html: string) => strip(html).replace(/^∀[^.]*\.\s*/, '');

describe('Book headings state the whole theorem', () => {
  for (const lv of BOOK_LEVELS) {
    it(`${lv.id} ${lv.title}`, () => {
      const head = strip(fullStatementHTML(lv));
      if (process.env.HEAD_DUMP) console.log(`${lv.id}: ${head}`);
      const L = labels(lv);
      const allowed = new Set(lv.sockets.flatMap((k) => k.allowedGivens));
      for (const g of lv.givens.filter((x) => allowed.has(x.id))) {
        if (g.fact.k === 'size') { expect(head, `${lv.id}: the order |G| = ${g.fact.n}`).toContain(String(g.fact.n)); continue; }
        // each premise / conclusion of a law-type given appears (its binder may be written with its sort)
        const want = g.fact.k === 'cond' ? [...g.fact.premises, g.fact.concl] : g.fact.k === 'law' ? [{ k: 'eq', l: g.fact.l, r: g.fact.r }] : [g.fact];
        for (const p of want) expect(head, `${lv.id}: hypothesis ${g.name}`).toContain(body(fH(p as never, { ...L, ...Object.fromEntries(((g.fact as { metas?: string[] }).metas ?? []).map((m) => [m, m])) })));
      }
      for (const sk of lv.sockets) {
        const t = sk.target;
        if (sk.holes?.length) continue; // an open dock's holes are chips, drawn by the caller
        const want = t.k === 'cond' ? [...t.premises, t.concl] : t.k === 'law' ? [{ k: 'eq', l: t.l, r: t.r }] : [t];
        for (const p of want) expect(head, `${lv.id}: dock ${sk.id}`).toContain(body(fH(p as never, { ...L, ...Object.fromEntries(((t as { metas?: string[] }).metas ?? []).map((m) => [m, m])) })));
      }
      expect(head).not.toMatch(/For all ,|for all ,|∀\s*\.|\. ⟹|, ⟹|^⟹/);
      expect(head).not.toMatch(/\$\d|\bx\d\b/); // no positional names, no raw Tower ids
    });
  }
});

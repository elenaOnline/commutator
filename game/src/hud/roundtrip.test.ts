// Text fields pre-fill with SOURCE text (architect, reachability round): a term slot, the room editor and the room
// popover show K.termSource, never the display text — `a^6` displays a literal power but parses back as the word
// aaaaaa, so re-saving a P10.4 room assumption silently changed the maths. Every Book given and dock term must read
// back, through the slot parser in the level's own context, as the very same term.
import { describe, expect, it } from 'vitest';
import * as K from '../kernel';
import * as F from '../factory';
import type { Term } from '../kernel/types';
import { BOOK_LEVELS } from '../levels/book';
import { ctxFor } from '../state/factoryStore';
import { setSortCtx, sortCtx } from '../ui/sorts';
import { parseExtra, readSlot } from './slotparse';
import { atomsAll, labelsAll, type S } from './util';

/** Every ground term a statement of the level mentions: sides of (in)equations, the term of a membership. */
function termsOf(x: unknown, out: Term[] = []): Term[] {
  if (Array.isArray(x)) { for (const y of x) termsOf(y, out); return out; }
  if (!x || typeof x !== 'object') return out;
  const o = x as Record<string, unknown>;
  if (o.k === 'cond' || o.k === 'law') return out; // a card's terms name its binders: never typed into a slot
  if ((o.k === 'eq' || o.k === 'neq') && o.l && o.r) out.push(o.l as Term, o.r as Term);
  else if (o.k === 'mem' && o.t) out.push(o.t as Term);
  for (const v of Object.values(o)) termsOf(v, out);
  return out;
}
const ground = (t: Term) => !/"k":"(meta|zmeta|submeta|sortmeta)"/.test(JSON.stringify(t));

describe('pre-filled text round-trips through the slot parser (every Book given and dock)', () => {
  it('a literal power pre-fills as a^(6) and stays a power (P10.4 room assumption), not the word aaaaaa', () => {
    const atoms = [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }];
    const L = { a: 'a', b: 'b' };
    const six: Term = { k: 'pow', base: { k: 'atom', id: 'a' }, exp: [{ coefficient: '6', monomial: [] }] } as Term;
    const word: Term = { k: 'mul', fs: Array.from({ length: 6 }, () => ({ k: 'atom', id: 'a' }) as Term) };
    for (const t of [six, word]) {
      const r = readSlot(K.termSource(t, L), atoms);
      expect(r.k === 'ok' && K.termEq(K.norm(r.term), K.norm(t))).toBe(true);
    }
    const shown = readSlot(K.termText(six, L), atoms); // the display text is what used to pre-fill
    expect(shown.k === 'ok' && K.termEq(K.norm(shown.term), K.norm(six))).toBe(false);
  });
  it('has Book levels to check', () => expect(BOOK_LEVELS.length).toBeGreaterThan(20));
  for (const level of BOOK_LEVELS) {
    it(level.id, () => {
      const ctx = ctxFor(level, [], []);
      const canvas = F.initialCanvas(level, ctx);
      const compiled = F.compile(canvas, ctx);
      const prevS = sortCtx.cur, prevP = parseExtra.cur;
      try {
        const sc = setSortCtx(ctx, compiled.graph);
        parseExtra.cur = sc.env?.multi ? { maps: [...sc.env.maps.values()], sorts: [...sc.env.sorts.values()] } : undefined;
        const s = { level, ctx, canvas, compiled } as unknown as S;
        const atoms = atomsAll(s), L = labelsAll(s);
        const terms = termsOf([level.givens, level.sockets, level.preStarts ?? []]).filter(ground);
        const bad: string[] = [];
        for (const t of terms) {
          const src = K.termSource(t, L);
          const r = readSlot(src, atoms);
          if (r.k !== 'ok' || !K.termEq(K.norm(r.term), K.norm(t))) bad.push(`${K.termText(t, L)} → "${src}" → ${r.k === 'ok' ? K.termText(r.term, L) : r.k === 'bad' ? r.error : 'empty'}`);
        }
        expect(bad).toEqual([]);
      } finally { sortCtx.cur = prevS; parseExtra.cur = prevP; }
    });
  }
});

// Manifest sanity for Book worlds 8–9: ids, order, fields, toolsets, givens, docks, holes and cross-references.
import { describe, expect, it } from 'vitest';
import { REGISTRY } from '../../src/levels/levels';
import { BOOK_123 } from './kit-w123';
import { BOOK_89 } from './kit-w89';
import { BOOK_LEVELS, BOOK_CARDS } from '../../src/levels/book';
import type { Card, Fact, Pallet, Term } from '../../src/kernel/types';

const IDS = ['P10.1', 'P10.2', 'P10.3', 'P10.4', 'P10.5', 'P10.s1', 'P10.s2', 'P11.2', 'P11.3'];
const METHODS = ['Computation', 'Uniqueness argument', 'Cancellation', 'Solving an equation', 'If–then', 'Contradiction', 'Subgroup test', 'Preservation', 'Exponent arithmetic', 'Equivalence relation', 'Lagrange', 'Witness'];
const atomsIn = (t: Term, out: Set<string>) => {
  if (t.k === 'atom') out.add(t.id);
  else if (t.k === 'inv') atomsIn(t.arg, out);
  else if (t.k === 'mul') t.fs.forEach((f) => atomsIn(f, out));
  else if (t.k === 'pow') atomsIn(t.base, out);
};
const factAtoms = (f: Fact | Pallet | Card, out: Set<string>) => {
  if (f.k === 'eq' || f.k === 'neq' || f.k === 'law') { atomsIn(f.l, out); atomsIn(f.r, out); }
  else if (f.k === 'cond') for (const p of [...f.premises, f.concl]) { if (p.k === 'eq' || p.k === 'neq') { atomsIn(p.l, out); atomsIn(p.r, out); } }
};
/** The imports a world-8/9 level may list, in the order the book hands them out. */
const POW_ORDER = ['power.add', 'power.zero', 'power.conjugate', 'power.multiply', 'power.one', 'power.identity'];

describe('Book worlds 8–9 manifests', () => {
  it('are the SYNTHESIS list, in order (P11.1 needs Members and is not here yet)', () => {
    expect(BOOK_89.map((l) => l.id)).toEqual(IDS);
    expect(BOOK_LEVELS.filter((l) => l.world === 8 || l.world === 9).map((l) => l.id)).toEqual(IDS);
  });
  it('carry the Book fields, with strictly increasing indices, a coarse method and a post-∎ insight', () => {
    BOOK_89.forEach((l, i) => {
      expect(l.campaign, l.id).toBe('book');
      expect(l.world, l.id).toBe(l.id.startsWith('P10.') ? 8 : 9);
      expect(l.chapter, l.id).toBe(l.id.startsWith('P10.') ? 10 : 11);
      expect(METHODS, l.id).toContain(l.method);
      expect(l.insight?.trim(), l.id).toBeTruthy();
      expect(l.source?.trim(), l.id).toBeTruthy();
      expect(l.par.parts, l.id).toBeGreaterThan(0);
      if (i > 0) expect(l.index, l.id).toBeGreaterThan(BOOK_89[i - 1]!.index);
    });
    expect(BOOK_89.filter((l) => l.side).map((l) => l.id)).toEqual(['P10.s1', 'P10.s2']);
    expect(BOOK_89[0]!.index).toBeGreaterThan(BOOK_123[BOOK_123.length - 1]!.index);
  });
  it('toolsets: power.negate never; no Lagrange, no classical reasoning; imports accumulate in the book’s order', () => {
    const want: Record<string, string[]> = {
      'P10.1': POW_ORDER.slice(0, 2), 'P10.2': POW_ORDER.slice(0, 3), 'P10.3': POW_ORDER.slice(0, 5),
      'P10.4': POW_ORDER, 'P10.5': POW_ORDER, 'P10.s1': POW_ORDER, 'P10.s2': POW_ORDER, 'P11.2': POW_ORDER, 'P11.3': POW_ORDER,
    };
    for (const l of BOOK_89) {
      expect(l.tools.press, l.id).toBe(false);
      expect(l.tools.classical, l.id).toBe(false);
      expect(l.tools.conjecture, l.id).toBe(false);
      expect(l.tools.schemas, l.id).not.toContain('power.negate');
      expect(l.tools.schemas.filter((s) => s.startsWith('power.')), l.id).toEqual(want[l.id]);
      expect(l.tools.schemas.filter((s) => !s.startsWith('power.')), l.id).toEqual(['cancel', 'witness', 'socks']);
      expect(l.tools.lift, l.id).toBe(true);
    }
  });
  it('earn nothing: the Book’s new results are the player’s own saved lemmas', () => {
    for (const l of BOOK_89) {
      expect(l.unlocks, l.id).toEqual([]);
      for (const s of l.tools.schemas) if (!s.startsWith('power.')) expect(REGISTRY[s], s).toBeDefined();
    }
  });
  it('givens, docks and atoms are consistent', () => {
    for (const l of BOOK_89) {
      const atoms = new Set(l.atoms.map((a) => a.id)), gids = new Set(l.givens.map((g) => g.id));
      expect(gids.size, l.id).toBe(l.givens.length);
      expect(new Set(l.sockets.map((s) => s.id)).size, l.id).toBe(l.sockets.length);
      for (const s of l.sockets) for (const g of s.allowedGivens) expect(gids.has(g), `${l.id}/${s.id} allows ${g}`).toBe(true);
      const used = new Set<string>();
      for (const g of l.givens) factAtoms(g.fact, used);
      for (const s of l.sockets) factAtoms(s.target, used);
      for (const u of used) expect(atoms.has(u), `${l.id} mentions undeclared atom ${u}`).toBe(true);
    }
  });
  it('open docks: the only ones are P10.3 and P11.3/t, each a ℤ hole that occurs in its target', () => {
    const open = BOOK_89.flatMap((l) => l.sockets.filter((s) => s.holes?.length).map((s) => `${l.id}/${s.id}`));
    expect(open).toEqual(['P10.3/s', 'P11.3/t']);
    for (const l of BOOK_89) for (const s of l.sockets) for (const h of s.holes ?? []) {
      expect(h.sort, `${l.id}/${s.id}`).toBe('Z');
      expect(JSON.stringify(s.target), `${l.id}/${s.id}`).toContain(`"id":"${h.id}"`);
    }
  });
  it('P10.4 is the multi-desk room (two premises)', () => {
    const t = BOOK_89.find((l) => l.id === 'P10.4')!.sockets[0]!.target;
    expect(t.k === 'cond' && t.premises.length).toBe(2);
  });
  it('uses point at earlier Book levels', () => {
    const all = [...BOOK_123.map((l) => l.id), ...IDS];
    for (const l of BOOK_89) for (const u of l.uses) {
      expect(all.indexOf(u), `${l.id} uses unknown ${u}`).toBeGreaterThanOrEqual(0);
      expect(all.indexOf(u), `${l.id} uses a later level ${u}`).toBeLessThan(all.indexOf(l.id));
    }
  });
  it('no pre-placed Spools; every level has cards in the Book’s card table', () => {
    for (const l of BOOK_89) { expect(l.preStarts, l.id).toBeUndefined(); expect(BOOK_CARDS[l.id]?.length, l.id).toBeGreaterThan(0); }
  });
});

// Manifest sanity for the phase-A levels scattered over Book worlds 4, 6, 7, 10, 11, 13, 14.
import { describe, expect, it } from 'vitest';
import { BOOK_A } from './kit-wA';
import type { Card, Fact, Pallet, Term } from '../../src/kernel/types';

const METHODS = ['Computation', 'Uniqueness argument', 'Cancellation', 'Solving an equation', 'If–then', 'Contradiction', 'Subgroup test', 'Preservation', 'Exponent arithmetic', 'Equivalence relation', 'Lagrange', 'Witness'];
/** SYNTHESIS §3 in campaign order, with the display index of each level. */
const ORDER = ['P3.1', 'P3.2', 'P3.3', 'P4.1', 'P4.2', 'P4.3', 'P4.4', 'P4.5', 'P4.6', 'P4.7', 'P4.8', 'P4.9', 'P4.10', 'P4.11', 'P4.12', 'P4.13', 'P4.s1', 'P4.s2', 'P4.s3', 'P4.s4',
  'P5.1', 'P5.2', 'P5.3', 'P5.4', 'P5.5', 'P5.s1', 'P5.s2', 'P6.1', 'P6.2', 'P6.3', 'P7.1', 'P7.2', 'P8.1', 'P8.2', 'P9.1', 'P9.2', 'P9.3', 'P9.4', 'P9.s1',
  'P10.1', 'P10.2', 'P10.3', 'P10.4', 'P10.5', 'P10.s1', 'P10.s2', 'P11.1', 'P11.2', 'P11.3', 'P12.1', 'P12.2', 'P12.s1', 'P13.1', 'P13.2', 'P13.3', 'P13.4', 'P13.s1',
  'P14.1', 'P14.2', 'P14.3', 'P14.4', 'P14.s1', 'P15.1', 'P15.2', 'P15.3', 'P15.4', 'P16.1', 'P16.2', 'P16.s1', 'P16.s2', 'P16.s3'];
const MINE = ['P5.2', 'P5.3', 'P5.5', 'P5.s1', 'P5.s2', 'P7.1', 'P8.1', 'P9.s1', 'P12.2', 'P12.s1', 'P13.2', 'P13.3', 'P13.4', 'P13.s1', 'P15.4', 'P16.s1', 'P16.s2', 'P16.s3'];
const WORLD: Record<string, number> = { '5': 4, '7': 6, '8': 6, '9': 7, '12': 10, '13': 11, '15': 13, '16': 14 };
const atomsIn = (t: Term, out: Set<string>) => {
  if (t.k === 'atom') out.add(t.id);
  else if (t.k === 'inv') atomsIn(t.arg, out);
  else if (t.k === 'mul') t.fs.forEach((f) => atomsIn(f, out));
  else if (t.k === 'pow') atomsIn(t.base, out);
};
const factAtoms = (f: Fact | Pallet | Card, out: Set<string>) => {
  if (f.k === 'eq' || f.k === 'neq' || f.k === 'law') { atomsIn(f.l, out); atomsIn(f.r, out); }
  else if (f.k === 'cond') for (const p of [...f.premises, f.concl]) if (p.k === 'eq' || p.k === 'neq') { atomsIn(p.l, out); atomsIn(p.r, out); }
};
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const sentences = (s: string) => s.replace(/\$[^$]*\$/g, 'M').split(/[.?!]+\**\s|[.?!]+\**$/).map((x) => x.trim()).filter(Boolean);

describe('Phase-A levels (worlds 4, 6, 7, 10, 11, 13, 14) · manifests', () => {
  it('are exactly the assigned levels, in campaign order', () => {
    expect(BOOK_A.map((l) => l.id)).toEqual(MINE);
    const at = BOOK_A.map((l) => ORDER.indexOf(l.id));
    expect(at).toEqual([...at].sort((p, q) => p - q));
  });
  it('carry the Book fields, with the SYNTHESIS display index', () => {
    for (const l of BOOK_A) {
      expect(l.campaign, l.id).toBe('book');
      expect(l.world, l.id).toBe(WORLD[l.id.slice(1).split('.')[0]!]);
      expect(l.chapter, l.id).toBe(Number(l.id.slice(1).split('.')[0]));
      expect(METHODS, l.id).toContain(l.method);
      expect(l.insight?.trim(), l.id).toBeTruthy();
      expect(l.source?.trim(), l.id).toBeTruthy();
      expect(l.par.parts, l.id).toBeGreaterThan(0);
      expect(l.par.axioms, l.id).toBeGreaterThan(0);
      expect(l.index, l.id).toBe(ORDER.indexOf(l.id) + 1);
      expect(!!l.side, l.id).toBe(l.id.includes('.s'));
      expect(l.unlocks, l.id).toEqual([]);
    }
  });
  it('toolsets accumulate in the book’s order: no power laws before ch. 10, no press before ch. 13, never power.negate or classical reasoning', () => {
    for (const l of BOOK_A) {
      const pow = l.tools.schemas.filter((s) => s.startsWith('power.'));
      expect(l.tools.classical, l.id).toBe(false);
      expect(l.tools.conjecture, l.id).toBe(false);
      expect(pow, l.id).not.toContain('power.negate');
      if (l.chapter < 10) expect(pow, l.id).toEqual([]);
      else expect(pow.length, l.id).toBeGreaterThan(0);
      expect(l.tools.press, l.id).toBe(l.chapter >= 13);
      for (const s of l.tools.schemas.filter((x) => !x.startsWith('power.'))) expect(['cancel', 'witness', 'socks'], l.id).toContain(s);
    }
  });
  it('givens, docks and atoms are consistent; a |G| given exists exactly where the press is used', () => {
    for (const l of BOOK_A) {
      const atoms = new Set(l.atoms.map((a) => a.id)), gids = new Set(l.givens.map((g) => g.id));
      expect(gids.size, l.id).toBe(l.givens.length);
      expect(new Set(l.sockets.map((s) => s.id)).size, l.id).toBe(l.sockets.length);
      for (const s of l.sockets) for (const g of s.allowedGivens) expect(gids.has(g), `${l.id}/${s.id} allows ${g}`).toBe(true);
      const used = new Set<string>();
      for (const g of l.givens) factAtoms(g.fact, used);
      for (const s of l.sockets) factAtoms(s.target, used);
      for (const u of used) expect(atoms.has(u), `${l.id} mentions undeclared atom ${u}`).toBe(true);
    }
    expect(BOOK_A.filter((l) => l.givens.some((g) => g.fact.k === 'size')).map((l) => l.id)).toEqual(['P13.2', 'P16.s2']);
  });
  it('open docks: P12.2 (element holes) and P12.s1 (ℤ holes) only', () => {
    const open = BOOK_A.filter((l) => l.sockets.some((s) => s.holes?.length)).map((l) => l.id);
    expect(open).toEqual(['P12.2', 'P12.s1']);
    expect(BOOK_A.find((l) => l.id === 'P12.2')!.sockets.every((s) => s.holes?.length === 1 && s.holes[0]!.sort === undefined)).toBe(true);
    expect(BOOK_A.find((l) => l.id === 'P12.s1')!.sockets.every((s) => s.holes?.length === 1 && s.holes[0]!.sort === 'Z')).toBe(true);
  });
  it('uses point at earlier levels of the SYNTHESIS list', () => {
    for (const l of BOOK_A) for (const u of l.uses) {
      expect(ORDER.indexOf(u), `${l.id} uses ${u}`).toBeGreaterThanOrEqual(0);
      expect(ORDER.indexOf(u), `${l.id} uses a later level ${u}`).toBeLessThan(ORDER.indexOf(l.id));
    }
  });
  it('memos are at most two short sentences and ideas one line; no old plant / idle / resets voice', () => {
    for (const l of BOOK_A) {
      const ss = sentences(l.memo);
      expect(ss.length, `${l.id} memo: ${l.memo}`).toBeLessThanOrEqual(2);
      for (const s of ss) expect(words(s), `${l.id} memo: “${s}”`).toBeLessThanOrEqual(14);
      expect(l.memo, l.id).not.toMatch(/;/);
      expect(l.memo + ' ' + l.title, l.id).not.toMatch(/\b(plant|idle|resets?|rotation|Seams)\b/i);
      expect(words(l.idea), `${l.id} idea: ${l.idea}`).toBeLessThanOrEqual(12);
    }
  });
  it('the Book pins: P7.1 carries r⁴ = e; P13.3 has no unneeded bb = e; P13.s1 has no bb = e given', () => {
    const l = BOOK_A.find((x) => x.id === 'P7.1')!;
    expect(l.givens.map((g) => g.id)).toEqual(['h1', 'h2', 'h3']);
    expect(JSON.stringify(l.givens[0]!.fact)).toContain('"r"');
    expect(BOOK_A.find((x) => x.id === 'P13.3')!.givens).toHaveLength(2);
    expect(BOOK_A.find((x) => x.id === 'P13.s1')!.givens).toHaveLength(3);
  });
});

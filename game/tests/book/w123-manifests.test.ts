// Manifest sanity for Book worlds 1–3: ids, order, fields, toolsets, givens and cross-references.
import { describe, expect, it } from 'vitest';
import { REGISTRY } from '../../src/levels/levels';
import { BOOK_123 } from './kit-w123';
import type { Card, Fact, Pallet, Term } from '../../src/kernel/types';

const METHODS = ['Computation', 'Uniqueness argument', 'Cancellation', 'Solving an equation', 'If–then', 'Contradiction', 'Subgroup test', 'Preservation', 'Exponent arithmetic', 'Equivalence relation', 'Lagrange', 'Witness'];
const IDS = ['P3.1', 'P3.2', 'P3.3', 'P4.1', 'P4.2', 'P4.3', 'P4.4', 'P4.5', 'P4.6', 'P4.7', 'P4.8', 'P4.9', 'P4.10', 'P4.11', 'P4.12', 'P4.13', 'P4.s1', 'P4.s2', 'P4.s3', 'P4.s4'];
const atomsIn = (t: Term, out: Set<string>) => {
  if (t.k === 'atom') out.add(t.id);
  else if (t.k === 'inv') atomsIn(t.arg, out);
  else if (t.k === 'mul') t.fs.forEach((f) => atomsIn(f, out));
  else if (t.k === 'pow') atomsIn(t.base, out);
};
const factAtoms = (f: Fact | Pallet | Card, out: Set<string>) => {
  if (f.k === 'eq' || f.k === 'neq' || f.k === 'law') { atomsIn(f.l, out); atomsIn(f.r, out); }
  else if (f.k === 'cond') for (const p of [...f.premises, f.concl]) { atomsIn(p.l, out); atomsIn(p.r, out); }
};

describe('Book worlds 1–3 manifests', () => {
  it('are the SYNTHESIS list, in order (v2: P4.s3 is a witness-free solve level, P4.s4 the witness dock)', () => {
    expect(BOOK_123.map((l) => l.id)).toEqual(IDS);
  });
  it('carry the Book fields, with strictly increasing indices', () => {
    BOOK_123.forEach((l, i) => {
      expect(l.campaign, l.id).toBe('book');
      expect(l.world, l.id).toBe(l.id.startsWith('P3.') ? 1 : i < 8 ? 2 : 3);
      expect(l.chapter, l.id).toBe(l.id.startsWith('P3.') ? 3 : 4);
      expect(METHODS, l.id).toContain(l.method);
      expect(l.insight?.trim(), l.id).toBeTruthy();
      expect(l.source?.trim(), l.id).toBeTruthy();
      expect(l.par.parts, l.id).toBeGreaterThan(0);
      if (i > 0) expect(l.index, l.id).toBeGreaterThan(BOOK_123[i - 1]!.index);
    });
    expect(BOOK_123.filter((l) => l.side).map((l) => l.id)).toEqual(['P4.s1', 'P4.s2', 'P4.s3', 'P4.s4']);
  });
  it('toolsets accumulate in the book’s order: no power laws, no Lagrange, no classical reasoning', () => {
    for (const l of BOOK_123) {
      expect(l.tools.press, l.id).toBe(false);
      expect(l.tools.classical, l.id).toBe(false);
      expect(l.tools.conjecture, l.id).toBe(false);
      expect(l.tools.schemas.filter((s) => s.startsWith('power.')), l.id).toEqual([]);
    }
    expect(BOOK_123.filter((l) => l.tools.lift).map((l) => l.id)[0]).toBe('P4.2');
    expect(BOOK_123.filter((l) => l.tools.merge).map((l) => l.id)[0]).toBe('P4.1'); // the Joiner arrives in P4.1
    expect(BOOK_123.filter((l) => l.tools.suppose).map((l) => l.id)).toEqual(['P4.12']);
    // earned theorems appear only after the level that earns them
    const earnedAt: Record<string, string> = { cancel: 'P4.2', witness: 'P4.3', socks: 'P4.5' };
    for (const l of BOOK_123) for (const s of l.tools.schemas) expect(IDS.indexOf(l.id), `${l.id} lists ${s}`).toBeGreaterThan(IDS.indexOf(earnedAt[s]!));
  });
  it('unlock exactly cancellation (P4.2), unique inverse (P4.3) and inverse of a product (P4.5)', () => {
    expect(BOOK_123.filter((l) => l.unlocks.length).map((l) => [l.id, l.unlocks])).toEqual([['P4.2', ['cancel']], ['P4.3', ['witness']], ['P4.5', ['socks']]]);
    for (const l of BOOK_123) for (const u of l.unlocks) expect(REGISTRY[u], u).toBeDefined();
  });
  it('givens, docks and atoms are consistent', () => {
    for (const l of BOOK_123) {
      const atoms = new Set(l.atoms.map((a) => a.id)), gids = new Set(l.givens.map((g) => g.id));
      expect(gids.size, l.id).toBe(l.givens.length);
      expect(new Set(l.sockets.map((s) => s.id)).size, l.id).toBe(l.sockets.length);
      for (const s of l.sockets) for (const g of s.allowedGivens) expect(gids.has(g), `${l.id}/${s.id} allows ${g}`).toBe(true);
      const used = new Set<string>();
      for (const g of l.givens) factAtoms(g.fact, used);
      for (const s of l.sockets) factAtoms(s.target, used);
      for (const t of l.preStarts ?? []) atomsIn(t, used);
      for (const u of used) expect(atoms.has(u), `${l.id} mentions undeclared atom ${u}`).toBe(true);
    }
  });
  it('uses point at earlier Book levels', () => {
    for (const l of BOOK_123) for (const u of l.uses) expect(IDS.indexOf(u), `${l.id} uses ${u}`).toBeGreaterThanOrEqual(0);
    for (const l of BOOK_123) for (const u of l.uses) expect(IDS.indexOf(u), `${l.id} uses a later level ${u}`).toBeLessThan(IDS.indexOf(l.id));
  });
  it('open docks: P4.6 and the side solves are `d = ?`; P4.s4 is a witness dock', () => {
    const open = BOOK_123.filter((l) => l.sockets.some((s) => s.holes?.length)).map((l) => l.id);
    expect(open).toEqual(['P4.6', 'P4.s1', 'P4.s2', 'P4.s3', 'P4.s4']);
  });
  it('memos keep clear of the old plant / idle / resets voice; no private names', () => {
    for (const l of BOOK_123) expect(l.memo + ' ' + l.title, l.id).not.toMatch(/\b(plant|idle|resets?|rotation|Rotations|Seams|Idle Twice)\b/i);
  });
  it('lemmaNames: one standard name per saved lemma, in dock order', () => {
    const names = Object.fromEntries(BOOK_123.filter((l) => l.lemmaNames).map((l) => [l.id, l.lemmaNames]));
    expect(names).toEqual({
      'P4.4': ['double inverse'],
      'P4.7': ['the only idempotent is e'],
      'P4.9': ['xy = yx ⟹ xyx⁻¹y⁻¹ = e', 'xyx⁻¹y⁻¹ = e ⟹ xy = yx'],
      'P4.10': ['xy = e ⟹ yx = e'],
    });
  });
  it('P3.1 starts with a pre-placed Spool; nothing else does', () => {
    expect(BOOK_123.filter((l) => l.preStarts?.length).map((l) => l.id)).toEqual(['P3.1']);
  });
});

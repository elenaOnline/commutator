// Manifest sanity for the Maps levels: P6.1–P6.3 (world 5), P7.2, P8.2 (world 6), P9.1–P9.4 (world 7).
import { describe, expect, it } from 'vitest';
import { BOOK_C } from './kit-wC';
import { REGISTRY } from '../../src/levels/levels';

const METHODS = ['Computation', 'Uniqueness argument', 'Cancellation', 'Solving an equation', 'If–then', 'Contradiction', 'Subgroup test', 'Preservation', 'Exponent arithmetic', 'Equivalence relation', 'Lagrange', 'Witness'];
/** SYNTHESIS §3 in campaign order, with the display index of each level. */
const ORDER = ['P3.1', 'P3.2', 'P3.3', 'P4.1', 'P4.2', 'P4.3', 'P4.4', 'P4.5', 'P4.6', 'P4.7', 'P4.8', 'P4.9', 'P4.10', 'P4.11', 'P4.12', 'P4.13', 'P4.s1', 'P4.s2', 'P4.s3', 'P4.s4',
  'P5.1', 'P5.2', 'P5.3', 'P5.4', 'P5.5', 'P5.s1', 'P5.s2', 'P6.1', 'P6.2', 'P6.3', 'P7.1', 'P7.2', 'P8.1', 'P8.2', 'P9.1', 'P9.2', 'P9.3', 'P9.4', 'P9.s1'];
const MINE = ['P6.1', 'P6.2', 'P6.3', 'P7.2', 'P8.2', 'P9.1', 'P9.2', 'P9.3', 'P9.4'];
const WORLD: Record<string, number> = { '6': 5, '7': 6, '8': 6, '9': 7 };
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const sentences = (s: string) => s.replace(/\$[^$]*\$/g, 'M').split(/[.?!]+\**\s|[.?!]+\**$/).map((x) => x.trim()).filter(Boolean);
const mine = BOOK_C.filter((l) => MINE.includes(l.id));

describe('Maps levels · manifests', () => {
  it('are exactly the assigned levels (plus the existing ones in their files), in campaign order', () => {
    expect(mine.map((l) => l.id)).toEqual(MINE);
    const at = BOOK_C.map((l) => ORDER.indexOf(l.id));
    expect(at).toEqual([...at].sort((p, q) => p - q));
  });
  it('carry the Book fields, with the SYNTHESIS display index', () => {
    for (const l of mine) {
      expect(l.campaign, l.id).toBe('book');
      expect(l.world, l.id).toBe(WORLD[l.id.slice(1).split('.')[0]!]);
      expect(l.chapter, l.id).toBe(Number(l.id.slice(1).split('.')[0]));
      expect(METHODS, l.id).toContain(l.method);
      expect(l.insight?.trim(), l.id).toBeTruthy();
      expect(l.source?.trim(), l.id).toBeTruthy();
      expect(l.par.parts, l.id).toBeGreaterThan(0);
      expect(l.par.axioms, l.id).toBeGreaterThan(0);
      expect(l.index, l.id).toBe(ORDER.indexOf(l.id) + 1);
      expect(!!l.side, l.id).toBe(false);
      expect(l.unlocks, l.id).toEqual([]);
    }
  });
  it('toolsets: no power laws, no press, no classical reasoning; earned schemas only', () => {
    for (const l of mine) {
      expect(l.tools.classical, l.id).toBe(false);
      expect(l.tools.press, l.id).toBe(false);
      expect(l.tools.conjecture, l.id).toBe(false);
      for (const s of l.tools.schemas) expect(['cancel', 'witness', 'socks'], l.id).toContain(s);
    }
  });
  it('givens, docks, maps and sorts are consistent', () => {
    for (const l of mine) {
      const gids = new Set(l.givens.map((g) => g.id));
      expect(gids.size, l.id).toBe(l.givens.length);
      expect(new Set(l.sockets.map((s) => s.id)).size, l.id).toBe(l.sockets.length);
      for (const s of l.sockets) for (const g of s.allowedGivens) expect(gids.has(g), `${l.id}/${s.id} allows ${g}`).toBe(true);
      const sorts = new Set((l.sorts ?? []).map((x) => x.id));
      for (const m of l.maps ?? []) for (const s of [...m.args, m.res]) expect(sorts.has(s), `${l.id}: map ${m.id} uses sort ${s}`).toBe(true);
      for (const a of l.atoms) if (a.carrier) expect(sorts.has(a.carrier), `${l.id}: atom ${a.id}`).toBe(true);
    }
  });
  it('the second group is named K, never H; the only open dock is P6.3’s witness', () => {
    for (const l of mine) for (const s of l.sorts ?? []) expect(s.label, l.id).not.toBe('H');
    expect(mine.filter((l) => l.sockets.some((s) => s.holes?.length)).map((l) => l.id)).toEqual(['P6.3']);
  });
  it('uses point at earlier levels of the SYNTHESIS list; every earned schema exists', () => {
    for (const l of mine) for (const u of l.uses) {
      expect(ORDER.indexOf(u), `${l.id} uses ${u}`).toBeGreaterThanOrEqual(0);
      expect(ORDER.indexOf(u), `${l.id} uses a later level ${u}`).toBeLessThan(ORDER.indexOf(l.id));
    }
    for (const l of mine) for (const s of l.tools.schemas) expect(REGISTRY[s], `${l.id}: ${s}`).toBeDefined();
  });
  it('memos are at most two short sentences and ideas one line', () => {
    for (const l of mine) {
      const ss = sentences(l.memo);
      expect(ss.length, `${l.id} memo: ${l.memo}`).toBeLessThanOrEqual(2);
      for (const s of ss) expect(words(s), `${l.id} memo: “${s}”`).toBeLessThanOrEqual(14);
      expect(l.memo, l.id).not.toMatch(/;/);
      expect(l.memo + ' ' + l.title, l.id).not.toMatch(/\b(plant|idle|resets?|rotation|Seams)\b/i);
      expect(words(l.idea), `${l.id} idea: ${l.idea}`).toBeLessThanOrEqual(12);
    }
  });
});

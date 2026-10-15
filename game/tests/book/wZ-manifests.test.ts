// Manifest sanity for Book worlds 12–14, phase B/C levels (P14.x, P15.1–P15.3, P16.1, P16.2; P14.3 shipped 2026-10-15).
import { describe, expect, it } from 'vitest';
import { BOOK_LEVELS } from '../../src/levels/book';
import { PENDING } from '../../src/levels/book/w12';
import { WZ_IDS } from './wZ-ids';
import { BOOK_Z } from './kit-w1214';

const METHODS = ['Computation', 'Uniqueness argument', 'Cancellation', 'Solving an equation', 'If–then', 'Contradiction', 'Subgroup test', 'Preservation', 'Exponent arithmetic', 'Equivalence relation', 'Lagrange', 'Witness'];
const ORDER = ['P3.1', 'P3.2', 'P3.3', 'P4.1', 'P4.2', 'P4.3', 'P4.4', 'P4.5', 'P4.6', 'P4.7', 'P4.8', 'P4.9', 'P4.10', 'P4.11', 'P4.12', 'P4.13', 'P4.s1', 'P4.s2', 'P4.s3', 'P4.s4',
  'P5.1', 'P5.2', 'P5.3', 'P5.4', 'P5.5', 'P5.s1', 'P5.s2', 'P6.1', 'P6.2', 'P6.3', 'P7.1', 'P7.2', 'P8.1', 'P8.2', 'P9.1', 'P9.2', 'P9.3', 'P9.4', 'P9.s1',
  'P10.1', 'P10.2', 'P10.3', 'P10.4', 'P10.5', 'P10.s1', 'P10.s2', 'P11.1', 'P11.2', 'P11.3', 'P12.1', 'P12.2', 'P12.s1', 'P13.1', 'P13.2', 'P13.3', 'P13.4', 'P13.s1',
  'P14.1', 'P14.2', 'P14.3', 'P14.4', 'P14.s1', 'P15.1', 'P15.2', 'P15.3', 'P15.4', 'P16.1', 'P16.2', 'P16.s1', 'P16.s2', 'P16.s3'];
const WORLD: Record<string, number> = { '14': 12, '15': 13, '16': 14 };
const ALL = [...BOOK_Z, ...PENDING];
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const sentences = (s: string) => s.split(/[.?!]+\s|[.?!]+$/).map((x) => x.trim()).filter(Boolean);

describe('Worlds 12–14 (phase B/C) · manifests', () => {
  it('are the assigned levels in campaign order, all in the Book index (nothing pending)', () => {
    expect(ALL.map((l) => l.id).sort()).toEqual([...WZ_IDS].sort());
    expect(PENDING).toEqual([]);
    const shipped = BOOK_LEVELS.filter((l) => WZ_IDS.includes(l.id)).map((l) => l.id);
    expect(shipped).toEqual(WZ_IDS);
    const at = shipped.map((id) => ORDER.indexOf(id));
    expect(at).toEqual([...at].sort((p, q) => p - q));
  });
  it('carry the Book fields with the SYNTHESIS display index; P15.4 keeps index 66', () => {
    for (const l of ALL) {
      expect(l.campaign, l.id).toBe('book');
      expect(l.world, l.id).toBe(WORLD[l.id.slice(1).split('.')[0]!]);
      expect(l.chapter, l.id).toBe(Number(l.id.slice(1).split('.')[0]));
      expect(METHODS, l.id).toContain(l.method);
      expect(l.insight?.trim(), l.id).toBeTruthy();
      expect(l.source?.trim(), l.id).toBeTruthy();
      expect(l.par.parts, l.id).toBeGreaterThan(0);
      expect(l.index, l.id).toBe(ORDER.indexOf(l.id) + 1);
      expect(!!l.side, l.id).toBe(l.id.includes('.s'));
      expect(l.unlocks, l.id).toEqual([]);
    }
    expect(BOOK_LEVELS.find((l) => l.id === 'P15.4')!.index).toBe(66);
  });
  it('toolsets: the book’s accumulation, never power.negate or classical; hom.pow with homs, sub.e / sub.pow with subgroups', () => {
    for (const l of ALL) {
      expect(l.tools.classical, l.id).toBe(false);
      expect(l.tools.press, l.id).toBe(true);
      expect(l.tools.schemas, l.id).not.toContain('power.negate');
      for (const s of ['cancel', 'witness', 'socks', 'power.add', 'power.identity']) expect(l.tools.schemas, l.id).toContain(s);
      const homs = !!l.maps?.length || JSON.stringify(l.sockets).includes('"k":"hom"');
      if (l.maps?.length && l.index >= 60) expect(l.tools.schemas, l.id).toContain('hom.pow');
      if (l.index < 60) expect(l.tools.schemas, l.id).not.toContain('hom.pow');
      if (l.subgroups?.length || JSON.stringify(l.sockets).includes('"k":"sub"')) expect(l.tools.schemas, l.id).toEqual(expect.arrayContaining(['sub.e', 'sub.pow']));
      void homs;
    }
  });
  it('second groups are K or Q, never H; homs are f and π', () => {
    for (const l of ALL) {
      for (const s of l.sorts ?? []) expect(['G', 'K', 'Q'], l.id).toContain(s.label);
      for (const m of l.maps ?? []) expect(['f', 'π'], l.id).toContain(m.label);
    }
  });
  it('uses point at earlier levels; memos are short and plain, ideas one line', () => {
    for (const l of ALL) {
      for (const u of l.uses) expect(ORDER.indexOf(u), `${l.id} uses ${u}`).toBeLessThan(ORDER.indexOf(l.id));
      const ss = sentences(l.memo);
      expect(ss.length, l.memo).toBeLessThanOrEqual(2);
      for (const s of ss) expect(words(s), s).toBeLessThanOrEqual(14);
      expect(l.memo, l.id).not.toMatch(/;|\b(plant|idle|resets?)\b/i);
      expect(words(l.idea), l.idea).toBeLessThanOrEqual(12);
    }
  });
});

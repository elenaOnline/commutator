// Manifest sanity for the Members levels of the Book: P5.1, P5.4, P11.1, P12.1, P13.1 (and the P13 levels that now use P13.1).
import { describe, expect, it } from 'vitest';
import { BOOK_LEVELS } from '../../src/levels/book';
import { BOOK_M } from './kit-members';
import { LEVELS as W11 } from '../../src/levels/book/w11';
import type { Card, Fact, Pallet, SubRef } from '../../src/kernel/types';
import { ctxFor } from '../../src/state/factoryStore';
import * as K from '../../src/kernel';

const IDS = ['P5.1', 'P5.4', 'P11.1', 'P12.1', 'P13.1'];
const INDEX: Record<string, number> = { 'P5.1': 21, 'P5.4': 24, 'P11.1': 45, 'P12.1': 50, 'P13.1': 53 };
const METHODS = ['Computation', 'Uniqueness argument', 'Cancellation', 'Solving an equation', 'If–then', 'Contradiction', 'Subgroup test', 'Preservation', 'Exponent arithmetic', 'Equivalence relation', 'Lagrange', 'Witness'];
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const sentences = (s: string) => s.replace(/\$[^$]*\$/g, 'M').split(/[.?!]+\**\s|[.?!]+\**$/).map((x) => x.trim()).filter(Boolean);
/** Subgroup references a fact makes. */
const subRefs = (f: Fact | Pallet | Card): SubRef[] =>
  f.k === 'mem' ? [f.sub] : f.k === 'cond' ? [...f.premises, f.concl].flatMap((p) => (p.k === 'mem' ? [p.sub] : [])) : [];

describe('Members levels · manifests', () => {
  it('are the assigned levels, in campaign order, with the SYNTHESIS display index', () => {
    expect(BOOK_M.map((l) => l.id)).toEqual(IDS);
    expect(BOOK_LEVELS.filter((l) => IDS.includes(l.id)).map((l) => l.id)).toEqual(IDS);
    for (const l of BOOK_M) {
      expect(l.campaign, l.id).toBe('book');
      expect(l.index, l.id).toBe(INDEX[l.id]);
      expect(l.chapter, l.id).toBe(Number(l.id.slice(1).split('.')[0]));
      expect(METHODS, l.id).toContain(l.method);
      expect(l.insight?.trim(), l.id).toBeTruthy();
      expect(l.source?.trim(), l.id).toBeTruthy();
      expect(l.par.parts, l.id).toBeGreaterThan(0);
      expect(l.par.axioms, l.id).toBeGreaterThan(0);
      expect(l.side, l.id).toBeFalsy();
    }
  });
  it('indices are strictly increasing across the whole Book list, and every `uses` names an earlier level', () => {
    const byId = new Map(BOOK_LEVELS.map((l) => [l.id, l]));
    for (const l of BOOK_M) for (const u of l.uses) {
      expect(byId.has(u), `${l.id} uses ${u}`).toBe(true);
      expect(byId.get(u)!.index, `${l.id} uses a later level ${u}`).toBeLessThan(l.index);
    }
    const mains = BOOK_LEVELS.filter((l) => l.campaign === 'book');
    for (const l of BOOK_M) {
      const before = mains.filter((m) => m.index < l.index).length, same = mains.filter((m) => m.index === l.index);
      expect(same.map((m) => m.id), `index ${l.index} is unique`).toEqual([l.id]);
      void before;
    }
  });
  it('sub.e is earned by P5.1 (unlocked, withheld there) and listed by every later subgroup level; sub.pow is listed from P11.1 on', () => {
    const p51 = BOOK_M.find((l) => l.id === 'P5.1')!;
    expect(p51.unlocks).toEqual(['sub.e']);
    expect(p51.tools.schemas).not.toContain('sub.e');
    expect(p51.tools.schemas).not.toContain('sub.pow');
    for (const l of BOOK_M.filter((x) => x.id !== 'P5.1')) {
      expect(l.unlocks, l.id).toEqual([]);
      expect(l.tools.schemas, l.id).toContain('sub.e');
      if (l.chapter >= 11) expect(l.tools.schemas, l.id).toContain('sub.pow'); else expect(l.tools.schemas, l.id).not.toContain('sub.pow');
    }
  });
  it('toolsets: no power laws before ch. 10, never power.negate, no classical reasoning, and no press before P13.1 or in it', () => {
    for (const l of BOOK_M) {
      const pow = l.tools.schemas.filter((s) => s.startsWith('power.'));
      expect(pow, l.id).not.toContain('power.negate');
      if (l.chapter < 10) expect(pow, l.id).toEqual([]);
      expect(l.tools.classical, l.id).toBe(false);
      expect(l.tools.conjecture, l.id).toBe(false);
      expect(l.tools.press, l.id).toBe(false);
      expect(l.tools.lift && l.tools.merge && l.tools.suppose, l.id).toBe(true);
      for (const s of l.tools.schemas.filter((x) => !x.startsWith('power.') && !x.startsWith('sub.'))) expect(['cancel', 'witness', 'socks'], l.id).toContain(s);
    }
  });
  it('P13.1 unlocks Lagrange: every later level of world 11 has the press and points at P13.1', () => {
    const later = W11.filter((l) => l.id !== 'P13.1');
    expect(later.map((l) => l.id)).toEqual(['P13.2', 'P13.3', 'P13.4', 'P13.s1']);
    for (const l of later) {
      expect(l.tools.press, l.id).toBe(true);
      expect(l.uses, l.id).toContain('P13.1');
    }
  });
  it('subgroups: every membership names a declared subgroup or a binder of its own card; P12.1 declares none', () => {
    for (const l of BOOK_M) {
      const declared = new Set((l.subgroups ?? []).map((s) => s.id));
      for (const f of [...l.givens.map((g) => g.fact), ...l.sockets.map((s) => s.target)]) {
        const binders = new Set(f.k === 'cond' ? (f.binds ?? []).map((b) => b.id) : []);
        for (const r of subRefs(f)) {
          if (r.k === 'sub') expect(declared.has(r.id), `${l.id} mentions undeclared subgroup ${r.id}`).toBe(true);
          else expect(binders.has(r.id), `${l.id} mentions unbound subgroup variable ${r.id}`).toBe(true);
        }
      }
    }
    expect(BOOK_M.find((l) => l.id === 'P12.1')!.subgroups).toBeUndefined();
  });
  it('givens and docks are consistent; P5.1 and P13.1 have no extra givens', () => {
    for (const l of BOOK_M) {
      const gids = new Set(l.givens.map((g) => g.id));
      expect(gids.size, l.id).toBe(l.givens.length);
      expect(new Set(l.sockets.map((s) => s.id)).size, l.id).toBe(l.sockets.length);
      for (const s of l.sockets) for (const g of s.allowedGivens) expect(gids.has(g), `${l.id}/${s.id} allows ${g}`).toBe(true);
    }
    expect(BOOK_M.find((l) => l.id === 'P5.1')!.givens).toHaveLength(1);
    expect(BOOK_M.find((l) => l.id === 'P13.1')!.givens).toHaveLength(0);
  });
  it('memos are at most two short sentences and ideas one line', () => {
    for (const l of BOOK_M) {
      const ss = sentences(l.memo);
      expect(ss.length, `${l.id} memo: ${l.memo}`).toBeLessThanOrEqual(2);
      for (const s of ss) expect(words(s), `${l.id} memo: “${s}”`).toBeLessThanOrEqual(14);
      expect(l.memo, l.id).not.toMatch(/;/);
      expect(words(l.idea), `${l.id} idea: ${l.idea}`).toBeLessThanOrEqual(12);
    }
  });
});

// ctxFor keeps the kernel-owned Book schemas a level lists or has earned (fixed by the architect after the Members author's report).
describe('live context', () => {
  it('ctxFor keeps the subgroup schemas a Book level lists (sub.pow for P11.1, sub.e for P12.1)', () => {
    for (const [id, sch] of [['P11.1', 'sub.pow'], ['P12.1', 'sub.e']] as const) {
      const l = BOOK_M.find((x) => x.id === id)!;
      expect(K.subAllowed(sch, ctxFor(l, ['cancel', 'witness', 'socks', 'sub.e']).level), `${id} ${sch}`).toBe(true);
    }
  });
});

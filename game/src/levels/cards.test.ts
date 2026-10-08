// Concept cards: coverage, length, and figures that actually exist (parse / catalogue).
import { describe, expect, it } from 'vitest';
import { norm, parseTerm } from '../kernel';
import { powerSchema } from '../kernel/powers';
import type { AtomDecl, Card, Pallet, Term } from '../kernel/types';
import { catalogue } from '../groups';
import { LEVELS, LEVEL_BY_ID } from './levels';
import { CARDS, type ConceptCard } from './cards';

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const groupNamed = (name: string) => catalogue().find((g) => g.name === name);
const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈'];

describe('concept cards', () => {
  it('every level has 1–3 cards, and every card key is a level', () => {
    for (const lv of LEVELS) {
      const cs = CARDS[lv.id];
      expect(cs, lv.id).toBeDefined();
      expect(cs!.length, lv.id).toBeGreaterThanOrEqual(1);
      expect(cs!.length, lv.id).toBeLessThanOrEqual(3);
    }
    for (const id of Object.keys(CARDS)) expect(LEVEL_BY_ID[id], id).toBeDefined();
  });

  it('cards are listed in campaign order', () => {
    expect(Object.keys(CARDS)).toEqual(LEVELS.map((l) => l.id));
  });

  it('bodies stay under 120 words; side fields stay short', () => {
    for (const [id, cs] of Object.entries(CARDS)) {
      for (const c of cs) {
        expect(c.title.trim(), id).not.toBe('');
        expect(words(c.body), `${id} · ${c.title}`).toBeLessThan(120);
        for (const k of ['example', 'nearMiss', 'gesture'] as const) {
          if (c[k] !== undefined) expect(words(c[k]!), `${id} · ${c.title} · ${k}`).toBeLessThan(60);
        }
      }
    }
  });

  it('maths delimiters are balanced', () => {
    for (const [id, cs] of Object.entries(CARDS)) {
      for (const c of cs) {
        for (const s of [c.body, c.example, c.nearMiss, c.gesture]) {
          if (s) expect((s.match(/\$/g) ?? []).length % 2, `${id} · ${c.title}: ${s}`).toBe(0);
        }
      }
    }
  });

  it('markdown the HUD renders cleanly: no *italic*, and no maths inside **bold**', () => {
    for (const [id, cs] of Object.entries(CARDS)) {
      for (const c of cs) {
        for (const t of [c.title, c.body, c.example, c.nearMiss, c.gesture]) {
          if (!t) continue;
          const noBold = t.replace(/\*\*[^*]+\*\*/g, '');
          expect(noBold, `${id} · ${c.title}: stray *`).not.toMatch(/\*/);
          for (const b of t.match(/\*\*[^*]+\*\*/g) ?? []) expect(b, `${id} · ${c.title}`).not.toMatch(/\$/);
        }
      }
    }
  });

  it('figures: bead terms parse against the level atoms; groups and generators exist in the catalogue', () => {
    for (const [id, cs] of Object.entries(CARDS)) {
      const lv = LEVEL_BY_ID[id]!;
      for (const c of cs as ConceptCard[]) {
        const f = c.figure;
        if (!f) continue;
        const where = `${id} · ${c.title}`;
        if (f.k === 'beads') {
          expect(f.terms.length, where).toBeGreaterThan(0);
          for (const t of f.terms) {
            const towers: AtomDecl[] = (f.towers ?? []).map((tw, i) => ({ id: tw.id, label: tw.label, hue: i, variable: true, sort: tw.sort }));
            const r = parseTerm(t, [...lv.atoms, ...towers]);
            expect(r.ok ? 'ok' : `${t}: ${r.error}`, where).toBe('ok');
          }
        } else if (f.k === 'clock') {
          expect(groupNamed(`ℤ${SUB[f.n] ?? '?'}`), `${where}: ℤ${f.n}`).toBeDefined();
        } else {
          const g = groupNamed(f.group);
          expect(g, `${where}: ${f.group}`).toBeDefined();
          if (f.k === 'cayley') for (const gen of f.gens) expect(g!.labels, `${where}: generator ${gen}`).toContain(gen);
        }
      }
    }
  });

  it('the group facts the cards cite hold in the catalogue', () => {
    const S3 = groupNamed('S₃')!, s = (l: string) => S3.labels.indexOf(l);
    expect(S3.labels[S3.mul(s('(12)'), s('(13)'))]).toBe('(132)');
    expect(S3.labels[S3.mul(s('(13)'), s('(12)'))]).toBe('(123)');
    const D4 = groupNamed('D₄')!, d = (l: string) => D4.labels.indexOf(l);
    expect(D4.labels[D4.mul(D4.mul(d('s'), d('r')), D4.inv(d('s')))]).toBe('r³');
    // B03: (ab)² ≠ a²b² with a = (12), b = (23)
    const ab = S3.mul(s('(12)'), s('(23)'));
    expect(S3.mul(ab, ab)).not.toBe(0);
    expect(S3.mul(S3.mul(s('(12)'), s('(12)')), S3.mul(s('(23)'), s('(23)')))).toBe(0);
    const V4 = groupNamed('V₄')!;
    for (let i = 0; i < V4.order; i++) expect(V4.mul(i, i)).toBe(0);
  });
});

describe('prove → save → reuse (v4 r2)', () => {
  it('no level offers the built-in Double Flip; S01 unlocks nothing; the reuse orders follow', () => {
    for (const lv of LEVELS) expect(lv.tools.schemas, lv.id).not.toContain('dbl');
    expect(LEVEL_BY_ID.S01!.unlocks).toEqual([]);
    const ids = LEVELS.map((l) => l.id);
    expect(ids.indexOf('T01')).toBe(ids.indexOf('S01') + 1);
    expect(ids.indexOf('T02')).toBe(ids.indexOf('L06') + 1);
    expect(LEVEL_BY_ID.T02!.uses).toEqual(expect.arrayContaining(['L06', 'T01']));
  });
});

describe('Chapter IV (Powers) manifests', () => {
  const B = ['B01', 'B02', 'B03', 'B04'];
  const powerIds = (id: string) => LEVEL_BY_ID[id]!.tools.schemas.filter((x) => x.startsWith('power.'));

  it('sit after Chapter III in campaign order, before the side orders', () => {
    const ids = LEVELS.map((l) => l.id);
    expect(ids.slice(ids.indexOf('L12') + 1, ids.indexOf('L12') + 5)).toEqual(B);
    for (const id of B) expect(LEVEL_BY_ID[id]!.chapter).toBe(4);
  });

  it('power imports appear only in Chapter IV, each one real, each level exactly its spec set', () => {
    for (const lv of LEVELS) if (!B.includes(lv.id)) expect(powerIds(lv.id), lv.id).toEqual([]);
    for (const id of B) for (const p of powerIds(id)) expect(() => powerSchema(p), `${id} ${p}`).not.toThrow();
    expect(powerIds('B01').sort()).toEqual(['power.identity', 'power.literal:5', 'power.multiply']);
    expect(powerIds('B02').sort()).toEqual(['power.identity', 'power.multiply']);
    expect(powerIds('B03')).toEqual(['power.conjugate']);
    expect(powerIds('B04')).toEqual([]);
    expect(LEVEL_BY_ID.B04!.tools.press).toBe(true);
  });

  it('socket targets are written in kernel normal form (hand-built polynomials are canonical)', () => {
    const terms = (t: Pallet | Card): Term[] =>
      t.k === 'eq' || t.k === 'neq' || t.k === 'law' ? [t.l, t.r]
        : t.k === 'cond' ? [...t.premises.flatMap((p) => [p.l, p.r]), t.concl.l, t.concl.r] : [];
    for (const id of B) for (const sk of LEVEL_BY_ID[id]!.sockets) for (const t of terms(sk.target)) expect(norm(t), id).toEqual(t);
  });
});

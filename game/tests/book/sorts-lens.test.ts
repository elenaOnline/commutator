// Sort honesty and set-level recipes (final playtest W1–7 #5, #6, #11, #20): the action's symbol σ is never on
// screen, carriers are printed when a variable lives outside the first group, Towers start in the docks' sort,
// sets-only levels offer only set-and-map recipes, and "used in" never counts a card's own bound letters.
import { describe, expect, it } from 'vitest';
import * as F from '../../src/factory';
import { LEVEL_BY_ID } from '../../src/levels/levels';
import { ctxFor } from '../../src/state/factoryStore';
import { libraryFor } from '../../src/hud/library';
import { mapStatementHTML } from '../../src/hud/map';
import { usesTower } from '../../src/hud/lens';
import { fH, labels, type S } from '../../src/hud/util';
import { SUBGROUP_DEFS, docksSort, homGroupChoices, setSortCtx, setsOnlyLevel, sortCtx, withSortCtx } from '../../src/ui/sorts';
import type { Machine } from '../../src/factory/types';

const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&thinsp;|&ensp;/g, ' ').replace(/\s+/g, ' ').trim();
const stateFor = (id: string, earned: string[] = ['cancel', 'witness', 'socks']): S => {
  const level = LEVEL_BY_ID[id]!;
  return { level, ctx: ctxFor(level, earned, []), canvas: { machines: [], belts: [], rooms: [] }, compiled: null } as unknown as S;
};
const inLevel = <T>(id: string, fn: (s: S) => T): T => {
  const s = stateFor(id);
  const prev = sortCtx.cur;
  try { setSortCtx(s.ctx); return fn(s); } finally { sortCtx.cur = prev; }
};

describe('σ is never shown (W6 #5)', () => {
  it('the action laws read (gh)(p) = g(h(p)) and e(p) = p in the Rewriter picker, with no "(σ)"', () => inLevel('P7.2', (s) => {
    const maps = libraryFor(s, 'rewriter').filter((e) => e.group === 'Maps');
    expect(maps.map((e) => e.nameHTML).sort()).toEqual(['acting by a product', 'e acts trivially']);
    expect(maps.map((e) => text(e.stmt)).sort()).toEqual(['(gh)(p) = g(h(p))', 'e(p) = p']);
    for (const e of maps) expect(e.nameHTML + e.stmt).not.toContain('σ');
  }));
  it('the theorem map prints the stabilizer level as α(p) = p', () => {
    for (const id of ['P7.2', 'P8.2']) {
      const t = text(mapStatementHTML(LEVEL_BY_ID[id]!));
      expect(t).not.toContain('σ');
    }
    expect(text(mapStatementHTML(LEVEL_BY_ID['P7.2']!))).toContain('α(p) = p');
  });
});

describe('carriers (W5–7 #6)', () => {
  it('a dock over K prints ∀u, v ∈ K; one over the first group stays ∀x, y', () => inLevel('P9.1', (s) => {
    expect(text(fH(s.level.sockets[0]!.target, labels(s.level)))).toBe('∀u, v ∈ K. uv = vu');
    const C = s.level.givens.find((g) => g.id === 'C')!;
    expect(text(fH(C.fact, labels(s.level)))).toBe('∀x, y. xy = yx');
  }));
  it('a sets level says where its variables live, on the map too', () => {
    expect(text(mapStatementHTML(LEVEL_BY_ID['P6.1']!))).toContain('∀x, y ∈ A.');
    expect(text(mapStatementHTML(LEVEL_BY_ID['P9.1']!))).toContain('∀u, v ∈ K.');
  });
  it('a new element Tower starts in the docks\' sort, never in a G the level lacks', () => {
    const cfg = (id: string) => F.defaultConfig('tower', stateFor(id).ctx) as { carrier?: string };
    expect(docksSort(LEVEL_BY_ID['P6.1']!)).toBe('A');
    expect(cfg('P6.1').carrier).toBe('A');
    expect(cfg('P6.3').carrier).toBe('C');
    expect(cfg('P9.1').carrier).toBe('K');
    expect(cfg('P4.4').carrier).toBeUndefined();
  });
  it('a Hom Tower goes between the floor\'s group Towers when the level\'s G is only a placeholder (P9.3)', () => {
    const G = [{ id: 'G', label: 'G' }], T = [{ id: 'g1', label: 'G₁' }, { id: 'k1', label: 'K₁' }];
    expect(homGroupChoices(LEVEL_BY_ID['P9.3']!, G, T).map((x) => x.id)).toEqual(['g1', 'k1']);
    expect(homGroupChoices(LEVEL_BY_ID['P9.3']!, G, T, ['G']).map((x) => x.id)).toEqual(['g1', 'k1', 'G']);
    expect(homGroupChoices(LEVEL_BY_ID['P9.1']!, [...G, { id: 'K', label: 'K' }], T).map((x) => x.id)).toEqual(['G', 'K', 'g1', 'k1']);
  });
  it('"used in" counts the Tower\'s own variable, never a given\'s bound x', () => {
    const m = (kind: string, config: unknown) => ({ id: kind, kind, config }) as unknown as Machine;
    const meta = { k: 'law', metas: ['x'], l: { k: 'meta', id: 'x' }, r: { k: 'meta', id: 'x' } };
    expect(usesTower(m('given', { kind: 'given', givenId: 'C' }), { inputs: {}, out: { k: 'card', card: meta } } as never, 'x')).toBe(false);
    expect(usesTower(m('rewriter', { kind: 'rewriter' }), { inputs: { q: { k: 'card', card: meta } } } as never, 'x')).toBe(false);
    expect(usesTower(m('spool', { kind: 'spool', t: { k: 'knob', term: { k: 'atom', id: 'x' } } }), undefined, 'x')).toBe(true);
    expect(usesTower(m('spool', { kind: 'spool', t: { k: 'knob', term: { k: 'app', fn: 'f1', args: [{ k: 'e', s: 'g1' }] } } }), undefined, 'g1')).toBe(true);
  });
});

describe('sets-only levels offer set-and-map recipes only (W5 #11)', () => {
  it('P6.x has no group, so no multiply, invert, product, group laws or group theorems', () => {
    for (const id of ['P6.1', 'P6.2', 'P6.3']) {
      const s = stateFor(id);
      expect(setsOnlyLevel(s.level)).toBe(true);
      const op = libraryFor(s, 'operator').map((e) => e.key);
      for (const k of ['mul', 'mulL', 'mulR', 'invert']) expect(op).not.toContain(k);
      expect(op).toContain('swap');
      expect(op.some((k) => k.startsWith('apply:'))).toBe(true);
      expect(libraryFor(s, 'joiner').map((e) => e.key)).toEqual(['chain', 'clash']);
      const rw = libraryFor(s, 'rewriter').map((e) => e.key);
      for (const k of ['cancel', 'pop', 'insertE', 'pair']) expect(rw).not.toContain(k);
      const th = libraryFor(s, 'theorem');
      expect(th.filter((e) => e.group === 'Theorems' || e.group === 'Saved')).toEqual([]);
      for (const g of s.level.givens.filter((x) => x.fact.k === 'cond')) expect(th.some((e) => e.key === `given:${g.id}`)).toBe(true);
    }
  });
  it('a group level keeps them all', () => {
    const s = stateFor('P4.6');
    expect(setsOnlyLevel(s.level)).toBe(false);
    expect(libraryFor(s, 'operator').map((e) => e.key)).toContain('invert');
    expect(libraryFor(s, 'joiner').map((e) => e.key)).toContain('product');
  });
});

it('≤ and ⊴ each have a plain one-line definition (W4 #20)', () => {
  expect(SUBGROUP_DEFS.sub).toMatch(/^H ≤ G, a subgroup: /);
  expect(SUBGROUP_DEFS.normal).toMatch(/^N ⊴ G, a normal subgroup: /);
  void withSortCtx;
});

describe('second review (W8–14)', () => {
  it('N9: a saved hom lemma whose mirror reads the same has no side toggle', async () => {
    const { homLemmas, HOM_INV_ID, EARNED } = await import('./lemmas-w1214');
    const { homE, homInv } = homLemmas();
    const level = LEVEL_BY_ID['P14.2']!;
    const s = { level, ctx: ctxFor(level, [...EARNED, homE.id, homInv.id], [homE, homInv]), canvas: { machines: [], belts: [], rooms: [] }, compiled: null } as unknown as S;
    for (const kind of ['rewriter', 'carddock'] as const) {
      const row = libraryFor(s, kind).find((e) => e.key === `schema:${HOM_INV_ID}`);
      expect(row, kind).toBeTruthy();
      expect(row!.sides, kind).toBeUndefined();
    }
  });
  it('N6: a generalized card never prints one group as another (f : G → K₁ over K₁ is ∀K, f : G → K)', () => {
    const card = { k: 'law', metas: [], l: { k: 'app', fn: 'f', args: [{ k: 'e', s: 'G' }] }, r: { k: 'e', s: 'k1' },
      binds: [{ k: 'grp', id: 'k1' }, { k: 'hom', id: 'f', dom: 'G', cod: 'k1' }] } as const;
    const t = text(fH(card as never, { G: 'G' }));
    expect(t).toMatch(/^∀K, f : G → K\./);
  });
});

describe('N21: the reuse chooser fills itself when the premise names the homomorphism', () => {
  it('P16.2: π(a₁) = π(b₁) into the fibre lemma plays f by π; f(a₁) = f(b₁) plays it by f', { timeout: 60_000 }, async () => {
    const { buildFibre, sch, given, EARNED } = await import('./lemmas-w1214');
    const { multiRoom } = await import('./lemmas-w89');
    const { bookFloor, lvZ, thm, app, elemTower } = await import('./kit-w1214');
    const { fwd, bwd } = buildFibre();
    const f = bookFloor(lvZ('P16.2'), EARNED, [fwd, bwd]);
    f.add(elemTower('a1', 'a₁'), { x: 2, y: 40 });
    f.add(elemTower('b1', 'b₁'), { x: 4, y: 40 });
    const a = { k: 'atom', id: 'a1' } as const, b = { k: 'atom', id: 'b1' } as const;
    const side = (outer: string, kernel: string, y: number) => {
      const r = multiRoom(f, { x: 18, y, w: 30, h: 10 }, [{ rel: 'eq', l: app(outer, a), r: app(outer, b) }]);
      const t1 = f.add(thm(sch(fwd.id)), { x: 21, y: y + 4 });
      const t2 = f.add(thm(given(kernel)), { x: 27, y: y + 4 });
      const t3 = f.add(thm(sch(bwd.id)), { x: 33, y: y + 4 });
      f.wire(r.desks[0]!, t1, 'p0'); f.wire(t1, t2, 'p0'); f.wire(t2, t3, 'p0');
      return [t1, t3] as const;
    };
    const wd = side('pi', 'K2', 4), inj = side('f', 'K1', 18);
    const comp = f.compile();
    expect(comp.machines[wd[0]]!.structs?.[0]?.chosen).toBe('pi');
    expect(comp.machines[wd[1]]!.structs?.[0]?.chosen).toBe('f');
    expect(comp.machines[inj[0]]!.structs?.[0]?.chosen).toBe('f');
    expect(comp.machines[inj[1]]!.structs?.[0]?.chosen).toBe('pi');
    expect(comp.machines[wd[1]]!.status.k).toBe('ok');
  });
});

describe('N16: recipe search and the Saved list', () => {
  const row = (name: string, group: string) => ({ key: name, group, name, nameHTML: name, stmt: '', recipe: { k: 'routed' } }) as never;
  it('ranks an exact built-in name above a saved lemma that contains it', async () => {
    const { searchLibrary } = await import('../../src/hud/library');
    const all = [row('powers of a product of powers', 'Saved'), row('product of powers', 'Imported'), row('cancel', 'Group laws')];
    expect(searchLibrary(all, 'product of powers').map((e) => (e as { name: string }).name)).toEqual(['product of powers', 'powers of a product of powers']);
    expect(searchLibrary(all, '').map((e) => (e as { group: string }).group)).toEqual(['Group laws', 'Saved', 'Imported']);
  });
  it('a homomorphism lemma is offered only where a homomorphism is in scope', async () => {
    const { homLemmas, HOM_INV_ID, EARNED } = await import('./lemmas-w1214');
    const { homE, homInv } = homLemmas();
    const at = (id: string, machines: unknown[] = []) => {
      const level = LEVEL_BY_ID[id]!;
      return { level, ctx: ctxFor(level, [...EARNED, homE.id, homInv.id], [homE, homInv]), canvas: { machines, belts: [], rooms: [] }, compiled: null } as unknown as S;
    };
    const has = (s: S) => libraryFor(s, 'rewriter').some((e) => e.key === `schema:${HOM_INV_ID}`);
    expect(has(at('P4.6'))).toBe(false); // one group, no map
    expect(has(at('P14.2'))).toBe(true); // a level homomorphism f
    const towers = [{ id: 'g', kind: 'tower', at: { x: 0, y: 0 }, rot: 0, config: { kind: 'tower', varId: 'G1', label: 'G₁', sort: 'G', group: true } },
      { id: 'k', kind: 'tower', at: { x: 2, y: 0 }, rot: 0, config: { kind: 'tower', varId: 'K1', label: 'K₁', sort: 'G', group: true } },
      { id: 'f', kind: 'tower', at: { x: 4, y: 0 }, rot: 0, config: { kind: 'tower', varId: 'f1', label: 'f₁', sort: 'G', hom: { dom: 'G1', cod: 'K1' } } }];
    expect(has(at('P14.1'))).toBe(false);
    expect(has(at('P14.1', towers))).toBe(true); // a Hom Tower on the floor
  });
});

it('N6: on a "∀G, K, f" level a new element Tower starts in the Hom Tower\'s domain', () => {
  const level = LEVEL_BY_ID['P14.1']!;
  const ctx = ctxFor(level, [], []);
  const canvas = { machines: [{ id: 'f', kind: 'tower', at: { x: 0, y: 0 }, rot: 0, config: { kind: 'tower', varId: 'f1', label: 'f₁', sort: 'G', hom: { dom: 'G1', cod: 'K1' } } }], belts: [], rooms: [] };
  expect((F.defaultConfig('tower', ctx, { canvas } as never) as { carrier?: string }).carrier).toBe('G1');
  expect((F.defaultConfig('tower', ctx) as { carrier?: string }).carrier).toBeUndefined();
});

describe('verify-fixround: Tower ids and name chips', () => {
  it('#1: group and Hom Towers take fresh ids, so an element x is never read as f₁', async () => {
    const { freshStructId } = await import('../../src/ui/sorts');
    const { labelsAll } = await import('../../src/hud/util');
    expect(freshStructId('hom', ['x', 'y'])).toBe('hom1');
    expect(freshStructId('grp', ['grp1', 'hom1'])).toBe('grp2');
    const tower = (id: string, config: object) => ({ id, kind: 'tower', at: { x: 0, y: 0 }, rot: 0, config: { kind: 'tower', sort: 'G', ...config } });
    const level = LEVEL_BY_ID['P14.1']!;
    const machines = [tower('a', { varId: 'grp1', label: 'G₁', group: true }), tower('b', { varId: 'grp2', label: 'K₁', group: true }),
      tower('c', { varId: freshStructId('hom', ['x', 'grp1', 'grp2']), label: 'f₁', hom: { dom: 'grp1', cod: 'grp2' } }),
      tower('d', { varId: 'x', label: 'x', carrier: 'grp1' }), tower('e', { varId: 'y', label: 'y', carrier: 'grp1' })];
    const s = { level, ctx: ctxFor(level, [], []), canvas: { machines, belts: [], rooms: [] }, compiled: null } as unknown as S;
    const L = labelsAll(s);
    expect([L.x, L.y, L.grp1, L.grp2, L.hom1]).toEqual(['x', 'y', 'G₁', 'K₁', 'f₁']);
  });
  it('#2: an element Tower offers the docks\' own letters first', async () => {
    const { towerLetters } = await import('../../src/ui/sorts');
    expect(towerLetters(LEVEL_BY_ID['P16.1']!, 'grp1', false)).toEqual(['a', 'b', 'x', 'y']); // a, b over the card's own group
    const p162 = LEVEL_BY_ID['P16.2']!.sockets[0]!.target as { metas: string[] };
    expect(p162.metas).toEqual(['a', 'b']);
    expect(towerLetters(LEVEL_BY_ID['P16.2']!, 'G', false)).toEqual(['a', 'b', 'x', 'y']);
    expect(towerLetters(LEVEL_BY_ID['P6.3']!, 'C', true)[0]).toBe('z');
    expect(towerLetters(LEVEL_BY_ID['P6.1']!, 'A', true)).toEqual(['x', 'y', 'u', 'v']);
    expect(towerLetters(LEVEL_BY_ID['P4.4']!, undefined, false)[0]).toBe('x');
  });
});

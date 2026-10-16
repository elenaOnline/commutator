// The lineage of a theorem (the finale's closing panel): computed from the player's actual saves. The Book's lemma
// chains are played through the real store (tests/book/chain-floors.ts, as in lemma-chains.test.ts: build, run to ∎,
// saveLemma), then the lineage of the FHT's floor and of saved lemmas is read back: its nodes, the "used in" edges,
// where each was proved, the columns, and the plain sentences.
import { beforeAll, describe, expect, it, vi } from 'vitest';
vi.setConfig({ testTimeout: 120_000 });
import { CAMPAIGN_LEVELS } from '../../src/levels/campaigns';
import type { Canvas } from '../../src/factory/types';
import { FactoryStore, freshSave, type FSave } from '../../src/state/factoryStore';
import { FLOORS, N, PLAY_ORDER, StoreFloor, type Editor } from './chain-floors';
import { isFinale, lineageColumns, lineageCounts, lineageOf, lineageSummary, lineageTitle, standardTheoremName, type Lineage } from '../../src/hud/lineage';

const SAVE_KEY = 'lemma-works/v3';
const mem = new Map<string, string>();
const earnedBefore = (id: string) => {
  const i = CAMPAIGN_LEVELS.book.findIndex((l) => l.id === id);
  return [...new Set(CAMPAIGN_LEVELS.book.slice(0, i).flatMap((l) => l.unlocks))];
};
function reload(save: FSave, before: string): FactoryStore {
  const s: FSave = JSON.parse(JSON.stringify(save));
  s.campaign = 'book';
  s.campaigns.book.earned = [...new Set([...s.campaigns.book.earned, ...earnedBefore(before)])];
  mem.set(SAVE_KEY, JSON.stringify(s));
  return new FactoryStore();
}

let save: FSave;
let fht: Canvas;
beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(),
  } });
  save = freshSave();
  let store!: FactoryStore;
  for (const id of PLAY_ORDER) {
    store = reload(save, id);
    store.openLevel(id);
    const fl = new StoreFloor(store as unknown as Editor);
    const saves = FLOORS[id]!(fl) ?? [];
    fl.settle();
    for (let i = 0; i < 900 && !store.get().level.sockets.every((d) => store.get().run.delivered[d.id] !== undefined); i++) store.tick();
    if (!store.get().compiled.solvable) throw new Error(`${id} does not solve`);
    for (const sv of saves) if (!store.saveLemma(sv.machine, sv.name).ok) throw new Error(`${id}: ${sv.name} not saved`);
    save = store.get().save;
  }
  fht = store.get().canvas; // the P16.2 floor as the ceremony sees it
});

const byName = (lin: Lineage, name: string) => lin.nodes.find((n) => n.name === name);
const usesOf = (lin: Lineage, name: string) => byName(lin, name)!.uses.map((k) => lin.nodes.find((n) => n.key === k)!.name).sort();

describe('the lineage of the Fundamental Homomorphism Theorem, from the played saves', () => {
  it('nodes: the FHT, the saved lemmas its proof used, the lemmas those used, the earned theorems as roots', () => {
    const lin = lineageOf(save.campaigns.book, 'book', { k: 'floor', levelId: 'P16.2', canvas: fht });
    const t = lin.nodes.find((n) => n.key === lin.target)!;
    expect(t.name).toBe('The Fundamental Homomorphism Theorem');
    expect(t.kind).toBe('target');
    expect(new Set(lin.nodes.map((n) => n.name))).toEqual(new Set(['The Fundamental Homomorphism Theorem', N.fibF, N.fibB, N.finv, N.fe, N.idem, 'unique inverse']));
    // edges are the floors' own citations ("used in"), nothing more
    expect(usesOf(lin, t.name)).toEqual([N.fibF, N.fibB].sort());
    expect(usesOf(lin, N.fibF)).toEqual([N.finv]);
    expect(usesOf(lin, N.fibB)).toEqual([N.finv]);
    expect(usesOf(lin, N.finv)).toEqual([N.fe, 'unique inverse'].sort());
    expect(usesOf(lin, N.fe)).toEqual([N.idem]);
    expect(usesOf(lin, N.idem)).toEqual([]);
    expect(byName(lin, 'unique inverse')).toMatchObject({ kind: 'theorem', levelId: 'P4.3', uses: [] });
    // where each was proved: the order that saved it
    expect([N.fibF, N.fibB, N.finv, N.fe, N.idem].map((n) => byName(lin, n)!.levelId)).toEqual(['P16.1', 'P16.1', 'P9.4', 'P9.3', 'P4.7']);
    // dependencies come before the nodes that use them
    const at = new Map(lin.nodes.map((n, i) => [n.key, i] as const));
    for (const n of lin.nodes) for (const u of n.uses) expect(at.get(u)!).toBeLessThan(at.get(n.key)!);
    expect(lin).toMatchObject({ lemmas: 5, direct: 2 });
  });

  it('columns run by world from the roots to the FHT, and a lemma used inside its own world sits one column right', () => {
    const lin = lineageOf(save.campaigns.book, 'book', { k: 'floor', levelId: 'P16.2', canvas: fht });
    const cols = lineageColumns(lin).map((c) => [c.world, c.nodes.map((n) => n.name)]);
    expect(cols).toEqual([
      [2, ['unique inverse']],
      [3, [N.idem]],
      [7, [N.fe]],
      [7, [N.finv]],
      [14, [N.fibF, N.fibB]],
      [14, ['The Fundamental Homomorphism Theorem']],
    ]);
  });

  it('says plainly what it rests on, and counts like the map', () => {
    const lin = lineageOf(save.campaigns.book, 'book', { k: 'floor', levelId: 'P16.2', canvas: fht });
    expect(lineageTitle(lin)).toBe('The lineage of the Fundamental Homomorphism Theorem');
    expect(lineageSummary(lin)).toBe('This proof uses 2 of your saved lemmas directly. Those rest on 3 more of your lemmas.');
    const main = CAMPAIGN_LEVELS.book.filter((l) => !l.side).length, side = CAMPAIGN_LEVELS.book.length - main;
    const mainDone = PLAY_ORDER.filter((id) => !id.includes('.s')).length, sideDone = PLAY_ORDER.length - mainDone;
    expect(lineageCounts(save, 'book', lin)).toBe(`${mainDone} of ${main} main orders proven, and ${sideDone} of ${side} side orders. You saved 12 lemmas of your own; this proof rests on 5 of them.`);
  });

  it('never invents an edge: a saved lemma standing unwired on the floor is not part of the proof', () => {
    const comm = save.campaigns.book.lemmas.find((l) => l.name === N.commB)!;
    const extra = { id: 'theorem99', kind: 'theorem', at: { x: 70, y: 44 }, rot: 0, config: { kind: 'theorem', recipe: { k: 'library', ref: { k: 'schema', id: comm.id } }, choice: 0, values: {} } };
    const canvas = { ...fht, machines: [...fht.machines, extra] } as Canvas;
    const lin = lineageOf(save.campaigns.book, 'book', { k: 'floor', levelId: 'P16.2', canvas });
    expect(lin.nodes.map((n) => n.name)).not.toContain(N.commB);
    expect(lin.lemmas).toBe(5);
  });

  it('a floor that uses no saved lemma has a short lineage, and says so', () => {
    const lin = lineageOf(save.campaigns.book, 'book', { k: 'floor', levelId: 'P16.2', canvas: { ...fht, machines: fht.machines.filter((m) => m.kind === 'tower'), belts: [], rooms: [] } as Canvas });
    expect(lin.nodes.map((n) => n.key)).toEqual(['target']);
    expect(lineageSummary(lin)).toBe('This proof uses none of your saved lemmas and no built-in theorem. It rests on the group laws and its hypotheses alone.');
    expect(lineageCounts(save, 'book', lin)).toMatch(/this proof rests on 0 of them\.$/);
  });
});

describe('the lineage of any saved lemma (from the Lemma Book)', () => {
  it('fibre lemma ⟹ rests on f(x⁻¹) = f(x)⁻¹, f(e) = e, the idempotent lemma and unique inverse', () => {
    const fib = save.campaigns.book.lemmas.find((l) => l.name === N.fibF)!;
    const lin = lineageOf(save.campaigns.book, 'book', { k: 'lemma', id: fib.id });
    expect(lin.target).toBe(fib.id);
    expect(lin.nodes[lin.nodes.length - 1]!.kind).toBe('target');
    expect(lin.nodes.map((n) => n.name).sort()).toEqual([N.fibF, N.finv, N.fe, N.idem, 'unique inverse'].sort());
    expect(lin).toMatchObject({ lemmas: 3, direct: 1 });
    expect(lineageTitle(lin)).toBe(`The lineage of “${N.fibF}”`);
    expect(lineageSummary(lin, 'Its proof')).toBe('Its proof uses one of your saved lemmas directly. That lemma rests on 2 more of your lemmas.');
  });
  it('a lemma proved from the group laws alone has nothing under it', () => {
    const idem = save.campaigns.book.lemmas.find((l) => l.name === N.idem)!;
    const lin = lineageOf(save.campaigns.book, 'book', { k: 'lemma', id: idem.id });
    expect(lin.nodes.map((n) => n.name)).toEqual([N.idem]);
    expect(lineageSummary(lin, 'Its proof')).toMatch(/^Its proof uses none of your saved lemmas/);
  });
});

describe('the finale', () => {
  it('is the Book’s last main order, and is named by its standard name', () => {
    expect(isFinale('P16.2')).toBe(true);
    expect(isFinale('P16.1')).toBe(false);
    expect(isFinale('P16.s1')).toBe(false);
    expect(standardTheoremName('P16.2')).toBe('The Fundamental Homomorphism Theorem');
    expect(standardTheoremName('P16.1')).toBeNull();
  });
});

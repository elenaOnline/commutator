// Lemma chains end to end, through the real store: a fresh Book save; each source level's reference floor is built with
// store calls, run to ∎ and its lemmas saved with store.saveLemma (the ceremony's / ∀ lens's call); the save then goes
// through JSON and a NEW FactoryStore (a page reload: upgrade, positional records, re-verification from the saved floors);
// each consumer level picks the saved lemma by name from the recipe picker's list, chooses its binders in the reuse lens,
// and runs to ∎. The floors are tests/book/chain-floors.ts (shared with the headless-browser driver pw-lemma-chains.mjs).
import { beforeAll, describe, expect, it, vi } from 'vitest';
vi.setConfig({ testTimeout: 60_000 });
import { CAMPAIGN_LEVELS, LEVEL_BY_ID } from '../../src/levels/campaigns';
import { FactoryStore, freshSave, type FSave } from '../../src/state/factoryStore';
import { CHAINS, FLOORS, N, PLAY_ORDER, StoreFloor, type Editor } from './chain-floors';

const SAVE_KEY = 'lemma-works/v3';
const mem = new Map<string, string>();
beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(),
  } });
});

/** Everything a player who reached `id` has earned in the Book: the unlocks of every earlier Book level. */
const earnedBefore = (id: string) => {
  const i = CAMPAIGN_LEVELS.book.findIndex((l) => l.id === id);
  return [...new Set(CAMPAIGN_LEVELS.book.slice(0, i).flatMap((l) => l.unlocks))];
};
/** A page reload: the save as JSON in localStorage, a new store reads it (upgrade → positional → re-verify). */
function reload(save: FSave, before: string): FactoryStore {
  const s: FSave = JSON.parse(JSON.stringify(save));
  s.campaign = 'book';
  s.campaigns.book.earned = [...new Set([...s.campaigns.book.earned, ...earnedBefore(before)])];
  mem.set(SAVE_KEY, JSON.stringify(s));
  return new FactoryStore();
}
/** Run to ∎ with the store's own clock. */
function runToQed(store: FactoryStore, limit = 900) {
  for (let i = 0; i < limit; i++) {
    const { run, level } = store.get();
    if (level.sockets.every((d) => run.delivered[d.id] !== undefined)) return true;
    store.tick();
  }
  const { run, level } = store.get();
  return level.sockets.every((d) => run.delivered[d.id] !== undefined);
}
const jams = (store: FactoryStore) => Object.entries(store.get().compiled.machines).filter(([, m]) => m.status.k !== 'ok').map(([id, m]) => `${id}: ${m.status.k} ${(m.status as { reason?: string }).reason ?? ''}`);

describe('lemma chains: save → JSON → reload → apply (real store)', () => {
  let save: FSave = freshSave();
  const result: Record<string, string> = {};
  for (const id of PLAY_ORDER) {
    it(`${id} · ${LEVEL_BY_ID[id]!.title}`, () => {
      const store = reload(save, id);
      // every lemma saved so far re-verifies from its saved floor after the reload
      for (const l of store.camp().lemmas) expect(l.verified, `${l.name} re-verifies on load: ${l.reason}`).toBe(true);
      store.openLevel(id);
      const fl = new StoreFloor(store as unknown as Editor);
      try {
        const saves = FLOORS[id]!(fl) ?? [];
        fl.settle();
        const solved = runToQed(store);
        expect(store.get().compiled.solvable, jams(store).join('\n')).toBe(true);
        expect(solved, `${id} reaches ∎`).toBe(true);
        // the saved lemmas were applied at the binders the lens chose
        for (const u of fl.uses) for (const [b, sym] of Object.entries(u.binds)) {
          const plays = store.get().compiled.machines[u.machine]!.structs ?? [];
          expect(plays.find((p) => p.binder.replace(/^\$\d+:/, '') === b)?.chosen, `${u.lemma} at ${b}`).toBe(sym);
        }
        // save, as the ceremony does: the standard name is the manifest's lemmaNames entry of the dock it feeds
        const lv = store.get().level;
        for (const sv of saves) {
          const dock = lv.sockets.findIndex((d) => store.get().compiled.sockets[d.id]?.by === sv.machine);
          expect(lv.lemmaNames?.[dock], `${id} dock ${dock} has a standard lemma name`).toBe(sv.name);
          const r = store.saveLemma(sv.machine, sv.name);
          expect(r.ok, (r as { reason?: string }).reason).toBe(true);
        }
        save = store.get().save;
        result[id] = 'ok';
      } catch (e) {
        save = store.get().save;
        result[id] = String(e);
        throw e;
      }
    });
  }
  it('every chain closes; after one more reload the whole Lemma Book is positional and verified', () => {
    for (const c of CHAINS) for (const id of c.levels) expect(result[id], `${c.name}: ${id}`).toBe('ok');
    const store = reload(save, 'P16.2');
    expect(store.camp().lemmas.map((l) => l.name)).toEqual(Object.values(N));
    for (const l of store.camp().lemmas) {
      expect(l.verified, `${l.name}: ${l.reason}`).toBe(true);
      for (const b of l.card.binds ?? []) expect(b.id, `${l.name} binder`).toMatch(/^\$\d+:/);
    }
  });

  it('a floor that comes in with a record\'s old binder names ({ f: \'pi\' }) is stored positionally (pasted fibre lemmas)', () => {
    const store = reload(save, 'P16.2');
    store.openLevel('P16.2');
    const fib = store.camp().lemmas.find((l) => l.name === N.fibF)!;
    const old = { kind: 'theorem', recipe: { k: 'library', ref: { k: 'schema', id: fib.id, structs: { f: 'pi' } } }, choice: 0, values: {} } as const;
    const bp = { machines: [{ id: 'theorem1', kind: 'theorem', at: { x: 0, y: 0 }, rot: 0, config: old }], belts: [], origin: { x: 0, y: 0 } } as never;
    const before = new Set(store.get().canvas.machines.map((m) => m.id));
    const e = store.paste(bp, { x: 30, y: 40 });
    expect(e.ok, (e as { reason?: string }).reason).toBe(true);
    const placed = store.get().canvas.machines.find((m) => !before.has(m.id))!;
    expect((placed.config as { recipe: { ref: { structs: Record<string, string> } } }).recipe.ref.structs).toEqual({ '$2:f': 'pi' });
    expect(store.get().compiled.machines[placed.id]!.status).not.toMatchObject({ reason: expect.stringMatching(/not a parameter|Choose which/) });
  });

  it('a chain goes off together, and each lemma says which lemma it is missing', () => {
    const s: FSave = JSON.parse(JSON.stringify(save));
    s.campaigns.book.lemmas = s.campaigns.book.lemmas.filter((l) => l.name !== N.fe);
    const store = reload(s, 'P16.2');
    const by = (n: string) => store.camp().lemmas.find((l) => l.name === n)!;
    expect(by(N.finv)).toMatchObject({ verified: false, reason: 'It uses a lemma that is no longer in your Lemma Book.' });
    expect(by(N.fibF)).toMatchObject({ verified: false, reason: `It uses “${N.finv}”, which is disabled.` });
    expect(by(N.fibB).verified).toBe(false);
    expect(by(N.symm).verified).toBe(true); // the coset lemmas do not use it
  });
});

// Architect regression (playtest-v4-r1 blocker): a saved lemma that cites an EARLIER saved lemma must
// stay verified after reload — FactoryStore.verifyLemmas must pass the ids of earlier verified lemmas.
import { test, expect, vi } from 'vitest';

const calls: { id: string; earlier: string[] }[] = [];
vi.mock('../src/factory', async (orig) => {
  const real = await orig<typeof import('../src/factory')>();
  return { ...real, verifyLemma: (l: { id: string }, _ctx: unknown, earlier: string[] = []) => { calls.push({ id: l.id, earlier }); return { ok: true }; } };
});

test('verifyLemmas passes earlier lemma ids so chained lemmas survive reload', async () => {
  const { FactoryStore } = await import('../src/state/factoryStore');
  const mk = (id: string, t: number) => ({ id, name: id, card: { k: 'law' as const, metas: ['x'], l: { k: 'meta' as const, id: 'x' }, r: { k: 'meta' as const, id: 'x' } }, levelId: 'S01', canvas: { version: 3 as const, levelId: 'S01', machines: [], belts: [], rooms: [] }, machine: 'm', savedAt: t });
  const out = FactoryStore.verifyLemmas({ version: 4, lemmas: [mk('lemma:b-2', 2), mk('lemma:a-1', 1)], levels: {}, earned: [], settings: { speed: 1, reducedMotion: false } });
  expect(calls).toEqual([{ id: 'lemma:a-1', earlier: [] }, { id: 'lemma:b-2', earlier: ['lemma:a-1'] }]);
  expect(out.lemmas.every((l) => l.verified)).toBe(true);
});

// Campaign infrastructure (The Book, SYNTHESIS §2.1 / §4): namespaced save, v4 migration, Book opening rules,
// campaign-aware kernel contexts. The Book's world files are being authored concurrently, so this suite mocks
// them with a small fixture Book (two worlds) built from main-campaign manifests.
import { describe, expect, it, vi } from 'vitest';
import type { LevelManifest } from '../kernel/types';

vi.mock('../levels/book', async () => {
  const { LEVEL_BY_ID } = await import('../levels/levels');
  const mk = (id: string, from: string, world: number, extra: Partial<LevelManifest> = {}): LevelManifest =>
    ({ ...structuredClone(LEVEL_BY_ID[from]!), id, campaign: 'book', world, chapter: world + 2, method: 'Direct computation', uses: [], unlocks: [], ...extra });
  const BOOK_LEVELS = [
    mk('P3.1', 'L01', 1),
    mk('P3.2', 'L02', 1),
    mk('P3.s1', 'L01', 1, { side: true }),
    mk('P4.1', 'L03', 2, { unlocks: ['witness'], method: 'Uniqueness argument' }),
    mk('P4.2', 'L05', 2, { unlocks: ['cancel'] }),
  ];
  return {
    BOOK_LEVELS,
    BOOK_CARDS: { 'P3.1': [{ title: 'Fixture card', body: 'x' }] },
    BOOK_WORLDS: { 1: { title: 'Groups', chapters: '2–3' }, 2: { title: 'First Theorems', chapters: '4' } },
  };
});

const { FactoryStore, ctxFor, ctxForSave, campSave, progressOf, freshSave } = await import('./factoryStore');
const { isOpen, isSolved, nextLevel, tally } = await import('./progress');
const { ALL_CARDS, LEVEL_BY_ID, campaignOf, displayNo, bookWorlds } = await import('../levels/campaigns');
const { LEVEL_BY_ID: CORE_BY_ID } = await import('../levels/levels');
type FSave = import('./factoryStore').FSave;
type SavedLemma = import('./factoryStore').SavedLemma;

const solved = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { canvas: { version: 3, levelId: id, machines: [], belts: [], rooms: [] }, history: [], solvedAt: 1 }]));
const withBook = (book: string[], main: string[] = []): FSave => {
  const s = freshSave();
  s.campaigns.book.levels = solved(book) as FSave['campaigns']['book']['levels'];
  s.campaigns.main.levels = solved(main) as FSave['campaigns']['main']['levels'];
  return s;
};
const lemma = (id: string, levelId: string, savedAt = 1): SavedLemma => ({
  id, name: id, levelId, machine: 'm', savedAt, verified: true,
  card: { k: 'law', metas: ['x'], l: { k: 'inv', arg: { k: 'inv', arg: { k: 'meta', id: 'x' } } }, r: { k: 'meta', id: 'x' } },
  canvas: { version: 3, levelId, machines: [], belts: [], rooms: [] } as unknown as SavedLemma['canvas'],
});

describe('level lookup covers both campaigns', () => {
  it('registers Book levels in the shared LEVEL_BY_ID (the factory and kernel lookups see them)', () => {
    expect(LEVEL_BY_ID['P4.1']?.campaign).toBe('book');
    expect(CORE_BY_ID['P4.1']).toBe(LEVEL_BY_ID['P4.1']);
    expect(LEVEL_BY_ID.L01?.campaign ?? 'main').toBe('main');
  });
  it('knows each level\'s campaign, including Book ids that no longer exist', () => {
    expect(campaignOf('P3.1')).toBe('book');
    expect(campaignOf('L05')).toBe('main');
    expect(campaignOf('P9.9')).toBe('book');
    expect(campaignOf(undefined)).toBe('main');
  });
  it('merges the Book\'s concept cards', () => {
    expect(ALL_CARDS['P3.1']?.[0]?.title).toBe('Fixture card');
    expect(ALL_CARDS.L01?.length).toBeGreaterThan(0);
  });
  it('numbers Book levels 1…n and side levels S1… in book order', () => {
    expect(['P3.1', 'P3.2', 'P4.1', 'P4.2'].map((id) => displayNo(LEVEL_BY_ID[id]!))).toEqual(['1', '2', '3', '4']);
    expect(displayNo(LEVEL_BY_ID['P3.s1']!)).toBe('S1');
    expect(displayNo(LEVEL_BY_ID.L01!)).toBe(String(LEVEL_BY_ID.L01!.index));
  });
  it('groups the Book by world, main levels then side levels', () => {
    const ws = bookWorlds();
    expect(ws.map((w) => [w.world, w.title, w.main.map((l) => l.id), w.side.map((l) => l.id)])).toEqual([
      [1, 'Groups', ['P3.1', 'P3.2'], ['P3.s1']],
      [2, 'First Theorems', ['P4.1', 'P4.2'], []],
    ]);
  });
});

describe('The Book opening rules', () => {
  const open = (s: FSave) => ['P3.1', 'P3.2', 'P3.s1', 'P4.1', 'P4.2'].filter((id) => isOpen(s, LEVEL_BY_ID[id]!));
  it('opens the first level, and side levels with their world', () => {
    expect(open(withBook([]))).toEqual(['P3.1', 'P3.s1']);
  });
  it('opens levels in order within a world', () => {
    expect(open(withBook(['P3.1']))).toEqual(['P3.1', 'P3.2', 'P3.s1']);
  });
  it('opens a world when the previous world\'s main levels are solved (side levels not required)', () => {
    expect(open(withBook(['P3.1', 'P3.2']))).toEqual(['P3.1', 'P3.2', 'P3.s1', 'P4.1']);
    expect(open(withBook(['P3.1', 'P3.2', 'P4.1']))).toContain('P4.2');
  });
  it('ignores main-campaign progress', () => {
    expect(open(withBook([], ['L01', 'L02', 'L03']))).toEqual(['P3.1', 'P3.s1']);
    expect(isSolved(withBook([], ['L01']), 'L01')).toBe(true);
    expect(isSolved(withBook(['P3.1']), 'L01')).toBe(false);
  });
  it('suggests the next order inside the Book', () => {
    expect(nextLevel(withBook([]), undefined, 'book')?.id).toBe('P3.1');
    expect(nextLevel(withBook(['P3.1']), 'P3.1')?.id).toBe('P3.2');
    expect(nextLevel(withBook(['P3.1', 'P3.2']), 'P3.2')?.id).toBe('P4.1');
    expect(nextLevel(withBook(['P3.1']), 'P3.s1')?.id).toBe('P3.2');
    expect(nextLevel(withBook([]), undefined, 'main')?.campaign ?? 'main').toBe('main');
    expect(tally(withBook(['P3.1', 'P3.s1']), 'book')).toEqual({ solved: 1, total: 4 });
  });
});

describe('save migration (v4 → v5)', () => {
  const v4 = {
    version: 4 as const,
    levels: solved(['L01', 'L02', 'S01']) as FSave['campaigns']['main']['levels'],
    earned: ['witness', 'cancel', 'socks'],
    lemmas: [lemma('lemma:double-inverse-1', 'S01')],
    lastLevel: 'L02',
    settings: { speed: 2, reducedMotion: false, outAsTerms: false },
  };
  it('files everything under main, without loss', () => {
    const s = FactoryStore.migrateV4(structuredClone(v4));
    expect(s.version).toBe(5);
    expect(s.campaign).toBe('main');
    expect(s.campaigns.main.levels).toEqual(v4.levels);
    expect(s.campaigns.main.earned).toEqual(v4.earned);
    expect(s.campaigns.main.lemmas).toEqual(v4.lemmas);
    expect(s.campaigns.main.lastLevel).toBe('L02');
    expect(s.settings).toEqual(v4.settings);
    expect(s.campaigns.book).toEqual({ levels: {}, earned: [], lemmas: [] });
  });
  it('files a Book id found in a v4 dev save under the Book', () => {
    const s = FactoryStore.migrateV4({ ...structuredClone(v4), levels: { ...v4.levels, ...solved(['P3.1']) } as typeof v4.levels, lastLevel: 'P3.1' });
    expect(Object.keys(s.campaigns.book.levels)).toEqual(['P3.1']);
    expect(Object.keys(s.campaigns.main.levels)).toEqual(['L01', 'L02', 'S01']);
    expect(s.campaigns.book.lastLevel).toBe('P3.1');
    expect(s.campaign).toBe('book');
  });
  it('upgrade() accepts v5 as is, v4, and unknown shapes', () => {
    const s5 = FactoryStore.migrateV4(structuredClone(v4));
    expect(FactoryStore.upgrade(JSON.parse(JSON.stringify(s5)))).toEqual(s5);
    expect(FactoryStore.upgrade(structuredClone(v4)).campaigns.main.earned).toEqual(v4.earned);
    expect(FactoryStore.upgrade({ version: 99 })).toEqual(freshSave());
    expect(FactoryStore.upgrade(null)).toEqual(freshSave());
  });
  it('progressOf finds a level in its own campaign', () => {
    const s = withBook(['P3.1'], ['L01']);
    expect(progressOf(s, 'P3.1')?.solvedAt).toBe(1);
    expect(progressOf(s, 'L01')?.solvedAt).toBe(1);
    expect(progressOf(s, 'L02')).toBeUndefined();
  });
});

describe('campaign-aware kernel contexts', () => {
  const save = (): FSave => {
    const s = freshSave();
    s.campaigns.main.earned = ['witness', 'cancel'];
    s.campaigns.main.lemmas = [lemma('lemma:main-1', 'S01')];
    s.campaigns.book.earned = ['witness'];
    s.campaigns.book.lemmas = [lemma('lemma:book-2', 'P4.1')];
    return s;
  };
  it('lends each campaign only its own earned theorems', () => {
    const book = ctxForSave(LEVEL_BY_ID['P4.2']!, save()).level.tools.schemas;
    const main = ctxForSave(LEVEL_BY_ID.L06!, save()).level.tools.schemas;
    expect(book).toContain('witness');
    expect(book).not.toContain('cancel');
    expect(main).toEqual(expect.arrayContaining(['witness', 'cancel']));
  });
  it('lends each campaign only its own Lemma Book', () => {
    const book = ctxForSave(LEVEL_BY_ID['P4.2']!, save());
    const main = ctxForSave(LEVEL_BY_ID.L06!, save());
    expect(book.level.tools.schemas).toContain('lemma:book-2');
    expect(book.level.tools.schemas).not.toContain('lemma:main-1');
    expect(main.level.tools.schemas).toContain('lemma:main-1');
    expect(main.level.tools.schemas).not.toContain('lemma:book-2');
    expect(book.registry['lemma:book-2']?.origin).toBe('authored');
  });
  it('drops a lemma from the other campaign even if a caller passes it (backstop)', () => {
    const c = ctxFor(LEVEL_BY_ID['P4.2']!, [], [lemma('lemma:main-1', 'S01')]);
    expect(c.level.tools.schemas).not.toContain('lemma:main-1');
  });
  it('keeps the Book\'s toolset flags; the main campaign opens every machine', () => {
    const lv = { ...LEVEL_BY_ID['P4.2']!, tools: { ...LEVEL_BY_ID['P4.2']!.tools, press: false, classical: false } };
    expect(ctxFor(lv, []).level.tools.press).toBe(false);
    expect(ctxFor(lv, []).level.tools.classical).toBe(false);
    const main = { ...LEVEL_BY_ID.L01!, tools: { ...LEVEL_BY_ID.L01!.tools, press: false } };
    expect(ctxFor(main, []).level.tools.press).toBe(true);
  });
  it('never lends a level its own unlock', () => {
    const s = save(); s.campaigns.book.earned = ['witness', 'cancel'];
    expect(ctxForSave(LEVEL_BY_ID['P4.2']!, s).level.tools.schemas).not.toContain('cancel');
  });
});

describe('the store keeps campaigns apart', () => {
  it('a Book solve earns into the Book only; lastLevel is per campaign', () => {
    const store = new FactoryStore();
    store.openLevel('L02');
    store.openLevel('P4.1');
    expect(store.get().save.campaign).toBe('book');
    (store as unknown as { markSolved: () => void }).markSolved();
    const s = store.get().save;
    expect(campSave(s, 'book').earned).toEqual(['witness']);
    expect(campSave(s, 'main').earned).not.toContain('witness');
    expect(campSave(s, 'book').levels['P4.1']?.solvedAt).toBeTruthy();
    expect(campSave(s, 'main').levels['P4.1']).toBeUndefined();
    expect(campSave(s, 'main').lastLevel).toBe('L02');
    expect(campSave(s, 'book').lastLevel).toBe('P4.1');
    expect(store.get().ui.ceremony?.unlocked).toEqual(['witness']);
  });
  it('the map switch remembers the campaign and resumes it', () => {
    const store = new FactoryStore();
    store.openLevel('L03');
    store.openLevel('P3.2');
    store.setCampaign('main');
    expect(store.get().save.campaign).toBe('main');
    expect(store.resumeLevel()).toBe('L03');
    expect(store.resumeLevel('book')).toBe('P3.2');
    store.openMap('book');
    expect(store.get().save.campaign).toBe('book');
    expect(store.get().ui.screen).toBe('map');
  });
  it('re-verifies each campaign\'s Lemma Book under that campaign\'s earned set', async () => {
    const F = await import('../factory');
    const seen: { id: string; schemas: string[]; earlier: string[] }[] = [];
    const spy = vi.spyOn(F, 'verifyLemma').mockImplementation((l, ctx, earlier = []) => { seen.push({ id: l.id, schemas: ctx.level.tools.schemas, earlier }); return { ok: true }; });
    try {
      const s = freshSave();
      s.campaigns.main.earned = ['cancel'];
      s.campaigns.main.lemmas = [lemma('lemma:a-1', 'S01', 1)];
      s.campaigns.book.lemmas = [lemma('lemma:b-2', 'P4.1', 2), lemma('lemma:c-3', 'P4.2', 3)];
      const out = FactoryStore.verifyLemmas(s);
      expect(out.campaigns.book.lemmas.map((l) => l.verified)).toEqual([true, true]);
      const c = seen.find((x) => x.id === 'lemma:c-3')!;
      expect(c.earlier).toEqual(['lemma:b-2']); // never the main campaign's lemma
      expect(c.schemas).not.toContain('cancel'); // main's earned set never leaks into the Book
      expect(seen.find((x) => x.id === 'lemma:a-1')!.earlier).toEqual([]);
    } finally { spy.mockRestore(); }
  });
});

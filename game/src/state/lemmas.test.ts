// Lemma Book records are positional (KERNEL-EXT §3½): binders by position, never a level's id, so a saved law about
// "every homomorphism f" can never be read as a law about a level's plain map that happens to be called f.
import { describe, expect, it } from 'vitest';
import * as K from '../kernel';
import { positional, positionalRefs, isPositional } from './lemmas';
import { FactoryStore, freshSave, type SavedLemma } from './factoryStore';

const app = (fn: string, ...args: K.Term[]): K.Term => ({ k: 'app', fn, args });
const eS = (s: string): K.Term => ({ k: 'e', s });
const sm = (id: string) => ({ k: 'sortmeta' as const, id });
/** P9.1's card: ∀G₁, H (groups) ∀f : G₁ → H. f(e_G₁) = e_H, as the kernel generalizes it (binder ids = names). */
const P91: K.Card = { k: 'law', metas: [], l: app('f', eS('S')), r: eS('T'),
  binds: [{ k: 'grp', id: 'S' }, { k: 'grp', id: 'T' }, { k: 'hom', id: 'f', dom: sm('S'), cod: sm('T') }] };
const SUBCARD: K.Card = { k: 'cond', metas: ['x'], binds: [{ k: 'sub', id: 'H', normal: false }],
  premises: [{ k: 'mem', t: { k: 'meta', id: 'x' }, sub: { k: 'submeta', id: 'H' } }], concl: { k: 'mem', t: { k: 'inv', arg: { k: 'meta', id: 'x' } }, sub: { k: 'submeta', id: 'H' } } };

describe('positional Lemma Book records', () => {
  it('renames every structure binder by position, everywhere it occurs', () => {
    const c = positional(P91);
    expect(c.binds!.map((b) => b.id)).toEqual(['$0:S', '$1:T', '$2:f']);
    expect(JSON.stringify(c)).not.toMatch(/"(fn|id|s)":"(f|S|T)"/);
    expect((c as { l: K.Term }).l).toEqual(app('$2:f', eS('$0:S')));
    expect(c.binds![2]).toEqual({ k: 'hom', id: '$2:f', dom: sm('$0:S'), cod: sm('$1:T') });
    const d = positional(SUBCARD);
    expect(JSON.stringify(d)).toContain('"submeta","id":"$0:H"');
  });
  it('is the same theorem (card identity up to renaming) and idempotent', () => {
    expect(K.sameCardUpToRenaming(positional(P91), P91)).toBe(true);
    expect(K.sameCardUpToRenaming(positional(SUBCARD), SUBCARD)).toBe(true);
    expect(positional(positional(P91))).toEqual(positional(P91));
    expect(isPositional('$3:f')).toBe(true);
  });
  it('leaves one-group cards (no binders) untouched', () => {
    const law: K.Card = { k: 'law', metas: ['x'], l: { k: 'inv', arg: { k: 'inv', arg: { k: 'meta', id: 'x' } } }, r: { k: 'meta', id: 'x' } };
    expect(positional(law)).toBe(law);
  });
  it('migrates saves on load: every record in both campaigns becomes positional', () => {
    const s = freshSave();
    const rec = (id: string, card: K.Card, levelId: string): SavedLemma => ({ id, name: id, card, levelId, canvas: { version: 3, levelId, machines: [], belts: [], rooms: [] } as never, machine: 'm', savedAt: 1 });
    s.campaigns.book.lemmas = [rec('lemma:fe-1', P91, 'P9.1'), rec('lemma:inv-2', SUBCARD, 'P5.2')];
    s.campaigns.main.lemmas = [rec('lemma:dbl-3', { k: 'law', metas: ['x'], l: { k: 'meta', id: 'x' }, r: { k: 'meta', id: 'x' } }, 'S01')];
    const out = FactoryStore.upgrade(JSON.parse(JSON.stringify(s)));
    expect(out.campaigns.book.lemmas.map((l) => l.card.binds?.map((b) => b.id))).toEqual([['$0:S', '$1:T', '$2:f'], ['$0:H']]);
    expect(out.campaigns.main.lemmas[0]!.card).toEqual(s.campaigns.main.lemmas[0]!.card);
    expect(FactoryStore.upgrade(JSON.parse(JSON.stringify(out)))).toEqual(out);
  });
  it('rewrites floors that apply a record under its old binder names (P14.3 used f(e) = e as structs { f })', () => {
    const s = freshSave();
    const ref = { k: 'schema', id: 'lemma:fe-1', structs: { f: 'g' } };
    const canvas = { version: 3, levelId: 'P14.3', machines: [{ id: 'rewriter3', kind: 'rewriter', config: { kind: 'rewriter', recipe: { k: 'law', ref } } }], belts: [], rooms: [] };
    s.campaigns.book.lemmas = [{ id: 'lemma:fe-1', name: 'f(e) = e', card: P91, levelId: 'P9.1', canvas: canvas as never, machine: 'm', savedAt: 1 }];
    s.campaigns.book.levels['P14.3'] = { canvas: canvas as never, history: [] } as never;
    const out = FactoryStore.upgrade(JSON.parse(JSON.stringify(s)));
    const structsOf = (c: unknown) => (c as typeof canvas).machines[0]!.config.recipe.ref.structs;
    expect(structsOf(out.campaigns.book.levels['P14.3']!.canvas)).toEqual({ '$2:f': 'g' });
    expect(structsOf(out.campaigns.book.lemmas[0]!.canvas)).toEqual({ '$2:f': 'g' });
    expect(positionalRefs(out, out.campaigns.book.lemmas)).toBe(out);
  });
});

describe('a positional record in a level that reuses the name', () => {
  it('∀f (a hom) binds only homs in scope: never the level\'s plain map called f', async () => {
    const { mkLevel } = await import('../kernel/testkit');
    const { libraryRefs } = await import('../factory/catalog');
    const { ctxFor } = await import('./factoryStore');
    const lv = mkLevel({ id: 'P7.x', campaign: 'book', sorts: [{ id: 'G', kind: 'group', label: 'G' }, { id: 'K', kind: 'group', label: 'K' }, { id: 'A', kind: 'set', label: 'A' }],
      maps: [{ id: 'f', label: 'f', args: ['A'], res: 'A', kind: 'map' }, { id: 'g', label: 'g', args: ['G'], res: 'K', kind: 'hom' }] } as never);
    const rec: SavedLemma = { id: 'lemma:fe-1', name: 'f(e) = e', card: positional(P91), levelId: 'P9.1', canvas: { version: 3, levelId: 'P9.1', machines: [], belts: [], rooms: [] } as never, machine: 'm', savedAt: 1, verified: true };
    const ctx = ctxFor(lv, [], [rec]);
    const refs = libraryRefs(ctx, 'rule').filter((r) => r.k === 'schema' && r.id === 'lemma:fe-1');
    expect(refs.map((r) => (r as { structs?: Record<string, string> }).structs)).toEqual([{ '$2:f': 'g' }]);
  });
});

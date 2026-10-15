import { describe, expect, it } from 'vitest';
import type { KernelCtx } from '../kernel';
import { LEVELS, LEVEL_BY_ID, REGISTRY } from '../levels/levels';
import { SPECS, defaultConfig, HOTBAR, DRAWER, hasDistinctMirror, libraryRefs, libPremises } from './catalog';
import { footprint, frontOf, portsOf, rotateFace, sizeOf, tileKey } from './geometry';
import type { Machine, MachineConfig, MachineKind, Rot } from './types';

function ctxOf(id: string, earned = Object.keys(REGISTRY)): KernelCtx {
  const level = LEVEL_BY_ID[id]!;
  const schemas = Object.keys(REGISTRY).filter((s) => earned.includes(s) && !level.unlocks.includes(s));
  return { level: { ...level, tools: { lift: true, merge: true, suppose: true, classical: true, press: true, conjecture: true, schemas } }, registry: REGISTRY };
}
const ctx = ctxOf('L12');
const mk = (kind: MachineKind, rot: Rot = 0, config?: MachineConfig, at = { x: 3, y: 4 }): Machine =>
  ({ id: 'm', kind, at, rot, config: config ?? defaultConfig(kind, ctx) });
const first = { k: 'first' } as const;
const rw = (recipe: Extract<MachineConfig, { kind: 'rewriter' }>['recipe'], values: Record<string, { k: 'port' } | { k: 'knob'; term: null }> = {}): MachineConfig =>
  ({ kind: 'rewriter', recipe, dir: 'fwd', target: first, gap: first, values, tidy: true });

const ALL = Object.keys(SPECS) as MachineKind[];
const ids = (m: Machine, k: KernelCtx = ctx) => portsOf(m, k).map((p) => p.id).sort();

describe('catalogue (v4)', () => {
  it('covers every machine kind with a family, glyph and blurb', () => {
    for (const k of ALL) {
      const s = SPECS[k];
      expect(s.kind).toBe(k);
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.glyph.length).toBeGreaterThan(0);
      expect(s.blurb.length).toBeGreaterThan(5);
    }
  });
  it('hotbar: Spool 1 · Rewriter 2 · Operator 3 · Joiner 4 · Theorem 5 · Tower 6 · ∀ 7; hotbar + drawer = every placeable kind', () => {
    expect(HOTBAR).toEqual(['spool', 'rewriter', 'operator', 'joiner', 'theorem', 'tower', 'forall']);
    expect(HOTBAR.map((k) => SPECS[k].hotkey).join('')).toBe('1234567');
    expect([...HOTBAR, ...DRAWER].sort()).toEqual(ALL.filter((k) => SPECS[k].placeable).sort());
    for (const k of ['given', 'socket', 'desk', 'gate'] as const) expect(SPECS[k].placeable).toBe(false);
  });
  it('defaultConfig: verbs start without a recipe; presets and schemas are honoured; towers are plain x', () => {
    for (const k of ALL) expect(defaultConfig(k, ctx).kind).toBe(k);
    for (const k of ['rewriter', 'operator', 'joiner', 'theorem'] as const) expect(defaultConfig(k, ctx)).toMatchObject({ recipe: null });
    expect(defaultConfig('tower', ctx)).toEqual({ kind: 'tower', varId: 'x', label: 'x', sort: 'G' });
    expect(defaultConfig('tower', ctx, { sort: 'Z' })).toEqual({ kind: 'tower', varId: 'n', label: 'n', sort: 'Z' });
    expect(defaultConfig('theorem', ctx, { schema: 'cancel', mirror: true })).toMatchObject({ recipe: { k: 'library', ref: { k: 'schema', id: 'cancel', mirror: true } } });
    expect(defaultConfig('carddock', ctx, { schema: 'socks', mirror: true })).toEqual({ kind: 'carddock', ref: { k: 'schema', id: 'socks' } });
    expect(defaultConfig('operator', ctx, { recipe: { k: 'swap' } })).toEqual({ kind: 'operator', recipe: { k: 'swap' } });
  });
  it('library refs: rules, theorems and cards for the order', () => {
    const c10 = ctxOf('L10');
    expect(libraryRefs(c10, 'theorem')).toContainEqual({ k: 'given', givenId: 'H' });
    expect(libraryRefs(c10, 'theorem')).toContainEqual({ k: 'schema', id: 'witness', mirror: true });
    expect(libraryRefs(ctxOf('L11'), 'rule')).toContainEqual({ k: 'lagrange' });
    expect(libraryRefs(ctxOf('L05'), 'rule')).toContainEqual({ k: 'given', givenId: 'h' });
    expect(libPremises(c10, { k: 'given', givenId: 'H' })).toBe(1);
  });
});

describe('footprints and ports by recipe', () => {
  it('sizes follow the convention', () => {
    const sz = (k: MachineKind, cfg?: MachineConfig) => sizeOf(mk(k, 0, cfg), ctx);
    for (const k of ['spool', 'tower', 'hopper', 'carddock'] as const) expect(sz(k)).toEqual({ w: 1, h: 1 });
    for (const k of ['rewriter', 'operator', 'forall', 'theorem'] as const) expect(sz(k)).toEqual({ w: 2, h: 1 });
    expect(sz('joiner')).toEqual({ w: 2, h: 2 });
    expect(sz('socket', { kind: 'socket', socketId: 's' })).toEqual({ w: 2, h: 2 });
    expect(sz('rewriter', rw({ k: 'routed' }, { u: { k: 'port' }, v: { k: 'port' }, w: { k: 'port' } }))).toEqual({ w: 3, h: 1 });
  });

  it('a tower has no ports', () => expect(portsOf(mk('tower'), ctx)).toEqual([]));

  it('rewriter: q + out always; rule port only when routed; params only for port params', () => {
    expect(ids(mk('rewriter', 0, rw(null)))).toEqual(['out', 'q']);
    expect(ids(mk('rewriter', 0, rw({ k: 'cancel' })))).toEqual(['out', 'q']);
    expect(ids(mk('rewriter', 0, rw({ k: 'law', ref: { k: 'axiom', id: 'invL' } })))).toEqual(['out', 'q']);
    expect(ids(mk('rewriter', 0, rw({ k: 'insertPair', inv: false, x: { k: 'port' } })))).toEqual(['out', 'q', 'x']);
    const r = portsOf(mk('rewriter', 0, rw({ k: 'routed' }, { x: { k: 'port' }, y: { k: 'knob', term: null } })), ctx);
    const by = Object.fromEntries(r.map((p) => [p.id, p]));
    expect(Object.keys(by).sort()).toEqual(['meta:x', 'out', 'q', 'rule']);
    expect(by.q).toMatchObject({ dir: 'in', role: 'work', tile: { x: 3, y: 4 }, face: 'W', accepts: ['eq', 'mem'] }); // Book phase B: the membership rail too
    expect(by.out).toMatchObject({ dir: 'out', tile: { x: 4, y: 4 }, face: 'E' });
    expect(by.rule).toMatchObject({ role: 'rule', tile: { x: 3, y: 4 }, face: 'N', accepts: ['eq', 'law'] });
    expect(by['meta:x']).toMatchObject({ role: 'param', tile: { x: 3, y: 4 }, face: 'S', accepts: ['term'] });
  });

  it('operator, joiner, forall ports', () => {
    expect(ids(mk('operator', 0, { kind: 'operator', recipe: { k: 'multiply', side: 'left', t: { k: 'port' } } }))).toEqual(['out', 'q', 't']);
    expect(ids(mk('operator', 0, { kind: 'operator', recipe: { k: 'multiply', side: 'left', t: { k: 'knob', term: null } } }))).toEqual(['out', 'q']);
    expect(portsOf(mk('operator', 0, { kind: 'operator', recipe: { k: 'swap' } }), ctx)[0]!.accepts).toEqual(['eq', 'neq']);
    const clash = portsOf(mk('joiner', 0, { kind: 'joiner', recipe: { k: 'clash' } }), ctx);
    expect(clash.map((p) => [p.id, p.label])).toEqual([['a', '='], ['b', '≠'], ['out', 'out']]);
    expect(clash.find((p) => p.id === 'out')!.accepts).toEqual(['bot']);
    expect(ids(mk('joiner', 0, { kind: 'joiner', recipe: { k: 'chain' } }))).toEqual(['a', 'b', 'out']);
    const fa = portsOf(mk('forall'), ctx);
    expect(fa.map((p) => p.id)).toEqual(['q', 'out']);
    expect(fa[1]!.accepts).toEqual(['law', 'cond']);
  });

  it('theorem: premises by the card, card port only when routed', () => {
    const c10 = ctxOf('L10');
    const lib = (ref: object): MachineConfig => ({ kind: 'theorem', recipe: { k: 'library', ref: ref as never }, choice: 0, values: {} });
    expect(ids(mk('theorem', 0, lib({ k: 'schema', id: 'witness' })))).toEqual(['out', 'p0']);
    expect(ids(mk('theorem', 0, lib({ k: 'given', givenId: 'H' }), undefined), c10)).toEqual(['out', 'p0']);
    const nofix = portsOf(mk('theorem', 0, lib({ k: 'schema', id: 'nofix', mirror: true })), ctx);
    expect(nofix.find((p) => p.id === 'p0')!.accepts).toEqual(['neq']);
    expect(nofix.find((p) => p.id === 'out')!.accepts).toEqual(['neq']);
    expect(ids(mk('theorem', 0, { kind: 'theorem', recipe: { k: 'routed' }, choice: 0, values: {} }))).toEqual(['card', 'out', 'p0']);
    expect(ids(mk('theorem', 0, lib({ k: 'schema', id: 'socks' })))).toEqual(['out']);       // a law: zero premises
  });

  it('given, socket, carddock ports carry the item kind they hold', () => {
    const c12 = ctxOf('L12');
    expect(portsOf(mk('given', 0, { kind: 'given', givenId: 's' }), c12)[0]!.accepts).toEqual(['size']);
    expect(portsOf(mk('socket', 0, { kind: 'socket', socketId: 's' }), c12)[0]).toMatchObject({ id: 'q', dir: 'in', accepts: ['neq'], face: 'W' });
    const c2 = ctxOf('L02');
    expect(sizeOf(mk('given', 0, { kind: 'given', givenId: 'H' }), c2)).toEqual({ w: 2, h: 1 });
    expect(portsOf(mk('carddock', 0, { kind: 'carddock', ref: { k: 'schema', id: 'dbl' } }), ctx)[0]!.accepts).toEqual(['law']);
    expect(portsOf(mk('carddock', 0, { kind: 'carddock', ref: { k: 'lagrange' } }), ctxOf('L11'))[0]!.accepts).toEqual(['law']);
  });

  it('rotation turns rect, ports and faces clockwise and round-trips', () => {
    const cfg: MachineConfig = { kind: 'theorem', recipe: { k: 'library', ref: { k: 'schema', id: 'cancel' } }, choice: 0, values: { u: { k: 'port' }, v: { k: 'port' }, w: { k: 'port' } } };
    const base = portsOf(mk('theorem', 0, cfg), ctx);
    for (const rot of [0, 1, 2, 3] as Rot[]) {
      const m = mk('theorem', rot, cfg);
      const fp = footprint(m, ctx);
      expect(fp.length).toBe(3);
      expect(Math.min(...fp.map((t) => t.x))).toBe(3);
      expect(Math.min(...fp.map((t) => t.y))).toBe(4);
      const ps = portsOf(m, ctx);
      expect(ps.map((p) => p.id)).toEqual(base.map((p) => p.id));
      const fps = new Set(fp.map(tileKey));
      for (const p of ps) {
        expect(fps.has(tileKey(p.tile))).toBe(true);
        expect(fps.has(tileKey(frontOf(p)))).toBe(false);
        expect(p.face).toBe(rotateFace(base.find((q) => q.id === p.id)!.face, rot));
      }
    }
  });

  it('every port of every kind in every rotation faces off the footprint, deterministic', () => {
    for (const lvl of LEVELS) {
      const c = ctxOf(lvl.id);
      for (const k of ALL) for (const rot of [0, 1, 2, 3] as Rot[]) {
        let cfg = defaultConfig(k, c);
        if (cfg.kind === 'given' && lvl.givens[0]) cfg = { kind: 'given', givenId: lvl.givens[0].id };
        if (cfg.kind === 'socket') cfg = { kind: 'socket', socketId: lvl.sockets[0]!.id };
        const m = mk(k, rot, cfg);
        const fp = new Set(footprint(m, c).map(tileKey));
        const ps = portsOf(m, c);
        expect(portsOf(m, c)).toEqual(ps);
        expect(new Set(ps.map((p) => p.id)).size).toBe(ps.length);
        for (const p of ps) { expect(fp.has(tileKey(p.tile))).toBe(true); expect(fp.has(tileKey(frontOf(p)))).toBe(false); }
        expect(new Set(ps.map((p) => tileKey(frontOf(p)))).size).toBe(ps.length);
      }
    }
  });
});

describe('library mirrors', () => {
  it('a mirror is listed only when its card differs up to renaming', () => {
    const X = { k: 'meta' as const, id: 'x' };
    const sym = { id: 'sq', name: 'Square Reset', textbook: 'x x = e', origin: 'authored' as const, mirrorable: true,
      card: { k: 'law' as const, metas: ['x'], l: { k: 'mul' as const, fs: [X, X] }, r: { k: 'e' as const } } };
    const k: KernelCtx = { ...ctx, registry: { ...REGISTRY, sq: sym }, level: { ...ctx.level, tools: { ...ctx.level.tools, schemas: [...ctx.level.tools.schemas, 'sq'] } } };
    const refs = libraryRefs(k, 'card');
    expect(hasDistinctMirror(sym.card)).toBe(false);
    expect(refs).toContainEqual({ k: 'schema', id: 'sq' });
    expect(refs).not.toContainEqual({ k: 'schema', id: 'sq', mirror: true });   // x x = e is its own mirror
    expect(refs).toContainEqual({ k: 'schema', id: 'witness', mirror: true });  // uv = e ⇒ … differs from vu = e ⇒ …
  });
});

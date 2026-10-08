import { describe, expect, it } from 'vitest';
import type { KernelCtx } from '../kernel';
import { LEVELS, LEVEL_BY_ID, REGISTRY } from '../levels/levels';
import { SPECS, defaultConfig, HOTBAR, DRAWER } from './catalog';
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

const ALL = Object.keys(SPECS) as MachineKind[];

describe('catalogue', () => {
  it('covers every machine kind with a family, glyph and blurb', () => {
    for (const k of ALL) {
      const s = SPECS[k];
      expect(s.kind).toBe(k);
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.glyph.length).toBeGreaterThan(0);
      expect(s.blurb.length).toBeGreaterThan(5);
    }
  });
  it('hotkeys 1..0 follow the DESIGN table, hotbar + drawer = every placeable kind', () => {
    expect(HOTBAR.map((k) => SPECS[k].hotkey).join('')).toBe('1234567890');
    const placeable = ALL.filter((k) => SPECS[k].placeable).sort();
    expect([...HOTBAR, ...DRAWER].sort()).toEqual(placeable);
    for (const k of ['given', 'socket', 'desk', 'gate'] as const) expect(SPECS[k].placeable).toBe(false);
  });
  it('defaultConfig matches kind; earned machines carry schema + mirror from the usable registry', () => {
    for (const k of ALL) expect(defaultConfig(k, ctx).kind).toBe(k);
    const st = defaultConfig('stamp', ctx);
    expect(st).toMatchObject({ kind: 'stamp', schema: 'witness', mirror: false });
    expect(defaultConfig('stamp', ctx, { schema: 'cancel', mirror: true })).toMatchObject({ schema: 'cancel', mirror: true });
    expect(defaultConfig('carddock', ctx)).toMatchObject({ kind: 'carddock', schema: 'socks', mirror: false });
    // socks is not mirrorable: mirror request is dropped
    expect(defaultConfig('carddock', ctx, { schema: 'socks', mirror: true })).toMatchObject({ mirror: false });
    // nothing earned: fall back to a registry schema (it will jam as not earned)
    expect(defaultConfig('stamp', ctxOf('L01', []))).toMatchObject({ schema: 'witness' });
  });
});

describe('footprints and ports', () => {
  it('sizes follow the convention', () => {
    const sz = (k: MachineKind, cfg?: MachineConfig) => sizeOf(mk(k, 0, cfg), ctx);
    for (const k of ['spool', 'hopper', 'carddock', 'inverter'] as const) expect(sz(k)).toEqual({ w: 1, h: 1 });
    for (const k of ['canceller', 'popper', 'swapper', 'press', 'expander', 'multiplier', 'rewriter'] as const) expect(sz(k)).toEqual({ w: 2, h: 1 });
    for (const k of ['meet', 'anvil', 'joiner'] as const) expect(sz(k)).toEqual({ w: 2, h: 2 });
    expect(sz('socket', { kind: 'socket', socketId: 's' })).toEqual({ w: 2, h: 1 });
    expect(sz('apply', { kind: 'apply', premises: 3, choice: 0, values: {} })).toEqual({ w: 2, h: 3 });
    expect(sz('rewriter', { kind: 'rewriter', target: { k: 'first' }, dir: 'fwd', tidy: true, values: { u: { k: 'port' }, v: { k: 'port' }, w: { k: 'port' } } })).toEqual({ w: 3, h: 1 });
  });

  it('a processor has q on the back, out on the front, rule on the left, params on the right', () => {
    const cfg: MachineConfig = { kind: 'rewriter', target: { k: 'first' }, dir: 'fwd', tidy: true, values: { x: { k: 'port' }, y: { k: 'knob', term: null } } };
    const ps = portsOf(mk('rewriter', 0, cfg), ctx);
    const by = Object.fromEntries(ps.map((p) => [p.id, p]));
    expect(Object.keys(by).sort()).toEqual(['meta:x', 'out', 'q', 'rule']);
    expect(by.q).toMatchObject({ dir: 'in', role: 'work', tile: { x: 3, y: 4 }, face: 'W' });
    expect(by.out).toMatchObject({ dir: 'out', role: 'out', tile: { x: 4, y: 4 }, face: 'E' });
    expect(by.rule).toMatchObject({ role: 'rule', tile: { x: 3, y: 4 }, face: 'N' });
    expect(by['meta:x']).toMatchObject({ role: 'param', tile: { x: 3, y: 4 }, face: 'S', accepts: ['term'] });
  });

  it('param ports exist only when set to a port', () => {
    const ids = (k: MachineKind, cfg: MachineConfig) => portsOf(mk(k, 0, cfg), ctx).map((p) => p.id).sort();
    expect(ids('spool', { kind: 'spool', t: { k: 'knob', term: null } })).toEqual(['out']);
    expect(ids('spool', { kind: 'spool', t: { k: 'port' } })).toEqual(['out', 't']);
    expect(ids('multiplier', { kind: 'multiplier', side: 'left', t: { k: 'port' } })).toEqual(['out', 'q', 't']);
    expect(ids('expander', { kind: 'expander', target: { k: 'first' }, insert: 'e', x: { k: 'knob', term: null }, dir: 'fwd' })).toEqual(['out', 'q']);
    expect(ids('expander', { kind: 'expander', target: { k: 'first' }, insert: 'rule', x: { k: 'port' }, dir: 'fwd' })).toEqual(['out', 'q', 'rule', 'x']);
  });

  it('premise ports follow Apply premises and the stamp schema', () => {
    const apply = portsOf(mk('apply', 0, { kind: 'apply', premises: 2, choice: 0, values: {} }), ctx);
    expect(apply.map((p) => p.id).sort()).toEqual(['out', 'p0', 'p1', 'rule']);
    expect(apply.find((p) => p.id === 'rule')!.accepts).toEqual(['cond', 'law']);
    const zero = portsOf(mk('apply', 0, { kind: 'apply', premises: 0, choice: 0, values: {} }), ctx);
    expect(zero.map((p) => p.id).sort()).toEqual(['out', 'rule']);
    const st = portsOf(mk('stamp', 0, { kind: 'stamp', schema: 'witness', mirror: false, choice: 0, values: {} }), ctx);
    expect(st.map((p) => p.id).sort()).toEqual(['out', 'p0']);
    const nofix = portsOf(mk('stamp', 0, { kind: 'stamp', schema: 'nofix', mirror: true, choice: 0, values: {} }), ctx);
    expect(nofix.find((p) => p.id === 'p0')!.accepts).toEqual(['neq']);
    expect(nofix.find((p) => p.id === 'out')!.accepts).toEqual(['neq']);
  });

  it('given, socket, carddock ports carry the item kind they hold', () => {
    const c12 = ctxOf('L12');
    expect(portsOf(mk('given', 0, { kind: 'given', givenId: 's' }), c12)[0]!.accepts).toEqual(['size']);
    expect(portsOf(mk('given', 0, { kind: 'given', givenId: 'n' }), c12)[0]!.accepts).toEqual(['neq']);
    expect(portsOf(mk('socket', 0, { kind: 'socket', socketId: 's' }), c12)[0]).toMatchObject({ id: 'q', dir: 'in', accepts: ['neq'], face: 'W' });
    const c2 = ctxOf('L02');
    expect(sizeOf(mk('given', 0, { kind: 'given', givenId: 'H' }), c2)).toEqual({ w: 2, h: 1 }); // law card: long inlet
    expect(portsOf(mk('given', 0, { kind: 'given', givenId: 'H' }), c2)[0]).toMatchObject({ accepts: ['law'], tile: { x: 4, y: 4 } });
    expect(portsOf(mk('carddock', 0, { kind: 'carddock', schema: 'dbl', mirror: false }), ctx)[0]!.accepts).toEqual(['law']);
  });

  it('rotation turns rect, ports and faces clockwise and round-trips', () => {
    const cfg: MachineConfig = { kind: 'apply', premises: 2, choice: 0, values: { u: { k: 'port' }, v: { k: 'port' }, w: { k: 'port' } } };
    const base = portsOf(mk('apply', 0, cfg), ctx);
    const r0 = new Set(footprint(mk('apply', 0, cfg), ctx).map(tileKey));
    for (const rot of [0, 1, 2, 3] as Rot[]) {
      const m = mk('apply', rot, cfg);
      const fp = footprint(m, ctx);
      const s = sizeOf(m, ctx);
      expect(fp.length).toBe(6);
      expect(s).toEqual(rot % 2 ? { w: 2, h: 3 } : { w: 3, h: 2 });
      expect(Math.min(...fp.map((t) => t.x))).toBe(3); // `at` is the min corner of the rotated rect
      expect(Math.min(...fp.map((t) => t.y))).toBe(4);
      const ps = portsOf(m, ctx);
      expect(ps.map((p) => p.id)).toEqual(base.map((p) => p.id)); // ids stable
      const fps = new Set(fp.map(tileKey));
      for (const p of ps) {
        expect(fps.has(tileKey(p.tile))).toBe(true);         // port on the machine
        expect(fps.has(tileKey(frontOf(p)))).toBe(false);    // facing outward
        const b = base.find((q) => q.id === p.id)!;
        expect(p.face).toBe(rotateFace(b.face, rot));
      }
    }
    expect(new Set(footprint(mk('apply', 0, cfg), ctx).map(tileKey))).toEqual(r0);
  });

  it('rot 1 of a 2×1 processor: q faces north on top, out faces south below', () => {
    const ps = portsOf(mk('canceller', 1), ctx);
    expect(ps.find((p) => p.id === 'q')).toMatchObject({ tile: { x: 3, y: 4 }, face: 'N' });
    expect(ps.find((p) => p.id === 'out')).toMatchObject({ tile: { x: 3, y: 5 }, face: 'S' });
    const p2 = portsOf(mk('canceller', 2), ctx);
    expect(p2.find((p) => p.id === 'q')).toMatchObject({ tile: { x: 4, y: 4 }, face: 'E' });
    expect(p2.find((p) => p.id === 'out')).toMatchObject({ tile: { x: 3, y: 4 }, face: 'W' });
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
        // no two ports share a front cell (each attaches to its own belt end)
        expect(new Set(ps.map((p) => tileKey(frontOf(p)))).size).toBe(ps.length);
      }
    }
  });
});

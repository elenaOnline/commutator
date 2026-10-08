// Test helpers for the COMPILER builder's tests (compile / targeting / runtime). Not shipped code.
import { expect } from 'vitest';
import * as F from './index';
import type { KernelCtx } from '../kernel';
import type { LevelManifest, Pallet, Term } from '../kernel/types';
import { ctxFor } from '../state/factoryStore';
import { mkLevel } from '../kernel/testkit';
import { REGISTRY } from '../levels/levels';

export const a: Term = { k: 'atom', id: 'a' }, b: Term = { k: 'atom', id: 'b' }, c: Term = { k: 'atom', id: 'c' };
export const e1: Term = { k: 'atom', id: 'e1' };
export const E: Term = { k: 'e' };
export const I = (t: Term): Term => ({ k: 'inv', arg: t });
export const P = (...fs: Term[]): Term => { const f = fs.flatMap((x) => (x.k === 'mul' ? x.fs : [x])); return f.length === 1 ? f[0]! : { k: 'mul', fs: f }; };
export const eq = (l: Term, r: Term): Pallet => ({ k: 'eq', l, r });
export const neq = (l: Term, r: Term): Pallet => ({ k: 'neq', l, r });
export const knob = (term: Term | null): F.Param => ({ k: 'knob', term });

/** An ad-hoc work order with one socket `s`. */
export function order(target: Pallet, givens: { id: string; fact: LevelManifest['givens'][number]['fact'] }[] = [], extra: Partial<LevelManifest> = {}): LevelManifest {
  return mkLevel({
    id: 'T', givens: givens.map((g) => ({ ...g, name: g.id })),
    sockets: [{ id: 's', target, allowedGivens: givens.map((g) => g.id) }], ...extra,
  } as never);
}

/** A floor built through the real editor (so geometry, ports and routes are the shipped ones). */
export class Floor {
  ctx: KernelCtx;
  c: F.Canvas;
  private col = 4;
  constructor(public level: LevelManifest, earned: string[] = []) {
    this.ctx = level.id === 'T' ? { level: { ...level, tools: { ...level.tools, schemas: earned } }, registry: REGISTRY } : ctxFor(level, earned);
    this.c = F.initialCanvas(level, this.ctx);
  }
  private ok(e: F.Edit): F.Canvas { if (!e.ok) throw new Error(e.reason); this.c = e.canvas; return e.canvas; }
  add(config: F.MachineConfig, at?: F.Tile, rot: F.Rot = 0): string {
    const before = new Set(this.c.machines.map((m) => m.id));
    this.ok(F.place(this.c, config.kind, at ?? { x: (this.col += 4), y: 20 + (this.col % 3) * 4 }, rot, this.ctx, config));
    return this.c.machines.find((m) => !before.has(m.id))!.id;
  }
  wire(from: string, to: string, port = 'q', path?: F.Tile[]): string {
    this.ok(F.connect(this.c, { m: from, port: 'out' }, { m: to, port }, this.ctx, path));
    return this.c.belts[this.c.belts.length - 1]!.id;
  }
  room(rect: F.Rect, kind: F.Room['kind'], l: Term, r: Term) {
    const before = new Set(this.c.rooms.map((x) => x.id));
    this.ok(F.paintRoom(this.c, rect, kind, l, r, this.ctx));
    const room = this.c.rooms.find((x) => !before.has(x.id))!;
    const desk = this.c.machines.find((m) => m.config.kind === 'desk' && m.config.room === room.id)!.id;
    const gate = this.c.machines.find((m) => m.config.kind === 'gate' && m.config.room === room.id)!.id;
    return { room: room.id, desk, gate };
  }
  given(id: string) { return this.c.machines.find((m) => m.config.kind === 'given' && m.config.givenId === id)!.id; }
  socket(id = 's') { return this.c.machines.find((m) => m.config.kind === 'socket' && m.config.socketId === id)!.id; }
  compile() { return F.compile(this.c, this.ctx) as F.CompiledX; }
  run(limit = 400) {
    const comp = this.compile();
    let s = F.initRun(this.c, comp);
    while (s.tick < limit && !Object.keys(comp.sockets).every((k) => s.delivered[k] !== undefined)) s = F.stepRun(s, this.c, comp);
    return { comp, s, metrics: F.factoryMetrics(this.c, s, comp) };
  }
}

export function factOut(comp: F.Compiled, id: string): Pallet {
  const o = comp.machines[id]?.out;
  expect(o?.k, JSON.stringify(comp.machines[id]?.status)).toBe('fact');
  return (o as { fact: Pallet }).fact;
}
export const status = (comp: F.Compiled, id: string) => comp.machines[id]!.status;

// ───── v4 machine configs ─────
type RW = Extract<F.MachineConfig, { kind: 'rewriter' }>;
export const rw = (recipe: F.RewriteRecipe, o: Partial<Omit<RW, 'kind' | 'recipe'>> = {}): F.MachineConfig =>
  ({ kind: 'rewriter', recipe, dir: 'fwd', target: { k: 'first' }, gap: { k: 'first' }, values: {}, tidy: true, ...o });
export const cancel = (target: F.SpanTarget = { k: 'first' }, tidy = true) => rw({ k: 'cancel' }, { target, tidy });
export const pop = (target: F.SpanTarget = { k: 'first' }) => rw({ k: 'pop' }, { target });
export const insertE = (gap: F.GapTarget = { k: 'first' }) => rw({ k: 'insertE' }, { gap });
export const insertPair = (x: Term, inv: boolean, gap: F.GapTarget = { k: 'first' }) => rw({ k: 'insertPair', inv, x: knob(x) }, { gap });
export const lawRw = (ref: F.LibRef, o: Partial<Omit<RW, 'kind' | 'recipe'>> = {}) => rw({ k: 'law', ref }, o);
export const routed = (o: Partial<Omit<RW, 'kind' | 'recipe'>> = {}) => rw({ k: 'routed' }, o);
export const op = (recipe: F.OperatorRecipe): F.MachineConfig => ({ kind: 'operator', recipe });
export const mult = (side: 'left' | 'right', t: Term) => op({ k: 'multiply', side, t: knob(t) });
export const join = (recipe: F.JoinerRecipe): F.MachineConfig => ({ kind: 'joiner', recipe });
export const thm = (ref: F.LibRef | 'routed', choice = 0, values: Record<string, F.Param> = {}): F.MachineConfig =>
  ({ kind: 'theorem', recipe: ref === 'routed' ? { k: 'routed' } : { k: 'library', ref }, choice, values });
export const tower = (varId: string, label: string): F.MachineConfig => ({ kind: 'tower', varId, label, sort: 'G' });
export const spool = (t: Term): F.MachineConfig => ({ kind: 'spool', t: knob(t) });
export const x1: Term = { k: 'atom', id: 'x1' }, y1: Term = { k: 'atom', id: 'y1' };
export const M = (id: string): Term => ({ k: 'meta', id });

// ───── Phase B (integer exponents) ─────
import { polyConst, polyMul, polyZmeta, polyZvar } from '../kernel/poly';
import type { Poly } from '../kernel/types';
export const towerZ = (varId: string, label: string): F.MachineConfig => ({ kind: 'tower', varId, label, sort: 'Z' });
export const pw = (base: Term, exp: Poly): Term => ({ k: 'pow', base, exp });
export const Zc = (n: number): Poly => polyConst(n);
export const Zv = (id: string): Poly => polyZvar(id);
export const Zm = (id: string): Poly => polyZmeta(id);
export const Zmul = (a: Poly, b: Poly): Poly => polyMul(a, b);
/** An exponent knob value (a ℤ-meta's integer). */
export const intKnob = (p: Poly): F.Param => ({ k: 'knob', term: { k: 'int', val: p } });

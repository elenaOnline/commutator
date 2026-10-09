import { describe, expect, it } from 'vitest';
import type { KernelCtx } from '../kernel';
import { LEVEL_BY_ID, REGISTRY } from '../levels/levels';
import { migrateCanvas } from './migrate';
import { V3_FIXTURES } from './migrate.fixtures';
import { footprint, portsOf, tileKey } from './geometry';
import { SPECS } from './catalog';
import type { Canvas, MachineConfig } from './types';

function ctxOf(id: string): KernelCtx {
  const level = LEVEL_BY_ID[id]!;
  const schemas = Object.keys(REGISTRY).filter((s) => !level.unlocks.includes(s));
  return { level: { ...level, tools: { ...level.tools, schemas } }, registry: REGISTRY };
}
const levelOf = (key: string) => (V3_FIXTURES[key] as { levelId: string }).levelId;
const cfgs = (c: Canvas) => c.machines.map((m) => m.config);
const recipes = (c: Canvas, kind: string) => cfgs(c).filter((x) => x.kind === kind).map((x) => (x as { recipe: unknown }).recipe);

/** A migrated canvas is a sound v4 canvas: v4 kinds only, no overlaps, every belt end is a real port. */
function wellFormed(c: Canvas, k: KernelCtx) {
  const occ = new Set<string>();
  for (const m of c.machines) {
    expect(SPECS[m.kind], m.kind).toBeDefined();
    for (const t of footprint(m, k)) { expect(occ.has(tileKey(t))).toBe(false); occ.add(tileKey(t)); }
  }
  for (const b of c.belts) {
    const f = c.machines.find((m) => m.id === b.from.m), t = c.machines.find((m) => m.id === b.to?.m);
    expect(f && t, b.id).toBeTruthy();
    if (b.broken) continue;
    expect(portsOf(f!, k).find((p) => p.id === b.from.port)?.dir, `${b.id} from`).toBe('out');
    expect(portsOf(t!, k).find((p) => p.id === b.to?.port)?.dir, `${b.id} to`).toBe('in');
  }
}

describe('migrateCanvas: real v3 canvases → v4', () => {
  it.each(Object.keys(V3_FIXTURES))('%s migrates to a well-formed v4 canvas, keeping positions and belts', (key) => {
    const k = ctxOf(levelOf(key));
    const raw = V3_FIXTURES[key] as Canvas;
    const c = migrateCanvas(raw, k);
    expect(c).not.toBeNull();
    wellFormed(c!, k);
    // every machine that survives keeps its place and rotation
    for (const m of c!.machines) {
      const old = raw.machines.find((x) => x.id === m.id);
      if (old) { expect(m.at).toEqual(old.at); expect(m.rot).toBe(old.rot); }
    }
    expect(c!.belts.filter((b) => b.broken)).toEqual([]);
    // idempotent: a v4 canvas passes through unchanged in substance
    expect(migrateCanvas(c, k)).toEqual(c);
  });

  it('L01: canceller → rewriter{cancel}, belts re-keyed', () => {
    const c = migrateCanvas(V3_FIXTURES.L01, ctxOf('L01'))!;
    expect(recipes(c, 'rewriter')).toEqual([{ k: 'cancel' }]);
    expect(c.belts.length).toBe(2);
  });

  it('L02: expander{e} → rewriter{insertE} with its gap; v3 rewriter → rewriter{routed} with its rule belt', () => {
    const c = migrateCanvas(V3_FIXTURES.L02, ctxOf('L02'))!;
    const rw = cfgs(c).filter((x) => x.kind === 'rewriter') as Extract<MachineConfig, { kind: 'rewriter' }>[];
    expect(rw.map((x) => x.recipe)).toEqual([{ k: 'insertE' }, { k: 'routed' }]);
    expect(rw[0]!.gap.k).toBe('pin');
    expect(rw[0]!.dir).toBe('rev');
    expect(c.belts.some((b) => b.to?.port === 'rule')).toBe(true);
  });

  it('L03/L04/L05: multiplier → operator{multiply}, popper → rewriter{pop}', () => {
    const c = migrateCanvas(V3_FIXTURES.L04, ctxOf('L04'))!;
    expect(recipes(c, 'operator')).toEqual([
      { k: 'multiply', side: 'left', t: { k: 'knob', term: { k: 'inv', arg: { k: 'atom', id: 'a' } } } },
      { k: 'multiply', side: 'right', t: { k: 'knob', term: { k: 'atom', id: 'a' } } },
    ]);
    expect(recipes(c, 'rewriter')).toContainEqual({ k: 'pop' });
  });

  it('L06/L07/R01: stamps → theorem{library schema} with mirror, values and choice kept', () => {
    const c = migrateCanvas(V3_FIXTURES.L07, ctxOf('L07'))!;
    expect(recipes(c, 'theorem')).toEqual([
      { k: 'library', ref: { k: 'schema', id: 'cancel' } },
      { k: 'library', ref: { k: 'schema', id: 'cancel', mirror: true } },
    ]);
    const th = cfgs(c).find((x) => x.kind === 'theorem') as Extract<MachineConfig, { kind: 'theorem' }>;
    expect(Object.keys(th.values).sort()).toEqual(['u', 'v', 'w']);
    expect(c.belts.filter((b) => b.to?.port === 'p0').length).toBe(2);
  });

  it('L11: press → carddock{lagrange} feeding where the press output went', () => {
    const c = migrateCanvas(V3_FIXTURES.L11press, ctxOf('L11'))!;
    const dock = c.machines.find((m) => m.kind === 'carddock')!;
    expect(dock.config).toEqual({ kind: 'carddock', ref: { k: 'lagrange' } });
    expect(c.belts.some((b) => b.from.m === dock.id && b.to?.port === 'rule')).toBe(true);
    expect(c.belts.some((b) => b.to?.m === dock.id)).toBe(false); // the |G| belt into the press is gone
  });

  it('term joiner / inverter → hoppers with the computed term; the x port of a pair expander kept', () => {
    const c = migrateCanvas(V3_FIXTURES.L05terms, ctxOf('L05'))!;
    const hoppers = cfgs(c).filter((x) => x.kind === 'hopper').map((x) => (x as { t: unknown }).t);
    const A = { k: 'atom', id: 'a' }, B = { k: 'atom', id: 'b' };
    expect(hoppers).toContainEqual({ k: 'mul', fs: [A, B] });
    expect(hoppers).toContainEqual({ k: 'inv', arg: { k: 'mul', fs: [A, B] } });
    expect(recipes(c, 'operator')).toEqual([{ k: 'multiply', side: 'right', t: { k: 'port' } }]);
    expect(recipes(c, 'rewriter')).toEqual([{ k: 'insertPair', inv: true, x: { k: 'port' } }]);
    expect(c.belts.some((b) => b.to?.port === 't')).toBe(true);
    expect(c.belts.some((b) => b.to?.port === 'x')).toBe(true);
  });

  it('L10: apply fed by the cond given → theorem{library given}; swapper/anvil → operator/joiner; room kept', () => {
    const c = migrateCanvas(V3_FIXTURES.L10room, ctxOf('L10'))!;
    expect(recipes(c, 'theorem')).toEqual([{ k: 'library', ref: { k: 'given', givenId: 'H' } }]);
    expect(recipes(c, 'operator')).toEqual([{ k: 'swap' }]);
    expect(recipes(c, 'joiner')).toEqual([{ k: 'clash' }]);
    expect(c.rooms.map((r) => r.kind)).toEqual(['suppose']);
    expect(c.belts.some((b) => b.to?.port === 'rule' || b.to?.port === 'card')).toBe(false);
  });

  it('L08: carddock{schema} → carddock{ref}; meet → joiner{chain}', () => {
    const c = migrateCanvas(V3_FIXTURES.L08dock, ctxOf('L08'))!;
    expect(cfgs(c).find((x) => x.kind === 'carddock')).toEqual({ kind: 'carddock', ref: { k: 'schema', id: 'socks' } });
    expect(recipes(c, 'joiner')).toEqual([{ k: 'chain' }]);
  });

  it('never throws: garbage gives null, a wrong level gives null', () => {
    const k = ctxOf('L01');
    for (const g of [null, 42, 'x', {}, { machines: 'no' }, { machines: [{ id: 1 }], belts: [] }]) expect(() => migrateCanvas(g, k)).not.toThrow();
    expect(migrateCanvas(null, k)).toBeNull();
    expect(migrateCanvas(V3_FIXTURES.L05, k)).toBeNull();
    // missing order entities are restored where they start
    const c = migrateCanvas({ version: 3, levelId: 'L01', machines: [], belts: [], rooms: [] }, k)!;
    expect(c.machines.map((m) => m.id)).toEqual(['pre:0', 'socket:s']);
  });
});

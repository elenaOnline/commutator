// Shared helpers for the reference-solution tests of Book worlds 12–14 (P14.x, P15.1–P15.3, P16.1, P16.2): Hom Towers,
// two-group levels, memberships. Not a test file.
import { checkPaper } from './paper-kit';
import { assertPointerReachable } from './reach-kit';
import { expect } from 'vitest';
import * as K from '../../src/kernel';
import * as F from '../../src/factory';
import type { Floor } from '../../src/factory/compiler.testkit';
import type { LevelManifest, StructDecl, SubRef, Term } from '../../src/kernel/types';
import { oracleCheck, nontrivialModels, NONTRIVIAL_THRESHOLD } from '../../src/groups/oracle';
import { LEVELS as W12, PENDING as W12P } from '../../src/levels/book/w12';
import { LEVELS as W13 } from '../../src/levels/book/w13';
import { LEVELS as W14 } from '../../src/levels/book/w14';

export * from './kit-w123';

/** The levels this batch owns (worlds 12–14, minus the phase-A levels P15.4 and P16.s1–s3 authored earlier). */
export const PHASE_A_ELSEWHERE = ['P15.4', 'P16.s1', 'P16.s2', 'P16.s3'];
export const BOOK_Z: LevelManifest[] = [...W12, ...W13, ...W14].filter((l) => !PHASE_A_ELSEWHERE.includes(l.id));
export const lvZ = (id: string): LevelManifest => {
  const l = [...W12, ...W12P, ...W13, ...W14].find((x) => x.id === id);
  if (!l) throw new Error(`no Book level ${id}`);
  return l;
};

export const app = (fn: string, ...args: Term[]): Term => ({ k: 'app', fn, args });
export const eS = (s: string): Term => ({ k: 'e', s });
export const A = (id: string): Term => ({ k: 'atom', id });
export const sub = (id: string): SubRef => ({ k: 'sub', id });
export const mem = (t: Term, s: SubRef): K.Pallet => ({ k: 'mem', t, sub: s });

/** Tower configs of phase C: a group Tower (G₁), a Hom Tower (f₁ : dom → cod), an element Tower in a given group. */
export const groupTower = (id: string, label: string): F.MachineConfig => ({ kind: 'tower', varId: id, label, sort: 'G', group: true });
export const homTower = (id: string, label: string, dom: string, cod: string): F.MachineConfig => ({ kind: 'tower', varId: id, label, sort: 'G', hom: { dom, cod } });
export const elemTower = (id: string, label: string, carrier?: string): F.MachineConfig => ({ kind: 'tower', varId: id, label, sort: 'G', ...(carrier ? { carrier } : {}) });
export const subTower = (id: string, label: string, normal = false): F.MachineConfig => ({ kind: 'tower', varId: id, label, sort: 'G', sub: normal ? 'normal' : 'sub' });
export const applyOp = (fn: string): F.MachineConfig => ({ kind: 'operator', recipe: { k: 'apply', fn } });

/** Labels for printing facts on a floor (Towers included). */
export function labelsOn(f: Floor, comp: F.Compiled) {
  return K.levelLabels(K.withVars(f.ctx, comp.graph).ctx.level);
}
/** The fact (or card) a machine emits, printed. */
export function outText(f: Floor, comp: F.Compiled, id: string): string {
  const o = comp.machines[id]?.out;
  const st = comp.machines[id]?.status;
  if (!o || o.k === 'term') return `<${st?.k}: ${st && st.k !== 'ok' ? st.reason : ''}>`;
  return K.factText(o.k === 'fact' ? o.fact : o.card, labelsOn(f, comp));
}

/**
 * deliver() for many-sorted / structured floors: every socket delivered, kernel solved, every proof node true in every
 * finite model (Towers and structures passed to the oracle, so Hom Towers reach the many-sorted oracle), par asserted.
 */
export function deliverZ(f: Floor, opts: { parParts?: boolean } = {}) {
  const level = f.level;
  const { comp, s, metrics } = f.run(800);
  assertPointerReachable(f, comp); // the real HUD could have built this floor (reach-kit.ts)
  const detail = JSON.stringify({ sockets: comp.sockets, beltErrors: comp.beltErrors, jams: Object.entries(comp.machines).filter(([, m]) => m.status.k !== 'ok').map(([id, m]) => [id, m.status]) });
  expect(comp.solvable, detail).toBe(true);
  for (const sock of level.sockets) expect(s.delivered[sock.id], `socket ${sock.id} delivered; ${detail}`).toBeDefined();
  expect(comp.check.solved).toBe(true);
  expect(oracleCheck(f.ctx.level, comp.check.nodes, comp.graph.rooms, comp.graph.vars ?? [], comp.graph.structs ?? [])).toEqual([]);
  const km = K.metrics(comp.graph, comp.check, f.ctx);
  checkPaper(f, comp); // the proof on paper reads like homework (paper-kit.ts)
  if (process.env.PAR) console.log('PAR', level.id, metrics.machines, km.axioms);
  if (opts.parParts !== false) {
    expect(metrics.machines, `par.parts of ${level.id} (measured ${metrics.machines})`).toBe(level.par.parts);
    expect(km.axioms, `par.axioms of ${level.id} (measured ${km.axioms})`).toBe(level.par.axioms);
  } else console.log('PAR', level.id, metrics.machines, km.axioms);
  return { comp, metrics, axioms: km.axioms, parts: metrics.machines };
}

/** Nontrivial-model count of each dock's allowed givens (SYNTHESIS §4.1 pin 4); fails below NONTRIVIAL_THRESHOLD. */
export function enoughModels(level: LevelManifest): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of level.sockets) {
    const r = nontrivialModels(level, s.id);
    out[s.id] = r.count;
    expect(r.count, `${level.id}/${s.id}: nontrivial models`).toBeGreaterThanOrEqual(NONTRIVIAL_THRESHOLD);
  }
  return out;
}

/**
 * Truth check: the oracle evaluates `target` in every finite model of `deps` (given ids). Cards over homomorphisms and
 * groups are quantified over every catalogue hom; levels with maps use the many-sorted oracle. Returns the violations.
 */
export function falsified(level: LevelManifest, target: K.Fact, deps: string[]): string[] {
  const manySorted = JSON.stringify(target).includes('"k":"app"') || JSON.stringify(level.givens).includes('"k":"app"');
  const trigger: StructDecl[] = manySorted && !level.maps?.length ? [{ k: 'grp', id: 'Gz', label: 'G₉' }] : [];
  return oracleCheck(level, { t: { fact: target, deps: deps.map((g) => `g:${g}`), ok: true } }, [], [], trigger);
}
/** Every dock's target holds under its allowed givens. */
export function targetsHold(level: LevelManifest) {
  for (const s of level.sockets) expect(falsified(level, s.target, s.allowedGivens), `${level.id}/${s.id}`).toEqual([]);
}

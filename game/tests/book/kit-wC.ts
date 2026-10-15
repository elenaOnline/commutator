// Shared helpers for the reference-solution tests of the Maps worlds: W5 (P6.x), P7.2, P8.2, W7 (P9.1–P9.4). Not a test file.
// Same shape as kit-w123, but the kernel oracle runs with the floor's structures (Hom Towers), and a truth check
// counts the nontrivial many-sorted models (pin 4: at least NONTRIVIAL_THRESHOLD of them).
import { checkPaper } from './paper-kit';
import { expect } from 'vitest';
import * as K from '../../src/kernel';
import { oracleCheck, nontrivialModels, modelLog } from '../../src/groups/oracle';
import type { LevelManifest } from '../../src/kernel/types';
import { LEVELS as W05 } from '../../src/levels/book/w05';
import { LEVELS as W06 } from '../../src/levels/book/w06';
import { LEVELS as W07 } from '../../src/levels/book/w07';

export * from './kit-w123';
export { modelLog, nontrivialModels };

export const BOOK_C: LevelManifest[] = [...W05, ...W06, ...W07];
export const lvC = (id: string): LevelManifest => {
  const l = BOOK_C.find((x) => x.id === id);
  if (!l) throw new Error(`no Book level ${id}`);
  return l;
};

import { deliver as deliverBase } from './kit-w123';
import type { Floor } from '../../src/factory/compiler.testkit';

export const app = (fn: string, ...args: K.Term[]): K.Term => ({ k: 'app', fn, args });
export const eS = (s: string): K.Term => ({ k: 'e', s });
export const kn = (t: K.Term) => ({ k: 'knob', term: t } as const);
export const given = (id: string) => ({ k: 'given', givenId: id } as const);
export const schema = (id: string, mirror = false) => ({ k: 'schema', id, ...(mirror ? { mirror: true } : {}) }) as const;
/** A Tower whose variable lives in the sort `carrier` (a set or another group). */
export const towerIn = (varId: string, label: string, carrier: string) => ({ kind: 'tower', varId, label, sort: 'G', carrier }) as const;

/**
 * Run to ∎ and assert what `deliver` asserts (every socket delivered, kernel solved, par recorded) — but with the oracle
 * run on the many-sorted models, Hom Towers included.
 */
export function deliverC(f: Floor, opts: { parParts?: boolean } = {}) {
  const level = f.level;
  const { comp, s, metrics } = f.run(600);
  const detail = JSON.stringify({ sockets: comp.sockets, beltErrors: comp.beltErrors, jams: Object.entries(comp.machines).filter(([, m]) => m.status.k !== 'ok').map(([id, m]) => [id, m.status]) });
  expect(comp.solvable, detail).toBe(true);
  for (const sock of level.sockets) expect(s.delivered[sock.id], `socket ${sock.id} delivered; ${detail}`).toBeDefined();
  expect(comp.check.solved).toBe(true);
  expect(oracleCheck(f.ctx.level, comp.check.nodes, comp.graph.rooms, comp.graph.vars ?? [], comp.graph.structs ?? [])).toEqual([]);
  const km = K.metrics(comp.graph, comp.check, f.ctx);
  checkPaper(f, comp); // the proof on paper reads like homework (paper-kit.ts)
  if (opts.parParts !== false) {
    expect(metrics.machines, `par.parts of ${level.id} (measured ${metrics.machines})`).toBe(level.par.parts);
    expect(km.axioms, `par.axioms of ${level.id} (measured ${km.axioms})`).toBe(level.par.axioms);
  }
  return { comp, metrics, axioms: km.axioms, parts: metrics.machines };
}
void deliverBase;

/**
 * Nontrivial models of a SET-ONLY level (sorts all of kind 'set'), counted here because the kernel's `nontrivialModels`
 * counts only models with a group of order ≥ 2, so it returns 0 for every pure-set level (reported to the kernel lead).
 * A model: each set a size in 1..maxSize (3 = the kernel oracle's bound), each plain map any function; nontrivial = some set of size ≥ 2 and some map not constant.
 * The givens are law / cond cards over metas with `metaSorts`; counting stops at `cap`.
 */
export function nontrivialSetModels(level: LevelManifest, socketId: string, cap = 10_000, maxSize = 3): number {
  const sock = level.sockets.find((x) => x.id === socketId)!;
  const givens = level.givens.filter((g) => sock.allowedGivens.includes(g.id)).map((g) => g.fact);
  const sorts = (level.sorts ?? []).map((x) => x.id);
  const maps = level.maps ?? [];
  const size: Record<string, number> = {};
  const tab: Record<string, number[]> = {};
  const ev = (t: K.Term, env: Record<string, number>): number => {
    if (t.k === 'meta') return env[t.id]!;
    if (t.k === 'app') {
      const d = maps.find((m) => m.id === t.fn)!;
      let i = 0;
      t.args.forEach((a, j) => { i = i * size[d.args[j]!]! + ev(a, env); });
      return tab[t.fn]![i]!;
    }
    throw new Error(`nontrivialSetModels: unsupported term ${t.k}`);
  };
  const forAll = (f: K.Card, body: (env: Record<string, number>) => boolean): boolean => {
    const env: Record<string, number> = {};
    const go = (i: number): boolean => {
      if (i === f.metas.length) return body(env);
      const r = f.metaSorts?.[f.metas[i]!];
      const n = size[typeof r === 'string' ? r : 'A']!;
      for (let v = 0; v < n; v++) { env[f.metas[i]!] = v; if (!go(i + 1)) return false; }
      return true;
    };
    return go(0);
  };
  const holds = (f: K.Fact, env0: Record<string, number> = {}): boolean => {
    if (f.k === 'eq') return ev(f.l, env0) === ev(f.r, env0);
    if (f.k === 'law') return forAll(f, (env) => ev(f.l, env) === ev(f.r, env));
    if (f.k === 'cond') return forAll(f, (env) => !f.premises.every((p) => p.k === 'eq' && ev(p.l, env) === ev(p.r, env)) || (f.concl.k === 'eq' && ev(f.concl.l, env) === ev(f.concl.r, env)));
    throw new Error(`nontrivialSetModels: unsupported fact ${f.k}`);
  };
  let count = 0;
  const goMaps = (i: number): boolean => {
    if (i === maps.length) {
      const big = sorts.some((x) => size[x]! >= 2);
      const moving = maps.some((m) => new Set(tab[m.id]).size > 1);
      if (big && moving && givens.every((g) => holds(g))) count++;
      return count < cap;
    }
    const d = maps[i]!;
    const n = d.args.reduce((p, x) => p * size[x]!, 1), k = size[d.res]!;
    const t = new Array<number>(n).fill(0);
    tab[d.id] = t;
    const rec = (j: number): boolean => { if (j === n) return goMaps(i + 1); for (let v = 0; v < k; v++) { t[j] = v; if (!rec(j + 1)) return false; } return true; };
    return rec(0);
  };
  const goSizes = (i: number): boolean => {
    if (i === sorts.length) return goMaps(0);
    for (let k = 1; k <= maxSize; k++) { size[sorts[i]!] = k; if (!goSizes(i + 1)) return false; }
    return true;
  };
  goSizes(0);
  return count;
}

/** Truth check by the many-sorted oracle: at least NONTRIVIAL_THRESHOLD nontrivial models satisfy each dock's givens. */
export function nontrivialAll(level: LevelManifest, maxSize = 3, min = 10): Record<string, number> {
  const out: Record<string, number> = {};
  const setOnly = (level.sorts ?? []).length > 0 && (level.sorts ?? []).every((x) => x.kind === 'set');
  for (const sock of level.sockets) {
    const count = setOnly ? nontrivialSetModels(level, sock.id, 10_000, maxSize) : nontrivialModels(level, sock.id).count;
    expect(count >= min, `${level.id}/${sock.id}: only ${count} nontrivial models (threshold ${min})`).toBe(true);
    out[sock.id] = count;
  }
  return out;
}

/**
 * Truth check: for every dock, the target (at `answers[id]` for an open dock) holds in every finite model of the dock's
 * allowed givens — the many-sorted oracle run on a pseudo-node that depends on exactly those givens.
 */
export function targetsTrueC(level: LevelManifest, answers: Record<string, K.Fact> = {}): void {
  for (const sock of level.sockets) {
    if (sock.holes?.length) expect(answers[sock.id], `${level.id}/${sock.id} is open: give its answer`).toBeDefined();
    const fact = (answers[sock.id] ?? sock.target) as K.Fact;
    const deps = sock.allowedGivens.map((g) => `g:${g}`);
    // A level with no sorts and no maps (the Hom Tower levels) is only routed to the many-sorted oracle by a group Tower on
    // the floor; its dock is a card with its own binders, so one stand-in Group Tower sends it there.
    const structs: K.StructDecl[] = level.sorts?.length || level.maps?.length ? [] : [{ k: 'grp', id: 'G1', label: 'G₁' }];
    expect(oracleCheck(level, { n: { fact, deps, ok: true } }, [], [], structs), `${level.id}/${sock.id} must hold in every model of its givens`).toEqual([]);
  }
}

import { catalogue } from '../../src/groups';
import { homsBetween } from '../../src/groups/oracle';
/**
 * The models of a statement "for every homomorphism f : G₁ → H₁" (a Hom Tower level has no atoms and no givens): every
 * triple (G₁, H₁, f) of catalogue groups and a homomorphism that is not constant. The kernel's `nontrivialModels` would
 * count catalogue groups here, which says nothing about f.
 */
export function nontrivialHoms(): number {
  let n = 0;
  for (const G of catalogue()) for (const H of catalogue()) for (const t of homsBetween(G, H)) if (new Set(t).size > 1) n++;
  return n;
}

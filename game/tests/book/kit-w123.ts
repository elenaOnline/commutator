// Shared helpers for the reference-solution tests of Book worlds 1–3 (P3.x, P4.x). Not a test file.
// Every level test builds its floor through the real editor (compiler.testkit's Floor), runs it, asserts that
// every socket is delivered, checks the proof nodes in the finite-model oracle, and asserts the manifest's par.
import { expect } from 'vitest';
import * as K from '../../src/kernel';
import * as F from '../../src/factory';
import { ctxFor, type SavedLemma } from '../../src/state/factoryStore';
import { catalogue, holds, type Assignment } from '../../src/groups';
import { everyAssignment } from '../../src/groups/semantics';
import { oracleCheck } from '../../src/groups/oracle';
import type { LevelManifest } from '../../src/kernel/types';
import { Floor } from '../../src/factory/compiler.testkit';
import { LEVELS as W01 } from '../../src/levels/book/w01';
import { LEVELS as W02 } from '../../src/levels/book/w02';
import { LEVELS as W03 } from '../../src/levels/book/w03';

export * from '../../src/factory/compiler.testkit';

export const BOOK_123: LevelManifest[] = [...W01, ...W02, ...W03];
export const lv = (id: string): LevelManifest => {
  const l = BOOK_123.find((x) => x.id === id);
  if (!l) throw new Error(`no Book level ${id}`);
  return l;
};

/**
 * A floor for a Book level. The shared store forces every machine open (ctxFor); the Book's own toolset is
 * the manifest's, so the kernel context here keeps the manifest's flags (lift, merge, suppose, classical, press)
 * and takes only the schema list from ctxFor (earned theorems + the player's saved lemmas).
 */
export function bookFloor(level: LevelManifest, earned: string[] = [], lemmas: SavedLemma[] = []): Floor {
  const f = new Floor(level, earned);
  const ctx = ctxFor(level, earned, lemmas);
  f.ctx = { ...ctx, level: { ...ctx.level, tools: { ...level.tools, schemas: ctx.level.tools.schemas } } };
  return f;
}

/** The player's own saved lemma, as the HUD stores it (lemmaFrom + a verified card). */
export function saveLemma(f: Floor, machine: string, id: string, name: string, savedAt: number): SavedLemma {
  const comp = f.compile();
  const r = F.lemmaFrom(comp, f.c, machine, f.ctx);
  if (!r.ok) throw new Error(r.reason);
  const l: SavedLemma = { id, name, card: r.card, levelId: f.level.id, canvas: f.c, machine, savedAt };
  const v = F.verifyLemma(l, f.ctx, f.ctx.level.tools.schemas.filter((s) => s.startsWith('lemma:')));
  expect(v, `lemma ${name} must re-verify`).toEqual({ ok: true });
  return l;
}

/** Run to ∎: every socket delivered; kernel solved; oracle clean; par recorded. Returns the metrics. */
export function deliver(f: Floor, opts: { parParts?: boolean } = {}) {
  const level = f.level;
  const { comp, s, metrics } = f.run(600);
  const detail = JSON.stringify({ sockets: comp.sockets, beltErrors: comp.beltErrors, jams: Object.entries(comp.machines).filter(([, m]) => m.status.k !== 'ok').map(([id, m]) => [id, m.status]) });
  expect(comp.solvable, detail).toBe(true);
  for (const sock of level.sockets) expect(s.delivered[sock.id], `socket ${sock.id} delivered; ${detail}`).toBeDefined();
  expect(comp.check.solved).toBe(true);
  // oracle: every proof node is true in every finite model under its dependencies
  expect(oracleCheck(f.ctx.level, comp.check.nodes, comp.graph.rooms, comp.graph.vars ?? [])).toEqual([]);
  const km = K.metrics(comp.graph, comp.check, f.ctx);
  if (opts.parParts !== false) {
    expect(metrics.machines, `par.parts of ${level.id} (measured ${metrics.machines})`).toBe(level.par.parts);
    expect(km.axioms, `par.axioms of ${level.id} (measured ${km.axioms})`).toBe(level.par.axioms);
  }
  return { comp, metrics, axioms: km.axioms, parts: metrics.machines };
}

/**
 * Truth check: for every socket, over the catalogue (all groups of order ≤ 8) and every assignment of the level's
 * constants satisfying the socket's allowed givens, the target holds. Returns how many assignments were non-vacuous.
 */
export function targetsTrue(level: LevelManifest, answers: Record<string, K.Pallet | K.Card> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const sock of level.sockets) {
    // an open dock (`d = ?`) is checked at its known answer
    const target = answers[sock.id] ?? sock.target;
    if (sock.holes?.length) expect(answers[sock.id], `${level.id}/${sock.id} is open: give its answer`).toBeDefined();
    const hyps = level.givens.filter((g) => sock.allowedGivens.includes(g.id)).map((g) => g.fact);
    let nonVacuous = 0;
    for (const G of catalogue()) {
      if (hyps.some((h) => h.k === 'size' && h.n !== G.order)) continue;
      const s: Assignment = Object.create(null);
      everyAssignment(level.atoms.map((a) => a.id), G.order, s, () => {
        if (!hyps.every((h) => holds(G, h, s))) return true;
        nonVacuous++;
        expect(holds(G, target, s), `${level.id}/${sock.id} fails in ${G.name}`).toBe(true);
        return true;
      });
    }
    out[sock.id] = nonVacuous;
  }
  return out;
}

// ───── pins ─────
/** Span pin (side, factors s..e of the word at `path`) on the equation `p` that will arrive at the machine. */
export function pinSpan(p: K.Pallet, side: 'l' | 'r', s: number, e: number, path: number[] = []): F.SpanTarget {
  const pin = F.pinFromAddr(p, { side, path, range: [s, e] });
  if (!pin) throw new Error(`no span ${side}[${s},${e}) in ${K.factText(p, K.labelsOf([]))}`);
  return pin;
}
/** Gap pin (before factor `gap`) on the equation `p`. */
export function pinGap(p: K.Pallet, side: 'l' | 'r', gap: number, path: number[] = []): F.GapTarget {
  const pin = F.pinFromGap(p, { side, path, gap });
  if (!pin) throw new Error(`no gap ${side}^${gap}`);
  return pin;
}

/** The closed statement an open dock shows after delivery, e.g. 'd = bc⁻¹a⁻¹'. */
export function dockAnswer(comp: F.Compiled, socketId: string, level: LevelManifest): string {
  const inst = comp.sockets[socketId]?.instance;
  expect(inst, `dock ${socketId} reports its answer`).toBeDefined();
  return K.factText(inst as K.Pallet, K.labelsOf(level.atoms));
}

/**
 * Which allowed givens of a dock are actually needed: for each one, whether dropping it leaves a counterexample in the
 * catalogue (the target fails in some group under the remaining allowed givens). Open docks are checked at `answer`.
 */
export function neededGivens(level: LevelManifest, socketId: string, answer?: K.Pallet | K.Card): Record<string, boolean> {
  const sock = level.sockets.find((s) => s.id === socketId)!;
  const target = answer ?? sock.target;
  const out: Record<string, boolean> = {};
  for (const drop of sock.allowedGivens) {
    const hyps = level.givens.filter((g) => sock.allowedGivens.includes(g.id) && g.id !== drop).map((g) => g.fact);
    let fails = false;
    for (const G of catalogue()) {
      if (hyps.some((h) => h.k === 'size' && h.n !== G.order)) continue;
      const s: Assignment = Object.create(null);
      everyAssignment(level.atoms.map((a) => a.id), G.order, s, () => {
        if (hyps.every((h) => holds(G, h, s)) && !holds(G, target, s)) { fails = true; return false; }
        return true;
      });
      if (fails) break;
    }
    out[drop] = fails;
  }
  return out;
}

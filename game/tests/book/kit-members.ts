// Shared helpers for the Members levels of the Book: P5.1, P5.4, P11.1, P12.1, P13.1 (phase B, KERNEL-EXT §4). Not a test file.
//
// membersFloor: a Book floor whose kernel context also lists the subgroup schemas the level's manifest names (`sub.e`, `sub.pow`).
//   NOTE for the report: `ctxFor` (src/state/factoryStore.ts) builds `tools.schemas` from REGISTRY ids only, so it silently drops
//   `sub.e` and `sub.pow` (they live in K.SUB_SCHEMAS, not REGISTRY). The floor here adds them back, as the live game must.
// memTruth: the truth check for levels about subgroups. Membership facts quantify their subgroup over every subgroup of each
//   catalogue group (plus ∅ where the level withholds sub.e, i.e. P5.1), so `targetsTrue` of kit-w123 (atoms only) is not enough.
import { checkPaper } from './paper-kit';
import { expect } from 'vitest';
import * as K from '../../src/kernel';
import type { Fact, LevelManifest } from '../../src/kernel/types';
import { catalogue, holds, type Assignment } from '../../src/groups';
import { everyAssignment, subKeyOf, subModels } from '../../src/groups/semantics';
import { nontrivialModels } from '../../src/groups/oracle';
import type { SavedLemma } from '../../src/state/factoryStore';
import { LEVELS as W04 } from '../../src/levels/book/w04';
import { LEVELS as W09 } from '../../src/levels/book/w09';
import { LEVELS as W10 } from '../../src/levels/book/w10';
import { LEVELS as W11 } from '../../src/levels/book/w11';
import { Floor } from '../../src/factory/compiler.testkit';
import { bookFloor, pinSpan } from './kit-w123';
import { oracleCheck } from '../../src/groups/oracle';
import { MEMBERS_IDS } from './members-ids';

export * from './kit-w123';
export { MEMBERS_IDS };
export const d: K.Term = { k: 'atom', id: 'd' };

export const BOOK_M: LevelManifest[] = [...W04, ...W09, ...W10, ...W11].filter((l) => MEMBERS_IDS.includes(l.id));
export const lvM = (id: string): LevelManifest => {
  const l = BOOK_M.find((x) => x.id === id);
  if (!l) throw new Error(`no Members level ${id}`);
  return l;
};

/** A Book floor with the level's subgroup schemas (sub.e / sub.pow) restored in the context. */
export function membersFloor(level: LevelManifest, earned: string[] = [], lemmas: SavedLemma[] = []): Floor {
  const f = bookFloor(level, earned, lemmas);
  const subs = level.tools.schemas.filter((id) => K.subSchema(id));
  f.ctx = { ...f.ctx, level: { ...f.ctx.level, tools: { ...f.ctx.level.tools, schemas: [...f.ctx.level.tools.schemas, ...subs] } } };
  return f;
}

/** Every model (catalogue group, subgroup assignment, atom assignment) of the given hypotheses; `visit` returns false to stop. */
function everyModel(level: LevelManifest, hyps: Fact[], visit: (G: ReturnType<typeof catalogue>[number], s: Assignment) => boolean): void {
  const subs = level.subgroups ?? [];
  const withEmpty = !(level.tools.schemas.includes('sub.e') && !level.unlocks.includes('sub.e'));
  for (const G of catalogue()) {
    if (hyps.some((h) => h.k === 'size' && h.n !== G.order)) continue;
    const s: Assignment = Object.create(null);
    const subsFirst = (i: number): boolean => {
      if (i === subs.length) return everyAssignment(level.atoms.map((a) => a.id), G.order, s, () => (hyps.every((h) => holds(G, h, s)) ? visit(G, s) : true));
      for (const k of subModels(G, subs[i]!.normal === true, withEmpty)) { s[subKeyOf(subs[i]!.id)] = k; if (!subsFirst(i + 1)) return false; }
      return true;
    };
    if (!subsFirst(0)) return;
  }
}
const hypsOf = (level: LevelManifest, socketId: string, drop?: string): Fact[] => {
  const sock = level.sockets.find((x) => x.id === socketId)!;
  return level.givens.filter((g) => sock.allowedGivens.includes(g.id) && g.id !== drop).map((g) => g.fact);
};

/**
 * Truth check of a socket: over the catalogue (groups of order ≤ 8), every subgroup assignment for the level's subgroup symbols
 * (plus ∅ when the level does not list sub.e, or earns it), and every assignment of the level's atoms satisfying the socket's
 * allowed givens, the target holds. Returns how many assignments were non-vacuous.
 */
export function memTruth(level: LevelManifest, socketId = 's'): number {
  const sock = level.sockets.find((x) => x.id === socketId)!;
  let nonVacuous = 0;
  everyModel(level, hypsOf(level, socketId), (G, s) => {
    nonVacuous++;
    expect(holds(G, sock.target as Fact, s), `${level.id}/${socketId} fails in ${G.name}`).toBe(true);
    return true;
  });
  return nonVacuous;
}

/** For each allowed given of a socket: does dropping it leave a counterexample in the catalogue (is it needed)? */
export function neededGivensM(level: LevelManifest, socketId = 's'): Record<string, boolean> {
  const sock = level.sockets.find((x) => x.id === socketId)!;
  const out: Record<string, boolean> = {};
  for (const drop of sock.allowedGivens) {
    let fails = false;
    everyModel(level, hypsOf(level, socketId, drop), (G, s) => { if (!holds(G, sock.target as Fact, s)) { fails = true; return false; } return true; });
    out[drop] = fails;
  }
  return out;
}

/** A span pin on the membership `word ∈ H` (the word is the membership's single rail, side 'l'). */
export const pinSpanM = (word: K.Term, s: number, e: number, subId = 'H') => pinSpan({ k: 'mem', t: word, sub: { k: 'sub', id: subId } }, 'l', s, e);

/** The authoring threshold (SYNTHESIS §4.1 pin 4): at least NONTRIVIAL_THRESHOLD nontrivial models satisfy the dock's givens. */
export function expectNontrivial(level: LevelManifest, socketId = 's') {
  const r = nontrivialModels(level, socketId);
  expect(r.ok, `${level.id}/${socketId} has ${r.count} nontrivial models (need ${r.threshold})`).toBe(true);
  return r.count;
}

// ───── rooms with membership desks ─────
import * as F from '../../src/factory';
export const sub = (id: string): K.SubRef => ({ k: 'sub', id });
export const memA = (t: K.Term, id: string): K.DeskAssumption => ({ rel: 'mem', t, sub: sub(id) });
/**
 * An Assume room whose desks are memberships (and equations). Returns the room, its desks in slot order and its gate.
 * `first` is the term the first desk's placeholder equation uses (the editor keeps `assumes` even at one desk).
 */
export function memRoom(f: Floor, rect: F.Rect, assumes: K.DeskAssumption[], first: K.Term) {
  const before = new Set(f.c.rooms.map((r) => r.id));
  const e = F.paintRoom(f.c, rect, 'assume', first, first, f.ctx, undefined, assumes);
  if (!e.ok) throw new Error(e.reason);
  f.c = e.canvas;
  const room = f.c.rooms.find((r) => !before.has(r.id))!;
  const desks = f.c.machines.filter((m) => m.config.kind === 'desk' && m.config.room === room.id)
    .sort((p, q) => ((p.config as { slot?: number }).slot ?? 0) - ((q.config as { slot?: number }).slot ?? 0)).map((m) => m.id);
  const gate = f.c.machines.find((m) => m.config.kind === 'gate' && m.config.room === room.id)!.id;
  return { room: room.id, desks, gate };
}
export const subTower = (varId: string, label: string, kind: 'sub' | 'normal' = 'sub'): F.MachineConfig => ({ kind: 'tower', varId, label, sort: 'G', sub: kind });
export const gv = (givenId: string) => ({ k: 'given', givenId }) as const;
export const sc = (id: string, structs?: Record<string, string>): F.LibRef => ({ k: 'schema', id, ...(structs ? { structs } : {}) });

/**
 * deliver() for Members floors: the same checks as kit-w123's (every socket delivered, kernel solved, par recorded), and the
 * oracle is given the Subgroup Towers (`comp.graph.structs`), which kit-w123's deliver does not pass.
 */
export function deliver(f: Floor, opts: { parParts?: boolean } = {}) {
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

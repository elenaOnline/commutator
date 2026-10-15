// LEMMA WORKS v3 — factory public API (contract). Bodies live in the files named
// below; owners per ARCHITECTURE.md. Keep every signature; add freely.
import type { KernelCtx } from '../kernel';
import type { LevelManifest } from '../kernel/types';
import type {
  Belt, Canvas, Compiled, Endpoint, FactoryMetrics, Machine, MachineConfig, MachineKind,
  MachineSpec, Port, Rect, Room, Rot, RunState, Tile,
} from './types';

export * from './types';

const todo = (n: string): never => { throw new Error(`factory: ${n} not implemented yet`); };

// ───────────── catalog.ts + geometry.ts  (owner: EDITOR builder) ─────────────

/** Static catalogue: name, family ink, glyph, blurb, hotkey, placeable. */
export { SPECS, defaultConfig, HOTBAR, DRAWER, usableSchemas, schemaMachineName, schemaPremises, libCard, libPremises, libName, libraryRefs, subscript, splitLabel, varLabel, schemaOf } from './catalog';
export type { DefaultOpts } from './catalog';
/** footprint(m, ctx): occupied cells (rotation applied). portsOf(m, ctx): ports in world space (depend on config). */
export {
  footprint, portsOf, portOf, layoutOf, sizeOf, rectOf, frontOf, rotateFace, rotFacing,
  FACES, FACE_DELTA, OPPOSITE, tileKey, tileEq, addTile, inRect, DOCK_PORTS,
} from './geometry';

// ───────────── editor.ts  (owner: EDITOR builder). Pure: return a new Canvas or a reason. ─────────────

/** ok: `note` explains belts an edit left broken (ids in `broken`, drawn dashed). Refusal: `blockers` = ids to flash. */
export type Edit =
  | { ok: true; canvas: Canvas; ids?: string[]; note?: string; broken?: string[] }
  | { ok: false; reason: string; blockers?: string[] };

/** The level's starting floor: given inlets in a column on the west, sockets on the east, pre-start spools, generous empty floor between. */
export { initialCanvas, INITIAL_GAP } from './editor';
/** Place a machine (fails on overlap or straddling a room wall). */
/** Move / rotate machines; attached belts are re-routed (or removed if no route). */
/** Remove machines (unlocked only), belts, rooms (with their desk/gate and nothing else). */
/** Manhattan route from an output port to an input port avoiding footprints and other belts; null if none. */
/** Connect output → input with an explicit path (or auto-route). Refuses only impossible endpoints. */
/** Branch: a new belt from the same output as `belt` (free copy) to `to`. */
/** Paint a room rectangle; creates its desk (inside) and gate (on the boundary). Rooms nest, never partially overlap. */
/** Machine/belt at a tile (top-most), for picking. */
export {
  place, moveMachines, rotateMachine, remove, setConfig, setConfigCtx, route, routeOrWhy, connect, connectVia, extendTo, routeOpenOrWhy, branch, branchAt, autoLinks, spliceCandidates,
  paintRoom, resizeRoom, setRoomAssumptions, deskCount, MIN_ROOM, hit, portFacing, roomAt, roomOfMachine, freshId, copySelection, paste, repairBelts, placementWhy,
} from './editor';

export type { Splice, Why } from './editor';
export interface Blueprint { machines: Machine[]; belts: Belt[]; origin: Tile }

// ───────────── compile.ts + targeting.ts  (owner: COMPILER builder) ─────────────

/** Canvas → kernel ProofGraph + per-machine results. Pure; the kernel's check is the only authority.
 *  compile(c, ctx): Compiled (actually CompiledX: + cause, plan). JAMS = the jam message catalogue. */
export { compile, rootCause, bindingsOn, sortSubsts, JAMS, LK } from './compile';
export type { CompiledX, RunPlan, PlanMachine } from './compile';
/** Lens helpers: first-match candidate order, structural pins and their re-resolution. */
export {
  pinFromAddr, pinFromGap, resolveSpanPin, resolveGapPin, spanCandidates, gapCandidates, spanLocOf, gapLocOf,
  spanAddr, gapAddr, spanKey, gapKey, RAIL_ORDER,
} from './targeting';
export type { SpanLoc, GapLoc, Resolved } from './targeting';

// ───────────── runtime.ts  (owner: COMPILER builder) ─────────────

/** initRun(c, comp) · stepRun(s, c, comp) (Sol §9 phases, pure) · factoryMetrics(c, s, comp). */
export { initRun, stepRun, factoryMetrics, queued, dockAnswer, EMIT_PERIOD, MAX_IN_FLIGHT } from './runtime';
export type { RunStateX } from './runtime';

/** Ticks per second at 1× speed (rendering interpolates between ticks). */
export const TICKS_PER_SECOND = 8;

// ───────────── v4 additions (contract) ─────────────
const todo4 = (n: string): never => { throw new Error(`factory v4: ${n} not implemented yet`); };

/** (EDITOR builder, migrate.ts) Best-effort v3 → v4 canvas migration (old machine kinds → recipe machines). null = give up (caller uses initialCanvas). */
export { migrateCanvas } from './migrate';
/** (review 2026-10) Bring a saved canvas up to the 2×2 Receiving Dock. Idempotent; call on every canvas read from a save. */
export { migrateDocks } from './migrate';

/** (COMPILER builder) lemmaFrom(comp, c, machineId, ctx): the CLOSED card a ∀ machine or Assume gate emits, if it is a theorem of
 *  group theory (root scope, no dependencies, no constants / free variables). verifyLemma(l, ctx, earlier?): recompile the saved
 *  canvas; the same card must come out. verifyLemmas(book, ctxOf): whole book in save order (acyclic citation). */
export { lemmaFrom, verifyLemma, verifyLemmas, atomsOfFact } from './compile';

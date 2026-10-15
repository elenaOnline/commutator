// LEMMA WORKS v3 — deterministic tick runtime (owner: COMPILER builder).
// Reference: design/v3/proposals/sol-compiler.md §9. Pure: (state, canvas, compiled) → next state.
//
// The runtime moves packets and counts down jobs. It never creates truth: every packet carries the
// ItemValue that compile() took from the kernel's check for its producer (forged or stale packets are
// discarded), and a dock accepts only what compile() certified through its wired, P-first closure check.
//
// Buffers: every machine output (O|m), every machine inlet (I|m|port) and every belt cell (B|belt|i)
// holds at most one packet. Buffers are per belt, not per grid cell: two belts crossing at right angles
// are independent lines. A belt with `path: []` links touching ports directly (output → inlet, 1 tick).
// Broken belts and belts with errors are not in the plan, so they carry nothing.
//
// Transition t → t+1, in phases:
//   1. transport from the start-of-transition snapshot (one edge per tick; a move needs every
//      destination empty in the snapshot; leaving an output is an atomic multicast onto every belt of
//      its copy tree, and only while each of those belts has < MAX_IN_FLIGHT packets on it;
//      catalyst (rule/card) inlets latch the first arrival and then refuse more);
//   2. complete jobs finishing at t+1 (or blocked earlier) into empty outputs;
//   3. emit due sources (period 6, first packet at tick 0, no burst after blocking);
//   4. docks accept certified shipments at any certified inlet (delivery tick = t+1);
//   5. start jobs on valid machines with every ingredient present and an empty output.
//
// ── STATUS RULE for the HUD / floor ─────────────────────────────────────────────────────────────
// The HEADLINE status of a machine is compile()'s `comp.machines[id].status` (ok / starved / jammed,
// with its mathematical reason). Never derive "starved" or "waiting" from the runtime.
// `run.live[id]` is ACTIVITY only, a secondary pip:
//   working — a job is in progress, a source is counting down, or an output is moving on;
//   idle    — compiled ok, simply between packets (NOT starved: nothing is missing);
//   blocked — a finished item cannot leave (full belt / inlet downstream, or unconnected output);
//   sealed  — a dock that has accepted its certified delivery;
//   jammed / starved — only ever mirrors a non-ok compiled status (so a pip can still colour it).
// `queued(run)[id]` (RunStateX.queued) = items held back at a blocked output: show "×n waiting" there
// instead of drawing a belt full of bead strings.
import type { Canvas, Compiled, FactoryMetrics, LiveStatus, Packet, RunState } from './types';
import type { Card, Pallet, Subst } from '../kernel/types';
import { LK, type CompiledX, type RunPlan } from './compile';

/** Sources re-emit every EMIT_PERIOD ticks. */
export const EMIT_PERIOD = 6;
/** At most this many packets ride one belt at once (no packet flood). */
export const MAX_IN_FLIGHT = 2;

/** RunState plus per-output queue counts (machine id → items waiting at its blocked output), and (Book phase A)
 *  the inlet each dock accepted its first delivery at (socket id → port id), for open docks' answers. */
export interface RunStateX extends RunState { queued: Record<string, number>; via?: Record<string, string> }
/** Items waiting at each machine's blocked output ("×n waiting"); absent = nothing waiting. */
export const queued = (s: RunState): Record<string, number> => (s as Partial<RunStateX>).queued ?? {};

const planOf = (comp: Compiled): RunPlan => {
  const p = (comp as Partial<CompiledX>).plan;
  if (!p) throw new Error('runtime: compiled result has no run plan (use compile() from src/factory)');
  return p;
};
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const valueEq = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Location key of a packet (see LK in compile.ts). */
function keyOf(p: Packet, c: Canvas): string | null {
  if (p.at.k === 'port') return p.at.port === 'out' ? LK.out(p.at.m) : LK.in(p.at.m, p.at.port);
  const at = p.at;
  if (at.i < 0) { const b = c.belts.find((x) => x.id === at.belt); return b ? LK.out(b.from.m) : null; }
  return LK.belt(at.belt, at.i);
}
function atOf(key: string): Packet['at'] {
  const k = key[0];
  if (k === 'O') return { k: 'port', m: key.slice(2), port: 'out' };
  if (k === 'I') { const rest = key.slice(2), j = rest.lastIndexOf('|'); return { k: 'port', m: rest.slice(0, j), port: rest.slice(j + 1) }; }
  const rest = key.slice(2), j = rest.lastIndexOf('|');
  return { k: 'belt', belt: rest.slice(0, j), i: Number(rest.slice(j + 1)) };
}
const beltOfKey = (key: string): string | null => (key[0] === 'B' ? key.slice(2, key.lastIndexOf('|')) : null);

/** A packet is genuine only if it sits on a live route and carries exactly what compile() certified for its producer. */
function producerOf(key: string, plan: RunPlan, beltFrom: Map<string, string>): string | undefined {
  if (key[0] === 'O') return key.slice(2);
  if (key[0] === 'I') return plan.feeds[key];
  return beltFrom.get(beltOfKey(key)!);
}
function authentic(p: Packet, key: string, plan: RunPlan, comp: Compiled, beltFrom: Map<string, string>): boolean {
  const producer = producerOf(key, plan, beltFrom);
  if (!producer || !plan.machines[producer]?.ok) return false;
  const v = comp.machines[producer]?.out;
  return !!v && valueEq(p.value, v);
}

const catalystKeys = (plan: RunPlan): Map<string, { m: string; port: string }> => {
  const out = new Map<string, { m: string; port: string }>();
  for (const [m, pm] of Object.entries(plan.machines)) for (const i of pm.ins) if (i.catalyst) out.set(LK.in(m, i.port), { m, port: i.port });
  return out;
};

export function initRun(c: Canvas, comp: Compiled): RunStateX {
  const plan = planOf(comp);
  const packets: Packet[] = [];
  const nextEmit: Record<string, number> = {};
  let nid = 1;
  for (const id of Object.keys(plan.machines).sort(cmp)) {
    const pm = plan.machines[id]!;
    const v = comp.machines[id]?.out;
    if (!pm.source || !pm.ok || !v) continue;
    packets.push({ id: nid++, value: v, at: { k: 'port', m: id, port: 'out' } });
    nextEmit[id] = EMIT_PERIOD;
  }
  const s: RunStateX = { tick: 0, packets, jobs: {}, latched: {}, delivered: {}, live: {}, nextEmit, nextPacketId: nid, queued: {}, via: {} };
  s.live = activity(s, c, comp, new Set());
  return s;
}

/** Advance one tick (Sol §9 phases). Pure. */
export function stepRun(s: RunState, c: Canvas, comp: Compiled): RunStateX {
  const plan = planOf(comp);
  const t1 = s.tick + 1;
  const cats = catalystKeys(plan);

  // snapshot (forged / stale packets are dropped here)
  const active = new Set(plan.active);
  const beltFrom = new Map(c.belts.filter((b) => active.has(b.id)).map((b) => [b.id, b.from.m] as const));
  const occ = new Map<string, Packet>();
  const inFlight = new Map<string, number>();
  for (const p of s.packets) {
    const k = keyOf(p, c);
    if (!k || occ.has(k) || !authentic(p, k, plan, comp, beltFrom)) continue;
    occ.set(k, p);
    const b = beltOfKey(k);
    if (b) inFlight.set(b, (inFlight.get(b) ?? 0) + 1);
  }
  const latched: RunState['latched'] = {};
  for (const [m, slots] of Object.entries(s.latched)) latched[m] = { ...slots };
  const full = (k: string): boolean => {
    if (occ.has(k)) return true;
    const ct = cats.get(k);
    return !!(ct && s.latched[ct.m]?.[ct.port]);
  };

  // 1. transport
  const next = new Map<string, Packet>();
  const stuck = new Set<string>(); // machines whose output packet could not leave
  let nid = s.nextPacketId;
  const moves: { p: Packet; succ: string[] }[] = [];
  for (const k of [...occ.keys()].sort(cmp)) {
    const p = occ.get(k)!;
    const succ = k[0] === 'I' ? undefined : plan.succ[k];
    let can = !!succ?.length && !succ.some(full);
    if (can && k[0] === 'O') for (const b of plan.routes[k.slice(2)] ?? []) if ((inFlight.get(b) ?? 0) >= MAX_IN_FLIGHT) can = false;
    if (!can) { next.set(k, p); if (k[0] === 'O') stuck.add(k.slice(2)); continue; }
    moves.push({ p, succ: succ! });
  }
  for (const mv of moves) {
    mv.succ.forEach((d, j) => {
      const ct = cats.get(d);
      if (ct) { (latched[ct.m] ??= {})[ct.port] = mv.p.value; return; }
      next.set(d, { id: j === 0 ? mv.p.id : nid++, value: mv.p.value, at: atOf(d) });
    });
  }

  // 2. complete jobs
  const jobs: RunState['jobs'] = {};
  for (const m of Object.keys(s.jobs).sort(cmp)) {
    const job = s.jobs[m]!;
    if (job.finish > t1) { jobs[m] = { ...job }; continue; }
    const v = comp.machines[m]?.out;
    if (!v || !plan.machines[m]?.ok) continue;
    if (next.has(LK.out(m))) { jobs[m] = { finish: job.finish, blocked: true }; continue; }
    next.set(LK.out(m), { id: nid++, value: v, at: { k: 'port', m, port: 'out' } });
  }

  // 3. emit due sources
  const nextEmit = { ...s.nextEmit };
  const backlog: Record<string, number> = {};
  for (const m of Object.keys(plan.machines).sort(cmp)) {
    const pm = plan.machines[m]!;
    const v = comp.machines[m]?.out;
    if (!pm.source || !pm.ok || !v) continue;
    const due = nextEmit[m] ?? 0;
    if (t1 < due) continue;
    if (next.has(LK.out(m))) { stuck.add(m); backlog[m] = Math.floor((t1 - due) / EMIT_PERIOD) + 1; continue; }
    next.set(LK.out(m), { id: nid++, value: v, at: { k: 'port', m, port: 'out' } });
    nextEmit[m] = t1 + EMIT_PERIOD;
  }

  // 4. docks accept certified shipments
  const delivered = { ...s.delivered };
  const via = { ...((s as Partial<RunStateX>).via ?? {}) };
  for (const m of Object.keys(plan.machines).sort(cmp)) {
    const pm = plan.machines[m]!;
    if (pm.socket === undefined) continue;
    if (!pm.ok || !comp.sockets[pm.socket]?.ok) continue;
    // any certified inlet may deliver (a 2×2 dock has four); the first delivery seals the socket
    for (const port of pm.ins.length ? pm.ins.map((i) => i.port) : ['q']) {
      const k = LK.in(m, port);
      if (!next.has(k)) continue;
      next.delete(k);
      if (delivered[pm.socket] === undefined) { delivered[pm.socket] = t1; via[pm.socket] = port; }
    }
  }

  // 5. start jobs
  for (const m of Object.keys(plan.machines).sort(cmp)) {
    const pm = plan.machines[m]!;
    if (pm.source || pm.socket !== undefined || !pm.ok || jobs[m] || next.has(LK.out(m))) continue;
    if (!comp.machines[m]?.out) continue;
    const ready = pm.ins.every((i) => (i.catalyst ? !!latched[m]?.[i.port] : next.has(LK.in(m, i.port))));
    if (!ready) continue;
    for (const i of pm.ins) if (!i.catalyst) next.delete(LK.in(m, i.port));
    jobs[m] = { finish: t1 + Math.max(1, pm.duration) };
  }

  const packets = [...next.values()].sort((a, b) => a.id - b.id);
  // queue counts: only at outputs that genuinely could not move on this tick
  const q: Record<string, number> = {};
  for (const m of [...stuck].sort(cmp)) {
    if (!next.has(LK.out(m))) continue;
    q[m] = 1 + (jobs[m]?.blocked ? 1 : 0) + (backlog[m] ?? 0);
  }
  const out: RunStateX = { tick: t1, packets, jobs, latched, delivered, live: {}, nextEmit, nextPacketId: nid, queued: q, via };
  out.live = activity(out, c, comp, stuck);
  return out;
}

/** Activity per machine — see the STATUS RULE at the top of this file. */
function activity(s: RunState, c: Canvas, comp: Compiled, stuck: Set<string>): Record<string, LiveStatus> {
  const plan = planOf(comp);
  const occ = new Set<string>();
  for (const p of s.packets) { const k = keyOf(p, c); if (k) occ.add(k); }
  const live: Record<string, LiveStatus> = {};
  for (const m of c.machines) {
    const pm = plan.machines[m.id];
    const st = comp.machines[m.id]?.status;
    if (!pm || !st) { live[m.id] = 'idle'; continue; }
    if (pm.socket !== undefined && s.delivered[pm.socket] !== undefined) { live[m.id] = 'sealed'; continue; }
    if (st.k !== 'ok') { live[m.id] = st.k; continue; }
    if (pm.socket !== undefined) { live[m.id] = 'idle'; continue; }
    const job = s.jobs[m.id];
    if (job?.blocked || (stuck.has(m.id) && occ.has(LK.out(m.id)))) { live[m.id] = 'blocked'; continue; }
    if (job || pm.source || occ.has(LK.out(m.id))) { live[m.id] = 'working'; continue; }
    live[m.id] = 'idle';
  }
  return live;
}

/**
 * Book phase A — an open dock's answer, for the dock to show IN PLACE once it has accepted a delivery:
 * the hole values (kernel SocketResult.holes shape) and the closed instance (`d = a⁶` for `d = ?`).
 * null until the runtime delivers (so the floor never shows an answer the factory has not shipped), and
 * for closed docks. Render with factText/factTex(instance, L) or kernel dockText(sock, L, holes).
 */
export function dockAnswer(comp: Compiled, s: RunState, socketId: string): { holes: Subst; instance: Pallet | Card } | null {
  if (s.delivered[socketId] === undefined) return null;
  const d = comp.sockets[socketId];
  if (!d?.ok || !d.holes || !d.instance) return null;
  const port = (s as Partial<RunStateX>).via?.[socketId];
  const a = port ? d.answers?.[port] : undefined;
  return a ?? { holes: d.holes, instance: d.instance };
}

const SYSTEM = new Set(['given', 'socket', 'desk', 'gate']);

/** Machines · Area · Cycles (Opus Magnum). */
export function factoryMetrics(c: Canvas, s: RunState, comp: Compiled): FactoryMetrics {
  const plan = planOf(comp);
  const player = c.machines.filter((m) => !m.locked && !SYSTEM.has(m.kind));
  const tiles = new Set<string>();
  for (const m of player) for (const t of plan.footprints[m.id] ?? []) tiles.add(`${t.x},${t.y}`);
  for (const b of c.belts) for (const t of b.path) tiles.add(`${t.x},${t.y}`);
  for (const r of c.rooms) for (let y = r.rect.y; y < r.rect.y + r.rect.h; y++) for (let x = r.rect.x; x < r.rect.x + r.rect.w; x++) tiles.add(`${x},${y}`);
  const ids = Object.keys(comp.sockets);
  const all = ids.length > 0 && ids.every((id) => s.delivered[id] !== undefined);
  return { machines: player.length, area: tiles.size, cycles: all ? Math.max(...ids.map((id) => s.delivered[id]!)) : null };
}

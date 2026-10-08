// LEMMA WORKS v3 floor — adapter over the factory API.
//
// The editor/compiler are built concurrently; until their bodies land the
// factory functions throw "not implemented". Every call the floor makes goes
// through here: real implementation first, then a PRESENTATION-ONLY fallback
// (sol-compiler §2 geometry) so the floor can draw. Fallbacks never decide
// legality — `tryPlace` returns null (unknown) rather than inventing a verdict.
import type { KernelCtx } from '../kernel';
import * as F from '../factory';
import type {
  Canvas, Edit, Endpoint, Face, ItemKind, Machine, MachineConfig, MachineKind, MachineSpec, Port, Rot, Tile,
} from '../factory';
import type { Family } from '../kernel/types';

const warned = new Set<string>();
function soft<T>(name: string, fn: () => T, fb: () => T): T {
  try { return fn(); } catch (e) {
    if (!warned.has(name) && !String(e).includes('not implemented')) { warned.add(name); console.warn(`floor: factory.${name} threw`, e); }
    return fb();
  }
}

/** Is the real editor geometry available? (Re-checked on every call; cheap.) */
export const hasEditor = (): boolean => !!F.SPECS && Object.keys(F.SPECS).length > 0;

// ───────────── fallback catalogue (presentation only) ─────────────

type In = { id: string; accepts: ItemKind[]; role: Port['role']; label: string };
interface FB { name: string; family: Family; glyph: string; out?: ItemKind[]; ins: (m: Machine) => In[]; src?: boolean }
const q = (accepts: ItemKind[] = ['eq']): In => ({ id: 'q', accepts, role: 'work', label: 'q' });
const FALLBACK: Record<MachineKind, FB> = {
  spool: { name: 'Spool', family: 'equation', glyph: '=', out: ['eq'], src: true, ins: (m) => (m.config.kind === 'spool' && m.config.t.k === 'port' ? [{ id: 't', accepts: ['term'], role: 'param', label: 't' }] : []) },
  canceller: { name: 'Canceller', family: 'inverse', glyph: '⁻¹', out: ['eq'], ins: () => [q()] },
  expander: {
    name: 'Expander', family: 'identity', glyph: '+e', out: ['eq'], ins: (m) => {
      const c = m.config; const r: In[] = [q()];
      if (c.kind === 'expander' && c.insert === 'rule') r.push({ id: 'rule', accepts: ['eq', 'law'], role: 'rule', label: 'rule' });
      if (c.kind === 'expander' && c.x.k === 'port') r.push({ id: 'x', accepts: ['term'], role: 'param', label: 'x' });
      return r;
    },
  },
  popper: { name: 'Popper', family: 'identity', glyph: 'e', out: ['eq'], ins: () => [q()] },
  rewriter: { name: 'Rewriter', family: 'given', glyph: '⇄', out: ['eq'], ins: () => [q(), { id: 'rule', accepts: ['eq', 'law'], role: 'rule', label: 'rule' }] },
  multiplier: {
    name: 'Multiplier', family: 'structure', glyph: '·t', out: ['eq'],
    ins: (m) => (m.config.kind === 'multiplier' && m.config.t.k === 'port' ? [q(), { id: 't', accepts: ['term'], role: 'param', label: 't' }] : [q()]),
  },
  swapper: { name: 'Swapper', family: 'equation', glyph: '⇆', out: ['eq', 'neq'], ins: () => [q(['eq', 'neq'])] },
  meet: { name: 'Meet', family: 'equation', glyph: '∘', out: ['eq'], ins: () => [{ id: 'a', accepts: ['eq'], role: 'work', label: 'a' }, { id: 'b', accepts: ['eq'], role: 'work', label: 'b' }] },
  apply: {
    name: 'Apply', family: 'given', glyph: '⇒', out: ['eq', 'neq'], ins: (m) => {
      const n = m.config.kind === 'apply' ? m.config.premises : 1;
      return [{ id: 'rule', accepts: ['cond', 'law'], role: 'rule', label: 'card' }, ...Array.from({ length: n }, (_, i): In => ({ id: `p${i}`, accepts: ['eq', 'neq'], role: 'premise', label: `p${i + 1}` }))];
    },
  },
  anvil: { name: 'Anvil', family: 'contradiction', glyph: '⊥', out: ['bot'], ins: () => [{ id: 'a', accepts: ['eq'], role: 'work', label: '=' }, { id: 'b', accepts: ['neq'], role: 'work', label: '≠' }] },
  press: { name: 'Lagrange Press', family: 'lemma', glyph: '|G|', out: ['law'], ins: () => [q(['size'])] },
  hopper: { name: 'Hopper', family: 'structure', glyph: 'T', out: ['term'], src: true, ins: () => [] },
  joiner: { name: 'Joiner', family: 'structure', glyph: '⋅', out: ['term'], ins: () => [{ id: 'a', accepts: ['term'], role: 'param', label: 'a' }, { id: 'b', accepts: ['term'], role: 'param', label: 'b' }] },
  inverter: { name: 'Inverter', family: 'inverse', glyph: '( )⁻¹', out: ['term'], ins: () => [{ id: 'q', accepts: ['term'], role: 'param', label: 't' }] },
  stamp: { name: 'Witness Stamp', family: 'lemma', glyph: 'W', out: ['eq'], ins: () => [q(['eq', 'neq'])] },
  carddock: { name: 'Card Dock', family: 'lemma', glyph: '∀', out: ['law'], src: true, ins: () => [] },
  given: { name: 'Given', family: 'given', glyph: 'h', out: ['eq'], src: true, ins: () => [] },
  socket: { name: 'Receiving dock', family: 'lemma', glyph: '∎', ins: () => [q(['eq', 'neq'])] },
  desk: { name: 'Assumption Desk', family: 'scope', glyph: '⊢', out: ['eq'], src: true, ins: () => [] },
  gate: { name: 'Exit Gate', family: 'scope', glyph: '⊣', out: ['neq'], ins: () => [q(['bot'])] },
};

const FALLBACK_SPEC = (k: MachineKind): MachineSpec => ({ kind: k, name: FALLBACK[k].name, family: FALLBACK[k].family, glyph: FALLBACK[k].glyph, blurb: '', placeable: !['given', 'socket', 'desk', 'gate'].includes(k) });

export function spec(kind: MachineKind): MachineSpec {
  const s = F.SPECS?.[kind];
  return s ?? FALLBACK_SPEC(kind);
}

// ───────────── rotation (sol §2: rotate clockwise about the footprint, min corner = at) ─────────────

const FACES: Face[] = ['E', 'S', 'W', 'N'];
export const faceVec = (f: Face): [number, number] => (f === 'E' ? [1, 0] : f === 'S' ? [0, 1] : f === 'W' ? [-1, 0] : [0, -1]);
const rotFace = (f: Face, r: Rot): Face => FACES[(FACES.indexOf(f) + r) % 4]!;
function rotCells(cells: [number, number][], r: Rot): [number, number][] {
  let cs = cells.map(([x, y]) => [x + 0.5, y + 0.5] as [number, number]);
  for (let i = 0; i < r; i++) cs = cs.map(([x, y]) => [-y, x]);
  const mx = Math.min(...cs.map((c) => c[0] - 0.5)), my = Math.min(...cs.map((c) => c[1] - 0.5));
  return cs.map(([x, y]) => [Math.round(x - 0.5 - mx), Math.round(y - 0.5 - my)]);
}

function fbLocal(m: Machine): { w: number; h: number; ports: { p: In | { id: 'out'; accepts: ItemKind[]; role: 'out'; label: string }; dir: 'in' | 'out'; cell: [number, number]; face: Face }[] } {
  const fb = FALLBACK[m.kind];
  const ins = fb.ins(m);
  if (m.kind === 'socket') return { w: 1, h: 1, ports: [{ p: ins[0]!, dir: 'in', cell: [0, 0], face: 'W' }] };
  if (m.kind === 'gate') return { w: 1, h: 1, ports: [{ p: ins[0]!, dir: 'in', cell: [0, 0], face: 'W' }, { p: { id: 'out', accepts: fb.out!, role: 'out', label: 'out' }, dir: 'out', cell: [0, 0], face: 'E' }] };
  if (fb.src && ins.length === 0) return { w: 1, h: 1, ports: [{ p: { id: 'out', accepts: fb.out!, role: 'out', label: 'out' }, dir: 'out', cell: [0, 0], face: 'E' }] };
  const h = Math.max(1, ins.length);
  return {
    w: 2, h,
    ports: [
      ...ins.map((p, i) => ({ p, dir: 'in' as const, cell: [0, i] as [number, number], face: 'W' as Face })),
      { p: { id: 'out' as const, accepts: fb.out ?? ['eq'], role: 'out' as const, label: 'out' }, dir: 'out' as const, cell: [1, 0] as [number, number], face: 'E' as Face },
    ],
  };
}

function fbFootprint(m: Machine): Tile[] {
  const L = fbLocal(m);
  const cells: [number, number][] = [];
  for (let x = 0; x < L.w; x++) for (let y = 0; y < L.h; y++) cells.push([x, y]);
  return rotCells(cells, m.rot).map(([x, y]) => ({ x: x + m.at.x, y: y + m.at.y }));
}
function fbPorts(m: Machine): Port[] {
  const L = fbLocal(m);
  const cells: [number, number][] = [];
  for (let x = 0; x < L.w; x++) for (let y = 0; y < L.h; y++) cells.push([x, y]);
  const rc = rotCells(cells, m.rot);
  const idx = (c: [number, number]) => cells.findIndex((d) => d[0] === c[0] && d[1] === c[1]);
  return L.ports.map(({ p, dir, cell, face }) => {
    const r = rc[idx(cell)]!;
    return { id: p.id, dir, accepts: p.accepts, role: p.role, label: p.label, tile: { x: r[0] + m.at.x, y: r[1] + m.at.y }, face: rotFace(face, m.rot) };
  });
}

// ───────────── wrapped API ─────────────

export function footprint(m: Machine, ctx: KernelCtx): Tile[] { return soft('footprint', () => F.footprint(m, ctx), () => fbFootprint(m)); }
export function portsOf(m: Machine, ctx: KernelCtx): Port[] { return soft('portsOf', () => F.portsOf(m, ctx), () => fbPorts(m)); }

export function fallbackConfig(kind: MachineKind, opts: { schema?: string; mirror?: boolean } = {}): MachineConfig {
  const first = { k: 'first' } as const;
  switch (kind) {
    case 'spool': return { kind, t: { k: 'knob', term: null } };
    case 'canceller': return { kind, target: first, tidy: true };
    case 'expander': return { kind, target: first, insert: 'e', x: { k: 'knob', term: null }, dir: 'fwd' };
    case 'popper': return { kind, target: first };
    case 'rewriter': return { kind, target: first, dir: 'fwd', values: {}, tidy: true };
    case 'multiplier': return { kind, side: 'right', t: { k: 'knob', term: null } };
    case 'apply': return { kind, premises: 1, choice: 0, values: {} };
    case 'hopper': return { kind, t: null };
    case 'stamp': return { kind, schema: opts.schema ?? 'witness', mirror: !!opts.mirror, choice: 0, values: {} };
    case 'carddock': return { kind, schema: opts.schema ?? 'socks', mirror: !!opts.mirror };
    case 'given': return { kind, givenId: '' };
    case 'socket': return { kind, socketId: '' };
    case 'desk': return { kind, room: '' };
    case 'gate': return { kind, room: '' };
    default: return { kind } as MachineConfig;
  }
}
export function defaultConfig(kind: MachineKind, ctx: KernelCtx, opts: { schema?: string; mirror?: boolean } = {}): MachineConfig {
  return soft('defaultConfig', () => F.defaultConfig(kind, ctx, opts), () => fallbackConfig(kind, opts));
}

/** The editor's verdict on a placement (null = editor not available yet; the floor shows neutral). */
export function tryPlace(c: Canvas, kind: MachineKind, at: Tile, rot: Rot, ctx: KernelCtx, config?: MachineConfig): Edit | null {
  try { return F.place(c, kind, at, rot, ctx, config); } catch { return null; }
}
/** Editor route for a preview. undefined = editor not available; null = no route. */
export function tryRoute(c: Canvas, from: Endpoint, to: Endpoint, ctx: KernelCtx, via?: Tile[]): Tile[] | null | undefined {
  try { return F.route(c, from, to, ctx, via && via.length ? via : undefined); } catch (e) { if (String(e).includes('not implemented')) return undefined; return null; }
}
/** Belts this machine would splice into where it stands (place() splices iff exactly one). */
export function trySplice(c: Canvas, m: Machine, ctx: KernelCtx): { belt: string }[] {
  try { return (F as unknown as { spliceCandidates?: (c: Canvas, m: Machine, ctx: KernelCtx) => { belt: string }[] }).spliceCandidates?.(c, m, ctx) ?? []; } catch { return []; }
}
/** Ports the editor would link directly if this machine were placed (touching out→in). */
export function tryAutoLinks(c: Canvas, m: Machine, ctx: KernelCtx): { from: Endpoint; to: Endpoint }[] {
  try { return F.autoLinks(c, m, ctx); } catch { return []; }
}
/** Editor route for a drag preview, or the reason it cannot route (with blocker ids). undefined = editor not ready. */
export function tryRouteOrWhy(c: Canvas, from: Endpoint, to: Endpoint, ctx: KernelCtx, via?: Tile[]): { path: Tile[] } | { reason: string; blockers: string[] } | undefined {
  try { return F.routeOrWhy(c, from, to, ctx, via && via.length ? via : undefined); } catch { return undefined; }
}

/** The editor's branch (pure) — used to preview exactly what a release would commit. */
export function tryBranchAt(c: Canvas, belt: string, i: number, to: Endpoint, ctx: KernelCtx): Tile[] | null | undefined {
  try {
    const e = F.branchAt(c, belt, i, to, ctx);
    if (!e.ok) return null;
    const id = e.ids?.[0];
    return e.canvas.belts.find((b) => b.id === id)?.path ?? null;
  } catch (err) { return String(err).includes('not implemented') ? undefined : null; }
}
export function tryMove(c: Canvas, ids: string[], delta: Tile, ctx: KernelCtx): Edit | null {
  try { return F.moveMachines(c, ids, delta, ctx); } catch { return null; }
}
export function tryCopy(c: Canvas, ids: string[]): F.Blueprint | null {
  try { return F.copySelection(c, ids); } catch { return null; }
}
export function tryPaste(c: Canvas, bp: F.Blueprint, at: Tile, ctx: KernelCtx): Edit | null {
  try { return F.paste(c, bp, at, ctx); } catch { return null; }
}

/** Presentation-only Manhattan BFS used for previews when the editor's router is not available yet. */
export function fallbackRoute(blocked: (t: Tile) => boolean, a: Tile, b: Tile, limit = 4000): Tile[] | null {
  const key = (t: Tile) => `${t.x},${t.y}`;
  if (a.x === b.x && a.y === b.y) return [a];
  const prev = new Map<string, Tile | null>([[key(a), null]]);
  const queue: Tile[] = [a];
  const box = { x0: Math.min(a.x, b.x) - 6, x1: Math.max(a.x, b.x) + 6, y0: Math.min(a.y, b.y) - 6, y1: Math.max(a.y, b.y) + 6 };
  while (queue.length && prev.size < limit) {
    const t = queue.shift()!;
    // prefer continuing straight: order neighbours toward the goal
    const ns: Tile[] = [{ x: t.x + 1, y: t.y }, { x: t.x - 1, y: t.y }, { x: t.x, y: t.y + 1 }, { x: t.x, y: t.y - 1 }]
      .sort((p, q2) => Math.abs(p.x - b.x) + Math.abs(p.y - b.y) - (Math.abs(q2.x - b.x) + Math.abs(q2.y - b.y)));
    for (const n of ns) {
      if (n.x < box.x0 || n.x > box.x1 || n.y < box.y0 || n.y > box.y1) continue;
      const k = key(n);
      if (prev.has(k)) continue;
      if (!(n.x === b.x && n.y === b.y) && blocked(n)) continue;
      prev.set(k, t);
      if (n.x === b.x && n.y === b.y) {
        const out: Tile[] = [n]; let c = t as Tile | null;
        while (c) { out.unshift(c); c = prev.get(key(c)) ?? null; }
        return out;
      }
      queue.push(n);
    }
  }
  return null;
}

export const portTileOut = (p: Port): Tile => { const [dx, dy] = faceVec(p.face); return { x: p.tile.x + dx, y: p.tile.y + dy }; };

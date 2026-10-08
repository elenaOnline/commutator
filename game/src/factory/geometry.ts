// LEMMA WORKS v3 — footprints and ports (owner: EDITOR builder).
//
// Port layout convention (unrotated, rot 0 = output faces +x / east):
//   • work input  'q'              back face  (W), local (0,0)
//   • output      'out'            front face (E), local (w-1,0)
//   • rule / card 'rule'           left side  (N), local (0,0)
//   • params 't' 'x' 'meta:<m>'    right side (S), local (i,h-1), i = 0.. in order
//   • premises    'p0','p1',…      back face  (W), local (0,i)          (Apply, stamps)
//   • two inputs  'a','b'          back face  (W), local (0,0),(0,1)    (Meet, Anvil, Joiner)
// Sizes (w×h before rotation): sources/hopper/carddock/desk/gate/inverter 1×1 · given 1×1 or 2×1 (long
// statements / cards) · canceller/popper/swapper/press/expander/multiplier 2×1 · rewriter max(2,#meta ports)×1 ·
// meet/anvil/joiner 2×2 · socket 2×1 · apply/stamp max(2,#meta ports)×max(1,#premises).
// Rotation r turns the rectangle, every port tile and every face r quarter turns clockwise (E→S→W→N);
// `machine.at` is the minimum corner of the rotated rectangle. Port ids never change with rotation.
import * as K from '../kernel';
import type { KernelCtx } from '../kernel';
import type { Face, ItemKind, Machine, MachineConfig, Param, Port, Rect, Rot, Tile } from './types';
import { schemaPremises } from './catalog';

export const FACES: Face[] = ['E', 'S', 'W', 'N'];
export const FACE_DELTA: Record<Face, Tile> = { E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 }, N: { x: 0, y: -1 } };
export const OPPOSITE: Record<Face, Face> = { E: 'W', W: 'E', N: 'S', S: 'N' };

export const tileKey = (t: Tile): string => `${t.x},${t.y}`;
export const tileEq = (a: Tile, b: Tile): boolean => a.x === b.x && a.y === b.y;
export const addTile = (a: Tile, b: Tile): Tile => ({ x: a.x + b.x, y: a.y + b.y });
export function rotateFace(f: Face, r: Rot | number): Face { return FACES[(FACES.indexOf(f) + r) % 4]!; }
/** The rotation whose output face (E at rot 0) points to `f`. */
export function rotFacing(f: Face): Rot { return FACES.indexOf(f) as Rot; }
/** Outward neighbour of a port: where a belt attaches (first tile of an output belt / last of an input belt). */
export function frontOf(p: Pick<Port, 'tile' | 'face'>): Tile { return addTile(p.tile, FACE_DELTA[p.face]); }
export const inRect = (t: Tile, r: Rect): boolean => t.x >= r.x && t.x < r.x + r.w && t.y >= r.y && t.y < r.y + r.h;

const ALL_KINDS: ItemKind[] = ['term', 'eq', 'neq', 'bot', 'size', 'law', 'cond'];
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sub = (n: number): string => String(n).split('').map((d) => SUB[+d]).join('');

interface LocalPort extends Omit<Port, 'tile'> { x: number; y: number }
export interface Layout { w: number; h: number; ports: LocalPort[] }

const isPort = (p: Param | undefined): boolean => p?.k === 'port';
const metaPorts = (values: Record<string, Param>): string[] => Object.keys(values).filter((m) => isPort(values[m])).sort();

/** Width of a given inlet: long statements and cards get 2 tiles. */
function givenWidth(givenId: string, ctx: KernelCtx): number {
  const g = ctx.level.givens.find((d) => d.id === givenId);
  if (!g) return 1;
  if (g.fact.k === 'law' || g.fact.k === 'cond') return 2;
  return K.factText(g.fact, K.labelsOf(ctx.level.atoms)).length > 6 ? 2 : 1;
}

/** Unrotated layout of a machine: its w×h rectangle and local ports. Deterministic in (kind, config, ctx). */
export function layoutOf(config: MachineConfig, ctx: KernelCtx): Layout {
  const ports: LocalPort[] = [];
  const P = (id: string, dir: 'in' | 'out', role: Port['role'], accepts: ItemKind[], label: string, x: number, y: number, face: Face) =>
    ports.push({ id, dir, role, accepts, label, x, y, face });
  const work = (accepts: ItemKind[]) => P('q', 'in', 'work', accepts, 'in', 0, 0, 'W');
  const out = (accepts: ItemKind[], w: number) => P('out', 'out', 'out', accepts, 'out', w - 1, 0, 'E');
  const param = (id: string, label: string, i: number, h: number) => P(id, 'in', 'param', ['term'], label, i, h - 1, 'S');
  const rule = (accepts: ItemKind[], label = 'rule') => P('rule', 'in', 'rule', accepts, label, 0, 0, 'N');

  switch (config.kind) {
    case 'spool':
      out(['eq'], 1);
      if (isPort(config.t)) P('t', 'in', 'param', ['term'], 't', 0, 0, 'W');
      return { w: 1, h: 1, ports };
    case 'canceller': case 'popper':
      work(['eq']); out(['eq'], 2);
      return { w: 2, h: 1, ports };
    case 'swapper':
      work(['eq', 'neq']); out(['eq', 'neq'], 2);
      return { w: 2, h: 1, ports };
    case 'press':
      work(['size']); out(['law'], 2);
      return { w: 2, h: 1, ports };
    case 'expander':
      work(['eq']); out(['eq'], 2);
      if (config.insert === 'rule') rule(['eq', 'law']);
      if (isPort(config.x)) param('x', 'x', 0, 1);
      return { w: 2, h: 1, ports };
    case 'multiplier':
      work(['eq']); out(['eq'], 2);
      if (isPort(config.t)) param('t', 't', 0, 1);
      return { w: 2, h: 1, ports };
    case 'rewriter': {
      const ms = metaPorts(config.values);
      const w = Math.max(2, ms.length);
      work(['eq']); out(['eq'], w); rule(['eq', 'law']);
      ms.forEach((m, i) => param(`meta:${m}`, m, i, 1));
      return { w, h: 1, ports };
    }
    case 'apply': case 'stamp': {
      const p = config.kind === 'apply'
        ? Math.max(0, Math.min(8, Math.floor(config.premises)))
        : schemaPremises(ctx, config.schema);
      const ms = metaPorts(config.values);
      const w = Math.max(2, ms.length), h = Math.max(1, p);
      let premKinds: ItemKind[][] = Array.from({ length: p }, () => ['eq', 'neq']);
      let outKinds: ItemKind[] = ['eq', 'neq'];
      if (config.kind === 'stamp') {
        const card = ctx.registry[config.schema]?.card;
        if (card?.k === 'cond') { premKinds = card.premises.map((q) => [q.k]); outKinds = [card.concl.k]; }
        else if (card?.k === 'law') outKinds = ['eq'];
      } else rule(['cond', 'law'], 'card');
      for (let i = 0; i < p; i++) P(`p${i}`, 'in', 'premise', premKinds[i]!, `P${sub(i + 1)}`, 0, i, 'W');
      out(outKinds, w);
      ms.forEach((m, i) => param(`meta:${m}`, m, i, h));
      return { w, h, ports };
    }
    case 'meet':
      P('a', 'in', 'work', ['eq'], 'X=M', 0, 0, 'W'); P('b', 'in', 'work', ['eq'], 'Y=M', 0, 1, 'W'); out(['eq'], 2);
      return { w: 2, h: 2, ports };
    case 'anvil':
      P('a', 'in', 'work', ['eq'], '=', 0, 0, 'W'); P('b', 'in', 'work', ['neq'], '≠', 0, 1, 'W'); out(['bot'], 2);
      return { w: 2, h: 2, ports };
    case 'joiner':
      P('a', 'in', 'work', ['term'], 's', 0, 0, 'W'); P('b', 'in', 'work', ['term'], 't', 0, 1, 'W'); out(['term'], 2);
      return { w: 2, h: 2, ports };
    case 'inverter':
      work(['term']); out(['term'], 1);
      return { w: 1, h: 1, ports };
    case 'hopper':
      out(['term'], 1);
      return { w: 1, h: 1, ports };
    case 'carddock': {
      const card = ctx.registry[config.schema]?.card;
      out(card ? [card.k] : ['law'], 1);
      return { w: 1, h: 1, ports };
    }
    case 'given': {
      const g = ctx.level.givens.find((d) => d.id === config.givenId);
      const w = givenWidth(config.givenId, ctx);
      out(g ? [g.fact.k] : ALL_KINDS.filter((k) => k !== 'term'), w);
      return { w, h: 1, ports };
    }
    case 'socket': {
      const s = ctx.level.sockets.find((d) => d.id === config.socketId);
      // 2×1 so the goal inlet is open on three faces (W doorstep, N and S sides): belts arrive the short way.
      P('q', 'in', 'work', s ? [s.target.k] : ['eq', 'neq'], 'goal', 0, 0, 'W');
      return { w: 2, h: 1, ports };
    }
    case 'desk':
      out(['eq', 'neq'], 1);
      return { w: 1, h: 1, ports };
    case 'gate':
      // Placed on the room's boundary ring, rotated so `out` faces out of the room and `q` faces in.
      P('q', 'in', 'work', ['bot'], '⊥', 0, 0, 'W'); out(['eq', 'neq'], 1);
      return { w: 1, h: 1, ports };
  }
}

function rotLocal(x: number, y: number, w: number, h: number, r: number): { x: number; y: number; w: number; h: number } {
  for (let i = 0; i < r; i++) { const nx = h - 1 - y; y = x; x = nx; const t = w; w = h; h = t; }
  return { x, y, w, h };
}

/** Rotated size of the machine's rectangle. */
export function sizeOf(m: Pick<Machine, 'rot' | 'config'>, ctx: KernelCtx): { w: number; h: number } {
  const L = layoutOf(m.config, ctx);
  return m.rot % 2 === 0 ? { w: L.w, h: L.h } : { w: L.h, h: L.w };
}

export function rectOf(m: Pick<Machine, 'at' | 'rot' | 'config'>, ctx: KernelCtx): Rect {
  const s = sizeOf(m, ctx);
  return { x: m.at.x, y: m.at.y, w: s.w, h: s.h };
}

/** Occupied cells of a machine in world space (rotation applied), row-major. */
export function footprint(m: Pick<Machine, 'at' | 'rot' | 'config'>, ctx: KernelCtx): Tile[] {
  const r = rectOf(m, ctx);
  const out: Tile[] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push({ x, y });
  return out;
}

/** Ports in world space (rotation applied). Depends on config (param ports, premise count). */
export function portsOf(m: Pick<Machine, 'at' | 'rot' | 'config'>, ctx: KernelCtx): Port[] {
  const L = layoutOf(m.config, ctx);
  return L.ports.map((p) => {
    const q = rotLocal(p.x, p.y, L.w, L.h, m.rot);
    const { x: _x, y: _y, ...rest } = p;
    void _x; void _y;
    return { ...rest, tile: { x: m.at.x + q.x, y: m.at.y + q.y }, face: rotateFace(p.face, m.rot) };
  });
}

export function portOf(m: Pick<Machine, 'at' | 'rot' | 'config'>, id: string, ctx: KernelCtx): Port | undefined {
  return portsOf(m, ctx).find((p) => p.id === id);
}

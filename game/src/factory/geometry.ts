// LEMMA WORKS v3 — footprints and ports (owner: EDITOR builder).
//
// Port layout convention (unrotated, rot 0 = output faces +x / east):
//   • work input  'q'              back face  (W), local (0,0)
//   • output      'out'            front face (E), local (w-1,0)
//   • rule / card 'rule' | 'card'  left side  (N), local (0,0)      (Rewriter recipe 'routed' / Theorem 'routed')
//   • params 'x' 't' 'meta:<m>'    right side (S), local (i,h-1), i = 0.. in order (only for Param {k:'port'})
//   • premises    'p0','p1',…      back face  (W), local (0,i)          (Theorem)
//   • two inputs  'a','b'          back face  (W), local (0,0),(0,1)    (Joiner)
// Sizes (w×h before rotation): spool/tower/hopper/carddock/desk/gate 1×1 (a Tower has NO ports) · given 1×1 or
// 2×1 (long statements / cards) · rewriter max(2,#params)×1 · operator 2×1 · forall 2×1 · joiner 2×2 ·
// theorem max(2,#params)×max(1,#premises) · socket 2×2.
//   • dock inlets  'q' W (0,1) · 'qn' N (0,0) · 'qe' E (1,0) · 'qs' S (1,1)   (Receiving Dock, any may deliver)
// Rotation r turns the rectangle, every port tile and every face r quarter turns clockwise (E→S→W→N);
// `machine.at` is the minimum corner of the rotated rectangle. Port ids never change with rotation.
import * as K from '../kernel';
import type { KernelCtx } from '../kernel';
import type { Face, ItemKind, Machine, MachineConfig, Param, Port, Rect, Rot, Tile } from './types';
import { libCard, libPremises } from './catalog';

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

const ALL_KINDS: ItemKind[] = ['term', 'eq', 'neq', 'bot', 'size', 'law', 'cond', 'mem'];
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sub = (n: number): string => String(n).split('').map((d) => SUB[+d]).join('');

/** The Receiving Dock's four inlets (unrotated): a pinwheel, one per tile. W keeps the pre-2×2 id 'q'. */
export const DOCK_PORTS: readonly { id: string; x: number; y: number; face: Face }[] = [
  { id: 'q', x: 0, y: 1, face: 'W' },
  { id: 'qn', x: 0, y: 0, face: 'N' },
  { id: 'qe', x: 1, y: 0, face: 'E' },
  { id: 'qs', x: 1, y: 1, face: 'S' },
];

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

/** Unrotated layout of a machine: its w×h rectangle and local ports. Deterministic in (config, ctx). */
export function layoutOf(config: MachineConfig, ctx: KernelCtx): Layout {
  const ports: LocalPort[] = [];
  const P = (id: string, dir: 'in' | 'out', role: Port['role'], accepts: ItemKind[], label: string, x: number, y: number, face: Face) =>
    ports.push({ id, dir, role, accepts, label, x, y, face });
  const work = (accepts: ItemKind[], label = 'in') => P('q', 'in', 'work', accepts, label, 0, 0, 'W');
  const out = (accepts: ItemKind[], w: number) => P('out', 'out', 'out', accepts, 'out', w - 1, 0, 'E');
  const params = (ids: { id: string; label: string }[], h: number) => ids.forEach((q, i) => P(q.id, 'in', 'param', ['term'], q.label, i, h - 1, 'S'));
  const metaIds = (values: Record<string, Param>) => metaPorts(values).map((m) => ({ id: `meta:${m}`, label: m }));

  switch (config.kind) {
    case 'spool':
      out(['eq'], 1);
      if (isPort(config.t)) P('t', 'in', 'param', ['term'], 't', 0, 0, 'W');
      return { w: 1, h: 1, ports };
    case 'tower':
      return { w: 1, h: 1, ports };
    case 'rewriter': {
      const r = config.recipe;
      const ps = [
        ...(r?.k === 'insertPair' && isPort(r.x) ? [{ id: 'x', label: 'x' }] : []),
        ...metaIds(config.values),
      ];
      const w = Math.max(2, ps.length);
      // Book phase B: a Rewriter also works on the single rail of a membership t ∈ H (Leibniz)
      work(['eq', 'mem']); out(['eq', 'mem'], w);
      if (r?.k === 'routed') P('rule', 'in', 'rule', ['eq', 'law'], 'rule', 0, 0, 'N');
      params(ps, 1);
      return { w, h: 1, ports };
    }
    case 'operator': {
      const r = config.recipe;
      const k: ItemKind[] = r?.k === 'multiply' || r?.k === 'invert' || r?.k === 'apply' ? ['eq'] : ['eq', 'neq'];
      work(k); out(k, 2);
      if (r?.k === 'multiply' && isPort(r.t)) params([{ id: 't', label: 't' }], 1);
      // Book phase C: the other arguments of a two-argument map, as term ports when not knobs
      if (r?.k === 'apply') params((r.others ?? []).map((p, i) => ({ p, i })).filter((x) => isPort(x.p)).map((x) => ({ id: `arg:${x.i}`, label: `arg ${x.i + 1}` })), 1);
      return { w: 2, h: 1, ports };
    }
    case 'joiner': {
      const r = config.recipe;
      const lab = r?.k === 'chain' ? ['X=M', 'Y=M'] : r?.k === 'product' ? ['A=B', 'C=D'] : r?.k === 'clash' ? ['=', '≠'] : ['A', 'B'];
      const ins: ItemKind[] = r?.k === 'chain' || r?.k === 'product' ? ['eq'] : ['eq', 'neq'];
      const o: ItemKind[] = r?.k === 'clash' ? ['bot'] : r ? ['eq'] : ['eq', 'bot'];
      P('a', 'in', 'work', ins, lab[0]!, 0, 0, 'W'); P('b', 'in', 'work', ins, lab[1]!, 0, 1, 'W'); out(o, 2);
      return { w: 2, h: 2, ports };
    }
    case 'theorem': {
      const r = config.recipe;
      const card = r?.k === 'library' ? libCard(ctx, r.ref) : null;
      const p = r?.k === 'library' ? libPremises(ctx, r.ref) : 1;
      const ps = metaIds(config.values);
      const w = Math.max(2, ps.length), h = Math.max(1, p);
      let premKinds: ItemKind[][] = Array.from({ length: p }, () => ['eq', 'neq', 'mem']);
      let outKinds: ItemKind[] = ['eq', 'neq', 'mem'];
      if (card?.k === 'cond') { premKinds = card.premises.map((q) => [q.k]); outKinds = [card.concl.k]; }
      else if (card?.k === 'law') outKinds = ['eq'];
      if (r?.k === 'routed') P('card', 'in', 'rule', ['cond', 'law'], 'card', 0, 0, 'N');
      for (let i = 0; i < p; i++) P(`p${i}`, 'in', 'premise', premKinds[i]!, `P${sub(i + 1)}`, 0, i, 'W');
      out(outKinds, w);
      params(ps, h);
      return { w, h, ports };
    }
    case 'forall':
      work(['eq', 'neq', 'mem', 'law', 'cond'], 'fact'); out(['law', 'cond'], 2);
      return { w: 2, h: 1, ports };
    case 'hopper':
      out(['term'], 1);
      return { w: 1, h: 1, ports };
    case 'carddock': {
      const card = config.ref?.k === 'axiom' ? null : libCard(ctx, config.ref);
      out(card ? [card.k] : config.ref?.k === 'axiom' || config.ref?.k === 'lagrange' ? ['law'] : ['law', 'cond'], 1);
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
      // 2×2 proof box with one inlet per side in a pinwheel, one per tile (review 2026-10). W on (0,1) keeps the
      // old id 'q' so every belt saved against the 2×1 dock stays valid; any inlet may deliver.
      const acc: ItemKind[] = s ? [s.target.k as ItemKind] : ['eq', 'neq', 'law', 'cond'];
      for (const d of DOCK_PORTS) P(d.id, 'in', 'work', [...acc], 'goal', d.x, d.y, d.face);
      return { w: 2, h: 2, ports };
    }
    case 'desk':
      out(['eq', 'neq', 'mem'], 1);
      return { w: 1, h: 1, ports };
    case 'gate':
      // On the room's boundary ring, rotated so `out` faces out of the room and `q` faces in.
      // Suppose/classical take ⊥ and export ¬P / P; an Assume room takes any Q and exports P ⇒ Q.
      P('q', 'in', 'work', ['bot', 'eq', 'neq', 'mem'], '⊥', 0, 0, 'W'); out(['eq', 'neq', 'cond'], 1);
      return { w: 1, h: 1, ports };
    default:
      // An unknown (legacy / corrupt) config: a bare 1×1 with no ports, so nothing downstream crashes.
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

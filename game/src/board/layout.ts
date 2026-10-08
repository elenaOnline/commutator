// LEMMA WORKS board — auto-layout. Pure: proof graph (+ check facts) → grid layout.
//
// Approach (stable as the graph grows):
//  • belts.ts gives belts (a head + its step chain). A belt whose head consumes
//    another belt's END as its primary input (apply premise, clash eq, exit,
//    press, merge's active side) CONTINUES that belt's line, so a run passes
//    through earned buildings, the clash anvil, the room gate, and on to its
//    socket. Every other belt starts a new line.
//  • Lines are rows (stacked along +gy), ordered by first appearance, grouped by
//    scope so a room's rows are contiguous (its Euler field encloses them).
//    New belts append rows; new stations append columns. Nothing reshuffles.
//  • Columns: one station per column along the run (+gx). A line's first
//    station sits at its scope's indent (givens at the left edge, col 0), or one
//    column past its furthest input. The exit gate sits on the room's right edge.
//  • Sockets sit in a goal column right of everything, at their filler's row.
import type { Fact, Family, LevelManifest, NodeId, ProofGraph, ProofNode, Room, ScopeId } from '../kernel/types';
import { beltsOf, stationsOf, usesOf, type Belt } from '../state/belts';
import { MIRROR_NAMES, REGISTRY } from '../levels/levels';
import { FAMILY } from '../ui/tokens';
import type { G2 } from './geom';

export const PITCH = 1.85;      // grid units between stations along a run
export const ROW_HEAVY = 2.25;   // grid units per working row
export const ROW_LIGHT = 1.4;  // grid units per bare inlet row
export const ROOM_PAD = 0.5;

export type SKind = 'inlet' | 'start' | 'assume' | 'station' | 'building' | 'press' | 'clash' | 'gate';

export interface SLay {
  key: string;
  nodes: ProofNode[];
  first: NodeId;
  last: NodeId;
  kind: SKind;
  fam: Family;
  scope: ScopeId;
  line: number;
  col: number;
  gx: number;
  gy: number;
  next?: string;
  prev?: string;
  out?: Fact;
  /** Last node is consumed by no step (a belt end). */
  isEnd: boolean;
  glyph: string;
  /** Building / press name. */
  name?: string;
  mirror?: boolean;
  /** Tile half-size and height (grid units). */
  e: number;
  h: number;
}

export interface WireLay {
  id: string;
  from: string;            // station key producing it (its ink)
  to?: string;             // station key it runs into
  line: G2[];              // grid centreline
  lanes: 0 | 1 | 2;        // 2 = equation lanes, 1 = single wire (⊥, |G|)
  neq: boolean;
  fam: Family;
  /** Reveal: node whose replay step bleeds this wire (the producer's last node). */
  ord: NodeId;
  kind: 'run' | 'tail' | 'feed';
  /** Grid point where a delivery branch forks off its row. */
  fork?: G2;
}

export interface RibbonLay { id: string; from: string; to: string; fam: Family; ord: NodeId }

export interface RoomLay {
  room: Room;
  depth: number;
  poly: G2[];              // rounded grid polygon
  x0: number; x1: number; y0: number; y1: number;
  gate?: string;           // station key of the exit gate
  clash?: string;          // station key of the clash anvil
  ord: NodeId | null;      // reveal with the room's first node
  closed: boolean;
}

export interface SocketLay { id: string; gx: number; gy: number; filledBy?: NodeId; target: Fact; claim?: boolean; scope?: ScopeId }

export interface Layout {
  stations: Map<string, SLay>;
  byNode: Map<NodeId, string>;
  wires: WireLay[];
  ribbons: RibbonLay[];
  rooms: RoomLay[];
  sockets: SocketLay[];
  goalGx: number;
  /** Stations whose output feeds two or more consumers. */
  shared: Map<string, number>;
  /** Grid extent (for registration crosses / fit). */
  ext: { x0: number; y0: number; x1: number; y1: number };
  topo: NodeId[];
}

export interface LayoutInput {
  graph: ProofGraph;
  facts: Record<NodeId, Fact | undefined>;
  level: LevelManifest;
  famOf: (n: ProofNode) => Family;
  filled: { id: string; filledBy?: NodeId }[];
  claims: { id: string; pallet: Fact; scope: ScopeId }[];
}

/** Topological order (inputs + cites first), stable by graph order. */
export function topoOrder(g: ProofGraph): NodeId[] {
  const byId = new Map(g.nodes.map((n) => [n.id, n] as const));
  const out: NodeId[] = []; const seen = new Set<NodeId>();
  const visit = (id: NodeId) => {
    if (seen.has(id)) return; seen.add(id);
    const n = byId.get(id); if (!n) return;
    const u = usesOf(n);
    for (const d of [...u.inputs, ...u.cites]) visit(d);
    out.push(id);
  };
  for (const n of g.nodes) visit(n.id);
  return out;
}

const primaryInput = (n: ProofNode): NodeId | undefined => {
  switch (n.k) {
    case 'apply': return n.inputs[0];
    case 'merge': return n.inputs[1];
    case 'clash': return n.inputs[0];
    case 'exit': case 'press': return n.input;
    default: return undefined;
  }
};

export function layoutBoard(inp: LayoutInput): Layout {
  const { graph: g, facts, level, famOf } = inp;
  const topo = topoOrder(g);
  const tIdx = new Map(topo.map((id, i) => [id, i] as const));
  const ti = (id: NodeId) => tIdx.get(id) ?? 1e9;
  const byId = new Map(g.nodes.map((n) => [n.id, n] as const));
  const roomById = new Map(g.rooms.map((r) => [r.id, r] as const));
  const depth = (s: ScopeId): number => { let d = 0; let r = roomById.get(s); while (r) { d++; r = roomById.get(r.parent); } return d; };
  const within = (s: ScopeId, room: ScopeId): boolean => { if (s === room) return true; const r = roomById.get(s); return r ? within(r.parent, room) : false; };
  const consumedByStep = new Set<NodeId>();
  for (const n of g.nodes) if (n.k === 'step') consumedByStep.add(n.input);

  // ── belts → lines ──
  const belts = beltsOf(g).sort((a, b) => ti(a.head.id) - ti(b.head.id));
  const beltOfEnd = new Map<NodeId, Belt>();
  for (const b of belts) beltOfEnd.set(b.end, b);
  const lineOfBelt = new Map<string, number>();
  const lines: { home: ScopeId; belts: Belt[]; first: number }[] = [];
  const continued = new Set<string>();
  for (const b of belts) {
    const prim = primaryInput(b.head);
    const pb = prim ? beltOfEnd.get(prim) : undefined;
    if (pb && !continued.has(pb.id) && lineOfBelt.has(pb.id)) {
      continued.add(pb.id);
      const li = lineOfBelt.get(pb.id)!;
      lineOfBelt.set(b.id, li);
      lines[li]!.belts.push(b);
    } else {
      lineOfBelt.set(b.id, lines.length);
      lines.push({ home: b.scope, belts: [b], first: ti(b.head.id) });
    }
  }

  // ── stations ──
  const stations = new Map<string, SLay>();
  const byNode = new Map<NodeId, string>();
  const givenName = (gid: string) => level.givens.find((x) => x.id === gid)?.name ?? gid;
  const schemaName = (id: string, mirror?: boolean) => (mirror ? MIRROR_NAMES[id]?.name : undefined) ?? REGISTRY[id]?.name ?? id;
  const lineStations: string[][] = lines.map(() => []);

  /** The node a station cites (rewrite rule node / apply rule node), if any. */
  const s0 = (n: ProofNode): ProofNode | undefined => {
    const id = n.k === 'step' && n.op.k === 'rewrite' && n.op.rule.k === 'node' ? n.op.rule.id : n.k === 'apply' && n.rule.k === 'node' ? n.rule.id : undefined;
    return id ? byId.get(id) : undefined;
  };
  const citeGlyph = (c: ProofNode | undefined, dflt: string): string => {
    if (!c) return dflt;
    if (c.k === 'given') return givenName(c.givenId);
    if (c.k === 'assume') return 'P';
    if (c.k === 'press') { const f = facts[c.id]; const n = f?.k === 'law' ? (f.l.k === 'mul' ? f.l.fs.length : 1) : 0; return n ? `x^${n}` : dflt; }
    return dflt;
  };
  const mk = (key: string, nodes: ProofNode[], li: number): SLay => {
    const head = nodes[0]!, last = nodes[nodes.length - 1]!;
    const fam = famOf(head);
    let kind: SKind = 'station', glyph = FAMILY[fam].glyph, name: string | undefined, mirror: boolean | undefined;
    let e = 0.42, h = 0.22;
    switch (head.k) {
      case 'given': kind = 'inlet'; glyph = givenName(head.givenId); e = 0.4; h = 0.15; break;
      case 'start': kind = 'start'; glyph = '='; e = 0.4; h = 0.18; break;
      case 'assume': kind = 'assume'; break;
      case 'clash': kind = 'clash'; glyph = '⊥'; break;
      case 'exit': kind = 'gate'; e = 0; h = 0; break;
      case 'press': kind = 'press'; name = 'Lagrange Press'; e = 0.62; h = 0.4; break;
      case 'apply':
        if (head.rule.k === 'schema') { kind = 'building'; name = schemaName(head.rule.id, head.rule.mirror); mirror = head.rule.mirror; e = 0.62; h = 0.4; }
        else glyph = citeGlyph(s0(head), glyph);
        break;
      case 'step':
        if (head.op.k === 'rewrite' && head.op.rule.k === 'schema') { kind = 'building'; name = schemaName(head.op.rule.id, head.op.rule.mirror); mirror = head.op.rule.mirror; e = 0.62; h = 0.4; }
        else glyph = citeGlyph(s0(head), glyph);
        break;
      default: break;
    }
    if (kind === 'station' && head.k === 'step' && head.op.k === 'insertE') { const c = nodes.map(s0).find(Boolean); if (c) glyph = citeGlyph(c, glyph); }
    if (head.k === 'assume') glyph = 'P';
    const s: SLay = {
      key, nodes, first: head.id, last: last.id, kind, fam, scope: head.scope, line: li, col: 0, gx: 0, gy: 0,
      out: facts[last.id], isEnd: !consumedByStep.has(last.id), glyph, name, mirror, e, h,
    };
    return s;
  };

  lines.forEach((ln, li) => {
    for (const b of ln.belts) {
      const groups = stationsOf(b);
      const headKey = b.head.id;
      let headNodes: ProofNode[] = [b.head];
      const hs = b.head.meta?.station;
      if (hs && groups[0] && groups[0].id === hs) { headNodes = [b.head, ...groups.shift()!.nodes]; }
      const all: [string, ProofNode[]][] = [[headKey, headNodes], ...groups.map((gr) => [`${headKey}/${gr.id}`, gr.nodes] as [string, ProofNode[]])];
      for (const [key, nodes] of all) {
        const s = mk(key, nodes, li);
        stations.set(key, s);
        for (const n of nodes) byNode.set(n.id, key);
        const arr = lineStations[li]!;
        const prev = arr[arr.length - 1];
        if (prev) { s.prev = prev; stations.get(prev)!.next = key; }
        arr.push(key);
      }
    }
  });

  // ── columns (topological) ──
  const order = [...stations.values()].sort((a, b) => ti(a.first) - ti(b.first));
  const done = new Set<string>();
  for (const s of order) {
    const head = s.nodes[0]!;
    const ins = usesOf(head).inputs.map((id) => byNode.get(id)).filter((k): k is string => !!k && k !== s.key && done.has(k));
    const insMax = ins.length ? Math.max(...ins.map((k) => stations.get(k)!.col)) : -Infinity;
    const prev = s.prev ? stations.get(s.prev) : undefined;
    let col: number;
    if (s.kind === 'gate' && head.k === 'exit') {
      let roomMax = -Infinity;
      for (const k of done) { const o = stations.get(k)!; if (o.kind !== 'gate' && within(o.scope, head.room)) roomMax = Math.max(roomMax, o.col); }
      col = Math.max((prev?.col ?? 0) + 0.8, roomMax + 0.8);
    } else if (prev) {
      col = Math.max(prev.col + (prev.kind === 'gate' ? 0.8 : 1), insMax + 1);
    } else if (s.kind === 'inlet') {
      col = 0;
    } else {
      col = Math.max(depth(s.scope), insMax + 1);
    }
    s.col = col; s.gx = col * PITCH;
    done.add(s.key);
  }

  // ── rows (scope tree, first appearance) ──
  type Item = { k: 'line'; li: number; first: number } | { k: 'room'; id: ScopeId; first: number };
  const roomFirst = (rid: ScopeId) => {
    let m = 1e9;
    for (const n of g.nodes) if (within(n.scope, rid) && n.k !== 'exit') m = Math.min(m, ti(n.id));
    return m;
  };
  const items = (scope: ScopeId): Item[] => {
    const out: Item[] = [];
    lines.forEach((ln, li) => { if (ln.home === scope) out.push({ k: 'line', li, first: ln.first }); });
    for (const r of g.rooms) if (r.parent === scope) out.push({ k: 'room', id: r.id, first: roomFirst(r.id) });
    return out.sort((a, b) => a.first - b.first);
  };
  const lineGy: number[] = [];
  const roomBand = new Map<ScopeId, [number, number]>();
  let y = 0;
  const heavy = (li: number) => lineStations[li]!.length > 1 || lineStations[li]!.some((k) => stations.get(k)!.kind !== 'inlet');
  const place = (scope: ScopeId) => {
    for (const itm of items(scope)) {
      if (itm.k === 'line') {
        const h = heavy(itm.li) ? ROW_HEAVY : ROW_LIGHT;
        lineGy[itm.li] = y + h / 2; y += h;
      } else {
        const top = y; y += ROOM_PAD;
        place(itm.id);
        y += ROOM_PAD;
        roomBand.set(itm.id, [top, y]);
        y += 0.35;
      }
    }
  };
  place('root');
  for (const s of stations.values()) s.gy = lineGy[s.line] ?? 0;

  // ── sockets ──
  let maxCol = 0;
  for (const s of stations.values()) maxCol = Math.max(maxCol, s.col);
  const goalGx = (maxCol + 1.7) * PITCH;
  const allGy = lineGy.filter((v) => v !== undefined);
  const midGy = allGy.length ? (Math.min(...allGy) + Math.max(...allGy)) / 2 : 0;
  const sockets: SocketLay[] = [];
  const used: number[] = [];
  // stacked goal column: every socket gets its own slot (alternate around the wanted row)
  const free = (want: number, gap = 2.1) => {
    for (let k = 0; k < 40; k++) {
      const v = want + (k === 0 ? 0 : (k % 2 ? -1 : 1) * Math.ceil(k / 2) * gap);
      if (!used.some((u) => Math.abs(u - v) < gap - 0.05)) { used.push(v); return v; }
    }
    used.push(want); return want;
  };
  const fillerOf = (id?: NodeId) => (id && byNode.has(id) ? stations.get(byNode.get(id)!)! : undefined);
  const filledDecl = level.sockets.map((sd) => ({ sd, f: fillerOf(inp.filled.find((x) => x.id === sd.id)?.filledBy) }));
  // line ends first (they deliver straight along their row), then mid-line fillers (fan-out branches)
  for (const pass of [0, 1]) {
    for (const { sd, f } of filledDecl) {
      if (!f || (pass === 0) !== !f.next) continue;
      const gy = free(pass === 0 ? f.gy : f.gy - 1.6);
      sockets.push({ id: sd.id, gx: goalGx, gy, filledBy: inp.filled.find((x) => x.id === sd.id)!.filledBy, target: sd.target });
    }
  }
  for (const sd of level.sockets) {
    if (sockets.some((s) => s.id === sd.id)) continue;
    sockets.push({ id: sd.id, gx: goalGx, gy: free(midGy), target: sd.target });
  }
  sockets.sort((a, b) => level.sockets.findIndex((x) => x.id === a.id) - level.sockets.findIndex((x) => x.id === b.id));
  for (const c of inp.claims) {
    const band = roomBand.get(c.scope);
    if (band) {
      let rx = 0;
      for (const s of stations.values()) if (within(s.scope, c.scope) && s.kind !== 'gate') rx = Math.max(rx, s.gx);
      sockets.push({ id: c.id, gx: rx + PITCH * 0.75, gy: band[1] - 0.9, target: c.pallet, claim: true, scope: c.scope });
    } else sockets.push({ id: c.id, gx: goalGx, gy: free(midGy + 2.1), target: c.pallet, claim: true, scope: c.scope });
  }

  // ── wires ──
  const wires: WireLay[] = [];
  const lanesOf = (f?: Fact): 0 | 1 | 2 => (!f ? 2 : f.k === 'eq' || f.k === 'neq' ? 2 : f.k === 'bot' || f.k === 'size' ? 1 : 0);
  for (const s of stations.values()) {
    const lanes = lanesOf(s.out);
    const neq = s.out?.k === 'neq';
    const st = s.kind === 'gate' ? 0 : s.e + 0.04;
    if (s.next) {
      const n = stations.get(s.next)!;
      if (lanes) wires.push({ id: `w:${s.key}`, from: s.key, to: n.key, line: [[s.gx + st * 0.2, s.gy], [n.gx, n.gy]], lanes, neq, fam: s.fam, ord: s.last, kind: 'run' });
    } else if (lanes && s.isEnd) {
      const sock = sockets.find((k) => !k.claim && k.filledBy && byNode.get(k.filledBy) === s.key && Math.abs(k.gy - s.gy) < 0.01);
      const delivers = sockets.some((k) => !k.claim && k.filledBy && byNode.get(k.filledBy) === s.key);
      const end = sock ? sock.gx - 0.62 : s.gx + PITCH * 0.62;
      if (delivers && !sock) { /* delivered by a branch below */ } else if (s.kind === 'inlet' && !sock && s.out?.k !== 'eq') {
        // neq / size inlets feed by wire only when consumed; leave a short stub
        wires.push({ id: `w:${s.key}`, from: s.key, line: [[s.gx, s.gy], [s.gx + s.e + 0.35, s.gy]], lanes, neq, fam: s.fam, ord: s.last, kind: 'tail' });
      } else {
        wires.push({ id: `w:${s.key}`, from: s.key, line: [[s.gx, s.gy], [end, s.gy]], lanes, neq, fam: s.fam, ord: s.last, kind: 'tail' });
      }
    }
  }
  // deliveries that leave the row: a fan-out branch from the filler to its socket
  for (const k of sockets) {
    if (k.claim || !k.filledBy) continue;
    const f = fillerOf(k.filledBy); if (!f) continue;
    if (!f.next && Math.abs(k.gy - f.gy) < 0.01) continue; // straight tail, handled above
    const fx = f.gx + Math.max(f.e, 0.2) + 0.5;
    const line = roundedPolyline([[f.gx, f.gy], [fx, f.gy], [fx, k.gy], [k.gx - 0.62, k.gy]], 0.6);
    wires.push({ id: `d:${k.id}`, from: f.key, line, lanes: lanesOf(f.out), neq: f.out?.k === 'neq', fam: f.fam, ord: f.last, kind: 'tail', fork: [fx - 0.5, f.gy] });
  }

  // feeds: inputs that do not arrive along the run
  for (const s of stations.values()) {
    const head = s.nodes[0]!;
    const prevLast = s.prev ? stations.get(s.prev)!.last : undefined;
    for (const id of usesOf(head).inputs) {
      if (id === prevLast) continue;
      const sk = byNode.get(id); if (!sk) continue;
      const src = stations.get(sk)!;
      const line = feedRoute(src, s);
      wires.push({ id: `f:${id}>${s.key}`, from: sk, to: s.key, line, lanes: 1, neq: facts[id]?.k === 'neq', fam: src.fam, ord: s.first, kind: 'feed' });
    }
  }

  // ── ribbons (citations) ──
  const ribbons: RibbonLay[] = [];
  const seenR = new Set<string>();
  for (const s of stations.values()) {
    for (const n of s.nodes) {
      for (const c of usesOf(n).cites) {
        const from = byNode.get(c); if (!from) continue;
        const id = `r:${from}>${s.key}`;
        if (seenR.has(id)) continue; seenR.add(id);
        ribbons.push({ id, from, to: s.key, fam: stations.get(from)!.fam, ord: n.id });
      }
    }
  }

  // ── shared intermediates: a station whose output has ≥ 2 consumers (sockets, inputs, citations) ──
  const shared = new Map<string, number>();
  for (const s of stations.values()) {
    let n = sockets.filter((k) => !k.claim && k.filledBy === s.last).length;
    for (const m of g.nodes) { const u = usesOf(m); if (u.inputs.includes(s.last) || u.cites.includes(s.last)) n++; }
    if (n >= 2 && s.kind !== 'inlet') shared.set(s.key, n);
  }

  // ── rooms ──
  const rooms: RoomLay[] = [];
  for (const r of g.rooms) {
    const band = roomBand.get(r.id); if (!band) continue;
    const inside = [...stations.values()].filter((s) => within(s.scope, r.id) && s.kind !== 'gate');
    const gate = [...stations.values()].find((s) => s.kind === 'gate' && s.nodes[0]!.k === 'exit' && (s.nodes[0] as { room: string }).room === r.id);
    const clash = inside.find((s) => s.kind === 'clash' && s.scope === r.id);
    const minCol = inside.length ? Math.min(...inside.map((s) => s.col)) : depth(r.id);
    const maxColR = inside.length ? Math.max(...inside.map((s) => s.col)) : depth(r.id);
    const d = depth(r.id);
    const x0 = (minCol - 0.6) * PITCH + (d - 1) * 0.1;
    const x1 = gate ? gate.gx : (maxColR + 0.62) * PITCH;
    const [y0, y1] = band;
    const poly = roundGridRect(x0, y0, x1, y1, 0.95);
    const firstNode = g.nodes.filter((n) => within(n.scope, r.id)).sort((a, b) => ti(a.id) - ti(b.id))[0];
    rooms.push({ room: r, depth: d, poly, x0, x1, y0, y1, gate: gate?.key, clash: clash?.key, ord: firstNode?.id ?? null, closed: !!gate });
  }

  // ── extent ──
  let x0 = 0, x1 = goalGx, gy0 = 0, gy1 = y;
  for (const s of stations.values()) { x0 = Math.min(x0, s.gx - 1); x1 = Math.max(x1, s.gx + 1); }
  for (const s of sockets) { gy0 = Math.min(gy0, s.gy - 1); gy1 = Math.max(gy1, s.gy + 1); }
  return { stations, byNode, wires, ribbons, rooms, sockets, goalGx, shared, ext: { x0: x0 - 1, y0: gy0 - 1, x1: x1 + 1.5, y1: gy1 + 1 }, topo };
}

/**
 * Orthogonal feed route in grid space: leave the source along the run, drop
 * through the gutter beside the target's row, and enter the target from the
 * side (perpendicular), with corners rounded in grid space.
 */
function feedRoute(src: SLay, dst: SLay): G2[] {
  if (Math.abs(src.gy - dst.gy) < 0.01) {
    const p0: G2 = [src.gx, src.gy], p3: G2 = [dst.gx, dst.gy];
    return cubicLine(p0, [p0[0] + 1, p0[1] - 1.2], [p3[0] - 1, p3[1] - 1.2], p3);
  }
  const down = dst.gy > src.gy;
  const gut = dst.gy + (down ? -1 : 1) * 1.05;
  const xOut = src.gx + Math.max(src.e, 0.3) + 0.55;
  const xIn = dst.gx;
  const pts: G2[] = [[src.gx, src.gy], [xOut, src.gy], [xOut, gut], [xIn, gut], [xIn, dst.gy]];
  if (xIn <= xOut + 0.3) pts.splice(2, 2, [xOut, gut], [xIn, gut]);
  return roundedPolyline(pts, 0.55);
}

function roundedPolyline(p: G2[], r: number, n = 8): G2[] {
  const out: G2[] = [p[0]!];
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1]!, b = p[i]!, c = p[i + 1]!;
    const v1: G2 = [a[0] - b[0], a[1] - b[1]], v2: G2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const p1: G2 = [b[0] + v1[0] / l1 * rr, b[1] + v1[1] / l1 * rr], p2: G2 = [b[0] + v2[0] / l2 * rr, b[1] + v2[1] / l2 * rr];
    for (let k = 0; k <= n; k++) { const t = k / n; out.push([(1 - t) * (1 - t) * p1[0] + 2 * (1 - t) * t * b[0] + t * t * p2[0], (1 - t) * (1 - t) * p1[1] + 2 * (1 - t) * t * b[1] + t * t * p2[1]]); }
  }
  out.push(p[p.length - 1]!);
  // densify straight legs so cutLine/ribbon offsets stay smooth
  const dense: G2[] = [out[0]!];
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1]!, b = out[i]!, L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.ceil(L / 0.5));
    for (let k = 1; k <= m; k++) dense.push([a[0] + (b[0] - a[0]) * k / m, a[1] + (b[1] - a[1]) * k / m]);
  }
  return dense;
}

function cubicLine(p0: G2, p1: G2, p2: G2, p3: G2, n = 22): G2[] {
  const out: G2[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

function roundGridRect(x0: number, y0: number, x1: number, y1: number, r: number): G2[] {
  const poly: G2[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const out: G2[] = [];
  const n = 10;
  for (let i = 0; i < 4; i++) {
    const a = poly[(i + 3) % 4]!, b = poly[i]!, c = poly[(i + 1) % 4]!;
    const v1: G2 = [a[0] - b[0], a[1] - b[1]], v2: G2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2), rr = Math.min(r, l1 / 2, l2 / 2);
    const p1: G2 = [b[0] + v1[0] / l1 * rr, b[1] + v1[1] / l1 * rr], p2: G2 = [b[0] + v2[0] / l2 * rr, b[1] + v2[1] / l2 * rr];
    for (let k = 0; k <= n; k++) { const t = k / n; out.push([(1 - t) * (1 - t) * p1[0] + 2 * (1 - t) * t * b[0] + t * t * p2[0], (1 - t) * (1 - t) * p1[1] + 2 * (1 - t) * t * b[1] + t * t * p2[1]]); }
  }
  return out;
}

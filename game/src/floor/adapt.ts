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
  Canvas, Edit, Endpoint, Face, ItemKind, Machine, MachineConfig, MachineKind, MachineSpec, Param, Port, Rot, Tile,
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

// ───────────── fallback catalogue (presentation only; v4 verbs) ─────────────

interface FB { name: string; family: Family; glyph: string; placeable: boolean }
const FALLBACK: Record<MachineKind, FB> = {
  spool: { name: 'Spool', family: 'equation', glyph: 't=t', placeable: true },
  tower: { name: 'Tower', family: 'scope', glyph: 'x∈G', placeable: true },
  rewriter: { name: 'Rewriter', family: 'equation', glyph: '⥲', placeable: true },
  operator: { name: 'Operator', family: 'structure', glyph: '✣', placeable: true },
  joiner: { name: 'Joiner', family: 'equation', glyph: '=', placeable: true },
  theorem: { name: 'Theorem', family: 'lemma', glyph: '⟹', placeable: true },
  forall: { name: '∀ Generalizer', family: 'scope', glyph: '∀', placeable: true },
  carddock: { name: 'Card Dock', family: 'lemma', glyph: '∀=', placeable: true },
  hopper: { name: 'Hopper', family: 'structure', glyph: 't', placeable: true },
  given: { name: 'Given Inlet', family: 'given', glyph: '∵', placeable: false },
  socket: { name: 'Receiving Dock', family: 'equation', glyph: '∎', placeable: false },
  desk: { name: 'Assumption Desk', family: 'scope', glyph: '⊢', placeable: false },
  gate: { name: 'Exit Gate', family: 'scope', glyph: '⊣', placeable: false },
};

const FALLBACK_SPEC = (k: MachineKind): MachineSpec => ({ kind: k, name: FALLBACK[k].name, family: FALLBACK[k].family, glyph: FALLBACK[k].glyph, blurb: '', placeable: FALLBACK[k].placeable });

export function spec(kind: MachineKind): MachineSpec {
  const s = (F.SPECS as Partial<Record<MachineKind, MachineSpec>>)?.[kind];
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

interface LP { id: string; dir: 'in' | 'out'; role: Port['role']; accepts: ItemKind[]; label: string; cell: [number, number]; face: Face }
/** v4 port conventions (editor): work 'q' W (0,0) · 'out' E (w−1,0) · rule/card N (0,0) · params S (i,h−1) · premises W (0,i) · a/b W (0,0),(0,1). */
function fbLocal(m: Machine): { w: number; h: number; ports: LP[] } {
  const c = m.config;
  const ports: LP[] = [];
  const add = (id: string, dir: 'in' | 'out', role: Port['role'], accepts: ItemKind[], label: string, x: number, y: number, face: Face) => ports.push({ id, dir, role, accepts, label, cell: [x, y], face });
  const params = (h: number, ids: string[]) => ids.forEach((id, i) => add(id, 'in', 'param', ['term'], id.replace(/^meta:/, ''), i, h - 1, 'S'));
  const portParams = (vals: Record<string, Param>) => Object.keys(vals).filter((k) => vals[k]?.k === 'port').sort().map((k) => `meta:${k}`);
  switch (c.kind) {
    case 'spool': {
      if (c.t.k === 'port') { add('out', 'out', 'out', ['eq'], 'out', 1, 0, 'E'); params(1, ['t']); return { w: 2, h: 1, ports }; }
      add('out', 'out', 'out', ['eq'], 'out', 0, 0, 'E'); return { w: 1, h: 1, ports };
    }
    case 'tower': return { w: 1, h: 1, ports };
    case 'rewriter': {
      add('q', 'in', 'work', ['eq'], 'in', 0, 0, 'W'); add('out', 'out', 'out', ['eq'], 'out', 1, 0, 'E');
      if (c.recipe?.k === 'routed') add('rule', 'in', 'rule', ['eq', 'law'], 'rule', 0, 0, 'N');
      const ps = portParams(c.values);
      if (c.recipe?.k === 'insertPair' && c.recipe.x.k === 'port') ps.unshift('x');
      params(1, ps.slice(0, 2));
      return { w: 2, h: 1, ports };
    }
    case 'operator': {
      add('q', 'in', 'work', ['eq', 'neq'], 'in', 0, 0, 'W'); add('out', 'out', 'out', ['eq', 'neq'], 'out', 1, 0, 'E');
      if (c.recipe?.k === 'multiply' && c.recipe.t.k === 'port') params(1, ['t']);
      return { w: 2, h: 1, ports };
    }
    case 'joiner': {
      const clash = c.recipe?.k === 'clash';
      add('a', 'in', 'work', ['eq'], clash ? '=' : 'a', 0, 0, 'W'); add('b', 'in', 'work', [clash ? 'neq' : 'eq'], clash ? '≠' : 'b', 0, 1, 'W');
      add('out', 'out', 'out', [clash ? 'bot' : 'eq'], 'out', 1, 0, 'E');
      return { w: 2, h: 2, ports };
    }
    case 'theorem': {
      add('p0', 'in', 'premise', ['eq', 'neq'], 'p₁', 0, 0, 'W'); add('out', 'out', 'out', ['eq', 'neq'], 'out', 1, 0, 'E');
      if (c.recipe?.k === 'routed') add('rule', 'in', 'rule', ['cond', 'law'], 'card', 0, 0, 'N');
      return { w: 2, h: 1, ports };
    }
    case 'forall': add('q', 'in', 'work', ['eq', 'neq', 'law', 'cond'], 'in', 0, 0, 'W'); add('out', 'out', 'out', ['law', 'cond'], 'out', 1, 0, 'E'); return { w: 2, h: 1, ports };
    case 'carddock': add('out', 'out', 'out', ['law', 'cond'], 'out', 0, 0, 'E'); return { w: 1, h: 1, ports };
    case 'hopper': add('out', 'out', 'out', ['term'], 'out', 0, 0, 'E'); return { w: 1, h: 1, ports };
    case 'given': add('out', 'out', 'out', ['eq', 'neq', 'size', 'law', 'cond'], 'out', 0, 0, 'E'); return { w: 1, h: 1, ports };
    case 'socket': {
      const acc: ItemKind[] = ['eq', 'neq', 'law', 'cond'];
      add('q', 'in', 'work', acc, 'goal', 0, 1, 'W'); add('qn', 'in', 'work', acc, 'goal', 0, 0, 'N');
      add('qe', 'in', 'work', acc, 'goal', 1, 0, 'E'); add('qs', 'in', 'work', acc, 'goal', 1, 1, 'S');
      return { w: 2, h: 2, ports };
    }
    case 'desk': add('out', 'out', 'out', ['eq', 'neq'], 'out', 0, 0, 'E'); return { w: 1, h: 1, ports };
    case 'gate': add('q', 'in', 'work', ['bot', 'eq', 'neq'], 'in', 0, 0, 'W'); add('out', 'out', 'out', ['eq', 'neq', 'cond'], 'out', 0, 0, 'E'); return { w: 1, h: 1, ports };
  }
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
  return L.ports.map(({ id, dir, role, accepts, label, cell, face }) => {
    const r = rc[idx(cell)]!;
    return { id, dir, accepts, role, label, tile: { x: r[0] + m.at.x, y: r[1] + m.at.y }, face: rotFace(face, m.rot) };
  });
}

// ───────────── wrapped API ─────────────

export function footprint(m: Machine, ctx: KernelCtx): Tile[] { return soft('footprint', () => F.footprint(m, ctx), () => fbFootprint(m)); }
export function portsOf(m: Machine, ctx: KernelCtx): Port[] { return soft('portsOf', () => F.portsOf(m, ctx), () => fbPorts(m)); }

export function fallbackConfig(kind: MachineKind): MachineConfig {
  const first = { k: 'first' } as const;
  switch (kind) {
    case 'spool': return { kind, t: { k: 'knob', term: null } };
    case 'tower': return { kind, varId: 'v1', label: 'x₁', sort: 'G' };
    case 'rewriter': return { kind, recipe: null, dir: 'fwd', target: first, gap: first, values: {}, tidy: true };
    case 'operator': return { kind, recipe: null };
    case 'joiner': return { kind, recipe: null };
    case 'theorem': return { kind, recipe: null, choice: 0, values: {} };
    case 'forall': return { kind };
    case 'carddock': return { kind, ref: null };
    case 'hopper': return { kind, t: null };
    case 'given': return { kind, givenId: '' };
    case 'socket': return { kind, socketId: '' };
    case 'desk': return { kind, room: '' };
    case 'gate': return { kind, room: '' };
  }
}
export function defaultConfig(kind: MachineKind, ctx: KernelCtx, opts: { schema?: string; mirror?: boolean; canvas?: F.DefaultOpts['canvas'] } = {}): MachineConfig {
  return soft('defaultConfig', () => F.defaultConfig(kind, ctx, opts), () => fallbackConfig(kind));
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
/** Editor route for an OPEN belt preview (from an output, or an open belt's end, to a ground cell), or why not. */
export function tryRouteOpen(c: Canvas, from: Endpoint | { belt: string }, cell: Tile, ctx: KernelCtx): { path: Tile[] } | { reason: string; blockers: string[] } | undefined {
  try { return F.routeOpenOrWhy(c, from, cell, ctx); } catch { return undefined; }
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

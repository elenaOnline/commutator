// Lemma-chain floors: the reference floors of the Book levels that SAVE a lemma and of the levels that REUSE one, built
// through the real store (FactoryStore: place / connect / paintRoom / configure / saveLemma), the way a player builds them.
// Shared by tests/book/lemma-chains.test.ts (node store, save → JSON → reload) and the headless-browser driver
// tests/book/pw-lemma-chains.mjs (window.__lw, after real page reloads). No vitest import: the page loads this file too.
//
// The layouts are the test kits' (lemmas-w123, lemmas-wC, lemmas-w89, lemmas-members, lemmas-w1214 and the P*.test.ts
// reference floors), translated to store calls. A saved lemma is never cited by a test constant: it is looked up in the
// campaign's Lemma Book by its name, checked to be offered by the recipe picker, placed with the bare `{k:'schema', id}`
// recipe the picker arms, and its structure binders (f, H) are then chosen as the reuse lens does (one chip per binder).
import * as F from '../../src/factory';
import type * as K from '../../src/kernel';
import { usableSchemas } from '../../src/factory/catalog';
import { polyConst, polyMul, polyZvar } from '../../src/kernel/poly';
import type { Canvas, Compiled, Edit, Endpoint, MachineConfig, MachineKind, Rect, Room, Rot, Tile } from '../../src/factory/types';
import type { DeskAssumption, LevelManifest } from '../../src/kernel/types';
import type { SavedLemma } from '../../src/state/factoryStore';

/** The slice of FactoryStore a floor needs (window.__lw in the page). */
export interface Editor {
  get(): { canvas: Canvas; compiled: Compiled; ctx: K.KernelCtx; level: LevelManifest };
  camp(): { lemmas: SavedLemma[]; earned: string[] };
  place(kind: MachineKind, at: Tile, opts?: { rot?: Rot; config?: MachineConfig }): Edit;
  connect(from: Endpoint, to: Endpoint, path?: Tile[]): Edit;
  paintRoom(rect: Rect, kind: Room['kind'], l: Room['l'], r: Room['r'], rel?: Room['rel'], assumes?: DeskAssumption[]): Edit;
  configure(id: string, config: MachineConfig): Edit;
}

// ───── terms and configs (compiler.testkit's, without vitest) ─────
export const E: K.Term = { k: 'e' };
export const A = (id: string): K.Term => ({ k: 'atom', id });
export const I = (t: K.Term): K.Term => ({ k: 'inv', arg: t });
export const P = (...fs: K.Term[]): K.Term => { const f = fs.flatMap((x) => (x.k === 'mul' ? x.fs : [x])); return f.length === 1 ? f[0]! : { k: 'mul', fs: f }; };
export const eq = (l: K.Term, r: K.Term): K.Pallet => ({ k: 'eq', l, r });
export const app = (fn: string, ...args: K.Term[]): K.Term => ({ k: 'app', fn, args });
export const eS = (s: string): K.Term => ({ k: 'e', s });
export const pw = (base: K.Term, exp: K.Poly): K.Term => ({ k: 'pow', base, exp });
const Zc = polyConst, Zv = polyZvar;
const knob = (term: K.Term | null): F.Param => ({ k: 'knob', term });
const intKnob = (p: K.Poly): F.Param => ({ k: 'knob', term: { k: 'int', val: p } as K.Term });
type RW = Extract<MachineConfig, { kind: 'rewriter' }>;
type RwOpts = Partial<Omit<RW, 'kind' | 'recipe'>>;
const rw = (recipe: F.RewriteRecipe, o: RwOpts = {}): MachineConfig => ({ kind: 'rewriter', recipe, dir: 'fwd', target: { k: 'first' }, gap: { k: 'first' }, values: {}, tidy: true, ...o } as MachineConfig);
const cancel = (target: F.SpanTarget = { k: 'first' }) => rw({ k: 'cancel' }, { target });
const pop = () => rw({ k: 'pop' });
const insertE = (gap: F.GapTarget = { k: 'first' }) => rw({ k: 'insertE' }, { gap });
const insertPair = (x: K.Term, inv: boolean) => rw({ k: 'insertPair', inv, x: knob(x) });
const sch = (id: string, structs?: Record<string, string>, mirror = false): F.LibRef => ({ k: 'schema', id, ...(mirror ? { mirror: true } : {}), ...(structs ? { structs } : {}) });
const lawRw = (ref: F.LibRef, o: RwOpts = {}) => rw({ k: 'law', ref }, o);
const routed = () => rw({ k: 'routed' });
const op = (recipe: F.OperatorRecipe): MachineConfig => ({ kind: 'operator', recipe });
const mult = (side: 'left' | 'right', t: K.Term) => op({ k: 'multiply', side, t: knob(t) });
const join = (recipe: F.JoinerRecipe): MachineConfig => ({ kind: 'joiner', recipe });
const thm = (ref: F.LibRef | 'routed', choice = 0, values: Record<string, F.Param> = {}): MachineConfig =>
  ({ kind: 'theorem', recipe: ref === 'routed' ? { k: 'routed' } : { k: 'library', ref }, choice, values });
const tower = (varId: string, label: string, carrier?: string): MachineConfig => ({ kind: 'tower', varId, label, sort: 'G', ...(carrier ? { carrier } : {}) } as MachineConfig);
const towerZ = (varId: string, label: string): MachineConfig => ({ kind: 'tower', varId, label, sort: 'Z' } as MachineConfig);
const groupTower = (varId: string, label: string): MachineConfig => ({ kind: 'tower', varId, label, sort: 'G', group: true } as MachineConfig);
const homTower = (varId: string, label: string, dom: string, cod: string): MachineConfig => ({ kind: 'tower', varId, label, sort: 'G', hom: { dom, cod } } as MachineConfig);
const subTower = (varId: string, label: string): MachineConfig => ({ kind: 'tower', varId, label, sort: 'G', sub: 'sub' } as MachineConfig);
const pinSpan = (p: K.Pallet, side: 'l' | 'r', s: number, e: number, path: number[] = []): F.SpanTarget => {
  const pin = F.pinFromAddr(p, { side, path, range: [s, e] });
  if (!pin) throw new Error(`no span ${side}[${s},${e})`);
  return pin;
};
const pinGap = (p: K.Pallet, side: 'l' | 'r', gap: number, path: number[] = []): F.GapTarget => {
  const pin = F.pinFromGap(p, { side, path, gap });
  if (!pin) throw new Error(`no gap ${side}^${gap}`);
  return pin;
};
const x1 = A('x1'), y1 = A('y1');

/** A use of a saved lemma, recorded for the report: which machine, which record, which binder chosen as what. */
export interface LemmaUse { machine: string; lemma: string; id: string; binds: Record<string, string>; chosen: Record<string, string> }
export class ChainError extends Error { constructor(public stage: string, msg: string) { super(`[${stage}] ${msg}`); } }

/** compiler.testkit's Floor, on a store. Same auto-placement, so the kits' unplaced machines land where they do in the tests. */
export class StoreFloor {
  private col = 4;
  uses: LemmaUse[] = [];
  private pending: { machine: string; binds: Record<string, string>; use: LemmaUse }[] = [];
  constructor(public ed: Editor, public offered: (kind: 'rule' | 'theorem', id: string) => boolean = (kind, id) => defaultOffered(ed, kind, id)) {}
  get c() { return this.ed.get().canvas; }
  private ok(e: Edit, what: string) { if (!e.ok) throw new ChainError('build', `${what}: ${e.reason}`); }
  add(config: MachineConfig, at?: Tile): string {
    const before = new Set(this.c.machines.map((m) => m.id));
    this.ok(this.ed.place(config.kind, at ?? { x: (this.col += 4), y: 20 + (this.col % 3) * 4 }, { rot: 0, config }), `place ${config.kind}`);
    return this.c.machines.find((m) => !before.has(m.id))!.id;
  }
  wire(from: string, to: string, port = 'q') { this.ok(this.ed.connect({ m: from, port: 'out' }, { m: to, port }), `wire ${from} → ${to}.${port}`); }
  /** Floor.room: a one-desk Assume room. */
  room(rect: Rect, l: K.Term, r: K.Term) {
    const before = new Set(this.c.rooms.map((x) => x.id));
    this.ok(this.ed.paintRoom(rect, 'assume', l, r), 'paint room');
    const room = this.c.rooms.find((x) => !before.has(x.id))!;
    return { desk: this.deskIds(room.id)[0]!, gate: this.gateOf(room.id) };
  }
  /** lemmas-w89 multiRoom / kit-members memRoom: an Assume room with 1–3 numbered desks. */
  multiRoom(rect: Rect, assumes: DeskAssumption[], first?: K.Term) {
    const before = new Set(this.c.rooms.map((x) => x.id));
    const a0 = assumes[0]! as { l?: K.Term; r?: K.Term };
    this.ok(this.ed.paintRoom(rect, 'assume', first ?? a0.l!, first ?? a0.r!, first ? undefined : 'eq', assumes), 'paint room');
    const room = this.c.rooms.find((x) => !before.has(x.id))!;
    return { desks: this.deskIds(room.id), gate: this.gateOf(room.id) };
  }
  private deskIds(room: string) {
    return this.c.machines.filter((m) => m.config.kind === 'desk' && (m.config as { room?: string }).room === room)
      .sort((p, q) => ((p.config as { slot?: number }).slot ?? 0) - ((q.config as { slot?: number }).slot ?? 0)).map((m) => m.id);
  }
  private gateOf(room: string) { return this.c.machines.find((m) => m.config.kind === 'gate' && (m.config as { room?: string }).room === room)!.id; }
  given(id: string) { return this.c.machines.find((m) => m.config.kind === 'given' && (m.config as { givenId?: string }).givenId === id)!.id; }
  socket(id = 's') { return this.c.machines.find((m) => m.config.kind === 'socket' && (m.config as { socketId?: string }).socketId === id)!.id; }

  /** The Lemma Book record the player saved under this name (verified, in this campaign). */
  record(name: string): SavedLemma {
    const l = this.ed.camp().lemmas.find((x) => x.name === name);
    if (!l) throw new ChainError('load', `no lemma named "${name}" in the Lemma Book (has: ${this.ed.camp().lemmas.map((x) => x.name).join(' | ') || 'nothing'})`);
    if (l.verified === false) throw new ChainError('re-verify', `"${name}" is disabled after reload: ${l.reason}`);
    return l;
  }
  /**
   * Place a machine whose recipe is a saved lemma, as the player does: the picker row (a bare `{k:'schema', id}`), then
   * one reuse-lens chip per structure binder (`binds`: binder display name → symbol), chosen once the machine's inputs arrive.
   */
  lemma(kind: 'rewriter' | 'theorem', name: string, at: Tile | undefined, o: { binds?: Record<string, string>; mirror?: boolean; rw?: RwOpts } = {}): string {
    const l = this.record(name);
    if (!this.offered(kind === 'rewriter' ? 'rule' : 'theorem', l.id)) throw new ChainError('picker', `"${name}" (${l.id}) is not offered by the ${kind} recipe picker on ${this.ed.get().level.id}`);
    const ref = sch(l.id, undefined, o.mirror);
    const id = this.add(kind === 'rewriter' ? lawRw(ref, o.rw) : thm(ref), at);
    const use: LemmaUse = { machine: id, lemma: name, id: l.id, binds: o.binds ?? {}, chosen: {} };
    this.uses.push(use);
    if (o.binds && Object.keys(o.binds).length) this.pending.push({ machine: id, binds: o.binds, use });
    return id;
  }
  /** Choose every pending binder in the reuse lens (compiled.machines[m].structs), the lens's own configure call. Repeats until settled. */
  settle() {
    for (let pass = 0; pass < 12 && this.pending.length; pass++) {
      let moved = false;
      for (const p of [...this.pending]) {
        const plays = this.ed.get().compiled.machines[p.machine]?.structs ?? [];
        const left = Object.entries(p.binds).filter(([b]) => !(b in p.use.chosen));
        for (const [bname, sym] of left) {
          const st = plays.find((x) => x.binder.replace(/^\$\d+:/, '') === bname);
          if (!st) continue;
          if (!st.options.some((o) => o.id === sym)) throw new ChainError('bind', `${p.use.lemma} on ${p.machine}: the lens offers ${bname} ∈ {${st.options.map((o) => o.id).join(', ')}}, not ${sym}`);
          const m = this.c.machines.find((x) => x.id === p.machine)!;
          const c = m.config as MachineConfig & { structs?: Record<string, string> };
          if (c.kind === 'theorem') this.ok(this.ed.configure(m.id, { ...c, structs: { ...(c.structs ?? {}), [st.binder]: sym } } as MachineConfig), 'choose binder');
          else if (c.kind === 'rewriter' && c.recipe?.k === 'law' && c.recipe.ref.k === 'schema') {
            const ref = c.recipe.ref;
            this.ok(this.ed.configure(m.id, { ...c, recipe: { k: 'law', ref: { ...ref, structs: { ...(ref.structs ?? {}), [st.binder]: sym } } } } as MachineConfig), 'choose binder');
          }
          p.use.chosen[bname] = sym;
          moved = true;
        }
        if (Object.keys(p.binds).every((b) => b in p.use.chosen)) this.pending.splice(this.pending.indexOf(p), 1);
      }
      if (!moved) break;
    }
    for (const p of this.pending) {
      const st = this.ed.get().compiled.machines[p.machine]?.status;
      throw new ChainError('bind', `${p.use.lemma} on ${p.machine}: the lens never offered binder(s) ${Object.keys(p.binds).filter((b) => !(b in p.use.chosen)).join(', ')} (status ${st?.k}${st && st.k !== 'ok' ? `: ${(st as { reason?: string }).reason}` : ''})`);
    }
  }
}

export function defaultOffered(ed: Editor, kind: 'rule' | 'theorem', id: string): boolean {
  return usableSchemas(ed.get().ctx).some((s) => s.id === id && (kind === 'rule' ? s.card.k === 'law' : s.card.k === 'cond'));
}

/** What a floor saves: Lemma Book name → the ∀ / gate machine whose card is saved (dock order). */
export type Saves = { name: string; machine: string }[];
type Build = (fl: StoreFloor) => Saves | void;

// The standard names the ceremony saves under (the manifests' lemmaNames, dock order). The chain looks lemmas up by these.
export const N = {
  dbl: 'double inverse', idem: 'the only idempotent is e', commF: 'xy = yx ⟹ xyx⁻¹y⁻¹ = e', commB: 'xyx⁻¹y⁻¹ = e ⟹ xy = yx',
  fe: 'f(e) = e', finv: 'f(x⁻¹) = f(x)⁻¹', neg: 'negative powers',
  refl: 'coset relation is reflexive', symm: 'coset relation is symmetric', trans: 'coset relation is transitive',
  fibF: 'fibre lemma ⟹', fibB: 'fibre lemma ⟸',
};

/** The reference floors. Sources return what they save; consumers cite the saved lemmas by name. */
export const FLOORS: Record<string, Build> = {
  // P4.4 · Undo the Undo (lemmas-w123 buildDoubleInverse)
  'P4.4': (f) => {
    f.add(tower('x1', 'x₁'), { x: 4, y: 30 });
    const sp = f.add({ kind: 'spool', t: knob(P(I(x1), x1)) } as MachineConfig);
    const cn = f.add(cancel());
    const t = f.add(thm(sch('witness')));
    const sw = f.add(op({ k: 'swap' }));
    const all = f.add({ kind: 'forall' } as MachineConfig);
    f.wire(sp, cn); f.wire(cn, t, 'p0'); f.wire(t, sw); f.wire(sw, all); f.wire(all, f.socket());
    return [{ name: N.dbl, machine: all }];
  },
  // P4.7 · Idempotents (buildIdempotent)
  'P4.7': (f) => {
    f.add(tower('x1', 'x₁'), { x: 2, y: 30 });
    const r = f.room({ x: 18, y: 4, w: 26, h: 10 }, P(x1, x1), x1);
    const m = f.add(mult('left', I(x1)), { x: 21, y: 8 });
    const c1 = f.add(cancel(), { x: 27, y: 8 });
    const c2 = f.add(cancel(), { x: 33, y: 8 });
    const all = f.add({ kind: 'forall' } as MachineConfig, { x: 48, y: 20 });
    f.wire(r.desk, m); f.wire(m, c1); f.wire(c1, c2); f.wire(c2, r.gate); f.wire(r.gate, all); f.wire(all, f.socket());
    return [{ name: N.idem, machine: all }];
  },
  // P4.9 · The Commutator (buildCommutator)
  'P4.9': (f) => {
    f.add(tower('x1', 'x₁'), { x: 2, y: 44 });
    f.add(tower('y1', 'y₁'), { x: 4, y: 44 });
    const W = P(x1, y1, I(x1), I(y1));
    const r1 = f.room({ x: 18, y: 4, w: 30, h: 10 }, P(x1, y1), P(y1, x1));
    const sp = f.add({ kind: 'spool', t: knob(W) } as MachineConfig, { x: 20, y: 8 });
    const rr = f.add(routed(), { x: 26, y: 8 });
    const c1 = f.add(cancel(), { x: 32, y: 8 });
    const c2 = f.add(cancel(), { x: 38, y: 8 });
    const all1 = f.add({ kind: 'forall' } as MachineConfig, { x: 54, y: 6 });
    f.wire(sp, rr); f.wire(r1.desk, rr, 'rule'); f.wire(rr, c1); f.wire(c1, c2); f.wire(c2, r1.gate); f.wire(r1.gate, all1); f.wire(all1, f.socket('s'));
    const r2 = f.room({ x: 18, y: 18, w: 40, h: 10 }, W, E);
    const m1 = f.add(mult('right', P(y1, x1)), { x: 21, y: 22 });
    const d1 = f.add(cancel(), { x: 27, y: 22 });
    const d2 = f.add(cancel(), { x: 33, y: 22 });
    const pp = f.add(pop(), { x: 39, y: 22 });
    const all2 = f.add({ kind: 'forall' } as MachineConfig, { x: 60, y: 20 });
    f.wire(r2.desk, m1); f.wire(m1, d1); f.wire(d1, d2); f.wire(d2, pp); f.wire(pp, r2.gate); f.wire(r2.gate, all2); f.wire(all2, f.socket('t'));
    return [{ name: N.commF, machine: all1 }, { name: N.commB, machine: all2 }];
  },
  // P9.3 · e Goes to e (lemmas-wC buildFE, the real manifest)
  'P9.3': (f) => {
    f.add(groupTower('G1', 'G₁'), { x: 2, y: 30 });
    f.add(groupTower('H1', 'H₁'), { x: 4, y: 30 });
    f.add(homTower('f1', 'f₁', 'G1', 'H1'), { x: 6, y: 30 });
    const fE = app('f1', eS('G1'));
    const sp = f.add({ kind: 'spool', t: knob(fE) } as MachineConfig);
    const ee = f.add(insertE(pinGap(eq(fE, fE), 'r', 0, [0])));
    const hm = f.add(lawRw(sch('hom.mul')));
    const sw = f.add(op({ k: 'swap' }));
    const id = f.lemma('theorem', N.idem, undefined);
    const all = f.add({ kind: 'forall' } as MachineConfig);
    f.wire(sp, ee); f.wire(ee, hm); f.wire(hm, sw); f.wire(sw, id, 'p0'); f.wire(id, all); f.wire(all, f.socket());
    return [{ name: N.fe, machine: all }];
  },
  // P9.4 · Inverses Go to Inverses (P9.4.test buildInv)
  'P9.4': (f) => {
    f.add(groupTower('G1', 'G₁'), { x: 2, y: 30 });
    f.add(groupTower('H1', 'H₁'), { x: 4, y: 30 });
    f.add(homTower('f1', 'f₁', 'G1', 'H1'), { x: 6, y: 30 });
    f.add(tower('x1', 'x₁', 'G1'), { x: 8, y: 30 });
    const fx = app('f1', x1), fxi = app('f1', I(x1));
    const sp = f.add({ kind: 'spool', t: knob(P(fx, fxi)) } as MachineConfig);
    const hr = f.add(lawRw(sch('hom.mul'), { dir: 'rev' }));
    const cn = f.add(cancel(pinSpan(eq(P(fx, fxi), app('f1', P(x1, I(x1)))), 'r', 0, 2, [0])));
    const fe = f.lemma('rewriter', N.fe, undefined, { binds: { f: 'f1' } });
    const un = f.add(thm(sch('witness')));
    const all = f.add({ kind: 'forall' } as MachineConfig);
    f.wire(sp, hr); f.wire(hr, cn); f.wire(cn, fe); f.wire(fe, un, 'p0'); f.wire(un, all); f.wire(all, f.socket());
    return [{ name: N.finv, machine: all }];
  },
  // P10.1 · Negative Powers (lemmas-w89 buildNegPower)
  'P10.1': (f) => {
    f.add(tower('x1', 'x₁'), { x: 2, y: 30 });
    f.add(towerZ('n1', 'n₁'), { x: 4, y: 30 });
    const sp = f.add({ kind: 'spool', t: knob(P(pw(x1, Zv('n1')), pw(x1, polyMul(Zc(-1), Zv('n1'))))) } as MachineConfig);
    const r1 = f.add(lawRw(sch('power.add')));
    const r2 = f.add(lawRw(sch('power.zero')));
    const w = f.add(thm(sch('witness')));
    const all = f.add({ kind: 'forall' } as MachineConfig);
    f.wire(sp, r1); f.wire(r1, r2); f.wire(r2, w, 'p0'); f.wire(w, all); f.wire(all, f.socket());
    return [{ name: N.neg, machine: all }];
  },
  // P10.4 · Orders 3 and 5 (P10.4.test)
  'P10.4': (f) => {
    f.add(tower('x1', 'x₁'), { x: 2, y: 30 });
    const { desks, gate } = f.multiRoom({ x: 10, y: 4, w: 60, h: 14 }, [{ rel: 'eq', l: pw(x1, Zc(3)), r: E }, { rel: 'eq', l: pw(x1, Zc(5)), r: E }]);
    const sp = f.add({ kind: 'spool', t: knob(x1) } as MachineConfig, { x: 14, y: 12 });
    const r1 = f.add(lawRw(sch('power.one'), { dir: 'rev' }), { x: 18, y: 12 });
    const r2 = f.add(lawRw(sch('power.add'), { dir: 'rev', values: { m: intKnob(Zc(6)), n: intKnob(Zc(-5)) } }), { x: 22, y: 12 });
    const r3 = f.add(lawRw(sch('power.multiply'), { dir: 'rev', values: { m: intKnob(Zc(3)), n: intKnob(Zc(2)) } }), { x: 26, y: 12 });
    const r4 = f.add(routed(), { x: 30, y: 12 });
    const r5 = f.add(lawRw(sch('power.identity'), { tidy: false }), { x: 34, y: 12 });
    const r6 = f.lemma('rewriter', N.neg, { x: 38, y: 12 });
    const r7 = f.add(routed(), { x: 42, y: 12 });
    const r8 = f.add(cancel(), { x: 46, y: 12 });
    const all = f.add({ kind: 'forall' } as MachineConfig, { x: 74, y: 20 });
    f.wire(sp, r1); f.wire(r1, r2); f.wire(r2, r3); f.wire(r3, r4); f.wire(desks[0]!, r4, 'rule'); f.wire(r4, r5); f.wire(r5, r6);
    f.wire(r6, r7); f.wire(desks[1]!, r7, 'rule'); f.wire(r7, r8); f.wire(r8, gate); f.wire(gate, all); f.wire(all, f.socket());
  },
  // P12.1 · Same Coset (lemmas-members buildSameCoset), double inverse from P4.4
  'P12.1': (f) => {
    const z1 = A('z1');
    const mem = (t: K.Term, sub: string): DeskAssumption => ({ rel: 'mem', t, sub: { k: 'sub', id: sub } } as DeskAssumption);
    f.add(subTower('H1', 'H₁'), { x: 2, y: 62 });
    f.add(tower('x1', 'x₁'), { x: 4, y: 62 }); f.add(tower('y1', 'y₁'), { x: 6, y: 62 }); f.add(tower('z1', 'z₁'), { x: 8, y: 62 });
    const se = f.add(thm(sch('sub.e')), { x: 20, y: 6 });
    const ip = f.add(insertPair(x1, false), { x: 26, y: 6 });
    const pp = f.add(pop(), { x: 32, y: 6 });
    const a1 = f.add({ kind: 'forall' } as MachineConfig, { x: 38, y: 6 });
    f.wire(se, ip); f.wire(ip, pp); f.wire(pp, a1); f.wire(a1, f.socket('s1'));
    const r2 = f.multiRoom({ x: 18, y: 18, w: 34, h: 10 }, [mem(P(x1, I(y1)), 'H1')], x1);
    const iv = f.add(thm(sch('sub.inv')), { x: 21, y: 22 });
    const sk = f.add(lawRw(sch('socks')), { x: 27, y: 22 });
    const di = f.lemma('rewriter', N.dbl, { x: 33, y: 22 });
    const a2 = f.add({ kind: 'forall' } as MachineConfig, { x: 56, y: 22 });
    f.wire(r2.desks[0]!, iv, 'p0'); f.wire(iv, sk); f.wire(sk, di); f.wire(di, r2.gate); f.wire(r2.gate, a2); f.wire(a2, f.socket('s2'));
    const r3 = f.multiRoom({ x: 18, y: 36, w: 34, h: 12 }, [mem(P(x1, I(y1)), 'H1'), mem(P(y1, I(z1)), 'H1')], x1);
    const ml = f.add(thm(sch('sub.mul')), { x: 25, y: 40 });
    const cn = f.add(cancel(), { x: 31, y: 40 });
    const a3 = f.add({ kind: 'forall' } as MachineConfig, { x: 56, y: 40 });
    f.wire(r3.desks[0]!, ml, 'p0'); f.wire(r3.desks[1]!, ml, 'p1'); f.wire(ml, cn); f.wire(cn, r3.gate); f.wire(r3.gate, a3); f.wire(a3, f.socket('s3'));
    return [{ name: N.refl, machine: a1 }, { name: N.symm, machine: a2 }, { name: N.trans, machine: a3 }];
  },
  // P12.s1 · Differ by a Power (P12.s1.test): double inverse (P4.4) and negative powers (P10.1)
  'P12.s1': (f) => {
    const c = A('c'), z1 = A('z1');
    f.add(tower('x1', 'x₁'), { x: 2, y: 50 }); f.add(tower('y1', 'y₁'), { x: 4, y: 50 }); f.add(tower('z1', 'z₁'), { x: 6, y: 50 });
    f.add(towerZ('n1', 'n₁'), { x: 8, y: 50 }); f.add(towerZ('m1', 'm₁'), { x: 10, y: 50 });
    const T = P(x1, I(x1));
    const sp = f.add({ kind: 'spool', t: knob(T) } as MachineConfig, { x: 22, y: 4 });
    const k0 = f.add(cancel(pinSpan(eq(T, T), 'r', 0, 2)), { x: 28, y: 4 });
    const z0 = f.add(lawRw(sch('power.zero'), { dir: 'rev', gap: pinGap(eq(T, E), 'r', 0), values: { x: knob(c) } }), { x: 34, y: 4 });
    const pp = f.add(pop(), { x: 40, y: 4 });
    const al1 = f.add({ kind: 'forall' } as MachineConfig, { x: 46, y: 4 });
    f.wire(sp, k0); f.wire(k0, z0); f.wire(z0, pp); f.wire(pp, al1); f.wire(al1, f.socket('s1'));
    const cn = pw(c, Zv('n1'));
    const r2 = f.room({ x: 22, y: 12, w: 40, h: 10 }, P(x1, I(y1)), cn);
    const inv = f.add(op({ k: 'invert' }), { x: 25, y: 16 });
    const sk = f.add(lawRw(sch('socks')), { x: 31, y: 16 });
    const db = f.lemma('rewriter', N.dbl, { x: 37, y: 16 });
    const ng = f.lemma('rewriter', N.neg, { x: 43, y: 16 }, { rw: { dir: 'rev' } });
    const al2 = f.add({ kind: 'forall' } as MachineConfig, { x: 66, y: 16 });
    f.wire(r2.desk, inv); f.wire(inv, sk); f.wire(sk, db); f.wire(db, ng); f.wire(ng, r2.gate); f.wire(r2.gate, al2); f.wire(al2, f.socket('s2'));
    const r3 = f.multiRoom({ x: 22, y: 28, w: 40, h: 14 }, [{ rel: 'eq', l: P(x1, I(y1)), r: pw(c, Zv('n1')) }, { rel: 'eq', l: P(y1, I(z1)), r: pw(c, Zv('m1')) }]);
    const pr = f.add(join({ k: 'product' }), { x: 26, y: 32 });
    const kk = f.add(cancel(pinSpan(eq(P(x1, I(y1), y1, I(z1)), P(pw(c, Zv('n1')), pw(c, Zv('m1')))), 'l', 1, 3)), { x: 32, y: 32 });
    const ad = f.add(lawRw(sch('power.add')), { x: 38, y: 32 });
    const al3 = f.add({ kind: 'forall' } as MachineConfig, { x: 66, y: 32 });
    f.wire(r3.desks[0]!, pr, 'a'); f.wire(r3.desks[1]!, pr, 'b'); f.wire(pr, kk); f.wire(kk, ad); f.wire(ad, r3.gate); f.wire(r3.gate, al3); f.wire(al3, f.socket('s3'));
  },
  // P13.1 · Cosets Are Equal or Disjoint (P13.1.test): symmetric once, transitive twice, at the level subgroup H
  'P13.1': (f) => {
    const a1 = A('a1'), b1 = A('b1'), h1 = A('h1');
    const mem = (t: K.Term): DeskAssumption => ({ rel: 'mem', t, sub: { k: 'sub', id: 'H' } } as DeskAssumption);
    f.add(tower('x1', 'x₁'), { x: 2, y: 40 }); f.add(tower('a1', 'a₁'), { x: 4, y: 40 }); f.add(tower('b1', 'b₁'), { x: 6, y: 40 }); f.add(tower('h1', 'h₁'), { x: 8, y: 40 });
    const r = f.multiRoom({ x: 18, y: 4, w: 40, h: 14 }, [mem(P(x1, I(a1))), mem(P(x1, I(b1))), mem(P(h1, I(a1)))], x1);
    const sy = f.lemma('theorem', N.symm, { x: 22, y: 6 }, { binds: { H: 'H' } });
    const t1 = f.lemma('theorem', N.trans, { x: 29, y: 10 }, { binds: { H: 'H' } });
    const t2 = f.lemma('theorem', N.trans, { x: 36, y: 10 }, { binds: { H: 'H' } });
    const all = f.add({ kind: 'forall' } as MachineConfig, { x: 62, y: 10 });
    f.wire(r.desks[0]!, sy, 'p0'); f.wire(r.desks[2]!, t1, 'p0'); f.wire(sy, t1, 'p1'); f.wire(t1, t2, 'p0'); f.wire(r.desks[1]!, t2, 'p1');
    f.wire(t2, r.gate); f.wire(r.gate, all); f.wire(all, f.socket());
  },
  // P14.1 · The Kernel (P14.1.test): your f(x⁻¹) = f(x)⁻¹ and f(e) = e at the Tower hom f₁
  'P14.1': (f) => {
    f.add(groupTower('G1', 'G₁'), { x: 2, y: 60 }); f.add(groupTower('K1', 'K₁'), { x: 4, y: 60 });
    f.add(homTower('f1', 'f₁', 'G1', 'K1'), { x: 6, y: 60 });
    f.add(tower('x1', 'x₁', 'G1'), { x: 8, y: 60 }); f.add(tower('y1', 'y₁', 'G1'), { x: 10, y: 60 }); f.add(tower('g1', 'g₁', 'G1'), { x: 12, y: 60 });
    const X = x1, Y = y1, G = A('g1');
    const fx = (t: K.Term) => app('f1', t), e1 = eS('K1');
    const r1 = f.multiRoom({ x: 18, y: 4, w: 40, h: 10 }, [{ rel: 'eq', l: fx(X), r: e1 }, { rel: 'eq', l: fx(Y), r: e1 }]);
    const sp1 = f.add({ kind: 'spool', t: knob(fx(P(X, Y))) } as MachineConfig, { x: 20, y: 8 });
    const h1 = f.add(lawRw(sch('hom.mul'), { target: pinSpan(eq(fx(P(X, Y)), fx(P(X, Y))), 'r', 0, 1) }), { x: 25, y: 8 });
    const d1 = f.add(routed(), { x: 30, y: 8 });
    const d2 = f.add(routed(), { x: 35, y: 8 });
    const all1 = f.add({ kind: 'forall' } as MachineConfig, { x: 62, y: 6 });
    f.wire(sp1, h1); f.wire(h1, d1); f.wire(r1.desks[0]!, d1, 'rule'); f.wire(d1, d2); f.wire(r1.desks[1]!, d2, 'rule'); f.wire(d2, r1.gate); f.wire(r1.gate, all1); f.wire(all1, f.socket('prod'));
    const r2 = f.multiRoom({ x: 18, y: 18, w: 40, h: 10 }, [{ rel: 'eq', l: fx(X), r: e1 }]);
    const sp2 = f.add({ kind: 'spool', t: knob(fx(I(X))) } as MachineConfig, { x: 20, y: 22 });
    const v1 = f.lemma('rewriter', N.finv, { x: 25, y: 22 }, { binds: { f: 'f1' }, rw: { target: pinSpan(eq(fx(I(X)), fx(I(X))), 'r', 0, 1) } });
    const v2 = f.add(routed(), { x: 30, y: 22 });
    const v3 = f.add(insertE(), { x: 35, y: 22 });
    const v4 = f.add(cancel(), { x: 40, y: 22 });
    const all2 = f.add({ kind: 'forall' } as MachineConfig, { x: 62, y: 20 });
    f.wire(sp2, v1); f.wire(v1, v2); f.wire(r2.desks[0]!, v2, 'rule'); f.wire(v2, v3); f.wire(v3, v4); f.wire(v4, r2.gate); f.wire(r2.gate, all2); f.wire(all2, f.socket('inv'));
    const r3 = f.multiRoom({ x: 18, y: 32, w: 44, h: 10 }, [{ rel: 'eq', l: fx(X), r: e1 }]);
    const W = fx(P(G, X, I(G)));
    const sp3 = f.add({ kind: 'spool', t: knob(W) } as MachineConfig, { x: 20, y: 36 });
    const c1 = f.add(lawRw(sch('hom.mul'), { target: pinSpan(eq(W, W), 'r', 0, 1), values: { x: knob(G), y: knob(P(X, I(G))) } }), { x: 24, y: 36 });
    const c2 = f.add(lawRw(sch('hom.mul')), { x: 28, y: 36 });
    const c3 = f.add(routed(), { x: 32, y: 36 });
    const c4 = f.add(lawRw(sch('hom.mul'), { dir: 'rev' }), { x: 36, y: 36 });
    const c5 = f.add(cancel(), { x: 40, y: 36 });
    const c6 = f.lemma('rewriter', N.fe, { x: 44, y: 36 }, { binds: { f: 'f1' } });
    const all3 = f.add({ kind: 'forall' } as MachineConfig, { x: 66, y: 34 });
    f.wire(sp3, c1); f.wire(c1, c2); f.wire(c2, c3); f.wire(r3.desks[0]!, c3, 'rule'); f.wire(c3, c4); f.wire(c4, c5); f.wire(c5, c6); f.wire(c6, r3.gate); f.wire(r3.gate, all3); f.wire(all3, f.socket('conj'));
  },
  // P14.2 · Trivial Kernel (P14.2.test): your f(x⁻¹) = f(x)⁻¹ at the level hom f
  'P14.2': (f) => {
    const a = A('a'), b = A('b');
    const W = app('f', P(a, I(b)));
    const sp = f.add({ kind: 'spool', t: knob(W) } as MachineConfig, { x: 10, y: 6 });
    const h1 = f.add(lawRw(sch('hom.mul'), { target: pinSpan(eq(W, W), 'r', 0, 1) }), { x: 14, y: 6 });
    const h2 = f.lemma('rewriter', N.finv, { x: 18, y: 6 }, { binds: { f: 'f' } });
    const h3 = f.add(lawRw({ k: 'given', givenId: 'h' }), { x: 22, y: 6 });
    const h4 = f.add(cancel(), { x: 26, y: 6 });
    const t = f.add(thm({ k: 'given', givenId: 'T' }), { x: 30, y: 6 });
    const m = f.add(mult('right', b), { x: 34, y: 6 });
    const c = f.add(cancel(), { x: 38, y: 6 });
    const pp = f.add(pop(), { x: 42, y: 6 });
    f.wire(sp, h1); f.wire(h1, h2); f.wire(h2, h3); f.wire(h3, h4); f.wire(h4, t, 'p0'); f.wire(t, m); f.wire(m, c); f.wire(c, pp); f.wire(pp, f.socket());
  },
  // P14.4 · Normal Subgroups That Meet at e (P14.4.test): your commutator ⟸
  'P14.4': (f) => {
    const a = A('a'), b = A('b');
    const n1 = f.add(thm(sch('sub.conj', { N: 'N' }), 0, { g: knob(a) }), { x: 10, y: 6 });
    const n2 = f.add(thm(sch('sub.inv', { H: 'N' })), { x: 10, y: 12 });
    const n3 = f.add(thm(sch('sub.mul', { H: 'N' })), { x: 16, y: 9 });
    const m1 = f.add(thm(sch('sub.inv', { H: 'M' })), { x: 10, y: 20 });
    const m2 = f.add(thm(sch('sub.conj', { N: 'M' }), 0, { g: knob(b) }), { x: 14, y: 20 });
    const m3 = f.add(thm(sch('sub.mul', { H: 'M' })), { x: 18, y: 18 });
    const i1 = f.add(thm({ k: 'given', givenId: 'I' }), { x: 24, y: 12 });
    const c = f.lemma('theorem', N.commB, { x: 30, y: 12 });
    f.wire(f.given('hb'), n1, 'p0'); f.wire(f.given('hb'), n2, 'p0'); f.wire(n1, n3, 'p0'); f.wire(n2, n3, 'p1');
    f.wire(f.given('ha'), m1, 'p0'); f.wire(m1, m2, 'p0'); f.wire(f.given('ha'), m3, 'p0'); f.wire(m2, m3, 'p1');
    f.wire(m3, i1, 'p0'); f.wire(n3, i1, 'p1'); f.wire(i1, c, 'p0'); f.wire(c, f.socket());
  },
  // P15.2 · An Abelian Quotient (P15.2.test): your f(x⁻¹) = f(x)⁻¹ at π twice, your commutator ⟸ in Q
  'P15.2': (f) => {
    f.add(tower('x1', 'x₁'), { x: 2, y: 40 }); f.add(tower('y1', 'y₁'), { x: 4, y: 40 });
    const W = app('pi', P(x1, y1, I(x1), I(y1)));
    const sp = f.add({ kind: 'spool', t: knob(W) } as MachineConfig, { x: 10, y: 6 });
    const d = f.add(lawRw({ k: 'given', givenId: 'D' }, { target: pinSpan(eq(W, W), 'r', 0, 1) }), { x: 14, y: 6 });
    const h1 = f.add(lawRw(sch('hom.mul')), { x: 18, y: 6 });
    const h2 = f.add(lawRw(sch('hom.mul')), { x: 22, y: 6 });
    const h3 = f.add(lawRw(sch('hom.mul')), { x: 26, y: 6 });
    const v1 = f.lemma('rewriter', N.finv, { x: 30, y: 6 }, { binds: { f: 'pi' } });
    const v2 = f.lemma('rewriter', N.finv, { x: 34, y: 6 }, { binds: { f: 'pi' } });
    const c = f.lemma('theorem', N.commB, { x: 38, y: 6 });
    const all = f.add({ kind: 'forall' } as MachineConfig, { x: 42, y: 6 });
    f.wire(sp, d); f.wire(d, h1); f.wire(h1, h2); f.wire(h2, h3); f.wire(h3, v1); f.wire(v1, v2); f.wire(v2, c, 'p0'); f.wire(c, all); f.wire(all, f.socket());
  },
  // P15.3 · Commutators in the Kernel (P15.3.test): your commutator ⟹ in Q, your f(x⁻¹) = f(x)⁻¹ at π backwards twice
  'P15.3': (f) => {
    f.add(tower('x1', 'x₁'), { x: 2, y: 40 }); f.add(tower('y1', 'y₁'), { x: 4, y: 40 });
    const W = P(app('pi', x1), app('pi', y1));
    const sp = f.add({ kind: 'spool', t: knob(W) } as MachineConfig, { x: 10, y: 6 });
    const a = f.add(lawRw({ k: 'given', givenId: 'A' }, { target: pinSpan(eq(W, W), 'r', 0, 2) }), { x: 14, y: 6 });
    const c = f.lemma('theorem', N.commF, { x: 18, y: 6 });
    const v1 = f.lemma('rewriter', N.finv, { x: 22, y: 6 }, { binds: { f: 'pi' }, rw: { dir: 'rev' } });
    const v2 = f.lemma('rewriter', N.finv, { x: 26, y: 6 }, { binds: { f: 'pi' }, rw: { dir: 'rev' } });
    const h1 = f.add(lawRw(sch('hom.mul'), { dir: 'rev' }), { x: 30, y: 6 });
    const h2 = f.add(lawRw(sch('hom.mul'), { dir: 'rev' }), { x: 34, y: 6 });
    const h3 = f.add(lawRw(sch('hom.mul'), { dir: 'rev' }), { x: 38, y: 6 });
    const all = f.add({ kind: 'forall' } as MachineConfig, { x: 42, y: 6 });
    f.wire(sp, a); f.wire(a, c, 'p0'); f.wire(c, v1); f.wire(v1, v2); f.wire(v2, h1); f.wire(h1, h2); f.wire(h2, h3); f.wire(h3, all); f.wire(all, f.socket());
  },
  // P16.1 · Fibres Are Cosets (lemmas-w1214 buildFibre): your f(x⁻¹) = f(x)⁻¹ at f₁, both directions
  'P16.1': (f) => {
    f.add(groupTower('G1', 'G₁'), { x: 2, y: 40 }); f.add(groupTower('K1', 'K₁'), { x: 4, y: 40 });
    f.add(homTower('f1', 'f₁', 'G1', 'K1'), { x: 6, y: 40 });
    f.add(tower('a1', 'a₁', 'G1'), { x: 8, y: 40 }); f.add(tower('b1', 'b₁', 'G1'), { x: 10, y: 40 });
    const a = A('a1'), b = A('b1');
    const fx = (t: K.Term) => app('f1', t);
    const W = fx(P(a, I(b)));
    const r1 = f.multiRoom({ x: 14, y: 4, w: 36, h: 10 }, [{ rel: 'eq', l: fx(a), r: fx(b) }]);
    const sp = f.add({ kind: 'spool', t: knob(W) } as MachineConfig, { x: 16, y: 8 });
    const h1 = f.add(lawRw(sch('hom.mul'), { target: pinSpan(eq(W, W), 'r', 0, 1) }), { x: 20, y: 8 });
    const v1 = f.lemma('rewriter', N.finv, { x: 24, y: 8 }, { binds: { f: 'f1' } });
    const d1 = f.add(routed(), { x: 28, y: 8 });
    const c1 = f.add(cancel(), { x: 32, y: 8 });
    const all1 = f.add({ kind: 'forall' } as MachineConfig, { x: 54, y: 6 });
    f.wire(sp, h1); f.wire(h1, v1); f.wire(v1, d1); f.wire(r1.desks[0]!, d1, 'rule'); f.wire(d1, c1); f.wire(c1, r1.gate); f.wire(r1.gate, all1); f.wire(all1, f.socket('fwd'));
    const r2 = f.multiRoom({ x: 14, y: 18, w: 36, h: 10 }, [{ rel: 'eq', l: W, r: eS('K1') }]);
    const h2 = f.add(lawRw(sch('hom.mul')), { x: 16, y: 22 });
    const v2 = f.lemma('rewriter', N.finv, { x: 20, y: 22 }, { binds: { f: 'f1' } });
    const m2 = f.add(mult('right', fx(b)), { x: 24, y: 22 });
    const c2 = f.add(cancel(), { x: 28, y: 22 });
    const p2 = f.add(pop(), { x: 32, y: 22 });
    const all2 = f.add({ kind: 'forall' } as MachineConfig, { x: 54, y: 20 });
    f.wire(r2.desks[0]!, h2); f.wire(h2, v2); f.wire(v2, m2); f.wire(m2, c2); f.wire(c2, p2); f.wire(p2, r2.gate); f.wire(r2.gate, all2); f.wire(all2, f.socket('bwd'));
    return [{ name: N.fibF, machine: all1 }, { name: N.fibB, machine: all2 }];
  },
  // P16.2 · The Fundamental Theorem (P16.2.test floorP162): your fibre lemmas at π and at f, in opposite directions
  'P16.2': (f) => {
    f.add(tower('a1', 'a₁'), { x: 2, y: 40 }); f.add(tower('b1', 'b₁'), { x: 4, y: 40 });
    const a = A('a1'), b = A('b1');
    const side = (outer: string, inner: string, kernel: string, y: number, socket: string) => {
      const r = f.multiRoom({ x: 18, y, w: 30, h: 10 }, [{ rel: 'eq', l: app(outer, a), r: app(outer, b) }]);
      const t1 = f.lemma('theorem', N.fibF, { x: 21, y: y + 4 }, { binds: { f: outer } });
      const t2 = f.add(thm({ k: 'given', givenId: kernel }), { x: 27, y: y + 4 });
      const t3 = f.lemma('theorem', N.fibB, { x: 33, y: y + 4 }, { binds: { f: inner } });
      const all = f.add({ kind: 'forall' } as MachineConfig, { x: 52, y: y + 2 });
      f.wire(r.desks[0]!, t1, 'p0'); f.wire(t1, t2, 'p0'); f.wire(t2, t3, 'p0'); f.wire(t3, r.gate); f.wire(r.gate, all); f.wire(all, f.socket(socket));
    };
    side('pi', 'f', 'K2', 4, 'wd');
    side('f', 'pi', 'K1', 18, 'inj');
  },
};

/** The chains (source → consumers), in campaign order. */
export const CHAINS: { name: string; levels: string[] }[] = [
  { name: 'P4.7 idempotent → P9.3 f(e) = e → P9.4 f(x⁻¹) = f(x)⁻¹ → P14.1, P14.2, P15.2, P15.3', levels: ['P4.7', 'P9.3', 'P9.4', 'P14.1', 'P14.2', 'P15.2', 'P15.3'] },
  { name: 'P4.9 commutator ⟹/⟸ → P14.4, P15.2, P15.3', levels: ['P4.9', 'P14.4', 'P15.2', 'P15.3'] },
  { name: 'P12.1 coset refl/symm/trans → P13.1', levels: ['P12.1', 'P13.1'] },
  { name: 'P16.1 fibre ⟹/⟸ → P16.2', levels: ['P16.1', 'P16.2'] },
  { name: 'P10.1 negative power → P10.4, P12.s1', levels: ['P10.1', 'P10.4', 'P12.s1'] },
  { name: 'P4.4 double inverse → P12.1', levels: ['P4.4', 'P12.1'] },
];
/** Every level of every chain, in campaign play order: one Book save plays them all (each source before its consumers). */
export const PLAY_ORDER = ['P4.4', 'P4.7', 'P4.9', 'P9.3', 'P9.4', 'P10.1', 'P10.4', 'P12.1', 'P12.s1', 'P13.1', 'P14.1', 'P14.2', 'P14.4', 'P15.2', 'P15.3', 'P16.1', 'P16.2'];

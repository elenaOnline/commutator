// COMMUTATOR v4 — machine catalogue (owner: EDITOR builder).
// Four verbs with recipes (Rewriter · Operator · Joiner · Theorem), sources (Spool, Card Dock, Hopper),
// Tower (declares x₁ ∈ G) and ∀ (Generalizer). Decisions: design/v4/DESIGN.md §1–§2.
import type { KernelCtx } from '../kernel';
import { mirrorCard, pressCard, powerSchema, sameCardUpToRenaming, POWER_SCHEMAS, POWER_LITERAL_FAMILY } from '../kernel';
import type { Card, Schema } from '../kernel/types';
import type { LibRef, MachineConfig, MachineKind, MachineSpec } from './types';

const spec = (s: MachineSpec): MachineSpec => s;

/**
 * Hotbar machine slots in order (the HUD adds Select, Belt before and Room (G), All after):
 * Spool 1 · Rewriter 2 · Operator 3 · Joiner 4 · Theorem 5 · Tower 6 · ∀ 7.
 */
export const HOTBAR: MachineKind[] = ['spool', 'rewriter', 'operator', 'joiner', 'theorem', 'tower', 'forall'];

/** Everything else the player can place (the All drawer). */
export const DRAWER: MachineKind[] = ['carddock', 'hopper'];

export const SPECS: Record<MachineKind, MachineSpec> = {
  spool: spec({ kind: 'spool', name: 'Spool', family: 'equation', glyph: 't=t', hotkey: '1', placeable: true,
    blurb: 'reflexivity: from a term t, emit t = t' }),
  rewriter: spec({ kind: 'rewriter', name: 'Rewriter', family: 'given', glyph: 'L→R', hotkey: '2', placeable: true,
    blurb: 'rewrite at a bracket by a recipe: cancel, pop e, insert e or a pair, a library law, or a routed fact' }),
  operator: spec({ kind: 'operator', name: 'Operator', family: 'structure', glyph: 't·', hotkey: '3', placeable: true,
    blurb: 'act on the whole equation: L = R ⟹ tL = tR, Lt = Rt, L⁻¹ = R⁻¹, or R = L' }),
  joiner: spec({ kind: 'joiner', name: 'Joiner', family: 'equation', glyph: '⋈', hotkey: '4', placeable: true,
    blurb: 'combine two facts: X = M, Y = M ⟹ X = Y · A = B, C = D ⟹ AC = BD · P, ¬P ⟹ ⊥' }),
  theorem: spec({ kind: 'theorem', name: 'Theorem', family: 'lemma', glyph: '⟹', hotkey: '5', placeable: true,
    blurb: 'premises at σ ⟹ the conclusion at σ, by a library theorem or a routed card' }),
  tower: spec({ kind: 'tower', name: 'Tower', family: 'scope', glyph: '∈G', hotkey: '6', placeable: true,
    blurb: 'Let x₁ ∈ G: declare an arbitrary element, broadcast to the whole floor' }),
  forall: spec({ kind: 'forall', name: 'Generalizer', family: 'lemma', glyph: '∀', hotkey: '7', placeable: true,
    blurb: '∀-introduction: a fact about tower variables ⟹ the law or theorem for every element' }),
  carddock: spec({ kind: 'carddock', name: 'Card Dock', family: 'lemma', glyph: '∀=', placeable: true,
    blurb: 'put a library card (a law or theorem) onto a belt' }),
  hopper: spec({ kind: 'hopper', name: 'Hopper', family: 'structure', glyph: 't', placeable: true,
    blurb: 'emit a fixed term t (syntax only, no claim)' }),
  given: spec({ kind: 'given', name: 'Given Inlet', family: 'given', glyph: 'h', placeable: false,
    blurb: 'a hypothesis of this order, supplied as stated' }),
  socket: spec({ kind: 'socket', name: 'Receiving Dock', family: 'equation', glyph: '∎', placeable: false,
    blurb: 'accepts the order’s target statement (either orientation; laws up to renaming)' }),
  desk: spec({ kind: 'desk', name: 'Assumption Desk', family: 'scope', glyph: '⊢', placeable: false,
    blurb: 'inside a room: emit the room’s assumption' }),
  gate: spec({ kind: 'gate', name: 'Exit Gate', family: 'scope', glyph: '⊣', placeable: false,
    blurb: 'discharge the room: ⊥ ⟹ ¬P (suppose), ⊥ ⟹ P (classical), Q ⟹ (P ⇒ Q) (assume)' }),
};

// ───────────────────────────── library ─────────────────────────────

/** Registry schemas usable in this order (level.tools.schemas), in registry order. */
export function usableSchemas(ctx: KernelCtx, k?: 'law' | 'cond'): Schema[] {
  const allowed = new Set(ctx.level.tools.schemas);
  return Object.values(ctx.registry).filter((s) => allowed.has(s.id) && (!k || s.card.k === k));
}

/**
 * A schema by id: the game registry, else a kernel-owned IMPORTED power law ('power.add', …,
 * 'power.literal:<r>'). The bare family id 'power.literal' has no card until r is chosen (null).
 */
export function schemaOf(ctx: KernelCtx, id: string): Schema | null {
  if (ctx.registry[id]) return ctx.registry[id]!;
  if (!id.startsWith('power.') || id === POWER_LITERAL_FAMILY) return null;
  try { return powerSchema(id); } catch { return null; }
}

/** Display name for a schema (mirror gets ᵒᵖ); the literal family reads 'Literal Power (choose r)'. */
export function schemaMachineName(ctx: KernelCtx, schema: string, mirror?: boolean): string {
  if (schema === POWER_LITERAL_FAMILY) return 'Literal Power (choose r)';
  const s = schemaOf(ctx, schema);
  if (!s) return schema || 'Unknown theorem';
  return mirror ? `${s.name} ᵒᵖ` : s.name;
}

/** Number of premises of a registry schema's card (0 for a law or unknown schema). */
export function schemaPremises(ctx: KernelCtx, schema: string): number {
  const c = schemaOf(ctx, schema)?.card;
  return c && c.k === 'cond' ? c.premises.length : 0;
}

/**
 * The card a library reference stands for, when it is a card (laws and conditionals). Ground given facts
 * (eq/neq used as rules) return null here; `libFact` returns them. Mirrors are left to the compiler/kernel.
 */
export function libCard(ctx: KernelCtx, ref: LibRef | null | undefined): Card | null {
  if (!ref) return null;
  switch (ref.k) {
    case 'schema': return schemaOf(ctx, ref.id)?.card ?? null;
    case 'given': { const f = ctx.level.givens.find((g) => g.id === ref.givenId)?.fact; return f && (f.k === 'law' || f.k === 'cond') ? f : null; }
    case 'lagrange': { const s = ctx.level.givens.find((g) => g.fact.k === 'size')?.fact; return s && s.k === 'size' ? pressCard(s.n) : null; }
    case 'axiom': return null;
  }
}

/** Premise count of a library card (0 for laws, ground facts, axioms). */
export function libPremises(ctx: KernelCtx, ref: LibRef | null | undefined): number {
  const c = libCard(ctx, ref);
  return c && c.k === 'cond' ? c.premises.length : 0;
}

/** Short display name of a library reference, e.g. 'Witness Stamp ᵒᵖ', 'h', 'Lagrange (imported)', 'x⁻¹x = e'. */
export function libName(ctx: KernelCtx, ref: LibRef | null | undefined): string {
  if (!ref) return 'no recipe';
  switch (ref.k) {
    case 'schema': return schemaMachineName(ctx, ref.id, ref.mirror);
    case 'given': return ctx.level.givens.find((g) => g.id === ref.givenId)?.name ?? ref.givenId;
    case 'lagrange': return 'Lagrange (imported)';
    case 'axiom': return { unitL: 'e x = x', unitR: 'x e = x', invL: 'x⁻¹x = e', invR: 'x x⁻¹ = e' }[ref.id];
  }
}

/** A mirror (ᵒᵖ) is worth listing only when it says something different (up to renaming of metas). */
export function hasDistinctMirror(card: Card): boolean {
  try { return !sameCardUpToRenaming(mirrorCard(card), card); } catch { return true; }
}

/**
 * Library entries a recipe picker may list. kind 'rule' = anything a Rewriter can cite (axioms, laws, ground
 * givens as rules, Lagrange); kind 'theorem' = conditional cards for a Theorem machine; kind 'card' = any card
 * a Card Dock may emit. Mirrors are listed for mirrorable schemas. Order: givens, earned/authored, imported.
 */
export function libraryRefs(ctx: KernelCtx, kind: 'rule' | 'theorem' | 'card'): LibRef[] {
  const out: LibRef[] = [];
  for (const g of ctx.level.givens) {
    const k = g.fact.k;
    if (kind === 'rule' && (k === 'eq' || k === 'law')) out.push({ k: 'given', givenId: g.id });
    if (kind === 'theorem' && k === 'cond') out.push({ k: 'given', givenId: g.id });
    if (kind === 'card' && (k === 'law' || k === 'cond')) out.push({ k: 'given', givenId: g.id });
  }
  for (const s of usableSchemas(ctx)) {
    const k = s.card.k;
    const want = kind === 'card' || (kind === 'rule' ? k === 'law' : k === 'cond');
    if (!want) continue;
    out.push({ k: 'schema', id: s.id });
    if (s.mirrorable && hasDistinctMirror(s.card)) out.push({ k: 'schema', id: s.id, mirror: true });
  }
  if ((kind === 'rule' || kind === 'card') && ctx.level.givens.some((g) => g.fact.k === 'size')) out.push({ k: 'lagrange' });
  // Imported power laws the order lists (all laws); 'power.literal' is one family entry with an r knob —
  // the lens sets ref.id = 'power.literal:<r>' once r is chosen.
  if (kind === 'rule' || kind === 'card') {
    const listed = new Set(out.map((r) => (r.k === 'schema' ? r.id : '')));
    for (const id of Object.keys(POWER_SCHEMAS)) if (ctx.level.tools.schemas.includes(id) && !listed.has(id)) out.push({ k: 'schema', id });
    if (ctx.level.tools.schemas.includes(POWER_LITERAL_FAMILY)) out.push({ k: 'schema', id: POWER_LITERAL_FAMILY });
  }
  return out;
}

// ───────────────────────────── towers ─────────────────────────────

const SUBS = '₀₁₂₃₄₅₆₇₈₉';
export const subscript = (n: number): string => String(n).split('').map((d) => SUBS[+d]).join('');
/** 'x₁₂' → { base: 'x', n: 12 }; a label without a subscript has n = 0. */
export function splitLabel(label: string): { base: string; n: number } {
  let i = label.length;
  while (i > 0 && SUBS.includes(label[i - 1]!)) i--;
  const digits = label.slice(i).split('').map((ch) => SUBS.indexOf(ch)).join('');
  return { base: label.slice(0, i) || 'x', n: digits ? Number(digits) : 0 };
}

/** Default tower names, in order: G x₁ y₁ z₁ w₁ x₂ …; ℤ n₁ k₁ m₁ n₂ …. */
export const SORT_SEQ: Record<'G' | 'Z', string[]> = { G: ['x', 'y', 'z', 'w'], Z: ['n', 'k', 'm'] };
/** The display label a variable id stands for ('x1' → 'x₁'), e.g. for the orphan jam when its Tower is gone. */
export function varLabel(varId: string): string {
  const mm = /^(\D+)(\d+)$/.exec(varId);
  return mm ? `${mm[1]}${subscript(Number(mm[2]))}` : varId;
}
/** Letters by sort: element towers read x, y, z, w, u, v; integer towers n, k, m, j, i. */
export const SORT_BASES: Record<'G' | 'Z', string[]> = { G: ['x', 'y', 'z', 'w', 'u', 'v'], Z: ['n', 'k', 'm', 'j', 'i'] };
/** The base letter a tower of this sort should use, keeping the player's letter when it fits the sort. */
export function sortBase(label: string, sort: 'G' | 'Z'): string {
  const { base } = splitLabel(label);
  const other = SORT_BASES[sort === 'G' ? 'Z' : 'G'];
  return other.includes(base) ? SORT_BASES[sort][0]! : base;
}

// ───────────────────────────── default configs ─────────────────────────────

export interface DefaultOpts {
  /** Tower sort: 'G' elements (x₁, y₁ …) or 'Z' integers (n₁, k₁ …). */
  sort?: 'G' | 'Z';
  schema?: string;
  mirror?: boolean;
  /** Preset recipe for the verb machines (hotbar presets); must match the kind. */
  recipe?: unknown;
  /** Preset library ref for a Card Dock / Theorem. */
  ref?: LibRef;
}

/**
 * Default configuration for a newly placed machine. Verb machines start with recipe null (the lens opens on
 * placement) unless a preset is given. A Tower defaults to x₁ / varId 'x1'; place() renumbers it to be unique
 * on the floor (x₂, x₃, …).
 */
export function defaultConfig(kind: MachineKind, ctx: KernelCtx, opts?: DefaultOpts): MachineConfig {
  const schemaRef = (): LibRef | null => {
    if (opts?.ref) return opts.ref;
    if (opts?.schema === undefined) return null;
    const s = ctx.registry[opts.schema];
    return { k: 'schema', id: opts.schema, ...(opts.mirror && s?.mirrorable ? { mirror: true } : {}) };
  };
  switch (kind) {
    case 'spool': return { kind, t: { k: 'knob', term: null } };
    case 'tower': return opts?.sort === 'Z' ? { kind, varId: 'n1', label: 'n₁', sort: 'Z' } : { kind, varId: 'x1', label: 'x₁', sort: 'G' };
    case 'rewriter': return {
      kind, recipe: (opts?.recipe as never) ?? null, dir: 'fwd', target: { k: 'first' }, gap: { k: 'first' }, values: {}, tidy: true,
    };
    case 'operator': return { kind, recipe: (opts?.recipe as never) ?? null };
    case 'joiner': return { kind, recipe: (opts?.recipe as never) ?? null };
    case 'theorem': {
      const ref = schemaRef();
      return { kind, recipe: (opts?.recipe as never) ?? (ref ? { k: 'library', ref } : null), choice: 0, values: {} };
    }
    case 'forall': return { kind };
    case 'carddock': return { kind, ref: schemaRef() };
    case 'hopper': return { kind, t: null };
    case 'given': return { kind, givenId: '' };
    case 'socket': return { kind, socketId: '' };
    case 'desk': return { kind, room: '' };
    case 'gate': return { kind, room: '' };
  }
}

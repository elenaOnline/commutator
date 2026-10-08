// LEMMA WORKS v3 — machine catalogue (owner: EDITOR builder).
// Static specs per MachineKind + default configurations. Decisions: design/v3/DESIGN.md.
import type { KernelCtx } from '../kernel';
import type { Schema } from '../kernel/types';
import type { MachineConfig, MachineKind, MachineSpec } from './types';

const spec = (s: MachineSpec): MachineSpec => s;

/** Hotbar order (DESIGN.md catalogue table). */
export const HOTBAR: MachineKind[] = [
  'spool', 'canceller', 'expander', 'popper', 'rewriter', 'multiplier', 'swapper', 'meet', 'apply', 'anvil',
];

/** Everything else the player can place (the all-machines drawer), after the hotbar. */
export const DRAWER: MachineKind[] = ['press', 'hopper', 'joiner', 'inverter', 'stamp', 'carddock'];

export const SPECS: Record<MachineKind, MachineSpec> = {
  spool: spec({ kind: 'spool', name: 'Spool', family: 'equation', glyph: 't=t', hotkey: '1', placeable: true,
    blurb: 'reflexivity: from a term t, emit t = t' }),
  canceller: spec({ kind: 'canceller', name: 'Canceller', family: 'inverse', glyph: 'xx⁻¹', hotkey: '2', placeable: true,
    blurb: 'x x⁻¹ → e or x⁻¹x → e at the bracket, then tidy the e away' }),
  expander: spec({ kind: 'expander', name: 'Expander', family: 'identity', glyph: '+e', hotkey: '3', placeable: true,
    blurb: 'at a gap insert e, x x⁻¹, x⁻¹x, or the word of a rule equal to e' }),
  popper: spec({ kind: 'popper', name: 'Popper', family: 'identity', glyph: 'e·', hotkey: '4', placeable: true,
    blurb: 'e x → x or x e → x at the bracketed e' }),
  rewriter: spec({ kind: 'rewriter', name: 'Rewriter', family: 'given', glyph: 'L→R', hotkey: '5', placeable: true,
    blurb: 'replace an instance of one side of a routed rule by the other side' }),
  multiplier: spec({ kind: 'multiplier', name: 'Multiplier', family: 'structure', glyph: 't·', hotkey: '6', placeable: true,
    blurb: 'L = R ⟹ tL = tR (or Lt = Rt)' }),
  swapper: spec({ kind: 'swapper', name: 'Swapper', family: 'equation', glyph: '⇄', hotkey: '7', placeable: true,
    blurb: 'symmetry: L = R ⟹ R = L, and L ≠ R ⟹ R ≠ L' }),
  meet: spec({ kind: 'meet', name: 'Meet', family: 'equation', glyph: '⋈', hotkey: '8', placeable: true,
    blurb: 'X = M and Y = M ⟹ X = Y' }),
  apply: spec({ kind: 'apply', name: 'Apply', family: 'lemma', glyph: '∀', hotkey: '9', placeable: true,
    blurb: 'instantiate a routed card: premises at σ ⟹ its conclusion at σ' }),
  anvil: spec({ kind: 'anvil', name: 'Anvil', family: 'contradiction', glyph: '⊥', hotkey: '0', placeable: true,
    blurb: 'L = R and L ≠ R ⟹ ⊥' }),
  press: spec({ kind: 'press', name: 'Lagrange Press', family: 'lemma', glyph: '|G|', placeable: true,
    blurb: '|G| = n ⟹ ∀x. xⁿ = e (Lagrange, imported)' }),
  hopper: spec({ kind: 'hopper', name: 'Hopper', family: 'structure', glyph: 't', placeable: true,
    blurb: 'emit a fixed term t (syntax only, no claim)' }),
  joiner: spec({ kind: 'joiner', name: 'Joiner', family: 'structure', glyph: 's·t', placeable: true,
    blurb: 'terms s, t ↦ the product st (syntax only)' }),
  inverter: spec({ kind: 'inverter', name: 'Inverter', family: 'inverse', glyph: 't⁻¹', placeable: true,
    blurb: 'term t ↦ t⁻¹ (syntax only)' }),
  stamp: spec({ kind: 'stamp', name: 'Theorem Stamp', family: 'lemma', glyph: '∎→', placeable: true,
    blurb: 'an earned theorem as hardware: its premise at σ ⟹ its conclusion at σ' }),
  carddock: spec({ kind: 'carddock', name: 'Card Dock', family: 'lemma', glyph: '∀=', placeable: true,
    blurb: 'supply an earned law ∀u. L(u) = R(u) as a rule card' }),
  given: spec({ kind: 'given', name: 'Given Inlet', family: 'given', glyph: 'h', placeable: false,
    blurb: 'a hypothesis of this order, supplied as stated' }),
  socket: spec({ kind: 'socket', name: 'Receiving Dock', family: 'equation', glyph: '∎', placeable: false,
    blurb: 'accepts the order’s target statement (either orientation)' }),
  desk: spec({ kind: 'desk', name: 'Assumption Desk', family: 'scope', glyph: '⊢', placeable: false,
    blurb: 'inside a room: emit the room’s assumption' }),
  gate: spec({ kind: 'gate', name: 'Exit Gate', family: 'scope', glyph: '⊣', placeable: false,
    blurb: '⊥ inside the room ⟹ the negated assumption outside it' }),
};

/** Registry schemas usable in this order (level.tools.schemas), in registry order. */
export function usableSchemas(ctx: KernelCtx, k?: 'law' | 'cond'): Schema[] {
  const allowed = new Set(ctx.level.tools.schemas);
  return Object.values(ctx.registry).filter((s) => allowed.has(s.id) && (!k || s.card.k === k));
}

/** Display name for an earned machine (mirror gets ᵒᵖ). */
export function schemaMachineName(ctx: KernelCtx, schema: string, mirror: boolean): string {
  const s = ctx.registry[schema];
  if (!s) return schema || 'Unknown theorem';
  return mirror ? `${s.name} ᵒᵖ` : s.name;
}

/** Number of premises of a stamp's schema card (0 for a law or unknown schema). */
export function schemaPremises(ctx: KernelCtx, schema: string): number {
  const c = ctx.registry[schema]?.card;
  return c && c.k === 'cond' ? c.premises.length : 0;
}

function pickSchema(ctx: KernelCtx, k: 'law' | 'cond', want?: string): string {
  if (want !== undefined) return want;
  const usable = usableSchemas(ctx, k)[0];
  if (usable) return usable.id;
  // Nothing earned yet: fall back to the first registry schema of the right shape (it will jam "not earned").
  const any = Object.values(ctx.registry).find((s) => s.card.k === k);
  return any?.id ?? '';
}

/** Default configuration for a newly placed machine of this kind. */
export function defaultConfig(kind: MachineKind, ctx: KernelCtx, opts?: { schema?: string; mirror?: boolean }): MachineConfig {
  switch (kind) {
    case 'spool': return { kind, t: { k: 'knob', term: null } };
    case 'canceller': return { kind, target: { k: 'first' }, tidy: true };
    case 'expander': return { kind, target: { k: 'first' }, insert: 'e', x: { k: 'knob', term: null }, dir: 'fwd' };
    case 'popper': return { kind, target: { k: 'first' } };
    case 'rewriter': return { kind, target: { k: 'first' }, dir: 'fwd', values: {}, tidy: true };
    case 'multiplier': return { kind, side: 'left', t: { k: 'knob', term: null } };
    case 'swapper': case 'meet': case 'anvil': case 'press': case 'joiner': case 'inverter': return { kind };
    case 'apply': return { kind, premises: 1, choice: 0, values: {} };
    case 'hopper': return { kind, t: null };
    case 'stamp': {
      const schema = pickSchema(ctx, 'cond', opts?.schema);
      return { kind, schema, mirror: !!opts?.mirror && !!ctx.registry[schema]?.mirrorable, choice: 0, values: {} };
    }
    case 'carddock': {
      const schema = pickSchema(ctx, 'law', opts?.schema);
      return { kind, schema, mirror: !!opts?.mirror && !!ctx.registry[schema]?.mirrorable };
    }
    case 'given': return { kind, givenId: '' };
    case 'socket': return { kind, socketId: '' };
    case 'desk': return { kind, room: '' };
    case 'gate': return { kind, room: '' };
  }
}

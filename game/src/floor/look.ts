// COMMUTATOR v4 floor — how a machine looks, from its RECIPE (colour = mechanic).
// A verb tile wears its recipe's family ink and glyph: cancel → inverse (†), pop/insert e → identity,
// givens (inlets and rules cited from them) → given green, routed rules → equation aqua (⥲), earned or
// authored theorems → navy + gold plate (the selected side's standard name), Lagrange → hatched IMPORTED
// plate. An unset recipe is a neutral tile with "?" (an empty Operator: ✣). The ∀ machine is violet-navy.
// Towers are standard boxes in their sort's colour (review 2026-10).
import type { Family, LevelManifest, Schema, Term } from '../kernel/types';
import type { LibRef, Machine } from '../factory/types';
import { FAMILY, INK, VAR } from '../ui/tokens';
import { shade } from '../board/geom';
import { schemaMachineName, schemaOf } from '../factory/catalog';
import { MIRROR_NAMES, SIDE_PAIRS } from '../levels/levels';
import type { KernelCtx } from '../kernel';

export interface Look {
  fam: Family;            // belt history stripe + label ink
  ink: string;            // tile top
  hull: string;           // extrusion
  on: string;             // glyph colour on the top
  glyph: string;          // short maths glyph (letters italic)
  label: string;          // short upright label under the tile: the ROLE word(s), uppercase
  name?: string;          // a maths name after the role (given h, e), printed in its real case as maths
  plate?: 'gold' | 'hatch'; // earned/authored (gold band) or imported (hatched band): name printed on the tile
  title?: string;         // printed on a plate tile
  tag?: string;           // e.g. IMPORTED
  neutral?: boolean;      // recipe not chosen yet
  dir?: 'fwd' | 'rev';    // rewriters: a persistent direction mark on the chassis (→ / ←)
  sheet?: boolean;        // Given Inlet: a folded sheet (east corner chamfered, white fold)
  tower?: 'G' | 'Z';      // Tower: its variable's sort (glyph x∈G / n∈ℤ, transmitter on the back corner)
}

const NEUTRAL = { ink: '#E4E6EC', hull: '#BFC3CF', on: INK.navy2 };
export const FORALL_INK = '#3B2F8F';

const fam = (f: Family, glyph: string, label: string): Look => ({
  fam: f, ink: FAMILY[f].ink, hull: shade(FAMILY[f].ink, f === 'identity' ? 0.2 : 0.26),
  on: f === 'inverse' || f === 'structure' || f === 'scope' || f === 'lemma' ? '#FFFFFF' : INK.navy, glyph, label,
});
const plate = (title: string, label: string, kind: 'gold' | 'hatch' = 'gold', tag?: string): Look => ({
  fam: 'lemma', ink: INK.navy, hull: INK.navy, on: '#FFFFFF', glyph: '', label, plate: kind, title, tag,
});
const neutral = (label: string, glyph = '?'): Look => ({ fam: 'lemma', ...NEUTRAL, glyph, label, neutral: true });

export interface LookCtx { level: LevelManifest; registry: Record<string, Schema> }

const givenName = (lc: LookCtx, id: string) => lc.level.givens.find((g) => g.id === id)?.name ?? id;
/** The schema's real name — dynamic imported laws too ('power.literal:5' → "Literal Power 5"), never a raw id. */
function schemaName(lc: LookCtx, id: string, mirror?: boolean): string {
  try { const n = schemaMachineName(lc as KernelCtx, id, mirror); if (n && n !== id) return n; } catch { /* catalogue not ready */ }
  const lit = /^power\.literal:(.+)$/.exec(id);
  if (lit) return `literal power ${lit[1]}`;
  const pair = SIDE_PAIRS[id];
  if (pair) return mirror ? pair.op : pair.plain;
  if (mirror && MIRROR_NAMES[id]) return MIRROR_NAMES[id]!.name;
  const base = lc.registry[id]?.name ?? id.replace(/^power\./, 'power ').replace(/[._:-]+/g, ' ');
  return base + (mirror ? ' ᵒᵖ' : '');
}
/** Imported (not earned/authored): Lagrange and the kernel's power laws. */
function imported(lc: LookCtx, id: string): boolean {
  try { const s = schemaOf(lc as KernelCtx, id); if (s) return s.origin === 'import'; } catch { /* not ready */ }
  return id.startsWith('power.') || lc.registry[id]?.origin === 'import';
}
const short = (s: string) => s.replace(/\s*ᵒᵖ\s*/, ' OP').toUpperCase();

function libLook(lc: LookCtx, ref: LibRef, asTheorem: boolean): Look {
  switch (ref.k) {
    case 'axiom':
      if (ref.id === 'invL') return fam('inverse', 'x⁻¹x', 'x⁻¹x = e');
      if (ref.id === 'invR') return fam('inverse', 'xx⁻¹', 'xx⁻¹ = e');
      if (ref.id === 'unitL') return fam('identity', 'ex', 'ex = x');
      return fam('identity', 'xe', 'xe = x');
    case 'given': { const n = givenName(lc, ref.givenId); return { ...fam('given', asTheorem ? `${n}⇒` : n, 'LAW'), name: n }; }
    case 'schema': {
      const n = schemaName(lc, ref.id, ref.mirror);
      return imported(lc, ref.id) ? plate(n, short(n), 'hatch', 'IMPORTED') : plate(n, short(n));
    }
    case 'lagrange': return plate('Lagrange', 'LAGRANGE', 'hatch', 'IMPORTED');
  }
}

export function lookOf(m: Machine, lc: LookCtx): Look {
  const c = m.config;
  switch (c.kind) {
    case 'spool': return fam('equation', 't=t', 'SPOOL');
    case 'hopper': return fam('structure', 't', 'HOPPER');
    case 'given': return { ...fam('given', '∵', 'GIVEN'), name: givenName(lc, c.givenId), sheet: true };
    case 'socket': return fam('equation', '∎', 'DOCK');
    case 'desk': return fam('scope', '⊢', 'ASSUMPTION DESK');
    case 'gate': return fam('scope', '⊣', 'EXIT GATE');
    case 'tower': {
      const sort = c.sort === 'Z' ? 'Z' : 'G', V = VAR[sort];
      return { fam: 'scope', ink: V.ring, hull: shade(V.ring, 0.3), on: '#FFFFFF', glyph: c.label, label: c.label, tower: sort };
    }
    case 'forall': return { fam: 'scope', ink: FORALL_INK, hull: shade(FORALL_INK, 0.32), on: '#FFFFFF', glyph: '∀', label: '∀ GENERALIZE' };
    case 'carddock': return c.ref ? { ...libLook(lc, c.ref, false), label: 'CARD DOCK' } : neutral('CARD DOCK');
    case 'rewriter': {
      const r = c.recipe;
      if (!r) return neutral('REWRITER');
      switch (r.k) {
        case 'cancel': return fam('inverse', '†', 'CANCEL');
        case 'pop': return { ...fam('identity', 'e·', 'POP'), name: 'e' };
        case 'insertE': return { ...fam('identity', '+e', 'INSERT'), name: 'e' };
        case 'insertPair': return fam('inverse', r.inv ? '+x⁻¹x' : '+xx⁻¹', 'INSERT PAIR');
        case 'law': return { ...libLook(lc, r.ref, false), dir: c.dir };
        case 'routed': return { ...fam('equation', '⥲', 'ROUTED RULE'), dir: c.dir };
      }
      return neutral('REWRITER');
    }
    case 'operator': {
      const r = c.recipe;
      if (!r) return neutral('OPERATOR', '✣');
      if (r.k === 'multiply') return fam('structure', r.side === 'left' ? 't*' : '*t', r.side === 'left' ? 'MULTIPLY LEFT' : 'MULTIPLY RIGHT');
      if (r.k === 'invert') return fam('inverse', '( )⁻¹', 'INVERT');
      return fam('equation', '=', 'SWAP');
    }
    case 'joiner': {
      const r = c.recipe;
      if (!r) return neutral('JOINER');
      if (r.k === 'chain') return fam('equation', '=', 'CHAIN');
      if (r.k === 'product') return fam('structure', '×', 'PRODUCT');
      return fam('contradiction', '⊥', 'CLASH');
    }
    case 'theorem': {
      const r = c.recipe;
      if (!r) return neutral('THEOREM');
      if (r.k === 'routed') return fam('equation', '⇒', 'ROUTED CARD');
      return libLook(lc, r.ref, true);
    }
  }
}

// ───────────── variables (towers) ─────────────

/** Atom ids mentioned anywhere in a term. */
export function termAtoms(t: Term, out = new Set<string>()): Set<string> {
  switch (t.k) {
    case 'atom': out.add(t.id); break;
    case 'inv': termAtoms(t.arg, out); break;
    case 'mul': for (const f of t.fs) termAtoms(f, out); break;
    case 'pow': termAtoms(t.base, out); for (const m of t.exp) for (const r of m.monomial) if (r.ref.k === 'zvar') out.add(r.ref.id); break;
    case 'int': for (const m of t.val) for (const r of m.monomial) if (r.ref.k === 'zvar') out.add(r.ref.id); break;
  }
  return out;
}

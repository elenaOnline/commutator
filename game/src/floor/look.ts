// COMMUTATOR v4 floor — how a machine looks, from its RECIPE (colour = mechanic).
// A verb tile wears its recipe's family ink and glyph: cancel → inverse (†), pop/insert e → identity,
// givens (inlets and rules cited from them) → given green, routed rules → equation aqua (⥲), earned or
// authored theorems → navy + gold plate (the selected side's standard name), Lagrange → hatched IMPORTED
// plate. An unset recipe is a neutral tile with "?" (an empty Operator: ✣). The ∀ machine is violet-navy.
// Towers are standard boxes in their sort's colour (review 2026-10).
import type { Family, LevelManifest, Schema, Term } from '../kernel/types';
import type { LibRef, Machine } from '../factory/types';
import { FAMILY, INK, SUBGROUP, VAR } from '../ui/tokens';
import { sortCtx } from '../ui/sorts';
import { freshLetter } from '../ui/letters';
import { shade } from '../board/geom';
import { upperWords } from './svg';
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
  /** Book phase B: a Subgroup Tower (H₁ ≤ G, or N₁ ⊴ G when normal), in the subgroup ink. */
  subTower?: 'sub' | 'normal';
  /** Book phase C: a group Tower (G₁) or a Hom Tower (f₁ : G₁ → H₁). */
  structTower?: { group?: boolean; hom?: { dom: string; cod: string } };
  /** Book phase B: a subgroup axiom's box ends its glyph in the subgroup, drawn as a small Euler set (xy ∈ (H)). */
  subBlob?: { label: string; normal: boolean };
}

const NEUTRAL = { ink: '#E4E6EC', hull: '#BFC3CF', on: INK.navy2 };
export const FORALL_INK = '#3B2F8F';

const fam = (f: Family, glyph: string, label: string): Look => ({
  fam: f, ink: FAMILY[f].ink, hull: shade(FAMILY[f].ink, f === 'identity' ? 0.2 : 0.26),
  on: f === 'inverse' || f === 'structure' || f === 'scope' || f === 'lemma' ? '#FFFFFF' : INK.navy, glyph, label,
});
/** A theorem plate: the face carries maths (⟹ for a theorem, the rewrite arrow for a law), the name is the caption. */
const plate = (title: string, label: string, kind: 'gold' | 'hatch' = 'gold', tag?: string, glyph = '⟹'): Look => ({
  fam: 'lemma', ink: INK.navy, hull: INK.navy, on: '#FFFFFF', glyph, label, plate: kind, title, tag,
});
const neutral = (label: string, glyph = '?'): Look => ({ fam: 'lemma', ...NEUTRAL, glyph, label, neutral: true });

export interface LookCtx { level: LevelManifest; registry: Record<string, Schema>; /** labels of the floor's Towers (H₁, f₁), when known */ labels?: Record<string, string> }

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
const short = (s: string) => upperWords(s.replace(/\s*ᵒᵖ\s*/, ' OP'));

function libLook(lc: LookCtx, ref: LibRef, asTheorem: boolean): Look {
  switch (ref.k) {
    case 'axiom':
      if (ref.id === 'invL') return fam('inverse', 'x⁻¹x', 'x⁻¹x = e');
      if (ref.id === 'invR') return fam('inverse', 'xx⁻¹', 'xx⁻¹ = e');
      if (ref.id === 'unitL') return fam('identity', 'ex', 'ex = x');
      return fam('identity', 'xe', 'xe = x');
    case 'given': { const n = givenName(lc, ref.givenId); return { ...fam('given', asTheorem ? `${n}⟹` : n, 'GIVEN'), name: n }; }
    case 'schema': {
      // Book phase B: the subgroup axioms are machines of their kind, like the group laws — a box in the subgroup
      // ink with the closure as its glyph. (Earned "contains e" keeps the gold plate; imported powers the hatch.)
      const SUB_GLYPH: Record<string, string> = { 'sub.mul': 'xy ∈', 'sub.inv': 'x⁻¹ ∈', 'sub.conj': 'gxg⁻¹ ∈' };
      // Book phase C: the map kinds' laws are boxes of their kind too (like the group laws): the law as the glyph
      const MAP_GLYPH: Record<string, string> = { 'hom.mul': 'f(xy)', 'hom.pow': 'f(xⁿ)', 'act.mul': '(gh)(p)', 'act.e': 'e(p)' };
      if (MAP_GLYPH[ref.id]) {
        const fnId = ref.structs ? Object.values(ref.structs)[0] : undefined;
        const fl = (fnId ? lc.level.maps?.find((x) => x.id === fnId)?.label ?? lc.labels?.[fnId] : undefined) ?? 'f'; // a Hom Tower's id is never a name
        const glyph = ref.id.startsWith('hom.') ? MAP_GLYPH[ref.id]!.replace('f', fl) : MAP_GLYPH[ref.id]!;
        return fam('structure', glyph, ref.id.startsWith('hom.') ? 'HOMOMORPHISM LAW' : 'ACTION LAW');
      }
      if (SUB_GLYPH[ref.id]) {
        const n = schemaName(lc, ref.id, ref.mirror);
        // the subgroup the recipe names (its chosen one), else the card's own letter
        const chosen = ref.structs ? Object.values(ref.structs)[0] : undefined;
        const sg = chosen ? (lc.level.subgroups ?? []).find((x) => x.id === chosen) : undefined;
        const blob = { label: sg?.label ?? (ref.id === 'sub.conj' ? 'N' : 'H'), normal: ref.id === 'sub.conj' || !!sg?.normal };
        return { fam: 'lemma', ink: SUBGROUP.ink, hull: shade(SUBGROUP.ink, 0.26), on: '#FFFFFF', glyph: SUB_GLYPH[ref.id]!, label: short(n), subBlob: blob };
      }
      const n = schemaName(lc, ref.id, ref.mirror);
      const g = asTheorem ? '⟹' : '⥲';
      return imported(lc, ref.id) ? plate(n, short(n), 'hatch', 'IMPORTED', g) : plate(n, short(n), 'gold', undefined, g);
    }
    case 'lagrange': return plate('Lagrange', 'LAGRANGE', 'hatch', 'IMPORTED', asTheorem ? '⟹' : '⥲');
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
      // Book phase B: a Subgroup Tower declares a subgroup H₁ ≤ G (N₁ ⊴ G): the subgroup ink, the set glyph
      // Book phase C: a group Tower wears its group's sort ink; a Hom Tower is navy with its signature
      if (c.group) { const st = sortCtx.cur.styles.get(c.varId); const ink = st && !st.plain ? st.ink : INK.navy2; return { fam: 'scope', ink, hull: shade(ink, 0.3), on: '#FFFFFF', glyph: c.label, label: c.label, tower: 'G', structTower: { group: true } }; }
      if (c.hom) return { fam: 'scope', ink: INK.navy, hull: shade(INK.navy, 0.3), on: '#FFFFFF', glyph: c.label, label: c.label, tower: 'G', structTower: { hom: c.hom } };
      if (c.sub === 'sub' || c.sub === 'normal') return { fam: 'scope', ink: SUBGROUP.ink, hull: shade(SUBGROUP.ink, 0.3), on: '#FFFFFF', glyph: c.label, label: c.label, tower: 'G', subTower: c.sub };
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
        case 'insertPair': {
          // the recipe's own letter, the one its lens shows (hud/slot pairLetter): fresh against the floor's letters
          const lv = lc.level;
          const x = freshLetter([...lv.atoms.map((a) => a.label), ...(lv.subgroups ?? []).map((g) => g.label), ...(lv.sorts ?? []).map((g) => g.label),
            ...(lv.maps ?? []).map((g) => g.label), ...Object.values(lc.labels ?? {})]);
          return fam('inverse', r.inv ? `+${x}⁻¹${x}` : `+${x}${x}⁻¹`, 'INSERT PAIR');
        }
        case 'law': return { ...libLook(lc, r.ref, false), dir: c.dir };
        case 'routed': return { ...fam('equation', '⥲', 'RULE INPUT'), dir: c.dir };
      }
      return neutral('REWRITER');
    }
    case 'operator': {
      const r = c.recipe;
      if (!r) return neutral('OPERATOR', '✣');
      if (r.k === 'multiply') return fam('structure', r.side === 'left' ? 't*' : '*t', r.side === 'left' ? 'MULTIPLY LEFT' : 'MULTIPLY RIGHT');
      if (r.k === 'invert') return fam('inverse', '( )⁻¹', 'INVERT');
      // Book phase C: apply f to both sides — a structure operation like multiply, its glyph the frame f( )
      if (r.k === 'apply') {
        const mp = lc.level.maps?.find((x) => x.id === r.fn); const n = mp?.label ?? r.fn;
        // an action is never named by its symbol: it acts — g( ) on both sides (W4–9)
        if (mp?.kind === 'action') return fam('structure', 'g( )', 'ACT ON BOTH SIDES');
        return { ...fam('structure', `${n}( )`, 'APPLY'), name: n }; // the map's name is maths: printed as written, never capitalised
      }
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
      if (r.k === 'routed') return fam('equation', '⟹', 'CARD INPUT');
      // the face names the instance it is used at ("fibre lemma ⟹ at π", "… at N"), once chosen (#5, #10)
      const structs = { ...(r.ref.k === 'schema' ? r.ref.structs ?? {} : {}), ...(c.structs ?? {}) };
      const lk = libLook(lc, Object.keys(structs).length && r.ref.k === 'schema' ? { ...r.ref, structs } : r.ref, true);
      const at = Object.values(structs).flatMap((id) => { const l = lc.level.maps?.find((x) => x.id === id)?.label ?? lc.level.subgroups?.find((x) => x.id === id)?.label ?? lc.labels?.[id]; return l ? [l] : []; });
      return at.length && lk.plate && lk.title ? { ...lk, title: `${lk.title} at ${at.join(', ')}` } : lk;
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

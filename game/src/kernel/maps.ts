// LEMMA WORKS kernel — Book phase C: the laws of the map kinds (KERNEL-EXT §5.4). Pure.
//
// The hom law and the two action laws are the MEANING of a declaration ("let f be a homomorphism", "let σ be an
// action"), so they are dependency-free axioms, schematic over the hom / action (and its groups and set). They apply
// at any hom / action in scope — level maps and Hom Towers alike — never at a plain map (SYNTHESIS §4.1 pins 2–3).
import type { Card, LevelManifest, MetaId, Poly, Schema, SortRef, StructBinder, Term } from './types';
import { mapKind } from './sorts';

const M = (id: MetaId): Term => ({ k: 'meta', id });
const S: SortRef = { k: 'sortmeta', id: 'S' }, T: SortRef = { k: 'sortmeta', id: 'T' }, O: SortRef = { k: 'sortmeta', id: 'Ω' };
const app = (fn: string, ...args: Term[]): Term => ({ k: 'app', fn, args });
const homBinds: StructBinder[] = [{ k: 'grp', id: 'S' }, { k: 'grp', id: 'T' }, { k: 'hom', id: 'f', dom: S, cod: T }];
const actBinds: StructBinder[] = [{ k: 'grp', id: 'S' }, { k: 'set', id: 'Ω' }, { k: 'act', id: 'σ', grp: S, on: O }];
const nPoly: Poly = [{ coefficient: '1', monomial: [{ ref: { k: 'zmeta', id: 'n' }, degree: 1 }] }];
const law = (metas: MetaId[], l: Term, r: Term, binds: StructBinder[], metaSorts: Record<MetaId, SortRef>): Card =>
  ({ k: 'law', metas, l, r, binds, metaSorts });

/** Kernel-owned map-kind schemas. Apply / rewrite with `structs: { f: <hom id> }` or `{ σ: <action id> }`. */
export const MAP_SCHEMAS: Record<string, Schema> = {
  'hom.mul': { id: 'hom.mul', name: 'homomorphism law', textbook: 'f is a homomorphism: f(xy) = f(x)f(y)', origin: 'axiom', mirrorable: false,
    card: law(['x', 'y'], app('f', { k: 'mul', fs: [M('x'), M('y')] }), { k: 'mul', fs: [app('f', M('x')), app('f', M('y'))] }, homBinds, { x: S, y: S }) },
  'hom.pow': { id: 'hom.pow', name: 'powers through a homomorphism', textbook: 'f(xⁿ) = f(x)ⁿ (imported)', origin: 'import', mirrorable: false,
    card: law(['x', 'n'], app('f', { k: 'pow', base: M('x'), exp: nPoly }), { k: 'pow', base: app('f', M('x')), exp: nPoly }, homBinds, { x: S }) },
  'act.mul': { id: 'act.mul', name: 'acting by a product', textbook: 'an action: (gh)(p) = g(h(p))', origin: 'axiom', mirrorable: false,
    card: law(['g', 'h', 'p'], app('σ', { k: 'mul', fs: [M('g'), M('h')] }, M('p')), app('σ', M('g'), app('σ', M('h'), M('p'))), actBinds, { g: S, h: S, p: O }) },
  'act.e': { id: 'act.e', name: 'e acts trivially', textbook: 'an action: e(p) = p', origin: 'axiom', mirrorable: false,
    card: law(['p'], app('σ', { k: 'e', s: 'S' }, M('p')), M('p'), actBinds, { p: O }) },
};

export function mapSchema(id: string): Schema | null { return Object.hasOwn(MAP_SCHEMAS, id) ? MAP_SCHEMAS[id]! : null; }

/** The hom law and action laws wherever a hom / action is in scope; hom.pow when the level lists it. */
export function mapAllowed(id: string, level: Pick<LevelManifest, 'maps' | 'tools' | 'unlocks'>): boolean {
  if (!mapSchema(id)) return false;
  const kinds = new Set((level.maps ?? []).map(mapKind));
  if (id === 'hom.mul') return kinds.has('hom');
  if (id === 'hom.pow') return kinds.has('hom') && level.tools.schemas.includes(id);
  return kinds.has('action');
}

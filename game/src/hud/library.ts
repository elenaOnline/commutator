// COMMUTATOR v4 — the library as the recipe picker shows it: RULES, never results.
// Groups (review 2026-10): Operations · Group laws · Given here · Theorems · Saved · Imported · Made here.
// No origin notes. Mirror pairs and the insert-pair orientations are ONE row each; the toggle that picks the
// side / orientation lives in the lens's recipe section (merge.ts).
import { hasDistinctMirror } from '../factory/catalog';
import * as K from '../kernel';
import type { Card, Fact, Family, Term } from '../kernel/types';
import { FAMILY } from '../ui/tokens';
import type { JoinerRecipe, LibRef, MachineKind, OperatorRecipe, RewriteRecipe, TheoremRecipe } from '../factory/types';
import { REGISTRY, esc, fH, labelsAll, nameHTML, safe, type S } from './util';
import { stripEl, transformEl, type Rails } from './strip';
import { h } from './util';
import { entryKeyOf, familyName, sideName } from './merge';

export type AnyRecipe = RewriteRecipe | OperatorRecipe | JoinerRecipe | TheoremRecipe | { k: 'ref'; ref: LibRef };
export type Group = 'Operations' | 'Group laws' | 'Given here' | 'Theorems' | 'Saved' | 'Imported' | 'Made here';

/** A merged row's toggle: the two sides of a mirror pair, or the two orientations of insert pair. */
export type Sides =
  | { k: 'mirror'; id: string; plain: { name: string; label: string }; op: { name: string; label: string } }
  | { k: 'orient' };

export interface LibEntry {
  key: string;
  group: Group;
  name: string;          // plain, searchable (merged rows carry both side names)
  nameHTML: string;
  stmt: string;          // HTML statement (typeset), for tooltips
  note?: string;         // what to do, never where it came from ('route an equation into the rule port')
  recipe: AnyRecipe;
  /** For carddock: the bare LibRef. */
  ref?: LibRef;
  /** A tiny demo strip on a small example, the changed part in the family ink (shown instead of prose). */
  demo?: () => HTMLElement;
  /** Merged rows: the toggle in the recipe section, and the demo for each side (true = mirror / x⁻¹x). */
  sides?: Sides;
  demoFor?: (alt: boolean) => HTMLElement;
}

// ───────── demo strips (COPY rule 1, 7): show what each recipe does on a small example ─────────
const at = (id: string): Term => ({ k: 'atom', id });
const W = (...fs: Term[]): Term => (fs.length === 1 ? fs[0]! : { k: 'mul', fs });
const [da, db, dc, dd, dt, dx] = ['a', 'b', 'c', 'd', 't', 'x'].map(at) as [Term, Term, Term, Term, Term, Term];
const DL: Record<string, string> = { a: 'a', b: 'b', c: 'c', d: 'd', t: 't', x: 'x' };
const DH: Record<string, number> = { a: 0, b: 1, c: 2, d: 3, t: 4, x: 5 };
const DV = new Map<string, 'G' | 'Z'>([['x', 'G'], ['t', 'G']]);
const eqR = (l: Term, r: Term, rel: '=' | '≠' = '='): Rails => ({ l, rel, r });
type Range = [number, number] | 'all';
/** before = after (review: `=`, never →), the hit / made factors tinted. */
const tf = (b: Rails, a: Rails, family: Family, o: Partial<Parameters<typeof transformEl>[4]> = {}) => () => transformEl(b, a, DL, DH, { family, vars: DV, ...o });
/** A law/fact as a strip: l = r, both sides tinted, with the card's metas as variable terms. */
const lawDemo = (l: Term, r: Term, family: Family, L: Record<string, string>) => () => transformEl({ l }, { l: r }, L, {}, { family, hit: 'all', made: 'all' });
/** Operator rows show only the result, LHS / = / RHS on a grid lined up on the = (8a41a69b). */
const opDemo = (l: Term, r: Term, family: Family, hl?: Range, hr?: Range) => () => {
  const ink = FAMILY[family].ink;
  return h('span', { class: 'h3-opdemo' },
    h('span', { class: 'h3-opdemo-l' }, stripEl({ l }, DL, DH, { range: hl, ink, which: 'l', vars: DV })),
    h('span', { class: 'h3-strip-rel math' }, '='),
    h('span', { class: 'h3-opdemo-r' }, stripEl({ l: r }, DL, DH, { range: hr, ink, which: 'l', vars: DV })));
};
/** Several facts ⟹ one (joiner recipes, theorem cards): `a = b, b = c ⟹ a = c` (aecb3d7b). */
const joinDemo = (ins: Rails[], out: Rails | string, family: Family, L = DL, small = false) => () => {
  const el = h('span', { class: `h3-tf h3-join${small ? ' small' : ''}` });
  ins.forEach((r, i) => { if (i) el.append(h('span', { class: 'h3-tf-comma' }, ',')); el.append(stripEl(r, L, DH, { vars: DV })); });
  el.append(h('span', { class: 'h3-tf-implies math' }, '⟹'));
  el.append(typeof out === 'string' ? h('span', { class: 'h3-tf-bot math', style: `color:${FAMILY[family].text}` }, out) : stripEl(out, L, DH, { range: 'all', ink: FAMILY[family].ink, which: 'both', vars: DV }));
  return el;
};

const I = (t: Term): Term => ({ k: 'inv', arg: t });
const e: Term = { k: 'e' };
const stmt = (f: Fact, L: Record<string, string>) => fH(f, L);
const law = (l: Term, r: Term): Card => ({ k: 'law', metas: ['x'], l, r });

/** The statement a LibRef stands for (for display), or null. */
export function libCard(s: S, ref: LibRef): Fact | null {
  switch (ref.k) {
    case 'axiom': return safe(() => K.axiomCard(ref.id), null);
    case 'given': return s.level.givens.find((g) => g.id === ref.givenId)?.fact ?? null;
    case 'schema': {
      const sc = s.ctx.registry[ref.id] ?? REGISTRY[ref.id] ?? safe(() => K.powerSchema(ref.id), null);
      if (!sc) return null;
      return ref.mirror ? safe(() => K.mirrorCard(sc.card), sc.card) : sc.card;
    }
    case 'lagrange': {
      const n = sizeOf(s);
      return n ? safe(() => K.pressCard(n), null) : null;
    }
  }
}
export const sizeOf = (s: S): number | null => {
  const g = s.level.givens.find((x) => x.fact.k === 'size');
  return g && g.fact.k === 'size' ? g.fact.n : null;
};
/** The standard name of a LibRef (a mirror pair names its side: 'right cancellation'). */
export function libName(s: S, ref: LibRef): string {
  switch (ref.k) {
    case 'axiom': return ({ unitL: 'e x = x', unitR: 'x e = x', invL: 'x⁻¹x = e', invR: 'x x⁻¹ = e' } as Record<string, string>)[ref.id] ?? ref.id;
    case 'given': return s.level.givens.find((g) => g.id === ref.givenId)?.name ?? ref.givenId;
    case 'schema': { const sc = s.ctx.registry[ref.id] ?? REGISTRY[ref.id] ?? safe(() => K.powerSchema(ref.id), null); return sc ? sideName(ref.id, !!ref.mirror, sc.name) : ref.id; }
    case 'lagrange': return 'Lagrange';
  }
}

/** Earned and authored theorems (imports, e.g. the power laws, are listed under Imported instead). */
const usableSchemas = (s: S) => s.ctx.level.tools.schemas.filter((id) => !id.startsWith('power.')).map((id) => s.ctx.registry[id]).filter((x): x is NonNullable<typeof x> => !!x && x.origin !== 'import');

/** The fact a card's side toggle names: its premises, or the conclusion when the premises read the same. */
function sideLabel(card: Card, mirrored: Card): [string, string] {
  const prem = (c: Card) => (c.k === 'cond' ? c.premises.map((p) => fH(p, {})).join(', ') : '');
  const concl = (c: Card) => (c.k === 'cond' ? fH(c.concl, {}) : c.k === 'law' ? fH({ k: 'eq', l: c.l, r: c.r }, {}) : '');
  const a = prem(card), b = prem(mirrored);
  if (a && a !== b) return [a, b];
  return [concl(card), concl(mirrored)];
}

/** The rule library for a machine kind, grouped. */
export function libraryFor(s: S, kind: MachineKind): LibEntry[] {
  const L = labelsAll(s);
  const out: LibEntry[] = [];
  const demoOf = (f: Fact, family: Family, Lx: Record<string, string>): (() => HTMLElement) | undefined =>
    f.k === 'eq' || f.k === 'law' ? lawDemo(f.l, f.r, family, Lx)
    : f.k === 'cond' && f.premises.every((p) => p.k === 'eq' || p.k === 'neq') && (f.concl.k === 'eq' || f.concl.k === 'neq')
      ? joinDemo(f.premises.map((p) => ({ l: (p as { l: Term }).l, rel: p.k === 'neq' ? '≠' : '=', r: (p as { r: Term }).r }) as Rails), { l: f.concl.l, rel: f.concl.k === 'neq' ? '≠' : '=', r: f.concl.r }, family, Lx)
      : undefined;
  const givenEntry = (g: { id: string; name: string; fact: Fact }, recipe: AnyRecipe): LibEntry => ({
    key: `given:${g.id}`, group: 'Given here', name: `${g.name} ${safe(() => K.factText(g.fact as never, L), '')}`,
    nameHTML: `<i>${nameHTML(g.name)}</i>`, stmt: g.fact.k === 'size' ? '' : stmt(g.fact, L), recipe, ref: { k: 'given', givenId: g.id },
    demo: demoOf(g.fact, 'given', L),
  });
  /** One row per schema; a distinct mirror makes it a merged row (named by its SIDE_PAIRS family). */
  const schemaEntry = (sc: { id: string; name: string; textbook: string; card: Card; origin: string; mirrorable: boolean }, recipe: AnyRecipe, merge: boolean): LibEntry => {
    const group: Group = sc.origin === 'authored' ? 'Saved' : 'Theorems';
    const mirrored = merge && sc.mirrorable && safe(() => hasDistinctMirror(sc.card), true) ? safe(() => K.mirrorCard(sc.card), null) : null;
    const base: LibEntry = { key: `schema:${sc.id}`, group, name: `${sc.name} ${sc.textbook}`, nameHTML: esc(sc.name), stmt: stmt(sc.card, {}), recipe, ref: { k: 'schema', id: sc.id }, demo: demoOf(sc.card, 'lemma', {}) };
    if (!mirrored) return base;
    const [pl, ol] = sideLabel(sc.card, mirrored);
    const plain = sideName(sc.id, false, sc.name), op = sideName(sc.id, true, `${sc.name} (mirror)`);
    const fam = familyName(sc.id, sc.name);
    return { ...base, name: `${fam} ${plain} ${op} ${sc.textbook}`, nameHTML: esc(fam),
      sides: { k: 'mirror', id: sc.id, plain: { name: plain, label: pl }, op: { name: op, label: ol } },
      demoFor: (m) => (demoOf(m ? mirrored : sc.card, 'lemma', {}) ?? (() => h('span', {})))() };
  };
  const n = sizeOf(s);
  const lagrange = (recipe: AnyRecipe): LibEntry | null => n ? ({
    key: 'lagrange', group: 'Imported', name: `Lagrange x^${n} = e order`, nameHTML: 'Lagrange', stmt: stmt(safe(() => K.pressCard(n), law(e, e)), {}),
    recipe, ref: { k: 'lagrange' }, demo: demoOf(safe(() => K.pressCard(n), law(e, e)), 'lemma', {}),
  }) : null;

  // imported power laws (Phase B): only those the level lists ('power.literal' enables the literal family)
  const listed = new Set([...s.level.tools.schemas, ...s.ctx.level.tools.schemas]);
  const powerEntries = (mk: (ref: LibRef) => AnyRecipe): LibEntry[] => {
    const out2: LibEntry[] = [];
    for (const [id, sc] of Object.entries(safe(() => K.POWER_SCHEMAS, {} as typeof K.POWER_SCHEMAS))) {
      if (!listed.has(id)) continue;
      out2.push({ key: `schema:${id}`, group: 'Imported', name: `${sc.name} ${sc.textbook} power exponent`, nameHTML: esc(sc.name), stmt: stmt(sc.card, {}), recipe: mk({ k: 'schema', id }), ref: { k: 'schema', id }, demo: demoOf(sc.card, 'lemma', {}) });
    }
    for (const id of listed) {
      const r = /^power\.literal:(\d+)$/.exec(id)?.[1];
      if (!r || listed.has(K.POWER_LITERAL_FAMILY)) continue;
      out2.push({ key: `schema:${K.POWER_LITERAL_FAMILY}`, group: 'Imported', name: `literal power ${r} x^${r} copies expand power`, nameHTML: `literal power ${r}`, stmt: `<i>x</i><sup class="m-sup">${r}</sup> <span class="m-rel">=</span> ${Array.from({ length: Math.min(+r, 6) }, () => '<i>x</i>').join('')}${+r > 6 ? '⋯' : ''}`, recipe: mk({ k: 'schema', id }), ref: { k: 'schema', id } });
    }
    if (listed.has(K.POWER_LITERAL_FAMILY)) {
      const id = `${K.POWER_LITERAL_FAMILY}:2`;
      out2.push({ key: `schema:${K.POWER_LITERAL_FAMILY}`, group: 'Imported', name: 'literal power x^r r copies expand power', nameHTML: 'literal power', stmt: `<i>x</i><sup class="m-sup"><i>r</i></sup> <span class="m-rel">=</span> <i>x</i><i>x</i>⋯<i>x</i> &ensp;<span class="h3-dim">(<i>r</i> copies)</span>`, note: 'choose r below', recipe: mk({ k: 'schema', id }), ref: { k: 'schema', id } });
    }
    return out2;
  };
  if (kind === 'rewriter') {
    const pairDemo = (inv: boolean) => tf({ l: W(da, db) }, { l: inv ? W(da, I(dx), dx, db) : W(da, dx, I(dx), db) }, 'inverse', { made: [1, 3] })();
    out.push(
      { key: 'cancel', group: 'Group laws', name: 'cancel inverse pair', nameHTML: 'cancel', stmt: '', recipe: { k: 'cancel' },
        demo: tf({ l: W(da, db, I(db), dc) }, { l: W(da, dc) }, 'inverse', { hit: [1, 3] }) },
      { key: 'pop', group: 'Group laws', name: 'pop e identity', nameHTML: 'pop <i>e</i>', stmt: '', recipe: { k: 'pop' },
        demo: tf({ l: W(da, e, db) }, { l: W(da, db) }, 'identity', { hit: [1, 2] }) },
      { key: 'insertE', group: 'Group laws', name: 'insert e identity', nameHTML: 'insert <i>e</i>', stmt: '', recipe: { k: 'insertE' },
        demo: tf({ l: W(da, db) }, { l: W(da, e, db) }, 'identity', { made: [1, 2] }) },
      { key: 'pair', group: 'Group laws', name: 'insert pair x x^-1 inverse', nameHTML: 'insert pair', stmt: '', recipe: { k: 'insertPair', inv: false, x: { k: 'knob', term: null } },
        demo: () => pairDemo(false), sides: { k: 'orient' }, demoFor: pairDemo },
    );
    for (const g of s.level.givens) if (g.fact.k === 'eq' || g.fact.k === 'law') out.push(givenEntry(g, { k: 'law', ref: { k: 'given', givenId: g.id } }));
    for (const sc of usableSchemas(s)) if (sc.card.k === 'law') out.push(schemaEntry(sc, { k: 'law', ref: { k: 'schema', id: sc.id } }, false));
    const lg = lagrange({ k: 'law', ref: { k: 'lagrange' } });
    if (lg) out.push(lg);
    out.push(...powerEntries((ref) => ({ k: 'law', ref })));
    out.push({ key: 'routed', group: 'Made here', name: 'the rule port routed made here', nameHTML: 'the rule port', stmt: '', note: 'route an equation into the rule port', recipe: { k: 'routed' } });
  } else if (kind === 'operator') {
    out.push(
      { key: 'mulL', group: 'Operations', name: 'multiply left', nameHTML: 'multiply left', stmt: '', recipe: { k: 'multiply', side: 'left', t: { k: 'knob', term: null } },
        demo: opDemo(W(dt, da, db), W(dt, dc), 'structure', [0, 1], [0, 1]) },
      { key: 'mulR', group: 'Operations', name: 'multiply right', nameHTML: 'multiply right', stmt: '', recipe: { k: 'multiply', side: 'right', t: { k: 'knob', term: null } },
        demo: opDemo(W(da, db, dt), W(dc, dt), 'structure', [2, 3], [1, 2]) },
      { key: 'invert', group: 'Operations', name: 'invert both sides inverse', nameHTML: 'invert both sides', stmt: '', recipe: { k: 'invert' },
        demo: opDemo(I(W(da, db)), I(dc), 'inverse', 'all', 'all') },
      { key: 'swap', group: 'Operations', name: 'swap sides symmetry', nameHTML: 'swap sides', stmt: '', recipe: { k: 'swap' },
        demo: opDemo(dc, W(da, db), 'equation', 'all', 'all') },
    );
  } else if (kind === 'joiner') {
    out.push(
      { key: 'chain', group: 'Operations', name: 'chain transitivity', nameHTML: 'chain', stmt: '', recipe: { k: 'chain' }, demo: joinDemo([eqR(da, db), eqR(db, dc)], eqR(da, dc), 'equation', DL, true) },
      { key: 'product', group: 'Operations', name: 'product multiply', nameHTML: 'product', stmt: '', recipe: { k: 'product' }, demo: joinDemo([eqR(da, db), eqR(dc, dd)], eqR(W(da, dc), W(db, dd)), 'structure', DL, true) },
      { key: 'clash', group: 'Operations', name: 'clash contradiction', nameHTML: 'clash', stmt: '', recipe: { k: 'clash' }, demo: joinDemo([eqR(da, db), eqR(da, db, '≠')], '⊥', 'contradiction', DL, true) },
    );
  } else if (kind === 'theorem') {
    for (const g of s.level.givens) if (g.fact.k === 'cond') out.push(givenEntry(g, { k: 'library', ref: { k: 'given', givenId: g.id } }));
    for (const sc of usableSchemas(s)) if (sc.card.k === 'cond') out.push(schemaEntry(sc, { k: 'library', ref: { k: 'schema', id: sc.id } }, true));
    out.push({ key: 'routed', group: 'Made here', name: 'the card port routed made here', nameHTML: 'the card port', stmt: '', note: 'route a theorem into the card port', recipe: { k: 'routed' } });
  } else if (kind === 'carddock') {
    for (const g of s.level.givens) if (g.fact.k === 'law' || g.fact.k === 'cond') out.push(givenEntry(g, { k: 'ref', ref: { k: 'given', givenId: g.id } }));
    for (const sc of usableSchemas(s)) out.push(schemaEntry(sc, { k: 'ref', ref: { k: 'schema', id: sc.id } }, false));
    const lg = lagrange({ k: 'ref', ref: { k: 'lagrange' } });
    if (lg) out.push(lg);
    out.push(...powerEntries((ref) => ({ k: 'ref', ref })));
  }
  return out;
}

export const GROUP_ORDER: Group[] = ['Operations', 'Group laws', 'Given here', 'Theorems', 'Saved', 'Imported', 'Made here'];

/** Stable key of a configured recipe (presets and pins tell sides and orientations apart). */
export function recipeKey(r: AnyRecipe | null | undefined): string {
  if (!r) return '';
  const o = r as { k: string; ref?: LibRef; side?: string; inv?: boolean };
  if (o.ref) return o.ref.k === 'given' ? `given:${o.ref.givenId}` : o.ref.k === 'schema' ? `schema:${o.ref.id.startsWith('power.literal:') ? 'power.literal' : o.ref.id}${o.ref.mirror ? ':op' : ''}` : o.ref.k === 'lagrange' ? 'lagrange' : `axiom:${o.ref.id}`;
  if (o.k === 'insertPair') return o.inv ? 'pairInv' : 'pair';
  if (o.k === 'multiply') return o.side === 'left' ? 'mulL' : 'mulR';
  return o.k;
}

/** The picker row of a configured recipe (merged rows ignore the side / orientation). */
export function entryFor(s: S, kind: MachineKind, r: AnyRecipe | null | undefined): LibEntry | undefined {
  if (!r) return undefined;
  const k = entryKeyOf(recipeKey(r));
  return libraryFor(s, kind).find((x) => x.key === k);
}

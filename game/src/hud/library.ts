// COMMUTATOR v4 — the library as the recipe picker shows it: RULES, never results.
// Groups (Astra v4 §2): Axioms · Given here · Proven theorem (earned · Lemma Book) · Imported · Fact made here.
import { hasDistinctMirror } from '../factory/catalog';
import * as K from '../kernel';
import type { Card, Fact, Family, Term } from '../kernel/types';
import { FAMILY } from '../ui/tokens';
import type { JoinerRecipe, LibRef, MachineKind, OperatorRecipe, RewriteRecipe, TheoremRecipe } from '../factory/types';
import { MIRROR_NAMES, REGISTRY, esc, fH, labelsAll, nameHTML, safe, type S } from './util';
import { stripEl, transformEl, type Rails } from './strip';
import { h } from './util';

export type AnyRecipe = RewriteRecipe | OperatorRecipe | JoinerRecipe | TheoremRecipe | { k: 'ref'; ref: LibRef };
export type Group = 'Axioms' | 'Given here' | 'Proven theorem' | 'Imported' | 'Fact made here' | 'Operations';
export interface LibEntry {
  key: string;
  group: Group;
  name: string;          // plain, searchable
  nameHTML: string;
  stmt: string;          // HTML statement (typeset)
  note?: string;         // provenance line, e.g. 'earned in Lemma 3' · 'Lemma Book · Double Flip'
  recipe: AnyRecipe;
  /** For carddock: the bare LibRef. */
  ref?: LibRef;
  /** A tiny before → after bead strip, the changed part in the family ink (shown instead of prose). */
  demo?: () => HTMLElement;
}

// ───────── demo strips (COPY rule 1, 7): show what each recipe does on a small example ─────────
const at = (id: string): Term => ({ k: 'atom', id });
const W = (...fs: Term[]): Term => (fs.length === 1 ? fs[0]! : { k: 'mul', fs });
const [da, db, dc, dd, dt, dx] = ['a', 'b', 'c', 'd', 't', 'x'].map(at) as [Term, Term, Term, Term, Term, Term];
const DL: Record<string, string> = { a: 'a', b: 'b', c: 'c', d: 'd', t: 't', x: 'x' };
const DH: Record<string, number> = { a: 0, b: 1, c: 2, d: 3, t: 4, x: 5 };
const DV = new Map<string, 'G' | 'Z'>([['x', 'G'], ['t', 'G']]);
const eqR = (l: Term, r: Term, rel: '=' | '≠' = '='): Rails => ({ l, rel, r });
const tf = (b: Rails, a: Rails, family: Family, o: Partial<Parameters<typeof transformEl>[4]> = {}) => () => transformEl(b, a, DL, DH, { family, vars: DV, ...o });
/** A law/fact as a strip: its l → r (whole sides tinted), with the card's metas as variable beads. */
const lawDemo = (l: Term, r: Term, family: Family, L: Record<string, string>) => () => transformEl({ l }, { l: r }, L, {}, { family, hit: 'all', made: 'all' });
/** Several facts → one (joiner recipes, theorem cards). */
const joinDemo = (ins: Rails[], out: Rails | string, family: Family, L = DL) => () => {
  const el = h('span', { class: 'h3-tf' });
  ins.forEach((r, i) => { if (i) el.append(h('span', { class: 'h3-tf-comma' }, ',')); el.append(stripEl(r, L, DH, { vars: DV })); });
  el.append(h('span', { class: 'h3-tf-arrow' }, '→'));
  el.append(typeof out === 'string' ? h('span', { class: 'h3-tf-bot math', style: `color:${FAMILY[family].text}` }, out) : stripEl(out, L, DH, { range: 'all', ink: FAMILY[family].ink, which: 'both', vars: DV }));
  return el;
};

const A = (id: string): Term => ({ k: 'meta', id });
const I = (t: Term): Term => ({ k: 'inv', arg: t });
const mul = (...fs: Term[]): Term => ({ k: 'mul', fs });
const e: Term = { k: 'e' };
const x = A('x');
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
export function libName(s: S, ref: LibRef): string {
  switch (ref.k) {
    case 'axiom': return ({ unitL: 'e x = x', unitR: 'x e = x', invL: 'x⁻¹x = e', invR: 'x x⁻¹ = e' } as Record<string, string>)[ref.id] ?? ref.id;
    case 'given': return s.level.givens.find((g) => g.id === ref.givenId)?.name ?? ref.givenId;
    case 'schema': { const sc = s.ctx.registry[ref.id] ?? REGISTRY[ref.id] ?? safe(() => K.powerSchema(ref.id), null); return sc ? (ref.mirror ? (MIRROR_NAMES[ref.id]?.name ?? `${sc.name} ᵒᵖ`) : sc.name) : ref.id; }
    case 'lagrange': return 'Lagrange';
  }
}

/** Earned and authored theorems (imports, e.g. the power laws, are listed under Imported instead). */
const usableSchemas = (s: S) => s.ctx.level.tools.schemas.filter((id) => !id.startsWith('power.')).map((id) => s.ctx.registry[id]).filter((x): x is NonNullable<typeof x> => !!x && x.origin !== 'import');
const provenance = (origin: string, id: string) => {
  if (origin === 'authored') return 'Lemma Book';
  const from = REGISTRY[id]?.fromLevel;
  return from ? `earned` : 'proven';
};

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
  const schemaEntry = (sc: { id: string; name: string; textbook: string; card: Card; origin: string; mirrorable: boolean }, mirror: boolean, recipe: AnyRecipe): LibEntry => {
    const card = mirror ? safe(() => K.mirrorCard(sc.card), sc.card) : sc.card;
    const name = mirror ? (MIRROR_NAMES[sc.id]?.name ?? `${sc.name} ᵒᵖ`) : sc.name;
    return { key: `schema:${sc.id}${mirror ? ':op' : ''}`, group: 'Proven theorem', name: `${name} ${sc.textbook}`, nameHTML: esc(name), stmt: stmt(card, {}), note: provenance(sc.origin, sc.id), recipe, ref: { k: 'schema', id: sc.id, ...(mirror ? { mirror: true } : {}) },
      demo: demoOf(card, 'lemma', {}) };
  };
  const n = sizeOf(s);
  const lagrange = (recipe: AnyRecipe): LibEntry | null => n ? ({
    key: 'lagrange', group: 'Imported', name: `Lagrange x^${n} = e`, nameHTML: 'Lagrange', stmt: stmt(safe(() => K.pressCard(n), law(e, e)), {}),
    note: `imported · uses |G| = ${n}`, recipe, ref: { k: 'lagrange' },
  }) : null;

  // imported power laws (Phase B): only those the level lists ('power.literal' enables the literal family)
  const listed = new Set([...s.level.tools.schemas, ...s.ctx.level.tools.schemas]);
  const powerEntries = (mk: (ref: LibRef) => AnyRecipe): LibEntry[] => {
    const out2: LibEntry[] = [];
    for (const [id, sc] of Object.entries(safe(() => K.POWER_SCHEMAS, {} as typeof K.POWER_SCHEMAS))) {
      if (!listed.has(id)) continue;
      out2.push({ key: `schema:${id}`, group: 'Imported', name: `${sc.name} ${sc.textbook} power exponent`, nameHTML: esc(sc.name), stmt: stmt(sc.card, {}), note: 'imported · proven elsewhere, by induction', recipe: mk({ k: 'schema', id }), ref: { k: 'schema', id }, demo: demoOf(sc.card, 'lemma', {}) });
    }
    for (const id of listed) {
      const r = /^power\.literal:(\d+)$/.exec(id)?.[1];
      if (!r || listed.has(K.POWER_LITERAL_FAMILY)) continue;
      out2.push({ key: `schema:${K.POWER_LITERAL_FAMILY}`, group: 'Imported', name: `Literal Power ${r} x^${r} copies expand power`, nameHTML: `Literal Power ${r}`, stmt: `<i>x</i><sup class="m-sup">${r}</sup> <span class="m-rel">=</span> ${Array.from({ length: Math.min(+r, 6) }, () => '<i>x</i>').join('')}${+r > 6 ? '⋯' : ''}`, note: 'imported · proven elsewhere, by induction', recipe: mk({ k: 'schema', id }), ref: { k: 'schema', id } });
    }
    if (listed.has(K.POWER_LITERAL_FAMILY)) {
      const id = `${K.POWER_LITERAL_FAMILY}:2`;
      out2.push({ key: `schema:${K.POWER_LITERAL_FAMILY}`, group: 'Imported', name: 'Literal Power x^r r copies expand power', nameHTML: 'Literal Power', stmt: `<i>x</i><sup class="m-sup"><i>r</i></sup> <span class="m-rel">=</span> <i>x</i><i>x</i>⋯<i>x</i> &ensp;<span class="h3-dim">(<i>r</i> copies)</span>`, note: 'imported · choose r', recipe: mk({ k: 'schema', id }), ref: { k: 'schema', id } });
    }
    return out2;
  };
  if (kind === 'rewriter') {
    out.push(
      { key: 'cancel', group: 'Axioms', name: 'cancel inverse pair', nameHTML: 'cancel', stmt: '', recipe: { k: 'cancel' },
        demo: tf({ l: W(da, db, I(db), dc) }, { l: W(da, dc) }, 'inverse', { hit: [1, 3] }) },
      { key: 'pop', group: 'Axioms', name: 'pop e identity', nameHTML: 'pop <i>e</i>', stmt: '', recipe: { k: 'pop' },
        demo: tf({ l: W(da, e, db) }, { l: W(da, db) }, 'identity', { hit: [1, 2] }) },
      { key: 'insertE', group: 'Axioms', name: 'insert e', nameHTML: 'insert <i>e</i>', stmt: '', recipe: { k: 'insertE' },
        demo: tf({ l: W(da, db) }, { l: W(da, e, db) }, 'identity', { made: [1, 2] }) },
      { key: 'pair', group: 'Axioms', name: 'insert pair x x^-1', nameHTML: 'insert pair', stmt: '', recipe: { k: 'insertPair', inv: false, x: { k: 'knob', term: null } },
        demo: tf({ l: W(da, db) }, { l: W(da, dx, I(dx), db) }, 'inverse', { made: [1, 3] }) },
      { key: 'pairInv', group: 'Axioms', name: 'insert pair x^-1 x', nameHTML: 'insert pair', stmt: '', recipe: { k: 'insertPair', inv: true, x: { k: 'knob', term: null } },
        demo: tf({ l: W(da, db) }, { l: W(da, I(dx), dx, db) }, 'inverse', { made: [1, 3] }) },
    );
    for (const g of s.level.givens) if (g.fact.k === 'eq' || g.fact.k === 'law') out.push(givenEntry(g, { k: 'law', ref: { k: 'given', givenId: g.id } }));
    for (const sc of usableSchemas(s)) if (sc.card.k === 'law') out.push(schemaEntry(sc, false, { k: 'law', ref: { k: 'schema', id: sc.id } }));
    const lg = lagrange({ k: 'law', ref: { k: 'lagrange' } });
    if (lg) out.push(lg);
    out.push(...powerEntries((ref) => ({ k: 'law', ref })));
    out.push({ key: 'routed', group: 'Fact made here', name: 'routed rule port fact made here', nameHTML: 'the rule port', stmt: '', note: 'route a fact into the rule port', recipe: { k: 'routed' } });
  } else if (kind === 'operator') {
    out.push(
      { key: 'mulL', group: 'Operations', name: 'multiply left', nameHTML: 'multiply left', stmt: '', recipe: { k: 'multiply', side: 'left', t: { k: 'knob', term: null } },
        demo: tf(eqR(W(da, db), dc), eqR(W(dt, da, db), W(dt, dc)), 'structure', { madeR: { l: [0, 1], r: [0, 1] } }) },
      { key: 'mulR', group: 'Operations', name: 'multiply right', nameHTML: 'multiply right', stmt: '', recipe: { k: 'multiply', side: 'right', t: { k: 'knob', term: null } },
        demo: tf(eqR(W(da, db), dc), eqR(W(da, db, dt), W(dc, dt)), 'structure', { madeR: { l: [2, 3], r: [1, 2] } }) },
      { key: 'invert', group: 'Operations', name: 'invert both sides', nameHTML: 'invert both sides', stmt: '', recipe: { k: 'invert' },
        demo: tf(eqR(W(da, db), dc), eqR(I(W(da, db)), I(dc)), 'inverse', { madeR: { l: 'all', r: 'all' } }) },
      { key: 'swap', group: 'Operations', name: 'swap symmetry', nameHTML: 'swap sides', stmt: '', recipe: { k: 'swap' },
        demo: tf(eqR(W(da, db), dc), eqR(dc, W(da, db)), 'equation', { madeR: { l: 'all', r: 'all' } }) },
    );
  } else if (kind === 'joiner') {
    out.push(
      { key: 'chain', group: 'Operations', name: 'chain transitivity', nameHTML: 'chain', stmt: '', recipe: { k: 'chain' }, demo: joinDemo([eqR(da, dc), eqR(db, dc)], eqR(da, db), 'equation') },
      { key: 'product', group: 'Operations', name: 'product multiply', nameHTML: 'product', stmt: '', recipe: { k: 'product' }, demo: joinDemo([eqR(da, db), eqR(dc, dd)], eqR(W(da, dc), W(db, dd)), 'structure') },
      { key: 'clash', group: 'Operations', name: 'clash contradiction', nameHTML: 'clash', stmt: '', recipe: { k: 'clash' }, demo: joinDemo([eqR(da, db), eqR(da, db, '≠')], '⊥', 'contradiction') },
    );
  } else if (kind === 'theorem') {
    for (const g of s.level.givens) if (g.fact.k === 'cond') out.push(givenEntry(g, { k: 'library', ref: { k: 'given', givenId: g.id } }));
    for (const sc of usableSchemas(s)) if (sc.card.k === 'cond') {
      out.push(schemaEntry(sc, false, { k: 'library', ref: { k: 'schema', id: sc.id } }));
      if (sc.mirrorable && safe(() => hasDistinctMirror(sc.card), true)) out.push(schemaEntry(sc, true, { k: 'library', ref: { k: 'schema', id: sc.id, mirror: true } }));
    }
    out.push({ key: 'routed', group: 'Fact made here', name: 'routed card port fact made here', nameHTML: 'the card port', stmt: '', note: 'route a card into the card port', recipe: { k: 'routed' } });
  } else if (kind === 'carddock') {
    for (const g of s.level.givens) if (g.fact.k === 'law' || g.fact.k === 'cond') out.push(givenEntry(g, { k: 'ref', ref: { k: 'given', givenId: g.id } }));
    for (const sc of usableSchemas(s)) out.push(schemaEntry(sc, false, { k: 'ref', ref: { k: 'schema', id: sc.id } }));
    const lg = lagrange({ k: 'ref', ref: { k: 'lagrange' } });
    if (lg) out.push(lg);
    out.push(...powerEntries((ref) => ({ k: 'ref', ref })));
  }
  return out;
}

export const GROUP_ORDER: Group[] = ['Operations', 'Axioms', 'Given here', 'Proven theorem', 'Imported', 'Fact made here'];

/** Stable key of a configured recipe (to find its entry / compare presets). */
export function recipeKey(r: AnyRecipe | null | undefined): string {
  if (!r) return '';
  const o = r as { k: string; ref?: LibRef; side?: string; inv?: boolean };
  if (o.ref) return o.ref.k === 'given' ? `given:${o.ref.givenId}` : o.ref.k === 'schema' ? `schema:${o.ref.id.startsWith('power.literal:') ? 'power.literal' : o.ref.id}${o.ref.mirror ? ':op' : ''}` : o.ref.k === 'lagrange' ? 'lagrange' : `axiom:${o.ref.id}`;
  if (o.k === 'insertPair') return o.inv ? 'pairInv' : 'pair';
  if (o.k === 'multiply') return o.side === 'left' ? 'mulL' : 'mulR';
  return o.k;
}

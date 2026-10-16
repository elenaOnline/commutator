// One display name per thing (final playtest w1–7: #7 source names, #8 one name per theorem, #12 one multiply
// recipe, #13 flavour labels, #15 the ∀ lens copy, #16 the ceremony's offers).
import { describe, expect, it } from 'vitest';
import * as K from '../kernel';
import * as F from '../factory';
import type { Card } from '../kernel/types';
import { LEVEL_BY_ID } from '../levels/campaigns';
import { REGISTRY } from '../levels/levels';
import { ctxFor } from '../state/factoryStore';
import { buildGeo } from '../floor/geo';
import { lookOf } from '../floor/look';
import { glyphSVG, upperWords } from '../floor/svg';
import { machineLabelSVG, machineSVG } from '../floor/scene';
import { nameHTML, richHTML } from '../shell/util';
import { graphLabels } from './proof';
import { Floor } from '../factory/compiler.testkit';
import { endingText, holdsByIdentityAlone } from './ceremony';
import { entryFor, libraryFor } from './library';
import { entryKeyOf, familyName } from './merge';
import { forallBinders, forallBlurb, recipeInstanceHTML, ruleDirLabels } from './lens';
import { schemaInfo } from './proof';
import { midEllipsis } from './hotbar';
import type { S } from './util';

const plain = (html: string) => html.replace(/<[^>]+>/g, '');
const stateFor = (id: string, earned: string[], canvas?: F.Canvas, extra?: Partial<S>): S => {
  const level = LEVEL_BY_ID[id]!;
  return { level, ctx: ctxFor(level, earned, []), canvas: canvas ?? { machines: [], belts: [], rooms: [] }, compiled: null, ...extra } as unknown as S;
};
const e = { k: 'e' } as const;
const x = { k: 'meta', id: 'x' } as const;

describe('#8 one name per theorem', () => {
  it('the theorem keeps one name on every surface; a side is named by its toggle', () => {
    for (const [id, family, plainSide, opSide] of [['witness', 'unique inverse', 'unique right inverse', 'unique left inverse'], ['cancel', 'cancellation', 'left cancellation', 'right cancellation']] as const) {
      expect(familyName(id, REGISTRY[id]!.name)).toBe(family);
      // the Paper cites the theorem by the same name, whichever side the machine used
      expect(schemaInfo(id, false).textbook).toBe(family);
      expect(schemaInfo(id, true).textbook).toBe(family);
      // the picker row and its toggle
      const lib = libraryFor(stateFor('P4.5', ['witness', 'cancel']), 'theorem');
      const row = lib.find((r) => r.key === `schema:${id}`)!;
      expect(row.nameHTML).toBe(family);
      expect(row.sides?.k === 'mirror' && [row.sides.plain.name, row.sides.op.name]).toEqual([plainSide, opSide]);
    }
    expect(REGISTRY.witness!.textbook).not.toMatch(/uniqueness/);
  });
});

describe('#12 Operator: one multiply recipe, with the side toggle', () => {
  it('lists multiply once and finds it for either side', () => {
    const s = stateFor('P4.2', ['witness']);
    const ops = libraryFor(s, 'operator').map((r) => r.key);
    expect(ops.filter((k) => /^mul/.test(k))).toEqual(['mul']);
    for (const side of ['left', 'right'] as const) {
      const r = { k: 'multiply', side, t: { k: 'knob', term: null } } as never;
      expect(entryFor(s, 'operator', r)?.key).toBe('mul');
    }
    expect(entryKeyOf('mulL')).toBe('mul');
    expect(entryKeyOf('mulR')).toBe('mul');
  });
});

describe('#7 source names never leak', () => {
  it('a Hom Tower is named by its label in a recipe name, never by its id', () => {
    const lv = LEVEL_BY_ID['P9.3']!;
    const ctx = ctxFor(lv, [], []);
    const canvas = { machines: [{ id: 'm1', kind: 'tower', at: { x: 0, y: 0 }, rot: 0, config: { kind: 'tower', varId: 'x3', label: 'f₁', sort: 'G', hom: { dom: 'G1', cod: 'K1' } } }], belts: [], rooms: [] } as unknown as F.Canvas;
    const ref = { k: 'schema', id: 'hom.mul', structs: { f: 'x3' } } as never;
    expect(F.libName(ctx, ref, canvas)).toBe('homomorphism law (f₁)');
    expect(F.libName(ctx, ref)).toBe('homomorphism law'); // no canvas, no label: the id is never printed
  });
  it('a subscripted source name (K_c, Hₐ) is a real subscript on screen', () => {
    expect(nameHTML('K_c')).toBe('K<sub class="m-sub">c</sub>');
    expect(nameHTML('H_{ab}')).toBe('H<sub class="m-sub">ab</sub>');
    expect(nameHTML('Hₐ')).toBe('H<sub class="m-sub">a</sub>');
    expect(plain(nameHTML('h₁'))).toBe('h1');
    const svg = glyphSVG('K_c');
    expect(svg).not.toContain('_');
    expect(svg).toContain('baseline-shift="-22%"');
  });
  it('a saved lemma f(e) = e reads at its own groups: e_G₁, never e_S / e_T', () => {
    const lv = LEVEL_BY_ID['P9.3']!;
    const card: Card = {
      k: 'law', metas: [], l: { k: 'app', fn: 'f', args: [{ k: 'e', s: 'S' }] }, r: { k: 'e', s: 'T' },
      binds: [{ k: 'grp', id: 'S' }, { k: 'grp', id: 'T' }, { k: 'hom', id: 'f', dom: { k: 'sortmeta', id: 'S' }, cod: { k: 'sortmeta', id: 'T' } }],
    } as never;
    const base = ctxFor(lv, [], []);
    const ctx = { ...base, registry: { ...base.registry, lem: { id: 'lem', name: 'f(e) = e', textbook: 'f(e) = e', card, origin: 'authored', mirrorable: false } } };
    const tower = (id: string, varId: string, label: string, extra: object) => ({ id, kind: 'tower', at: { x: 0, y: 0 }, rot: 0, config: { kind: 'tower', varId, label, sort: 'G', ...extra } });
    const canvas = { machines: [tower('t1', 'G1', 'G₁', { group: true }), tower('t2', 'K1', 'K₁', { group: true }), tower('t3', 'f1', 'f₁', { hom: { dom: 'G1', cod: 'K1' } }), { id: 'rw', kind: 'rewriter', at: { x: 0, y: 0 }, rot: 0, config: { kind: 'rewriter' } }], belts: [], rooms: [] };
    const s = { level: lv, ctx, canvas, compiled: { machines: { rw: { structs: [{ binder: 'f', normal: false, options: [], chosen: 'f1' }] } } } } as unknown as S;
    const html = recipeInstanceHTML(s, canvas.machines[3] as never, { k: 'schema', id: 'lem' })!;
    expect(html).toBeTruthy();
    expect(plain(html)).not.toMatch(/[ST]\b/);
    expect(plain(html)).toContain('G1');
    expect(plain(html)).toContain('K1');
    // the direction pills show the card's own groups as G and K (displayed names), not the positional S and T
    const [fwd, rev] = ruleDirLabels(card, {});
    expect(plain(fwd)).toContain('⟶');
    expect(plain(fwd)).not.toMatch(/S|T/);
    expect(plain(rev)).not.toMatch(/S|T/);
  });
});

describe('#13 floor labels are standard names; a face carries maths, not words', () => {
  it('rule and card inputs are named by what they are', () => {
    const f = new Floor(LEVEL_BY_ID['P4.2']!, ['witness']);
    const rw = f.add({ kind: 'rewriter', recipe: { k: 'routed' }, dir: 'fwd', target: { k: 'first' }, gap: { k: 'first' }, values: {}, tidy: true } as never);
    const th = f.add({ kind: 'theorem', recipe: { k: 'routed' }, choice: 0, values: {} } as never);
    const byId = (id: string) => f.c.machines.find((m) => m.id === id)!;
    expect(lookOf(byId(rw), f.ctx).label).toBe('RULE INPUT');
    expect(lookOf(byId(th), f.ctx).label).toBe('CARD INPUT');
  });
  it('a given used as a rule is captioned GIVEN, not LAW', () => {
    const lv = LEVEL_BY_ID['P4.1']!;
    const g = lv.givens[0]!;
    const f = new Floor(lv, []);
    const rw = f.add({ kind: 'rewriter', recipe: { k: 'law', ref: { k: 'given', givenId: g.id } }, dir: 'fwd', target: { k: 'first' }, gap: { k: 'first' }, values: {}, tidy: true } as never);
    expect(lookOf(f.c.machines.find((m) => m.id === rw)!, f.ctx).label).toBe('GIVEN');
  });
  it('a theorem tile prints its name as a caption, not on its face', () => {
    const f = new Floor(LEVEL_BY_ID['P4.5']!, ['witness', 'cancel']);
    const th = f.add({ kind: 'theorem', recipe: { k: 'library', ref: { k: 'schema', id: 'witness' } }, choice: 0, values: {} } as never);
    const geo = buildGeo(f.c, null, f.ctx);
    const g = geo.ms.get(th)!;
    const cx = { L: {}, level: f.level, comp: null, schemaName: (id: string) => id };
    const face = machineSVG(g, cx);
    expect(face).not.toMatch(/UNIQUE|INVERSE/);
    expect(face).toContain('⟹');
    expect(machineLabelSVG(g, cx)).toMatch(/UNIQUE/);
  });
  it('the Joiner is = everywhere, as on the floor', () => {
    expect(F.SPECS.joiner.glyph).toBe('=');
    expect(JSON.stringify(F.SPECS)).not.toContain('⋈');
  });
});

describe('#15 the ∀ lens names its real binders', () => {
  const hom = K.mapSchema('hom.mul')!.card as Card;
  it('lists groups, a homomorphism and elements, not "x"', () => {
    expect(forallBinders(hom)).toEqual(['G', 'K', 'f', 'x', 'y']);
    expect(forallBlurb(hom)).toBe('Makes the fact true for all G, K, f, x, y.');
    expect(forallBlurb({ k: 'law', metas: ['y'], l: x, r: x } as Card)).toBe('Makes the fact true for all y.');
    expect(forallBlurb(null)).not.toMatch(/for all x/);
  });
});

describe('#16 the ceremony offers only what is worth saving', () => {
  it('does not offer ∀x. ex = xe (the identity axiom alone), but does offer laws that need an inverse', () => {
    expect(holdsByIdentityAlone({ k: 'law', metas: ['x'], l: { k: 'mul', fs: [e, x] }, r: { k: 'mul', fs: [x, e] } })).toBe(true);
    expect(holdsByIdentityAlone({ k: 'law', metas: ['x'], l: { k: 'inv', arg: { k: 'inv', arg: x } }, r: x })).toBe(false);
    expect(holdsByIdentityAlone({ k: 'law', metas: ['x', 'y'], l: { k: 'inv', arg: { k: 'mul', fs: [x, { k: 'meta', id: 'y' }] } }, r: { k: 'mul', fs: [{ k: 'inv', arg: { k: 'meta', id: 'y' } }, { k: 'inv', arg: x }] } })).toBe(false);
  });
  it('a long hotbar name keeps both ends', () => {
    const n = midEllipsis('xyx⁻¹y⁻¹ = e ⟹ xy = yx and then some more');
    expect(n.startsWith('xyx')).toBe(true);
    expect(n.endsWith('more')).toBe(true);
  });
});

describe('N3 / N8 / N11 / N12 / N23 (final playtest w8–14)', () => {
  it('N3: the transcript names a map by its label (π), never its id', () => {
    const lv = Object.values(LEVEL_BY_ID).find((l) => l?.maps?.some((m) => m.id === 'pi'))!;
    expect(graphLabels(lv, {}).pi).toBe('π');
  });
  it('N8: a binder prints by its name in a status message, never as $2:f', () => {
    const card = { k: 'law', metas: [], l: { k: 'app', fn: 'f', args: [{ k: 'e', s: 'S' }] }, r: { k: 'e', s: 'T' }, binds: [{ k: 'grp', id: '$2:S' }, { k: 'grp', id: '$2:T' }, { k: 'hom', id: '$2:f', dom: { k: 'sortmeta', id: '$2:S' }, cod: { k: 'sortmeta', id: '$2:T' } }] } as never;
    const ctx = ctxFor(LEVEL_BY_ID['P9.3']!, [], []);
    let msg = '';
    try { K.instStructs(card, {}, ctx.level, 'a lemma'); } catch (e) { msg = (e as Error).message; }
    expect(msg).toMatch(/Choose which/);
    expect(msg).not.toContain('$');
  });
  it('N11: only the words of a label are uppercased, never the maths', () => {
    expect(upperWords('fibre lemma ⟹ at π')).toBe('FIBRE LEMMA ⟹ AT π');
    expect(upperWords('a subgroup contains e')).toBe('A SUBGROUP CONTAINS e');
  });
  it('N12: a jam prints exponents as maths, not as source', () => {
    const lv = LEVEL_BY_ID['P9.3']!;
    const html = richHTML('No x^(198i²) in a^i = a^(6i).', lv);
    expect(html).not.toContain('^');
    expect(html).toContain('<sup class="m-sup">');
    expect(richHTML('No (x^ix^j)^m in a^i = a^i.', lv)).not.toContain('^');
  });
  it('N23: the finale counts the main orders, and says side orders apart', () => {
    expect(endingText('The Book', 56, 9)).toBe('The Book complete: 56 theorems, all checked. (9 side orders besides.)');
    expect(endingText(null, 12, 0)).toBe('Campaign complete: 12 theorems, all checked.');
  });
});

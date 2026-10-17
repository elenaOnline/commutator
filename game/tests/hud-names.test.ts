// One display name per thing (final playtest w1–7: #7 source names, #8 one name per theorem, #12 one multiply
// recipe, #13 flavour labels, #15 the ∀ lens copy, #16 the ceremony's offers).
import { describe, expect, it } from 'vitest';
import * as K from '../src/kernel';
import * as F from '../src/factory';
import type { Card } from '../src/kernel/types';
import { LEVEL_BY_ID } from '../src/levels/campaigns';
import { REGISTRY } from '../src/levels/levels';
import { ctxFor } from '../src/state/factoryStore';
import { buildGeo } from '../src/floor/geo';
import { lookOf } from '../src/floor/look';
import { capsHTML, glyphSVG, upperWords } from '../src/floor/svg';
import { machineLabelSVG, machineName as machineNameOf, machineSVG } from '../src/floor/scene';
import { nameHTML, richHTML } from '../src/shell/util';
import { graphLabels } from '../src/hud/proof';
import { Floor } from '../src/factory/compiler.testkit';
import { endingText, holdsByIdentityAlone } from '../src/hud/ceremony';
import { entryFor, libraryFor } from '../src/hud/library';
import { entryKeyOf, familyName } from '../src/hud/merge';
import { forallBinders, forallBlurb, recipeInstanceCard, recipeInstanceHTML, ruleDirLabels } from '../src/hud/lens';
import { sideLabel } from '../src/hud/library';
import { schemaInfo } from '../src/hud/proof';
import { midEllipsis } from '../src/hud/hotbar';
import type { S } from '../src/hud/util';

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
  it('a given used as a rule is captioned by its own name, not LAW', () => {
    const lv = LEVEL_BY_ID['P4.1']!;
    const g = lv.givens[0]!;
    const f = new Floor(lv, []);
    const rw = f.add({ kind: 'rewriter', recipe: { k: 'law', ref: { k: 'given', givenId: g.id } }, dir: 'fwd', target: { k: 'first' }, gap: { k: 'first' }, values: {}, tidy: true } as never);
    const look = lookOf(f.c.machines.find((m) => m.id === rw)!, f.ctx);
    expect(look.label).toBe('');
    expect(look.name).toBe(g.name);
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

describe('σ never appears on any world 6 surface string', () => {
  const actionLevels = Object.values(LEVEL_BY_ID).filter((l): l is NonNullable<typeof l> => !!l && !!l.maps?.some((m) => m.kind === 'action'));
  const L = (lv: (typeof actionLevels)[number]) => ({ ...K.levelLabels(lv) });
  it('there are action levels to check', () => expect(actionLevels.length).toBeGreaterThanOrEqual(2));
  it('statements: level givens and docks, the action cards, in every printer', async () => {
    const { factHTML } = await import('../src/floor/math');
    const { fH } = await import('../src/hud/util');
    for (const lv of actionLevels) {
      const facts = [...lv.givens.map((g) => g.fact), ...lv.sockets.map((s) => s.target)];
      for (const f of facts) for (const out of [K.factText(f as never, L(lv)), plain(factHTML(f as never, L(lv))), plain(fH(f as never, L(lv)))]) expect(out, `${lv.id}: ${out}`).not.toContain('σ');
    }
    for (const id of ['act.mul', 'act.e']) {
      const card = K.mapSchema(id)!.card;
      for (const out of [K.factText(card, {}), plain(factHTML(card, {})), plain(fH(card, {}))]) expect(out, `${id}: ${out}`).not.toContain('σ');
    }
  });
  it('recipe names, floor captions and compiler statuses', () => {
    for (const lv of actionLevels) {
      const ctx = ctxFor(lv, [], []);
      const act = lv.maps!.find((m) => m.kind === 'action')!;
      for (const id of ['act.mul', 'act.e']) {
        const ref = { k: 'schema', id, structs: { σ: act.id } } as never;
        expect(F.libName(ctx, ref), lv.id).not.toContain('σ');
        const f = new Floor(lv, []);
        const rw = f.add({ kind: 'rewriter', recipe: { k: 'law', ref }, dir: 'fwd', target: { k: 'first' }, gap: { k: 'first' }, values: {}, tidy: true } as never);
        const look = lookOf(f.c.machines.find((m) => m.id === rw)!, f.ctx);
        expect(`${look.label} ${look.name ?? ''} ${look.glyph}`, lv.id).not.toContain('σ');
        // every status, port reason and socket reason the compiler prints for this floor
        const comp = f.compile();
        expect(JSON.stringify([comp.machines, comp.sockets, comp.beltErrors]), lv.id).not.toContain('σ');
      }
    }
  });
});

describe('σ: the real P7.2 and P8.2 floors, every machine, belt, status and editor note', () => {
  it('prints no σ anywhere', async () => {
    const kit = await import('./book/kit-wC');
    const { bookFloor, app, given, schema, lawRw, spool, cancel, I, P, eq } = kit;
    const A = (id: string): K.Term => ({ k: 'atom', id });
    const sig = (g: K.Term, pt: K.Term) => app('act', g, pt);
    // P7.2: Spool σ(αβ, p) → action law → h_b → h_a; Spool σ(α⁻¹, p) → h_a backwards → action law backwards → cancel → σ(e, p) = p
    const f72 = bookFloor(kit.lvC('P7.2'), ['cancel', 'witness', 'socks']);
    {
      const sp1 = f72.add(spool(sig(P(A('a'), A('b')), A('p')))), m1 = f72.add(lawRw(schema('act.mul'))), hb = f72.add(lawRw(given('hb'))), ha = f72.add(lawRw(given('ha')));
      f72.wire(sp1, m1); f72.wire(m1, hb); f72.wire(hb, ha); f72.wire(ha, f72.socket('s1'));
      const sp2 = f72.add(spool(sig(I(A('a')), A('p')))), back = f72.add(lawRw(given('ha'), { dir: 'rev' })), m2 = f72.add(lawRw(schema('act.mul'), { dir: 'rev' })), cn = f72.add(cancel()), e0 = f72.add(lawRw(schema('act.e')));
      f72.wire(sp2, back); f72.wire(back, m2); f72.wire(m2, cn); f72.wire(cn, e0); f72.wire(e0, f72.socket('s2'));
    }
    // P8.2: Spool σ(παπ⁻¹, r) → action law twice → h₁ backwards → action law backwards → cancel → σ(e, p) = p → h₃ → h₂
    const f82 = bookFloor(kit.lvC('P8.2'), ['cancel', 'witness', 'socks']);
    {
      const pi = A('pi'), a = A('a'), r = A('r');
      const sp = f82.add(spool(sig(P(pi, a, I(pi)), r))), m1 = f82.add(lawRw(schema('act.mul'))), m2 = f82.add(lawRw(schema('act.mul'))), h1 = f82.add(lawRw(given('h1'), { dir: 'rev' }));
      const arriving = eq(sig(P(pi, a, I(pi)), r), sig(pi, sig(a, sig(I(pi), sig(pi, A('p'))))));
      const inner = F.pinFromAddr(arriving, { side: 'r', path: [1, 1] })!;
      const m3 = f82.add(lawRw(schema('act.mul'), { dir: 'rev', target: inner })), cn = f82.add(cancel()), e1 = f82.add(lawRw(schema('act.e'))), h3 = f82.add(lawRw(given('h3'))), h2 = f82.add(lawRw(given('h2')));
      f82.wire(sp, m1); f82.wire(m1, m2); f82.wire(m2, h1); f82.wire(h1, m3); f82.wire(m3, cn); f82.wire(cn, e1); f82.wire(e1, h3); f82.wire(h3, h2); f82.wire(h2, f82.socket());
    }
    for (const f of [f72, f82]) {
      const seen: string[] = [];
      const scan = (what: string, v: unknown, path = ''): void => {
        // `structs` is chooser data (binder ids, option labels); the lens does not draw a chooser for an action
        if (typeof v === 'string') { if (v.includes('σ') && !path.includes('.structs.')) seen.push(`${what}${path}: ${v.slice(0, 160)}`); return; }
        if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) scan(what, x, `${path}.${k}`);
      };
      const comp = f.compile();
      scan('compiled', [comp.machines, comp.sockets, comp.beltErrors]);
      for (const m of f.c.machines) {
        const look = lookOf(m, f.ctx);
        scan(`look ${m.id}`, [look.label, look.name, look.glyph, look.title]);
        const c = m.config as { recipe?: { k: string; ref?: never }; ref?: never };
        if (c.recipe?.k === 'law') scan(`name ${m.id}`, F.libName(f.ctx, (c.recipe as unknown as { ref: never }).ref));
      }
      // editor notes and refusals: re-lay every belt on its own ports (replaces the feed), and remove each machine
      for (const b of f.c.belts) { const e = F.connect(f.c, b.from, b.to!, f.ctx); scan('connect', e); }
      for (const m of f.c.machines) if (!m.locked) scan('remove', F.remove(f.c, [m.id]));
      expect(seen, seen.join('\n')).toEqual([]);
    }
  });
});

describe('round 2 copy', () => {
  it('a hover header uppercases every word, never the maths', () => {
    expect(capsHTML('acting by a product')).toBe('acting by a product'); // all words (the stylesheet capitalises them), none wrapped as maths
    expect(capsHTML('fibre lemma at π')).toMatch(/fl-nocaps"> ?π/);
    expect(capsHTML('fibre lemma at π')).not.toMatch(/fl-nocaps">[^<]*lemma/);
    expect(upperWords('acting by a product')).toBe('ACTING BY A PRODUCT');
  });
  it('the Spool hover is just "Spool"', () => {
    const f = new Floor(LEVEL_BY_ID['P4.1']!, []);
    const sp = f.add({ kind: 'spool', t: { k: 'knob', term: null } } as never);
    const g = buildGeo(f.c, null, f.ctx).ms.get(sp)!;
    expect(machineNameOf(g, { L: {}, level: f.level, comp: null, schemaName: (id: string) => id })).toBe('Spool');
  });
  it("a mirror toggle shows the statements at the chosen homomorphism (π), not the card's f", () => {
    const lv = LEVEL_BY_ID['P16.2']!;
    const X = { k: 'meta', id: 'x' }, Y = { k: 'meta', id: 'y' };
    const fx = (t: unknown) => ({ k: 'app', fn: 'f', args: [t] });
    const card: Card = { k: 'cond', metas: ['x', 'y'], premises: [{ k: 'eq', l: fx(X), r: { k: 'e', s: 'T' } }], concl: { k: 'eq', l: fx({ k: 'mul', fs: [X, Y] }), r: fx({ k: 'mul', fs: [Y, X] }) },
      binds: [{ k: 'grp', id: 'S' }, { k: 'grp', id: 'T' }, { k: 'hom', id: 'f', dom: { k: 'sortmeta', id: 'S' }, cod: { k: 'sortmeta', id: 'T' } }] } as never;
    const base = ctxFor(lv, [], []);
    const ctx = { ...base, registry: { ...base.registry, lem: { id: 'lem', name: 'lemma', textbook: 'lemma', card, origin: 'authored', mirrorable: true } } };
    const m = { id: 'th', kind: 'theorem', at: { x: 0, y: 0 }, rot: 0, config: { kind: 'theorem' } };
    const s = { level: lv, ctx, canvas: { machines: [m], belts: [], rooms: [] }, compiled: { machines: { th: { structs: [{ binder: 'f', normal: false, options: [], chosen: 'pi' }] } } } } as unknown as S;
    const ref = { k: 'schema', id: 'lem' } as never;
    const a = recipeInstanceCard(s, m as never, ref, false)!, b = recipeInstanceCard(s, m as never, ref, true)!;
    const [pl, ol] = sideLabel(a, b, { pi: 'π', f: 'f' });
    expect(plain(pl) + plain(ol)).toContain('π');
    expect(plain(pl) + plain(ol)).not.toMatch(/\bf\(/);
  });
});

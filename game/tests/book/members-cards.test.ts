// Concept cards of the Members levels (P5.1, P5.4, P11.1, P12.1, P13.1), checked like the other worlds' cards (w89-cards.test.ts):
// coverage, copy length, markdown and maths delimiters, the NORMS that are checkable (terms never beads, no → in maths, ⟹ not ⇒, standard names),
// symbols defined where they first appear, and no spoilers. The cards of these levels carry no figures: ∈ is not a relation a math figure can draw.
import { describe, expect, it } from 'vitest';
import { BOOK_CARDS, BOOK_LEVELS } from '../../src/levels/book';
import { CARDS as C04 } from '../../src/levels/book/w04';
import { CARDS as C09 } from '../../src/levels/book/w09';
import { CARDS as C10 } from '../../src/levels/book/w10';
import { CARDS as C11 } from '../../src/levels/book/w11';
import type { ConceptCard } from '../../src/levels/cards';
import { BOOK_M } from './kit-members';
import { MEMBERS_IDS } from './members-ids';

const ALL: Record<string, ConceptCard[]> = { ...C04, ...C09, ...C10, ...C11 };
const CARDS: Record<string, ConceptCard[]> = Object.fromEntries(Object.entries(ALL).filter(([id]) => MEMBERS_IDS.includes(id)));
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const allText = (c: ConceptCard) => [c.title, c.body, c.example, c.nearMiss, c.gesture].filter(Boolean).join('\n');
const texSpans = (s: string) => (s.match(/\$[^$]*\$/g) ?? []).map((x) => x.slice(1, -1));

describe('Members levels · concept cards', () => {
  it('every Members level has 1–3 cards, in campaign order, and nothing else is keyed', () => {
    expect(Object.keys(CARDS)).toEqual(BOOK_M.map((l) => l.id));
    for (const l of BOOK_M) { expect(CARDS[l.id]!.length, l.id).toBeGreaterThanOrEqual(1); expect(CARDS[l.id]!.length, l.id).toBeLessThanOrEqual(3); }
    for (const id of MEMBERS_IDS) expect(BOOK_CARDS[id], `${id} reaches the HUD through the Book index`).toBeDefined();
    for (const [w, cs] of [['w04', C04], ['w09', C09], ['w10', C10], ['w11', C11]] as const) {
      const keys = Object.keys(cs);
      const order = BOOK_LEVELS.map((l) => l.id);
      expect(keys.map((k) => order.indexOf(k)), `${w} card keys are in campaign order`).toEqual([...keys.map((k) => order.indexOf(k))].sort((p, q) => p - q));
    }
  });
  it('copy is short unless the card is deliberately long; worked example / near miss only on long cards', () => {
    for (const [id, cs] of Object.entries(CARDS)) for (const c of cs) {
      const where = `${id} · ${c.title}`;
      expect(c.title.trim(), id).not.toBe('');
      expect(c.body !== undefined || (c.figures?.length ?? 0) > 0, `${where}: needs a figure or a body`).toBe(true);
      if (c.body) expect(words(c.body), where).toBeLessThanOrEqual(c.long ? 160 : 75);
      for (const k of ['example', 'nearMiss', 'gesture'] as const) if (!c.long) expect(c[k], `${where} · ${k} (long cards only)`).toBeUndefined();
    }
  });
  it('maths delimiters are balanced; no *italic*, no maths inside **bold**', () => {
    for (const [id, cs] of Object.entries(CARDS)) for (const c of cs) for (const t of [c.title, c.body ?? '']) {
      expect((t.match(/\$/g) ?? []).length % 2, `${id} · ${c.title}: ${t}`).toBe(0);
      expect(t.replace(/\*\*[^*]+\*\*/g, ''), `${id} · ${c.title}: stray *`).not.toMatch(/\*/);
      for (const b of t.match(/\*\*[^*]+\*\*/g) ?? []) expect(b, `${id} · ${c.title}`).not.toMatch(/\$/);
    }
  });
  it('NORMS: terms never beads; no → in maths; ⟹ and not ⇒; standard names, not machine nicknames; sentences, not fragments', () => {
    const arrow = /→|->|\\to\b|\\rightarrow|\\longrightarrow|⟶|\\mapsto/;
    const old = /Witness Stamp|Cancel Lathe|Double Flip|Sock Drawer|Exponent Multiplier|Conjugate Power|ᵒᵖ|unique right inverse/;
    for (const [id, cs] of Object.entries(CARDS)) for (const c of cs) {
      const t = allText(c);
      expect(t, `${id} · ${c.title}`).not.toMatch(/\bbeads?\b/i);
      for (const m of texSpans(t)) expect(m, `${id} · ${c.title}: $${m}$`).not.toMatch(arrow);
      expect(t, `${id} · ${c.title}`).not.toMatch(/⇒|\\Rightarrow/);
      expect(t, `${id} · ${c.title}`).not.toMatch(old);
      expect(c.body ?? '', `${id} · ${c.title}`).toMatch(/[.:]$/);
    }
  });
  it('the subgroup definition is on the first subgroup card: nonempty, closed under products, closed under inverses; ∈ is read aloud', () => {
    const t = allText(CARDS['P5.1']![0]!);
    expect(t).toMatch(/nonempty/);
    expect(t).toMatch(/closed under products/);
    expect(t).toMatch(/closed under inverses/);
    expect(t).toMatch(/\\in/);
    expect(t).toMatch(/is an element of/);
  });
  it('every symbol is defined on the card where it first appears in the Book (when that card is a Members card)', () => {
    const SYMBOLS: [string, RegExp, RegExp][] = [
      ['∀', /∀|\\forall/, /for every/],
      ['⟹', /⟹|\\implies/, /implies/],
      ['∈', /∈|\\in\b/, /element of/],
      ['|G|', /\|G\|/, /size of/],
      ['ℤ', /ℤ(?![₀-₉])|\\mathbb\{Z\}/, /integers/],
    ];
    const ordered = BOOK_LEVELS.flatMap((lv) => (BOOK_CARDS[lv.id] ?? []).map((c, i) => ({ lv: lv.id, i, c })));
    for (const [sym, uses, defines] of SYMBOLS) {
      const first = ordered.find(({ c }) => uses.test(allText(c)));
      if (!first || !MEMBERS_IDS.includes(first.lv)) continue;
      expect(allText(first.c), `${sym} first appears on ${first.lv}#${first.i + 1} (${first.c.title}) and must be defined there`).toMatch(defines);
    }
    // the Lagrange card defines |G| (it is the first card to use it)
    expect(allText(CARDS['P13.1']![1]!)).toMatch(/size of \$G\$/);
  });
  it('no spoilers: no card states a dock’s result or names the route', () => {
    const t = (id: string) => (CARDS[id] ?? []).map(allText).join('\n');
    expect(t('P5.1')).not.toMatch(/e \\in H|contains \$e\$|a\^\{-1\}|aa\^/);
    expect(t('P5.4')).not.toMatch(/\(cd\)|cd\s*u|inverse of a product|socks/i);
    expect(t('P11.1')).not.toMatch(/-q|\(a\^3\)|power\.|multiply|a\^r \\in H \\implies/);
    expect(t('P12.1')).not.toMatch(/double inverse|inverse of a product|contains e|insert|cancel/i);
    expect(t('P13.1')).not.toMatch(/symmetric|transitive|P12\.1|saved/i);
  });
  it('the Lagrange card explains the counting step in complete sentences and says what it unlocks', () => {
    const c = CARDS['P13.1']![1]!;
    for (const need of [/split/, /do not overlap/, /as many elements as/, /divides/, /Lagrange recipe/, /x\^\{\|G\|\} = e/]) expect(c.body, String(need)).toMatch(need);
    expect(c.body!.split(/(?<=\.)\s+/).every((s) => /^[A-Z$*]/.test(s))).toBe(true);
  });
});

// The Book · concept cards across all 14 worlds, in campaign order (card audit 2026-10-15, design/pinter/reviews/card-audit.md).
// The per-world lints (w123-, w89-, wA-, wC-, wZ-, members-cards) check their own levels. This file checks what only makes sense
// over the whole campaign, and the norms the audit found broken:
//   · every symbol and notation is defined on the first card that uses it (∎ and the dock, ∀, ⟹, ∈, ⊢ ⊣, ⊥, f: A → B, ∘, e_G,
//     homomorphism, ℤ, |G|, ≤, ⊴, ker, ∩, ≅, G/N);
//   · NORMS vocabulary: the dock is the DELIVER dock, an action reads g(p) (σ never shown), no → outside map types;
//   · card TeX is TeX the renderer knows, with no stray “;” (a single-backslash \; in a JS string prints as “;”);
//   · letter shapes come from ui/letters (no per-card hue that fights it);
//   · every figure renders with exactly the letters the HUD gives it (no plain-text fallback);
//   · no figure shows its level’s own target (equations, inequations and memberships), and the spoilers this audit removed stay out.
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import type { Card, Pallet, Term } from '../../src/kernel/types';
import { BOOK_CARDS, BOOK_LEVELS } from '../../src/levels/book';
import * as W01 from '../../src/levels/book/w01';
import * as W02 from '../../src/levels/book/w02';
import * as W03 from '../../src/levels/book/w03';
import * as W04 from '../../src/levels/book/w04';
import * as W05 from '../../src/levels/book/w05';
import * as W06 from '../../src/levels/book/w06';
import * as W07 from '../../src/levels/book/w07';
import * as W08 from '../../src/levels/book/w08';
import * as W09 from '../../src/levels/book/w09';
import * as W10 from '../../src/levels/book/w10';
import * as W11 from '../../src/levels/book/w11';
import * as W12 from '../../src/levels/book/w12';
import * as W13 from '../../src/levels/book/w13';
import * as W14 from '../../src/levels/book/w14';
import type { AtomSpec, ConceptCard, Figure, MathCell } from '../../src/levels/cards';
import { RELS, displayTerm, parseDisplay, parseDisplayFig, parseSubgroup, type DFactor } from '../../src/hud/figures/parse';
import { KNOWN_MACROS, mdHTML, mdInline } from '../../src/hud/figures/tex';
import { richHTML } from '../../src/hud/util';
import { lettersOf } from '../../src/hud/figures/terms';
import { letterSlot } from '../../src/ui/letters';

const WORLDS = [W01, W02, W03, W04, W05, W06, W07, W08, W09, W10, W11, W12, W13, W14];
const LEVEL = Object.fromEntries(BOOK_LEVELS.map((l) => [l.id, l]));
const figuresOf = (c: ConceptCard): Figure[] => c.figures ?? [];
const cellText = (x: MathCell) => (typeof x === 'string' ? x : x.t);
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Every piece of copy a card shows: prose (with $…$ maths) and figure maths. */
function copyOf(c: ConceptCard): { prose: string[]; maths: string[] } {
  const prose = [c.title, c.body, c.example, c.nearMiss, c.gesture].filter((x): x is string => !!x);
  const maths: string[] = [];
  for (const f of figuresOf(c)) {
    if (f.k === 'math') {
      if (f.caption) prose.push(f.caption);
      for (const r of f.rows) {
        if (r.label) prose.push(r.label);
        if (r.why) prose.push(r.why);
        for (const x of r.seq) { maths.push(cellText(x)); if (typeof x !== 'string') for (const b of x.br) prose.push(b[2]); }
      }
    }
    if (f.k === 'scene') {
      for (const n of f.spec.notes ?? []) prose.push(n.text);
      for (const it of f.spec.items ?? []) maths.push(it.t);
    }
    // the orders table prints its own caption, “In G, |G| = n. Every order divides n.”: it uses |G| and Lagrange
    if (f.k === 'orders') prose.push('|G|');
  }
  return { prose, maths };
}
const allText = (c: ConceptCard) => { const { prose, maths } = copyOf(c); return [...prose, ...maths].join('\n'); };
const texSpans = (s: string) => (s.match(/\$[^$]*\$/g) ?? []).map((x) => x.slice(1, -1));
/** Every card in campaign order. */
const ORDERED = BOOK_LEVELS.flatMap((lv) => (BOOK_CARDS[lv.id] ?? []).map((c, i) => ({ lv: lv.id, i, c })));
/** The letters the HUD draws a figure with (concept.ts: the figure's own atoms, else the level's), through the HUD's own lettersOf. */
const hudLetters = (lvId: string, own?: AtomSpec[]) => lettersOf(own ?? LEVEL[lvId]!.atoms.map((a) => ({ id: a.id, label: a.label, hue: a.hue })));

// ───────── spoiler check: figure statements vs the level's targets (eq, neq and mem) ─────────
type Pair = { l: Term; rel: 'eq' | 'neq'; r: Term } | { l: Term; rel: 'mem'; sub: string };
const metasToAtoms = (t: Term): Term => JSON.parse(JSON.stringify(t), (_k, v) => (v && v.k === 'meta' ? { k: 'atom', id: v.id } : v)) as Term;
const key = (t: Term) => JSON.stringify(K.norm(t));
function targetPairs(lvId: string, t: Pallet | Card): Pair[] {
  const subLabel = (id: string) => LEVEL[lvId]!.subgroups?.find((s) => s.id === id)?.label ?? id;
  const one = (f: { k: string; l?: Term; r?: Term; t?: Term; sub?: { id: string } }): Pair[] => {
    if (f.k === 'eq' || f.k === 'neq') return [{ l: metasToAtoms(f.l!), rel: f.k, r: metasToAtoms(f.r!) }];
    if (f.k === 'mem' && f.t && f.sub) return [{ l: metasToAtoms(f.t), rel: 'mem', sub: subLabel(f.sub.id) }];
    return [];
  };
  switch (t.k) {
    case 'law': return one({ k: 'eq', l: t.l, r: t.r });
    case 'cond': return one(t.concl as never);
    default: return one(t as never);
  }
}
function figurePairs(lvId: string, c: ConceptCard): Pair[] {
  const out: Pair[] = [];
  for (const f of figuresOf(c)) {
    if (f.k === 'math') {
      const atoms = hudLetters(lvId, f.atoms).atoms;
      for (const row of f.rows) {
        if (row.strike) continue;
        const s = row.seq;
        // a chain t₀ = t₁ = … = tₙ shows every tᵢ = tⱼ; ≠ and ∈ relate their two neighbours
        let run: (DFactor[] | null)[] = [];
        const close = () => { for (let i = 0; i < run.length; i++) for (let j = i + 1; j < run.length; j++) if (run[i] && run[j]) out.push({ l: displayTerm(run[i]!), rel: 'eq', r: displayTerm(run[j]!) }); run = []; };
        s.forEach((x, i) => {
          if (typeof x === 'string' && RELS.includes(x)) {
            const l = s[i - 1], r = s[i + 1];
            if (x === '≠' && l !== undefined && r !== undefined) { const L = parseDisplay(cellText(l), atoms), R = parseDisplay(cellText(r), atoms); if (L && R) out.push({ l: displayTerm(L), rel: 'neq', r: displayTerm(R) }); }
            if (x === '∈' && l !== undefined && r !== undefined) { const L = parseDisplay(cellText(l), atoms), sub = parseSubgroup(cellText(r)); if (L && sub) out.push({ l: displayTerm(L), rel: 'mem', sub: sub.label }); }
            if (x !== '=') close();
            return;
          }
          if (s[i - 1] === '∈') return; // a subgroup
          if (s[i - 1] !== undefined && s[i - 1] !== '=') close();
          run.push(parseDisplay(cellText(x), atoms));
        });
        close();
      }
    }
    if (f.k === 'scene') {
      const atoms = hudLetters(lvId, f.atoms).atoms;
      for (const it of f.spec.items ?? []) for (const p of parseDisplayFig(it.t, atoms)?.parts ?? []) {
        if (p.rel === '∈' && p.sub) out.push({ l: displayTerm(p.l), rel: 'mem', sub: p.sub.label });
        else if (p.r) out.push({ l: displayTerm(p.l), rel: p.rel === '≠' ? 'neq' : 'eq', r: displayTerm(p.r) });
      }
    }
  }
  return out;
}
const same = (a: Pair, b: Pair) => {
  if (a.rel !== b.rel) return false;
  if (a.rel === 'mem' || b.rel === 'mem') return a.rel === 'mem' && b.rel === 'mem' && a.sub === b.sub && key(a.l) === key(b.l);
  return (key(a.l) === key(b.l) && key(a.r) === key(b.r)) || (key(a.l) === key(b.r) && key(a.r) === key(b.l));
};
const spoilers = (lvId: string, cards: ConceptCard[]) => {
  const targets = LEVEL[lvId]!.sockets.flatMap((s) => targetPairs(lvId, s.target));
  return cards.flatMap((c, i) => (figurePairs(lvId, c).some((p) => targets.some((t) => same(p, t))) ? [`${lvId}#${i + 1} ${c.title}`] : []));
};

describe('The Book · concept cards, whole campaign', () => {
  it('every level has 1–3 cards, and each world file lists them in campaign order', () => {
    for (const lv of BOOK_LEVELS) {
      expect(BOOK_CARDS[lv.id]?.length ?? 0, lv.id).toBeGreaterThanOrEqual(1);
      expect(BOOK_CARDS[lv.id]!.length, lv.id).toBeLessThanOrEqual(3);
    }
    for (const w of WORLDS) expect(Object.keys(w.CARDS), w.LEVELS[0]?.id).toEqual(w.LEVELS.map((l) => l.id));
  });

  it('every symbol and notation is defined on the first card that uses it, in campaign order', () => {
    const SYMBOLS: [string, RegExp, RegExp][] = [
      ['∎', /∎/, /end of a proof/],
      ['the dock', /\bdocks?\b/i, /labelled DELIVER/],
      ['∀', /∀|\\forall/, /for every/],
      ['⟹', /⟹|\\implies/, /implies/],
      ['∈', /∈|\\in\b/, /is an element of/],
      ['⊢', /⊢/, /desk \(⊢\)/],
      ['⊣', /⊣/, /gate \(⊣\)/],
      ['⊥', /⊥|\\bot/, /“bottom”/],
      ['a map type f: A → B', /: [A-Z]\S* → /, /\*\*map\*\*/],
      ['∘', /∘|\\circ/, /\*\*composite\*\*/],
      ['e_G', /e_G|e_\{G/, /its own identity/],
      ['homomorphism', /homomorphism/i, /\*\*homomorphism\*\*/],
      ['ℤ', /ℤ(?![₀-₉])|\\mathbb\{Z\}/, /set of integers/],
      ['≤ (subgroup)', /≤|\\le\b|\\leq\b/, /is a subgroup of/],
      ['⊴', /⊴|\\trianglelefteq|\\unlhd/, /is a normal subgroup of/],
      ['|G|', /\|G\|/, /size of/],
      ['ker', /\\ker|\bker\b/, /\*\*kernel\*\*/],
      ['∩', /∩|\\cap\b/, /common to/],
      ['≅', /≅|\\cong\b/, /isomorphic/],
      ['G/N', /G\/N|G\/\\ker/, /modulo/],
    ];
    for (const [sym, uses, defines] of SYMBOLS) {
      const first = ORDERED.find(({ c }) => uses.test(allText(c)));
      expect(first, `${sym} appears on some Book card`).toBeDefined();
      expect(allText(first!.c), `${sym} first appears on ${first!.lv}#${first!.i + 1} (${first!.c.title}) and must be defined there`).toMatch(defines);
    }
  });

  it('NORMS vocabulary: the DELIVER dock, g(p) for an action, terms not beads, ⟹ not ⇒, one name per theorem', () => {
    for (const { lv, c } of ORDERED) {
      const t = allText(c), where = `${lv} · ${c.title}`;
      expect(t, `${where}: the floor labels the dock DELIVER`).not.toMatch(/Receiving Dock/);
      expect(t, `${where}: an action applied reads g(p); σ is never shown`).not.toMatch(/σ|\\sigma\b/);
      expect(t, where).not.toMatch(/\bbeads?\b/i);
      expect(t, where).not.toMatch(/⇒|\\Rightarrow|e'/);
      expect(t, where).not.toMatch(/Witness Stamp|Cancel Lathe|Double Flip|Sock Drawer|ᵒᵖ|unique right inverse|uniqueness of inverses|maps? that preserves? products/);
    }
  });

  it('no → in maths except in a map type (f: A → B)', () => {
    const mapType = /[A-Za-zα-ωφπ\\]+(?:_\d|_\{[^}]*\})?\s*:\s*[A-Z](?:_\d|_\{[^}]*\})?\s*→\s*[A-Z](?:_\d|_\{[^}]*\})?/g;
    for (const { lv, c } of ORDERED) {
      const { prose, maths } = copyOf(c);
      for (const m of [...prose.flatMap(texSpans), ...maths]) expect(m.replace(mapType, ''), `${lv} · ${c.title}: ${m}`).not.toMatch(/→|->|\\to\b|\\rightarrow|⟶|\\mapsto/);
    }
  });

  it('card TeX is TeX the renderer knows, and no maths span has a stray “;”', () => {
    for (const { lv, c } of ORDERED) for (const m of copyOf(c).prose.flatMap(texSpans)) {
      for (const cmd of m.match(/\\([A-Za-z]+)/g) ?? []) expect(KNOWN_MACROS.has(cmd.slice(1)), `${lv} · ${c.title}: ${cmd} in $${m}$`).toBe(true);
      expect(m, `${lv} · ${c.title}: “;” in $${m}$ (write \\\\; for a thin space, or nothing)`).not.toMatch(/;/);
    }
  });

  it('copy reads as sentences: bodies end with a full stop or a colon, and stay within the length budget', () => {
    for (const { lv, c } of ORDERED) {
      const where = `${lv} · ${c.title}`;
      for (const s of [c.body, c.example, c.nearMiss].filter((x): x is string => !!x)) expect(s.trim(), where).toMatch(/[.:]$/);
      if (c.body) expect(words(c.body), where).toBeLessThanOrEqual(c.long ? 160 : 75);
    }
  });

  it('letter shapes come from ui/letters: no card gives a letter a hue of its own, and one figure never draws two letters alike', () => {
    for (const { lv, c } of ORDERED) for (const f of figuresOf(c)) {
      if (f.k !== 'math' && f.k !== 'scene') continue;
      for (const a of f.atoms ?? []) expect(a.hue, `${lv} · ${c.title}: ${a.label}`).toBe(letterSlot(a.label));
      // letters = shapes: within one figure, two constants in the same shape would read as one letter
      const consts = (f.atoms ?? []).filter((a) => !a.sort);
      const slots = consts.map((a) => letterSlot(a.label));
      expect(new Set(slots).size, `${lv} · ${c.title}: ${consts.map((a) => `${a.label}→${letterSlot(a.label)}`).join(' ')}`).toBe(slots.length);
    }
  });

  it('row labels are plain text (the HUD prints them as written, so no $…$ or **…**)', () => {
    for (const { lv, c } of ORDERED) for (const f of figuresOf(c)) if (f.k === 'math') for (const r of f.rows) expect(r.label ?? '', `${lv} · ${c.title}`).not.toMatch(/\$|\*\*/);
  });

  it('every figure renders: each term parses with exactly the letters the HUD draws it with', () => {
    for (const { lv, c } of ORDERED) for (const f of figuresOf(c)) {
      const where = `${lv} · ${c.title} · ${f.k}`;
      if (f.k === 'math') {
        const atoms = hudLetters(lv, f.atoms).atoms;
        for (const r of f.rows) for (const [xi, x] of r.seq.entries()) {
          if (typeof x === 'string' && (RELS.includes(x) || x === '⊥')) continue;
          if (r.seq[xi - 1] === '∈') { expect(parseSubgroup(cellText(x)), `${where}: ${cellText(x)} after ∈ is a subgroup`).not.toBeNull(); continue; }
          const fs = parseDisplay(cellText(x), atoms);
          expect(fs, `${where}: ${cellText(x)} would print as plain text`).not.toBeNull();
          if (typeof x !== 'string') for (const [from, to] of x.br) expect(to, `${where}: brace ${from}–${to} over ${x.t}`).toBeLessThanOrEqual(fs!.length);
        }
      }
      if (f.k === 'scene') {
        const atoms = hudLetters(lv, f.atoms).atoms;
        for (const it of f.spec.items ?? []) expect(parseDisplayFig(it.t, atoms), `${where}: ${it.t}`).not.toBeNull();
      }
    }
  });

  it('no raw markup leaks: $ balances in prose, and plain-text fields (titles, level copy) carry no $…$ or **…**', () => {
    for (const { lv, c } of ORDERED) {
      for (const sp of copyOf(c).prose) expect((sp.match(/\$/g) ?? []).length % 2, `${lv} · ${c.title}: ${sp}`).toBe(0);
      expect(c.title, `${lv}: a card title prints as written`).not.toMatch(/\$|\*\*/);
    }
    for (const l of BOOK_LEVELS) for (const t of [l.title, l.memo, l.idea, l.insight ?? '', ...(l.lemmaNames ?? [])]) expect(t, `${l.id}: ${t}`).not.toMatch(/\$|\*\*/);
  });

  it('player text names levels by title, never by id (P12.1)', () => {
    const id = /\bP\d+\.(?:\d+|s\d+)\b/;
    for (const { lv, c } of ORDERED) expect(allText(c), `${lv} · ${c.title}`).not.toMatch(id);
    for (const l of BOOK_LEVELS) for (const t of [l.title, l.memo, l.idea, l.insight ?? '', ...(l.lemmaNames ?? [])]) expect(t, `${l.id}: ${t}`).not.toMatch(id);
  });

  it('a minus in maths is a minus: no ASCII hyphen-minus except before a digit (the renderer turns -1 into −1)', () => {
    for (const { lv, c } of ORDERED) for (const sp of copyOf(c).prose) {
      for (const m of texSpans(sp)) expect(m, `${lv} · ${c.title}: $${m}$`).not.toMatch(/-(?!\d)/);
      expect(sp.replace(/\$[^$]*\$/g, 'M'), `${lv} · ${c.title}: a spaced hyphen reads as a minus or a dash`).not.toMatch(/\s-\s/);
    }
  });

  it('a card names a given exactly as the floor does', () => {
    const norm = (t: string) => t.replace(/\$/g, '').replace(/\\(ker|cap|pi|in)\b/g, (_m, w: string) => ({ ker: 'ker', cap: '∩', pi: 'π', in: '∈' } as Record<string, string>)[w]!)
      .replace(/\\[{}]/g, '').replace(/[{}_\s]/g, '').replace(/ₐ/g, 'a');
    for (const { lv, c } of ORDERED) {
      const names = LEVEL[lv]!.givens.map((g) => norm(g.name));
      const t = copyOf(c).prose.join('\n');
      for (const m of t.matchAll(/[Tt]he given (?:\$([^$]+)\$|“([^”]+)”)/g)) expect(names, `${lv} · ${c.title}: “the given ${m[1] ?? m[2]}”`).toContain(norm(m[1] ?? m[2]!));
    }
  });

  it('rendered text shows no source: card prose through the HUD’s own renderer, level copy as the order chip and Paper print it', () => {
    // what the player reads, tags stripped: no $, no ^( or ^-1 or ^{, no TeX command name, no “.;” from a lost \;
    const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&[a-z]+;|&#\d+;/g, ' ');
    const RAW = /\$|\^\(|\^-|\^\{|\\[A-Za-z]|\.\s*;|\*\*/;
    for (const { lv, c } of ORDERED) {
      const where = `${lv} · ${c.title}`;
      expect(c.title, where).not.toMatch(RAW); // printed as written
      for (const t of [c.body, c.example, c.nearMiss, c.gesture].filter((x): x is string => !!x)) expect(text(mdHTML(t)), where).not.toMatch(RAW);
      for (const f of figuresOf(c)) {
        if (f.k === 'math') {
          if (f.caption) expect(text(mdInline(f.caption)), where).not.toMatch(RAW);
          for (const r of f.rows) {
            expect(r.label ?? '', `${where}: row labels print as written`).not.toMatch(RAW);
            if (r.why) expect(text(mdInline(r.why)), where).not.toMatch(RAW);
            for (const x of r.seq) if (typeof x !== 'string') for (const b of x.br) expect(text(mdInline(b[2])), where).not.toMatch(RAW);
          }
        }
        if (f.k === 'scene') for (const n of f.spec.notes ?? []) expect(text(mdInline(n.text)), where).not.toMatch(RAW);
      }
    }
    for (const l of BOOK_LEVELS) {
      for (const t of [l.title, l.memo]) expect(t, `${l.id}: printed as written`).not.toMatch(RAW);
      for (const t of [l.idea, l.insight ?? '']) expect(text(richHTML(t, l)), `${l.id}: ${t}`).not.toMatch(RAW);
    }
  });

  it('no figure shows its level’s own target: equations, inequations or memberships', () => {
    for (const lv of BOOK_LEVELS) expect(spoilers(lv.id, BOOK_CARDS[lv.id] ?? []), lv.id).toEqual([]);
  });

  it('the spoiler check sees memberships and conclusions', () => {
    const mem: ConceptCard = { title: 'leak', figures: [{ k: 'math', rows: [{ seq: ['e', '∈', 'H'] }] }] };
    expect(spoilers('P5.1', [mem])).toHaveLength(1);
    const other: ConceptCard = { title: 'ok', figures: [{ k: 'math', atoms: [{ id: 'p', label: 'p', hue: letterSlot('p') }], rows: [{ seq: ['p', '∈', 'H'] }] }] };
    expect(spoilers('P5.1', [other])).toEqual([]);
    const idem: ConceptCard = { title: 'leak', figures: [{ k: 'math', atoms: [{ id: 'x', label: 'x', hue: letterSlot('x') }], rows: [{ seq: ['x', '=', 'e'] }] }] };
    expect(spoilers('P4.7', [idem])).toHaveLength(1);
  });

  it('the spoilers this audit removed stay out (no route, key move or named insight on a level’s own cards)', () => {
    const LEAK: Record<string, RegExp[]> = {
      'P3.2': [/backwards, \$x =/, /d\(cc\)/],
      'P3.3': [/\(uv\)\(uv\)/, /any term/],
      'P4.3': [/inverse pair|insert/i],
      'P4.5': [/\bcut/i],
      'P4.6': [/multipl|times/i],
      'P4.8': [/frame/i, /\(cdc\^-1\)/],
      'P4.10': [/making a product equal/i, /pqrs|s\^-1s/],
      'P4.11': [/\bcuts?\b|several/i],
      'P4.12': [/no repeats|cancellation/i],
      'P4.13': [/seam|any run|across/i],
      'P4.s2': [/that is a power|backwards/i],
      'P4.s3': [/build your own/i],
      'P4.s4': [/pqpq/],
      'P5.3': [/instance|choos/i],
      'P5.s2': [/several terms|more than once/i],
      'P10.4': [/combin|sa \+ tb|u\^\(8\)/i],
      'P10.5': [/so to show|y\^\{-1\}cy/i],
      'P10.s1': [/which factor goes inside|\(u\^\(a\)\)/],
      'P10.s2': [/conjugate|p\^-1\(pq\)p/i],
      'P11.2': [/commute|j \+ i/],
      'P13.3': [/again and again|collect/i],
      'P13.4': [/normal form|keep rewriting/i],
      'P14.4': [/two groupings|\(pq\)r|chapter 4|commutator/i],
      'P15.4': [/u\^\(m\)|at \$z =/],
      'P16.s2': [/sum of exponents|x\^\(6\)x\^\(-5\)/],
    };
    for (const [id, res] of Object.entries(LEAK)) for (const [i, c] of (BOOK_CARDS[id] ?? []).entries()) for (const re of res) expect(allText(c), `${id}#${i + 1} ${c.title}`).not.toMatch(re);
  });
});

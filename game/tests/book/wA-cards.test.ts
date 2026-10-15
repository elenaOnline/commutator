// Concept-card lint for the phase-A levels (worlds 4, 6, 7, 10, 11, 13, 14): coverage, copy rules, real figures, no spoilers.
// Same rules as w123-cards.test.ts (design/NORMS.md), applied to this batch's cards.
import { describe, expect, it } from 'vitest';
import { POWER_SCHEMAS, norm } from '../../src/kernel';
import type { AtomDecl, Card, Pallet, Term } from '../../src/kernel/types';
import { catalogue } from '../../src/groups';
import { REGISTRY } from '../../src/levels/levels';
import { BOOK_A } from './kit-wA';
import { MEMBERS_IDS } from './members-ids';
import { MAPS_IDS } from './maps-ids';
import { WZ_IDS } from './wZ-ids';
import { BOOK_CARDS, BOOK_LEVELS } from '../../src/levels/book';
import { CARDS as C04 } from '../../src/levels/book/w04';
import { CARDS as C06 } from '../../src/levels/book/w06';
import { CARDS as C07 } from '../../src/levels/book/w07';
import { CARDS as C10 } from '../../src/levels/book/w10';
import { CARDS as C11 } from '../../src/levels/book/w11';
import { CARDS as C13 } from '../../src/levels/book/w13';
import { CARDS as C14 } from '../../src/levels/book/w14';
import { type AtomSpec, type ConceptCard, type Figure, type MathCell } from '../../src/levels/cards';
import { RELS, displayTerm, parseDisplay, parseDisplayFig, parseSubgroup, type DFactor } from '../../src/hud/figures/parse';

// the Members levels have their own card test (members-cards.test.ts)
const CARDS: Record<string, ConceptCard[]> = Object.fromEntries(Object.entries({ ...C04, ...C06, ...C07, ...C10, ...C11, ...C13, ...C14 }).filter(([id]) => !MEMBERS_IDS.includes(id) && !MAPS_IDS.includes(id) && !WZ_IDS.includes(id)));
const LEVEL_BY_ID = Object.fromEntries(BOOK_A.map((l) => [l.id, l]));
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const groupNamed = (name: string) => catalogue().find((g) => g.name === name);
const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈'];
const figuresOf = (c: ConceptCard): Figure[] => c.figures ?? [];
const cellText = (x: MathCell) => (typeof x === 'string' ? x : x.t);
const atomsOf = (lvId: string, own?: AtomSpec[]): AtomDecl[] =>
  (own ?? LEVEL_BY_ID[lvId]!.atoms).map((a) => ({ id: a.id, label: a.label, hue: a.hue, ...(a.sort ? { variable: true, sort: a.sort } : {}) }));

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
  }
  return { prose, maths };
}
const allText = (c: ConceptCard) => { const { prose, maths } = copyOf(c); return [...prose, ...maths].join('\n'); };
const texSpans = (s: string) => (s.match(/\$[^$]*\$/g) ?? []).map((x) => x.slice(1, -1));

// ───────── spoiler check ─────────
type Pair = { l: Term; rel: 'eq' | 'neq'; r: Term };
const metasToAtoms = (t: Term): Term => JSON.parse(JSON.stringify(t), (_k, v) => (v && v.k === 'meta' ? { k: 'atom', id: v.id } : v)) as Term;
const key = (t: Term) => JSON.stringify(norm(t));
function targetPairs(t: Pallet | Card): Pair[] {
  const P = (l: Term, rel: 'eq' | 'neq', r: Term): Pair => ({ l: metasToAtoms(l), rel, r: metasToAtoms(r) });
  switch (t.k) {
    case 'eq': case 'neq': return [P(t.l, t.k, t.r)];
    case 'law': return [P(t.l, 'eq', t.r)];
    case 'cond': return t.concl.k === 'eq' || t.concl.k === 'neq' ? [P(t.concl.l, t.concl.k, t.concl.r)] : [];
    default: return [];
  }
}
function figurePairs(lvId: string, c: ConceptCard): Pair[] {
  const out: Pair[] = [];
  const add = (l: DFactor[] | null, rel: string, r: DFactor[] | null) => { if (l && r && (rel === '=' || rel === '≠')) out.push({ l: displayTerm(l), rel: rel === '=' ? 'eq' : 'neq', r: displayTerm(r) }); };
  for (const f of figuresOf(c)) {
    if (f.k === 'math') {
      const atoms = atomsOf(lvId, f.atoms);
      for (const row of f.rows) {
        if (row.strike) continue;
        let run: (DFactor[] | null)[] = [];
        const close = () => { for (let i = 0; i < run.length; i++) for (let j = i + 1; j < run.length; j++) add(run[i]!, '=', run[j]!); run = []; };
        const s = row.seq;
        s.forEach((x, i) => {
          if (typeof x === 'string' && RELS.includes(x)) {
            if (x === '≠') { const l = s[i - 1], r = s[i + 1]; if (l !== undefined && r !== undefined) add(parseDisplay(cellText(l), atoms), '≠', parseDisplay(cellText(r), atoms)); }
            if (x !== '=') close();
            return;
          }
          const prev = s[i - 1];
          if (prev !== undefined && prev !== '=') close();
          run.push(parseDisplay(cellText(x), atoms));
        });
        close();
      }
    }
    if (f.k === 'scene') {
      const atoms = atomsOf(lvId, f.atoms);
      for (const it of f.spec.items ?? []) for (const p of parseDisplayFig(it.t, atoms)?.parts ?? []) if (p.r) add(p.l, p.rel ?? '=', p.r);
    }
  }
  return out;
}
const same = (a: Pair, b: Pair) => a.rel === b.rel && ((key(a.l) === key(b.l) && key(a.r) === key(b.r)) || (key(a.l) === key(b.r) && key(a.r) === key(b.l)));
function spoilers(lvId: string, cards: ConceptCard[]): string[] {
  const targets = LEVEL_BY_ID[lvId]!.sockets.flatMap((s) => targetPairs(s.target));
  const hits: string[] = [];
  cards.forEach((c, i) => { for (const p of figurePairs(lvId, c)) if (targets.some((t) => same(p, t))) hits.push(`${lvId}#${i + 1} ${c.title}`); });
  return hits;
}

describe('Phase-A levels · concept cards', () => {
  it('every level has 1–3 cards, and every card key is one of these levels', () => {
    for (const lv of BOOK_A) {
      const cs = CARDS[lv.id];
      expect(cs, lv.id).toBeDefined();
      expect(cs!.length, lv.id).toBeGreaterThanOrEqual(1);
      expect(cs!.length, lv.id).toBeLessThanOrEqual(3);
    }
    expect(Object.keys(CARDS).sort()).toEqual(BOOK_A.map((l) => l.id).sort());
    for (const id of Object.keys(CARDS)) expect(BOOK_CARDS[id], `${id} reaches the HUD through the Book index`).toBeDefined();
  });

  it('copy is short; maths delimiters balance; markdown renders cleanly', () => {
    for (const [id, cs] of Object.entries(CARDS)) for (const c of cs) {
      const where = `${id} · ${c.title}`;
      expect(c.title.trim(), id).not.toBe('');
      expect(c.body !== undefined || figuresOf(c).length > 0, `${where}: needs a figure or a body`).toBe(true);
      if (c.body) expect(words(c.body), where).toBeLessThanOrEqual(c.long ? 160 : 75);
      for (const k of ['example', 'nearMiss', 'gesture'] as const) if (!c.long) expect(c[k], `${where} · ${k}`).toBeUndefined();
      for (const s of copyOf(c).prose) {
        expect((s.match(/\$/g) ?? []).length % 2, `${where}: ${s}`).toBe(0);
        expect(s.replace(/\*\*[^*]+\*\*/g, ''), `${where}: stray *`).not.toMatch(/\*/);
        for (const b of s.match(/\*\*[^*]+\*\*/g) ?? []) expect(b, where).not.toMatch(/\$/);
      }
    }
  });

  it('terms never beads; no → in maths; one implication symbol; standard theorem names', () => {
    const arrow = /→|->|\\to\b|\\rightarrow|\\longrightarrow|⟶/;
    const old = /Witness Stamp|Cancel Lathe|Double Flip|Sock Drawer|Exponent Multiplier|Conjugate Power|ᵒᵖ|unique right inverse/;
    for (const [id, cs] of Object.entries(CARDS)) for (const c of cs) {
      const where = `${id} · ${c.title}`;
      const t = allText(c);
      expect(t, where).not.toMatch(/\bbeads?\b/i);
      expect(t, where).not.toMatch(/⇒|\\Rightarrow/);
      expect(t, where).not.toMatch(/e'/);
      expect(t, where).not.toMatch(old);
      const { prose, maths } = copyOf(c);
      for (const s of prose) for (const m of texSpans(s)) expect(m, `${where}: $${m}$`).not.toMatch(arrow);
      for (const m of maths) expect(m, `${where}: ${m}`).not.toMatch(arrow);
    }
  });

  it('every symbol is defined on the card where it first appears in the Book, when that card is ours', () => {
    const SYMBOLS: [string, RegExp, RegExp][] = [
      ['∀', /∀|\\forall/, /for every/],
      ['⟹', /⟹|⇒|\\Rightarrow|\\implies/, /implies/],
      ['∈', /∈|\\in\b/, /element of/],
      ['⊥', /⊥|\\bot/, /“bottom”/],
      ['|G|', /\|G\|/, /size of/],
      ['ℤ', /ℤ(?![₀-₉])|\\mathbb\{Z\}/, /integers/],
    ];
    const ordered = BOOK_LEVELS.flatMap((lv) => (BOOK_CARDS[lv.id] ?? []).map((c, i) => ({ lv: lv.id, i, c })));
    for (const [sym, uses, defines] of SYMBOLS) {
      const first = ordered.find(({ c }) => uses.test(allText(c)));
      if (!first || !CARDS[first.lv]) continue;
      expect(allText(first.c), `${sym} first appears on ${first.lv}#${first.i + 1} (${first.c.title}) and must be defined there`).toMatch(defines);
    }
  });

  it('no card shows its own level’s target statement as a figure result (no spoilers)', () => {
    for (const lv of BOOK_A) expect(spoilers(lv.id, CARDS[lv.id] ?? []), lv.id).toEqual([]);
  });

  it('every figure is real: terms parse, braces are in range, machines and groups exist', () => {
    const registry = { ...REGISTRY, ...POWER_SCHEMAS };
    for (const [id, cs] of Object.entries(CARDS)) {
      const lv = LEVEL_BY_ID[id]!;
      for (const c of cs) for (const f of figuresOf(c)) {
        const where = `${id} · ${c.title} · ${f.k}`;
        switch (f.k) {
          case 'math': {
            const atoms = atomsOf(id, f.atoms);
            for (const r of f.rows) for (const [xi, x] of r.seq.entries()) {
              if (typeof x === 'string' && (RELS.includes(x) || x === '⊥')) continue;
              if (r.seq[xi - 1] === '∈' && parseSubgroup(cellText(x))) continue; // a subgroup, drawn as its Euler set
              const fs = parseDisplay(cellText(x), atoms);
              expect(fs, `${where}: ${cellText(x)}`).not.toBeNull();
              if (typeof x !== 'string') for (const [from, to] of x.br) { expect(from, where).toBeGreaterThanOrEqual(0); expect(to, where).toBeGreaterThan(from); expect(to, `${where}: brace ${from}–${to} over ${x.t}`).toBeLessThanOrEqual(fs!.length); }
            }
            break;
          }
          case 'scene': {
            const atoms = atomsOf(id, f.atoms);
            for (const it of f.spec.items ?? []) expect(parseDisplayFig(it.t, atoms), `${where}: ${it.t}`).not.toBeNull();
            for (const m of f.spec.machines) {
              const c2 = m.config;
              const ref = (c2.kind === 'rewriter' && c2.recipe?.k === 'law') ? c2.recipe.ref : (c2.kind === 'theorem' && c2.recipe?.k === 'library') ? c2.recipe.ref : null;
              if (ref?.k === 'schema') expect(registry[ref.id], `${where}: schema ${ref.id}`).toBeDefined();
              if (ref?.k === 'given') expect(lv.givens.map((g) => g.id), where).toContain(ref.givenId);
              if (c2.kind === 'given') expect(lv.givens.map((g) => g.id), where).toContain(c2.givenId);
            }
            break;
          }
          case 'clock': expect(groupNamed(`ℤ${SUB[f.n] ?? '?'}`), `${where}: ℤ${f.n}`).toBeDefined(); break;
          case 'table': case 'orders': expect(groupNamed(f.group), `${where}: ${f.group}`).toBeDefined(); break;
          case 'gif': break;
        }
      }
    }
  });
});

// Book worlds 8–9 concept cards, checked like worlds 1–3 (w123-cards.test.ts). Concept cards (review 2026-10, design/review-2026-10/DESIGN_NORMS.md): coverage, copy rules, figures that
// actually exist (every term parses, every brace is in range, every machine recipe and group is real), and the
// norms that are checkable: terms never beads, no → in maths, symbols defined where they first appear, and
// no card showing its own level's target statement as a figure result.
import { describe, expect, it } from 'vitest';
import { POWER_SCHEMAS, norm } from '../../src/kernel';
import { powerSchema } from '../../src/kernel/powers';
import type { AtomDecl, Card, Pallet, Term } from '../../src/kernel/types';
import { catalogue } from '../../src/groups';
import { REGISTRY } from '../../src/levels/levels';
import { BOOK_89 as LEVELS, lv89 as lvOf } from './kit-w89';
import { MEMBERS_IDS } from './members-ids';
import { CARDS as C8 } from '../../src/levels/book/w08';
import { CARDS as C9 } from '../../src/levels/book/w09';
import { type AtomSpec, type ConceptCard, type Figure, type MathCell } from '../../src/levels/cards';
import { RELS, displayTerm, parseDisplay, parseDisplayFig, parseSubgroup, type DFactor } from '../../src/hud/figures/parse';

// the Members level P11.1 has its own card test (members-cards.test.ts)
const CARDS: Record<string, ConceptCard[]> = Object.fromEntries(Object.entries({ ...C8, ...C9 }).filter(([id]) => !MEMBERS_IDS.includes(id)));
const LEVEL_BY_ID: Record<string, (typeof LEVELS)[number]> = Object.fromEntries(LEVELS.map((l) => [l.id, l]));
void lvOf;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const groupNamed = (name: string) => catalogue().find((g) => g.name === name);
const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈'];
const figuresOf = (c: ConceptCard): Figure[] => c.figures ?? [];
/** Sentences, splitting on . ? ! (maths in $…$ is masked first so a⁻¹ etc. do not split). */
const sentences = (s: string) => s.replace(/\$[^$]*\$/g, 'M').split(/[.?!]+\**\s|[.?!]+\**$/).map((x) => x.trim()).filter(Boolean);
const cellText = (x: MathCell) => (typeof x === 'string' ? x : x.t);
const atomsOf = (lvId: string, own?: AtomSpec[]): AtomDecl[] =>
  (own ?? LEVEL_BY_ID[lvId]!.atoms).map((a) => ({ id: a.id, label: a.label, hue: a.hue, ...('sort' in a && a.sort ? { sort: a.sort } : {}) }));

/** Every piece of copy a card shows, as [where, text] — prose and figure text alike. */
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
/** The $…$ spans of a piece of prose. */
const texSpans = (s: string) => (s.match(/\$[^$]*\$/g) ?? []).map((x) => x.slice(1, -1));
/** Cards in campaign order. */
const ordered = () => LEVELS.flatMap((lv) => (CARDS[lv.id] ?? []).map((c, i) => ({ lv: lv.id, i, c })));

// ───────── spoiler check: figure equations vs the level's target statement ─────────
type Pair = { l: Term; rel: 'eq' | 'neq'; r: Term };
const metasToAtoms = (t: Term): Term => JSON.parse(JSON.stringify(t), (_k, v) => (v && v.k === 'meta' ? { k: 'atom', id: v.id } : v)) as Term;
const key = (t: Term) => JSON.stringify(norm(t));
function targetPairs(t: Pallet | Card): Pair[] {
  const P = (l: Term, rel: 'eq' | 'neq', r: Term): Pair => ({ l: metasToAtoms(l), rel, r: metasToAtoms(r) });
  switch (t.k) {
    case 'eq': case 'neq': return [P(t.l, t.k, t.r)];
    case 'law': return [P(t.l, 'eq', t.r)];
    case 'cond': return [P(t.concl.l, t.concl.k === 'neq' ? 'neq' : 'eq', t.concl.r)];
    default: return [];
  }
}
/** Equations a card's figures show as results (struck rows are non-rules and do not count). */
function figurePairs(lvId: string, c: ConceptCard): Pair[] {
  const out: Pair[] = [];
  const add = (l: DFactor[] | null, rel: string, r: DFactor[] | null) => { if (l && r && (rel === '=' || rel === '≠')) out.push({ l: displayTerm(l), rel: rel === '=' ? 'eq' : 'neq', r: displayTerm(r) }); };
  for (const f of figuresOf(c)) {
    if (f.k === 'math') {
      const atoms = atomsOf(lvId, f.atoms);
      for (const row of f.rows) {
        if (row.strike) continue;
        // a chain t₀ = t₁ = … = tₙ shows every tᵢ = tⱼ (transitivity); ≠ relates its two neighbours only
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
  const lv = LEVEL_BY_ID[lvId]!;
  const targets = lv.sockets.flatMap((s) => targetPairs(s.target));
  const hits: string[] = [];
  cards.forEach((c, i) => { for (const p of figurePairs(lvId, c)) if (targets.some((t) => same(p, t))) hits.push(`${lvId}#${i + 1} ${c.title}`); });
  return hits;
}

describe('Book worlds 8–9 · concept cards', () => {
  it('every level has 1–3 cards, and every card key is a level', () => {
    for (const lv of LEVELS) {
      const cs = CARDS[lv.id];
      expect(cs, lv.id).toBeDefined();
      expect(cs!.length, lv.id).toBeGreaterThanOrEqual(1);
      expect(cs!.length, lv.id).toBeLessThanOrEqual(3);
    }
    for (const id of Object.keys(CARDS)) expect(LEVEL_BY_ID[id], id).toBeDefined();
  });

  it('cards are listed in campaign order', () => {
    expect(Object.keys(CARDS)).toEqual(LEVELS.map((l) => l.id));
  });

  it('copy is short unless the card is deliberately long; worked example / near miss only on long cards', () => {
    for (const [id, cs] of Object.entries(CARDS)) {
      for (const c of cs) {
        const where = `${id} · ${c.title}`;
        expect(c.title.trim(), id).not.toBe('');
        expect(c.body !== undefined || figuresOf(c).length > 0, `${where}: needs a figure or a body`).toBe(true);
        if (c.body) expect(words(c.body), where).toBeLessThanOrEqual(c.long ? 160 : 75);
        for (const k of ['example', 'nearMiss', 'gesture'] as const) {
          if (!c.long) expect(c[k], `${where} · ${k} (long cards only)`).toBeUndefined();
          else if (c[k] !== undefined) expect(words(c[k]!), `${where} · ${k}`).toBeLessThan(60);
        }
      }
    }
  });

  it('maths delimiters are balanced', () => {
    for (const [id, cs] of Object.entries(CARDS)) for (const c of cs) for (const s of copyOf(c).prose) expect((s.match(/\$/g) ?? []).length % 2, `${id} · ${c.title}: ${s}`).toBe(0);
  });

  it('markdown the HUD renders cleanly: no *italic*, and no maths inside **bold**', () => {
    for (const [id, cs] of Object.entries(CARDS)) {
      for (const c of cs) {
        for (const t of copyOf(c).prose) {
          expect(t.replace(/\*\*[^*]+\*\*/g, ''), `${id} · ${c.title}: stray *`).not.toMatch(/\*/);
          for (const b of t.match(/\*\*[^*]+\*\*/g) ?? []) expect(b, `${id} · ${c.title}`).not.toMatch(/\$/);
        }
      }
    }
  });

  it('terms, never beads', () => {
    for (const [id, cs] of Object.entries(CARDS)) for (const c of cs) expect(allText(c), `${id} · ${c.title}`).not.toMatch(/\bbeads?\b/i);
  });

  it('no → in maths: = for equal terms, ⟹ for implication', () => {
    const arrow = /→|->|\\to\b|\\rightarrow|\\longrightarrow|⟶/;
    for (const [id, cs] of Object.entries(CARDS)) {
      for (const c of cs) {
        const { prose, maths } = copyOf(c);
        for (const s of prose) for (const m of texSpans(s)) expect(m, `${id} · ${c.title}: $${m}$`).not.toMatch(arrow);
        for (const m of maths) expect(m, `${id} · ${c.title}: ${m}`).not.toMatch(arrow);
      }
    }
  });

  it('one implication symbol, ⟹ (as in figures and the lens), and the prime is e′, never ASCII e\'', () => {
    for (const [id, cs] of Object.entries(CARDS)) {
      for (const c of cs) {
        const t = allText(c);
        expect(t, `${id} · ${c.title}`).not.toMatch(/⇒|\\Rightarrow/);
        expect(t, `${id} · ${c.title}`).not.toMatch(/e'/);
      }
    }
  });

  it('scenes show identifiable machines: no unset "?" placeholder', () => {
    for (const [id, cs] of Object.entries(CARDS)) for (const c of cs) for (const f of figuresOf(c)) if (f.k === 'scene') {
      for (const m of f.spec.machines) expect('recipe' in m.config ? m.config.recipe : 'set', `${id} · ${c.title}: ${m.config.kind}`).not.toBeNull();
    }
  });

  it('standard theorem names, never the old machine nicknames', () => {
    const old = /Witness Stamp|Cancel Lathe|Double Flip|Sock Drawer|Exponent Multiplier|Conjugate Power|ᵒᵖ|unique right inverse/;
    for (const [id, cs] of Object.entries(CARDS)) for (const c of cs) expect(allText(c), `${id} · ${c.title}`).not.toMatch(old);
  });

  it('every symbol is defined on the card where it first appears (campaign order)', () => {
    const SYMBOLS: [string, RegExp, RegExp][] = [
      ['ℤ', /ℤ(?![₀-₉])|\\mathbb\{Z\}/, /integers/],
    ];
    const cards = ordered();
    for (const [sym, uses, defines] of SYMBOLS) {
      const first = cards.find(({ c }) => uses.test(allText(c)));
      if (!first) continue; // |G| and ℤ are not used before ch. 10 / 13
      expect(allText(first!.c), `${sym} first appears on ${first!.lv}#${first!.i + 1} (${first!.c.title}) and must be defined there`).toMatch(defines);
    }
  });

  it('no card shows its own level’s target statement as a figure result (no spoilers)', () => {
    for (const lv of LEVELS) expect(spoilers(lv.id, CARDS[lv.id] ?? []), lv.id).toEqual([]);
  });

  it('the spoiler check catches a figure that gives a level away', () => {
    const leak: ConceptCard = { title: 'leak', figures: [{ k: 'math', atoms: [{ id: 'x', label: 'x', hue: 0 }, { id: 'y', label: 'y', hue: 1 }], rows: [{ seq: ['(y^-1xy)^(2)', '=', 'e'] }] }] };
    const lv = LEVEL_BY_ID['P10.2']!;
    expect(lv).toBeDefined();
    const tgt = { l: { k: 'pow', base: { k: 'mul', fs: [{ k: 'inv', arg: { k: 'atom', id: 'y' } }, { k: 'atom', id: 'x' }, { k: 'atom', id: 'y' }] }, exp: [{ coefficient: '2', monomial: [] }] }, rel: 'eq' as const, r: { k: 'e' } as Term };
    const [p] = figurePairs('P10.2', leak);
    expect(p).toBeDefined();
    expect(same(p!, tgt as Pair)).toBe(true);
    const struck: ConceptCard = { title: 'near miss', figures: [{ k: 'math', atoms: [{ id: 'x', label: 'x', hue: 0 }], rows: [{ seq: ['x^(2)', '=', 'e'], strike: true }] }] };
    expect(figurePairs('P10.2', struck)).toEqual([]);
  });

  it('every figure is real: terms parse, braces are in range, machines and groups exist', () => {
    const registry = { ...REGISTRY, ...POWER_SCHEMAS };
    for (const [id, cs] of Object.entries(CARDS)) {
      const lv = LEVEL_BY_ID[id]!;
      for (const c of cs) {
        for (const f of figuresOf(c)) {
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
              for (const n of f.spec.notes ?? []) expect(n.text.trim(), where).not.toBe('');
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
    }
  });
});
describe('Book worlds 8–9 · level copy', () => {
  it('memos are at most two short sentences; ideas are one line', () => {
    for (const lv of LEVELS) {
      const ss = sentences(lv.memo);
      expect(ss.length, `${lv.id} memo: ${lv.memo}`).toBeLessThanOrEqual(2);
      for (const s of ss) expect(words(s), `${lv.id} memo: “${s}”`).toBeLessThanOrEqual(14);
      expect(lv.memo, lv.id).not.toMatch(/;/);
      expect(words(lv.idea), `${lv.id} idea: ${lv.idea}`).toBeLessThanOrEqual(12);
    }
  });
});

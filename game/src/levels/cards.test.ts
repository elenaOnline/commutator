// Concept cards (v4.1, design/v4/COPY.md): coverage, copy length, and figures that actually exist —
// every term string parses, every tint span is in bounds, every group/generator is in the catalogue.
import { describe, expect, it } from 'vitest';
import { norm, parseTerm } from '../kernel';
import { powerSchema } from '../kernel/powers';
import type { AtomDecl, Card, Pallet, Term } from '../kernel/types';
import { catalogue } from '../groups';
import { LEVELS, LEVEL_BY_ID } from './levels';
import { CARDS, type ConceptCard, type Figure, type TowerDecl } from './cards';

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const groupNamed = (name: string) => catalogue().find((g) => g.name === name);
const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈'];
const figuresOf = (c: ConceptCard): Figure[] => [...(c.figure ? [c.figure] : []), ...(c.figures ?? [])];
/** Sentences, splitting on . ? ! (maths in $…$ is masked first so a⁻¹ etc. do not split). */
const sentences = (s: string) => s.replace(/\$[^$]*\$/g, 'M').split(/[.?!]+\**\s|[.?!]+\**$/).map((x) => x.trim()).filter(Boolean);

/**
 * Parse a figure string (see the FIGURE STRINGS grammar in cards.ts). Returns the number of factors in
 * the strip (both rails for an equation), or an error.
 */
function parseFigure(src: string, atoms: AtomDecl[], towers: TowerDecl[] = []): { ok: true; factors: number } | { ok: false; error: string } {
  const decls: AtomDecl[] = [...atoms, ...towers.map((t, i) => ({ id: t.id, label: t.label, hue: i, variable: true, sort: t.sort }))];
  if (src.trim() === '⊥') return { ok: true, factors: 1 };
  const body = src.replace(/^\s*∀[^.]*\.\s*/, '');
  let factors = 0;
  for (const part of body.split('⇒')) {
    const sides = part.split(/[=≠]/);
    if (sides.length > 2) return { ok: false, error: `${part}: more than one relation` };
    for (const side of sides) {
      const r = parseTerm(side.trim(), decls);
      if (!r.ok) return { ok: false, error: `${side.trim()}: ${r.error}` };
      factors += r.term.k === 'mul' ? r.term.fs.length : 1;
    }
  }
  return { ok: true, factors };
}

function checkSpan(span: [number, number] | undefined, factors: number, where: string) {
  if (!span) return;
  expect(Number.isInteger(span[0]) && Number.isInteger(span[1]), where).toBe(true);
  expect(span[0], where).toBeGreaterThanOrEqual(0);
  expect(span[1], where).toBeGreaterThan(span[0]);
  expect(span[1], where).toBeLessThanOrEqual(factors);
}

describe('concept cards', () => {
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

  it('copy is caption-length unless the card is deliberately long (COPY.md)', () => {
    for (const [id, cs] of Object.entries(CARDS)) {
      for (const c of cs) {
        const where = `${id} · ${c.title}`;
        expect(c.title.trim(), id).not.toBe('');
        expect(c.body !== undefined || figuresOf(c).length > 0, `${where}: needs a figure or a body`).toBe(true);
        if (c.long) {
          if (c.body) expect(words(c.body), where).toBeLessThan(120);
          for (const k of ['example', 'nearMiss', 'gesture'] as const) if (c[k] !== undefined) expect(words(c[k]!), `${where} · ${k}`).toBeLessThan(60);
          continue;
        }
        // short cards: a figure does the job of the old prose fields
        for (const k of ['example', 'nearMiss', 'gesture'] as const) expect(c[k], `${where} · ${k} (use a figure)`).toBeUndefined();
        if (c.body) {
          expect(words(c.body), where).toBeLessThanOrEqual(25);
          expect(c.body, `${where}: no semicolons`).not.toMatch(/;/);
          for (const s of sentences(c.body)) expect(words(s), `${where}: “${s}”`).toBeLessThanOrEqual(14);
        }
      }
    }
  });

  it('figure captions and near-miss reasons are ≤ 8 words', () => {
    for (const [id, cs] of Object.entries(CARDS)) {
      for (const c of cs) {
        for (const f of figuresOf(c)) {
          const t = f.k === 'nearmiss' ? f.why : 'caption' in f ? f.caption : undefined;
          if (t !== undefined) {
            expect(words(t), `${id} · ${c.title} · ${f.k}: ${t}`).toBeLessThanOrEqual(8);
            expect(t, `${id} · ${c.title}`).not.toMatch(/[;$*]/);
          }
        }
      }
    }
  });

  it('maths delimiters are balanced', () => {
    for (const [id, cs] of Object.entries(CARDS)) {
      for (const c of cs) {
        for (const s of [c.body, c.example, c.nearMiss, c.gesture]) {
          if (s) expect((s.match(/\$/g) ?? []).length % 2, `${id} · ${c.title}: ${s}`).toBe(0);
        }
      }
    }
  });

  it('markdown the HUD renders cleanly: no *italic*, and no maths inside **bold**', () => {
    for (const [id, cs] of Object.entries(CARDS)) {
      for (const c of cs) {
        for (const t of [c.title, c.body, c.example, c.nearMiss, c.gesture]) {
          if (!t) continue;
          const noBold = t.replace(/\*\*[^*]+\*\*/g, '');
          expect(noBold, `${id} · ${c.title}: stray *`).not.toMatch(/\*/);
          for (const b of t.match(/\*\*[^*]+\*\*/g) ?? []) expect(b, `${id} · ${c.title}`).not.toMatch(/\$/);
        }
      }
    }
  });

  it('every figure string parses against the level atoms (+ towers); tint spans are in bounds', () => {
    for (const [id, cs] of Object.entries(CARDS)) {
      const lv = LEVEL_BY_ID[id]!;
      for (const c of cs) {
        for (const f of figuresOf(c)) {
          const where = `${id} · ${c.title} · ${f.k}`;
          const P = (src: string) => {
            const r = parseFigure(src, lv.atoms, 'towers' in f ? f.towers : undefined);
            expect(r.ok ? 'ok' : `${src} → ${r.error}`, where).toBe('ok');
            return r.ok ? r.factors : 0;
          };
          switch (f.k) {
            case 'beads':
              expect(f.terms.length, where).toBeGreaterThan(0);
              for (const t of f.terms) P(t);
              break;
            case 'transform':
              checkSpan(f.hit, P(f.before), `${where} hit`);
              checkSpan(f.made, P(f.after), `${where} made`);
              break;
            case 'nearmiss':
              P(f.before); P(f.after);
              break;
            case 'chain':
              expect(f.steps.length, where).toBeGreaterThanOrEqual(2);
              expect(f.steps.length, where).toBeLessThanOrEqual(5);
              for (const st of f.steps) checkSpan(st.hit, P(st.term), `${where} step ${st.term}`);
              break;
            case 'machine':
              P(f.input); P(f.output);
              if (f.rule !== undefined) P(f.rule);
              break;
            case 'clock':
              expect(groupNamed(`ℤ${SUB[f.n] ?? '?'}`), `${where}: ℤ${f.n}`).toBeDefined();
              break;
            case 'table':
            case 'cayley': {
              const g = groupNamed(f.group);
              expect(g, `${where}: ${f.group}`).toBeDefined();
              if (f.k === 'cayley') for (const gen of f.gens) expect(g!.labels, `${where}: generator ${gen}`).toContain(gen);
              break;
            }
          }
        }
      }
    }
  });

  it('the group facts the cards cite hold in the catalogue', () => {
    const S3 = groupNamed('S₃')!, s = (l: string) => S3.labels.indexOf(l);
    expect(S3.labels[S3.mul(s('(12)'), s('(13)'))]).toBe('(132)');
    expect(S3.labels[S3.mul(s('(13)'), s('(12)'))]).toBe('(123)');
    // B03: (ab)² ≠ a²b² with a = (12), b = (23)
    const ab = S3.mul(s('(12)'), s('(23)'));
    expect(S3.mul(ab, ab)).not.toBe(0);
    expect(S3.mul(S3.mul(s('(12)'), s('(12)')), S3.mul(s('(23)'), s('(23)')))).toBe(0);
    const V4 = groupNamed('V₄')!;
    for (let i = 0; i < V4.order; i++) expect(V4.mul(i, i)).toBe(0);
    const Z6 = groupNamed('ℤ₆')!; // R01: hour 2 has order 3
    expect([1, 2, 3].map((n) => Array.from({ length: n }, () => 2).reduce((x, y) => Z6.mul(x, y)))).toEqual([2, 4, 0]);
  });
});

describe('level copy (COPY.md)', () => {
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

describe('prove → save → reuse (v4 r2)', () => {
  it('no level offers the built-in Double Flip; S01 unlocks nothing; the reuse orders follow', () => {
    for (const lv of LEVELS) expect(lv.tools.schemas, lv.id).not.toContain('dbl');
    expect(LEVEL_BY_ID.S01!.unlocks).toEqual([]);
    const ids = LEVELS.map((l) => l.id);
    expect(ids.indexOf('T01')).toBe(ids.indexOf('S01') + 1);
    expect(ids.indexOf('T02')).toBe(ids.indexOf('L06') + 1);
    expect(LEVEL_BY_ID.T02!.uses).toEqual(expect.arrayContaining(['L06', 'T01']));
  });
});

describe('Chapter IV (Powers) manifests', () => {
  const B = ['B01', 'B02', 'B03', 'B04'];
  const powerIds = (id: string) => LEVEL_BY_ID[id]!.tools.schemas.filter((x) => x.startsWith('power.'));

  it('sit after Chapter III in campaign order, before the side orders', () => {
    const ids = LEVELS.map((l) => l.id);
    expect(ids.slice(ids.indexOf('L12') + 1, ids.indexOf('L12') + 5)).toEqual(B);
    for (const id of B) expect(LEVEL_BY_ID[id]!.chapter).toBe(4);
  });

  it('power imports appear only in Chapter IV, each one real, each level exactly its spec set', () => {
    for (const lv of LEVELS) if (!B.includes(lv.id)) expect(powerIds(lv.id), lv.id).toEqual([]);
    for (const id of B) for (const p of powerIds(id)) expect(() => powerSchema(p), `${id} ${p}`).not.toThrow();
    expect(powerIds('B01').sort()).toEqual(['power.identity', 'power.literal:5', 'power.multiply']);
    expect(powerIds('B02').sort()).toEqual(['power.identity', 'power.multiply']);
    expect(powerIds('B03')).toEqual(['power.conjugate']);
    expect(powerIds('B04')).toEqual([]);
    expect(LEVEL_BY_ID.B04!.tools.press).toBe(true);
  });

  it('socket targets are written in kernel normal form (hand-built polynomials are canonical)', () => {
    const terms = (t: Pallet | Card): Term[] =>
      t.k === 'eq' || t.k === 'neq' || t.k === 'law' ? [t.l, t.r]
        : t.k === 'cond' ? [...t.premises.flatMap((p) => [p.l, p.r]), t.concl.l, t.concl.r] : [];
    for (const id of B) for (const sk of LEVEL_BY_ID[id]!.sockets) for (const t of terms(sk.target)) expect(norm(t), id).toEqual(t);
  });
});

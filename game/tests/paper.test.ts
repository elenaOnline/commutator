// The Paper view (The Book, SYNTHESIS §4): the factory's proof as numbered homework lines with reasons.
// Built on the reference floors of the main campaign (tests/v3/helpers.ts) and small ad-hoc floors, through the
// real editor and compiler.
import { describe, expect, it } from 'vitest';
import { IDS, reference, run } from './v3/helpers';
import { Floor, E, P, a, b, c, eq, insertE, knob, lawRw } from '../src/factory/compiler.testkit';
import { mkLevel } from '../src/kernel/testkit';
import { buildPaper, paperHTML } from '../src/hud/paper';
import { adapt } from '../src/hud/transcript';
import type { S } from '../src/hud/util';

const sOf = (f: { level: unknown; ctx: unknown; c: unknown }, compiled: unknown) => ({ level: f.level, ctx: f.ctx, canvas: f.c, compiled }) as unknown as S;
/** Visible text of an HTML fragment (subscripts back to ₀…₉, superscripts as ^n). */
const text = (html: string) => html.replace(/<sub class="m-sub">(\d+)<\/sub>/g, (_m, d: string) => [...d].map((x) => '₀₁₂₃₄₅₆₇₈₉'[+x]).join(''))
  .replace(/<sup[^>]*>([^<]*)<\/sup>/g, '^$1').replace(/<[^>]+>/g, '').replace(/&thinsp;|&ensp;|&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const paperOf = (s: S) => { const { st } = adapt(s); const p = buildPaper(st); return { p, html: paperHTML(p, st) }; };
const reasons = (s: S) => paperOf(s).p.lines.map((l) => text(l.reason));

describe('Paper view: the main campaign\'s reference proofs', () => {
  for (const id of IDS) {
    it(`${id}: numbered lines, a reason on every equation, no arrows, ∎`, () => {
      const f = reference(id);
      const { p, html } = paperOf(sOf(f, run(f).comp));
      if (process.env.PAPER_DUMP) console.log(`── ${id}\n${text(html.replace(/<\/div>|<\/p>/g, '\n'))}`);
      expect(p.solved).toBe(true);
      expect(p.lines.length).toBeGreaterThan(0);
      expect(p.lines.map((l) => l.no)).toEqual(p.lines.map((_, i) => i + 1));
      expect(text(html)).not.toMatch(/→|⟶|->|⇒/);
      expect(html).toContain('<i>Proof.</i>');
      expect(html).toContain('class="tomb"');
      for (const l of p.lines) if (l.kind === 'eq') expect(l.reason, `${id} line ${l.no}`).not.toBe('');
    });
  }
  it('L01 reads as two lines, one rule each: inverse, then identity', () => {
    const f = reference('L01');
    expect(reasons(sOf(f, run(f).comp))).toEqual(['inverse', 'identity']);
  });
  it('L03 cites the given by name and an earlier line by number', () => {
    const f = reference('L03');
    const r = reasons(sOf(f, run(f).comp));
    expect(r[0]).toBe('given h');
    expect(r[1]).toMatch(/^multiply on the left by a/);
    expect(r).toContain('from lines 2 and 4'); // the left side simplified forwards, then combined with line 2
  });
  it('T01 opens the Assume room as a numbered line and indents its argument', () => {
    const f = reference('T01');
    const { p } = paperOf(sOf(f, run(f).comp));
    expect(text(p.lines[0]!.html!)).toMatch(/^Assume x₁/);
    expect(p.lines[0]!.depth).toBe(0);
    expect(p.lines[1]!.depth).toBe(1);
    expect(p.lines.at(-1)!.depth).toBe(0);
  });
});

describe('Paper view: homework voice', () => {
  const level = mkLevel({
    atoms: [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }, { id: 'c', label: 'c', hue: 2 }],
    givens: [{ id: 'h2', name: 'h₂', fact: eq(P(a, c), E) }],
    sockets: [{ id: 's', target: eq(b, P(b, a, c)), allowedGivens: ['h2'] }],
  });
  const build = (deliver: boolean, scrap = false) => {
    const f = new Floor(level);
    const sp = f.add({ kind: 'spool', t: knob(b) });
    const after = (x: typeof b) => ({ k: 'pin' as const, side: 'r' as const, neighbours: { left: [x], right: [], leftEdge: false, rightEdge: true }, ancestors: [] });
    if (scrap) { const sp2 = f.add({ kind: 'spool', t: knob(a) }); const i2 = f.add(insertE()); f.wire(sp2, i2); }
    if (deliver) { // e ⟶ ac at the gap after b (the Rewriter inserts e first)
      const rw = f.add(lawRw({ k: 'given', givenId: 'h2' }, { dir: 'rev', gap: after(b) }));
      f.wire(sp, rw); f.wire(rw, f.socket());
    }
    return sOf(f, run(f).comp);
  };
  it('b = be (identity), = bac (h₂, read right to left)', () => {
    const { p, html } = paperOf(build(true));
    expect(p.solved).toBe(true);
    expect(p.lines.map((l) => [l.lhs ? 'lhs' : '', text(l.reason)])).toEqual([['lhs', 'identity'], ['', 'h₂, read right to left']]);
    expect(text(html)).toContain('If ac = e, then b = bac.');
  });
  it('leaves scrap work on the floor once the order is solved', () => {
    expect(paperOf(build(true, true)).p.lines).toHaveLength(2);
  });
  it('shows all work, and says it is unfinished, before the statement is proved', () => {
    const { p, html } = paperOf(build(false, true));
    expect(p.solved).toBe(false);
    expect(p.lines.length).toBeGreaterThan(0);
    expect(html).toContain('Not finished');
    expect(html).not.toContain('class="tomb"');
  });
});

describe('Paper view: the Book', () => {
  it('heads the page with the method; shows the insight only after ∎', () => {
    const f = reference('L01');
    const s = sOf(f, run(f).comp);
    const { st } = adapt(s);
    const book = { ...st, level: { ...st.level, campaign: 'book' as const, world: 1, method: 'Computation', insight: 'Cancel the pair first.' } };
    const p = buildPaper(book);
    expect(text(paperHTML(p, book))).toContain('Method · Computation');
    expect(paperHTML(p, book)).not.toContain('Cancel the pair first.');
    expect(paperHTML(p, book, { insight: true })).toContain('Cancel the pair first.');
    expect(paperHTML({ ...p, solved: false }, book, { insight: true })).not.toContain('Cancel the pair first.');
  });
});

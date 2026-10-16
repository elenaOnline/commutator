// Term slots (review 2026-10): what the hidden input's text reads as — a term, an empty slot, or text that
// does not read ("That doesn't read as a term."). The kernel parser is the authority.
import { describe, expect, it } from 'vitest';
import * as K from '../kernel';
import type { AtomDecl, MapDecl, SortDecl, Term } from '../kernel/types';
import { BAD_TERM, actionText, elementChips, normaliseSlot, parseExtra, readSlot, readVarName, slotAppend, slotBackspace, slotSource, withLetter, withSubscript } from './slotparse';
import { trailingProduct } from './slot';

const atoms: AtomDecl[] = [
  { id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 },
  { id: 'x1', label: 'x₁', hue: 2, variable: true, sort: 'G' } as AtomDecl,
];
const a = { k: 'atom', id: 'a' }, b = { k: 'atom', id: 'b' };

describe('term slot parsing', () => {
  it('empty and blank text is an empty slot (dashed outline, placeholder)', () => {
    expect(readSlot('', atoms)).toEqual({ k: 'empty' });
    expect(readSlot('   ', atoms)).toEqual({ k: 'empty' });
  });
  it('reads products, inverses and e through the kernel', () => {
    expect(readSlot('ab', atoms)).toEqual({ k: 'ok', term: { k: 'mul', fs: [a, b] } });
    expect(readSlot('a⁻¹', atoms)).toEqual({ k: 'ok', term: { k: 'inv', arg: a } });
    expect(readSlot('a^-1', atoms)).toEqual({ k: 'ok', term: { k: 'inv', arg: a } });
    expect(readSlot('e', atoms)).toEqual({ k: 'ok', term: { k: 'e' } });
    const ab = readSlot('(ab)^-1', atoms);
    expect(ab.k).toBe('ok');
  });
  it('x_1 types the Tower variable x₁', () => {
    expect(normaliseSlot('x_1a^-1')).toBe('x₁a⁻¹');
    expect(readSlot('x_1', atoms)).toEqual({ k: 'ok', term: { k: 'atom', id: 'x1' } });
  });
  it('text that does not parse is "bad", kept as typed, with the kernel’s reason', () => {
    for (const src of ['a(', 'q', 'ab)', '3']) {
      const r = readSlot(src, atoms);
      expect(r.k).toBe('bad');
      if (r.k === 'bad') { expect(r.text).toBe(src); expect(r.error.length).toBeGreaterThan(0); }
    }
    expect(BAD_TERM).toBe('That doesn’t read as a term.');
  });
  it('⌫ drops a whole token: an inverse mark, a subscripted name, or one letter', () => {
    expect(slotBackspace('ab⁻¹')).toBe('ab');
    expect(slotBackspace('ab^-1')).toBe('ab');
    expect(slotBackspace('ax₁')).toBe('a');
    expect(slotBackspace('ab')).toBe('a');
    expect(slotBackspace('')).toBe('');
    expect(slotAppend('a', 'b⁻¹')).toBe('ab⁻¹');
  });
});

describe('Tower name slot', () => {
  it('a name is one letter with an optional subscript', () => {
    expect(readVarName('x')).toEqual({ k: 'ok', label: 'x' });
    expect(readVarName('y_2')).toEqual({ k: 'ok', label: 'y₂' });
    expect(readVarName('n12')).toEqual({ k: 'ok', label: 'n₁₂' });
    expect(readVarName('')).toEqual({ k: 'empty' });
    expect(readVarName('xy').k).toBe('bad');
    expect(readVarName('e').k).toBe('bad'); // e is the identity
  });
  it('letter chips keep the subscript; subscript chips extend it', () => {
    expect(withLetter('x₂', 'y')).toBe('y₂');
    expect(withSubscript('x', 1, 'x')).toBe('x₁');
    expect(withSubscript('x₁', 2, 'x')).toBe('x₂'); // the chip sets the subscript (#3: G₁ on G₂ gave G₂₁)
    expect(withSubscript('', 1, 'n')).toBe('n₁');
  });
});

// ───────── final W1–7 (2026-10-16): action terms, auto-closing frames, chips by sort, slot source ─────────

describe('action terms as Pinter writes them (P7.2, P8.2)', () => {
  const sorts: SortDecl[] = [{ id: 'G', kind: 'group', label: 'G' }, { id: 'O', kind: 'set', label: 'Ω' }];
  const maps: MapDecl[] = [{ id: 'act', label: 'σ', args: ['G', 'O'], res: 'O', kind: 'action' }];
  const at: AtomDecl[] = [
    { id: 'pi', label: 'π', hue: 0 }, { id: 'a', label: 'α', hue: 1 }, { id: 'b', label: 'β', hue: 2 },
    { id: 'p', label: 'p', hue: 3, carrier: 'O' }, { id: 'r', label: 'r', hue: 4, carrier: 'O' },
  ];
  const A = (id: string): Term => ({ k: 'atom', id });
  const act = (g: Term, x: Term): Term => ({ k: 'app', fn: 'act', args: [g, x] });
  const L = { pi: 'π', a: 'α', b: 'β', p: 'p', r: 'r', act: 'σ' };
  const read = (src: string) => readSlot(src, at);
  const reads = (src: string, t: Term) => {
    const r = read(src);
    expect(r.k, `${src}: ${r.k === 'bad' ? r.error : ''}`).toBe('ok');
    if (r.k === 'ok') expect(K.termEq(K.norm(r.term), K.norm(t)), `${src} reads ${JSON.stringify(r.term)}`).toBe(true);
  };
  const with_ = (f: () => void) => { const prev = parseExtra.cur; parseExtra.cur = { sorts, maps }; try { f(); } finally { parseExtra.cur = prev; } };

  it('α(β(p)) is the nested action term, not the product αβp (blocker #1)', () => with_(() => {
    reads('α(β(p))', act(A('a'), act(A('b'), A('p'))));
    reads('alpha(beta(p))', act(A('a'), act(A('b'), A('p'))));
    reads('π(α(π⁻¹(r)))', act(A('pi'), act(A('a'), act({ k: 'inv', arg: A('pi') }, A('r')))));
  }));
  it('a product acts: (αβ)(p), (παπ⁻¹)(r), (αβ)⁻¹(p); an inverse acts: α⁻¹(p), α^-1(p)', () => with_(() => {
    reads('(αβ)(p)', act({ k: 'mul', fs: [A('a'), A('b')] }, A('p')));
    reads('(alpha beta)(p)', act({ k: 'mul', fs: [A('a'), A('b')] }, A('p')));
    reads('(παπ⁻¹)(r)', act({ k: 'mul', fs: [A('pi'), A('a'), { k: 'inv', arg: A('pi') }] }, A('r')));
    reads('(αβ)⁻¹(p)', act({ k: 'inv', arg: { k: 'mul', fs: [A('a'), A('b')] } }, A('p')));
    reads('α⁻¹(p)', act({ k: 'inv', arg: A('a') }, A('p')));
    reads('α^-1(p)', act({ k: 'inv', arg: A('a') }, A('p')));
    reads('e(p)', act({ k: 'e' }, A('p')));
    reads('σ(α, p)', act(A('a'), A('p'))); // the kernel's own form still reads
  }));
  it('frames close themselves: α(β(p and (αβ)(p read, and say how many were open', () => with_(() => {
    reads('α(β(p', act(A('a'), act(A('b'), A('p'))));
    reads('(αβ)(p', act({ k: 'mul', fs: [A('a'), A('b')] }, A('p')));
    const r = read('α(β(p');
    expect(r.k === 'ok' && r.open).toBe(2);
    expect(read('α(β(p))')).not.toHaveProperty('open');
    expect(read('α(').k).toBe('bad'); // nothing inside yet
  }));
  it('group words still read as products where they sort (a bracket after nothing is grouping)', () => with_(() => {
    reads('π(απ⁻¹)', { k: 'mul', fs: [A('pi'), A('a'), { k: 'inv', arg: A('pi') }] });
    expect(actionText('ab')).toBeNull();
  }));
  it('slot source writes actions as typed, never with σ, and reads back the same term', () => with_(() => {
    const ts = [act(A('a'), act(A('b'), A('p'))), act({ k: 'mul', fs: [A('pi'), A('a'), { k: 'inv', arg: A('pi') }] }, A('r')), act({ k: 'inv', arg: A('a') }, A('p'))];
    expect(ts.map((t) => slotSource(t, L))).toEqual(['α(β(p))', '(παπ⁻¹)(r)', 'α⁻¹(p)']);
    for (const t of ts) reads(slotSource(t, L), t);
  }));
  it('the (□)( ) chip wraps the product after the last open bracket', () => {
    expect(trailingProduct('παπ⁻¹')).toBe('παπ⁻¹');
    expect(trailingProduct('α(βπ')).toBe('βπ');
    expect(trailingProduct('α(p)')).toBe('α(p)');
  });
  it('chips by sort: no inverse for a point, Tower inverses always, no e without a group (#2, #11)', () => {
    const env = K.sortEnv({ sorts, maps, atoms: at });
    const chips: Term[] = [A('a'), A('p'), { k: 'inv', arg: A('a') }, { k: 'inv', arg: A('p') }, { k: 'e' }];
    expect(elementChips(chips, at, env)).toEqual([A('a'), A('p'), { k: 'inv', arg: A('a') }, { k: 'e' }]);
    // P4.8: level atoms a, b and a Tower x — x⁻¹ is offered too
    const g: AtomDecl[] = [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }, { id: 'x1', label: 'x', hue: 0, variable: true, sort: 'G' } as AtomDecl];
    const lens: Term[] = [A('a'), A('b'), { k: 'inv', arg: A('a') }, { k: 'inv', arg: A('b') }, { k: 'e' }, A('x1')];
    expect(elementChips(lens, g, null)).toEqual([...lens, { k: 'inv', arg: A('x1') }]);
    // P6.x: a sets-only level, a Tower x ∈ A — no x⁻¹, no e
    const setsEnv = K.sortEnv({ sorts: [{ id: 'A', kind: 'set', label: 'A' }, { id: 'B', kind: 'set', label: 'B' }], maps: [], atoms: [{ id: 'x1', label: 'x', hue: 0, carrier: 'A' }] });
    const sx: AtomDecl[] = [{ id: 'x1', label: 'x', hue: 0, variable: true, carrier: 'A' } as AtomDecl];
    expect(elementChips([A('x1'), { k: 'inv', arg: A('x1') }, { k: 'e' }], sx, setsEnv)).toEqual([A('x1')]);
  });
});

// Term slots (review 2026-10): what the hidden input's text reads as — a term, an empty slot, or text that
// does not read ("That doesn't read as a term."). The kernel parser is the authority.
import { describe, expect, it } from 'vitest';
import type { AtomDecl } from '../kernel/types';
import { BAD_TERM, normaliseSlot, readSlot, readVarName, slotAppend, slotBackspace, withLetter, withSubscript } from './slotparse';

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
    expect(withSubscript('x₁', 2, 'x')).toBe('x₁₂');
    expect(withSubscript('', 1, 'n')).toBe('n₁');
  });
});

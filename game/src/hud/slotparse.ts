// COMMUTATOR — term slots, the pure part (review 2026-10, 3b103ba9 / 1a080950). A slot shows its value as
// terms; one hidden input feeds it. This module reads that input's text (kernel parser, no DOM) so the lens
// and the tests agree on what counts as a term, an empty slot, or text that does not read.
import * as K from '../kernel';
import type { AtomDecl, Term } from '../kernel/types';

export type SlotRead =
  | { k: 'empty' }
  | { k: 'ok'; term: Term }
  | { k: 'bad'; text: string; error: string };

/** Shown under a slot whose text the parser rejects. */
export const BAD_TERM = 'That doesn’t read as a term.';

const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const subOf = (digits: string) => [...digits].map((d) => SUBS[+d]).join('');

/** Typing shortcuts: x_1 → x₁ (always), ^-1 → ⁻¹. Plain letters and brackets are left alone. */
export function normaliseSlot(src: string): string {
  return src.replace(/_(\d+)/g, (_m, d: string) => subOf(d)).replace(/\^-1(?!\d)/g, '⁻¹');
}

/** Book phase C: the maps and sorts in scope (level declarations + group and Hom Towers), so slots read f(x) and e_H. */
export const parseExtra: { cur: K.ParseExtra | undefined } = { cur: undefined };
/** Read a slot's text against the atoms in scope (level atoms + Tower variables). */
export function readSlot(src: string, atoms: AtomDecl[]): SlotRead {
  const text = normaliseSlot(src).trim();
  if (!text) return { k: 'empty' };
  let r: { ok: true; term: Term } | { ok: false; error: string };
  try { r = K.parseTerm(text, atoms, parseExtra.cur); } catch (e) { r = { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  return r.ok ? { k: 'ok', term: r.term } : { k: 'bad', text, error: r.error };
}

/** ⌫ on a slot: drop the last token (an inverse mark counts as one), never half of ⁻¹. */
export function slotBackspace(src: string): string {
  const s = src.trimEnd();
  if (s.endsWith('⁻¹')) return s.slice(0, -2);
  if (s.endsWith('^-1')) return s.slice(0, -3);
  const m = /[A-Za-z][₀-₉]+$/.exec(s);
  if (m) return s.slice(0, -m[0].length); // x₁ is one name: it goes as a whole
  return [...s].slice(0, -1).join('');
}

/** Append a chip's text, keeping a product readable: "a" + "b⁻¹" = "ab⁻¹". */
export function slotAppend(src: string, piece: string): string {
  return `${src.trimEnd()}${piece}`;
}

// ───────── Tower names: a slot drawn as the variable itself ─────────

export type NameRead = { k: 'empty' } | { k: 'ok'; label: string } | { k: 'bad'; text: string };

/** A Tower name is one letter with an optional subscript: x, y₂, n₁₂ (x_12 and x12 also read as x₁₂). */
export function readVarName(src: string): NameRead {
  const t = src.trim().replace(/_?(\d+)$/, (_m, d: string) => subOf(d));
  if (!t) return { k: 'empty' };
  return /^[A-Za-z][₀-₉]*$/.test(t) && t !== 'e' ? { k: 'ok', label: t } : { k: 'bad', text: t };
}

/** Swap the letter of a Tower name, keeping its subscript: (x₂, y) → y₂. */
export function withLetter(label: string, letter: string): string {
  const sub = /[₀-₉]*$/.exec(label)?.[0] ?? '';
  return letter + sub;
}

/** Add a subscript digit to a Tower name (□₁ / □₂ chips): x → x₁, x₁ → x₁₂. An empty name takes `fallback`. */
export function withSubscript(label: string, digit: number, fallback: string): string {
  return (label || fallback) + SUBS[digit]!;
}

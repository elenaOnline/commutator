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
/** Whether integer powers exist on this floor (the power chip is offered). Set by the app on every render. */
export const slotFlags = { ints: false };
/** Typed names for Greek letters (#13): pi → π, alpha → α … — only where the letter is in play. */
const GREEK: Record<string, string> = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', psi: 'ψ', omega: 'ω' };
function greek(text: string, atoms: AtomDecl[]): string {
  const known = new Set([...atoms.map((a) => a.label), ...(parseExtra.cur?.maps ?? []).map((m) => m.label)]);
  return text.replace(/[a-z]{2,5}/g, (w) => (GREEK[w] && known.has(GREEK[w]!) ? GREEK[w]! : w));
}
const parse = (text: string, atoms: AtomDecl[]): { ok: true; term: Term } | { ok: false; error: string } => {
  try { return K.parseTerm(text, atoms, parseExtra.cur); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
};
const sortsOk = (t: Term, atoms: AtomDecl[]): boolean => {
  const ex = parseExtra.cur;
  if (!ex?.maps?.length && !ex?.sorts?.length) return true;
  try { K.sortOf(t, K.sortEnv({ sorts: ex.sorts, maps: ex.maps, atoms } as never)); return true; } catch { return false; }
};
/**
 * An action applied is typed as Pinter writes it, α(p) or (αβ)(p): when the plain reading is a product that mixes
 * a group and a set, the bracket after a group element is read as the action (σ(α, p)) (W4–9: actions).
 */
function asAction(text: string, atoms: AtomDecl[]): Term | null {
  const acts = (parseExtra.cur?.maps ?? []).filter((m) => m.kind === 'action');
  if (acts.length !== 1) return null;
  const sg = acts[0]!.label;
  const rewritten = text.replace(/(\([^()]*\)|[^\s(),]+?)\(([^()]*)\)/g, (_m, g: string, p: string) => `${sg}(${g.replace(/^\((.*)\)$/, '$1')}, ${p})`);
  if (rewritten === text) return null;
  const r = parse(rewritten, atoms);
  return r.ok && sortsOk(r.term, atoms) ? r.term : null;
}
/** A bare e takes the group of what it stands beside (e·π(b) is e in K), never a group absent from the floor (#3). */
function settleE(t: Term, atoms: AtomDecl[]): Term {
  const ex = parseExtra.cur;
  if (!ex?.sorts?.length) return t;
  const env = K.sortEnv({ sorts: ex.sorts, maps: ex.maps, atoms } as never);
  const others = (t.k === 'mul' ? t.fs : [t]).filter((f) => f.k !== 'e');
  let s: string | null = null;
  for (const f of others) { try { s = K.sortOf(f, env); break; } catch { /* unsortable alone */ } }
  if (!s) { const groups = ex.sorts.filter((x) => x.kind === 'group'); if (!groups.some((g) => g.id === K.DEFAULT_GROUP) && groups.length) s = groups[0]!.id; }
  if (!s || s === K.DEFAULT_GROUP) return t;
  const fix = (x: Term): Term => (x.k === 'e' && !x.s ? { k: 'e', s } : x.k === 'mul' ? { ...x, fs: x.fs.map(fix) } : x.k === 'inv' ? { ...x, arg: fix(x.arg) } : x);
  return fix(t);
}
/** Read a slot's text against the atoms in scope (level atoms + Tower variables). */
export function readSlot(src: string, atoms: AtomDecl[]): SlotRead {
  const text = greek(normaliseSlot(src).trim(), atoms);
  if (!text) return { k: 'empty' };
  const r = parse(text, atoms);
  if (r.ok && sortsOk(r.term, atoms)) return { k: 'ok', term: settleE(r.term, atoms) };
  const act = asAction(text, atoms);
  if (act) return { k: 'ok', term: act };
  if (r.ok) { const fixed = settleE(r.term, atoms); if (sortsOk(fixed, atoms)) return { k: 'ok', term: fixed }; }
  return r.ok ? { k: 'ok', term: r.term } : { k: 'bad', text, error: r.error };
}

/** ⌫ on a slot: drop the last token (an inverse mark counts as one), never half of ⁻¹. */
export function slotBackspace(src: string): string {
  const s = src.trimEnd();
  if (s.endsWith('⁻¹')) return s.slice(0, -2);
  const eK = /e_[A-Za-zΑ-Ωα-ω][₀-₉]*$/.exec(s);
  if (eK) return s.slice(0, -eK[0].length); // e_K is one token (#13)
  const pw = /\^\([^()]*\)$/.exec(s);
  if (pw) return s.slice(0, -pw[0].length); // a power's exponent ^(n) goes as a whole
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

/** Set a Tower name's subscript (the x₁ / x₂ chips): x → x₁, x₁ → x₂, never x₁₂ (G₁ chip on G₂ gave G₂₁, #3). */
export function withSubscript(label: string, digit: number, fallback: string): string {
  return (label.replace(/[₀-₉]+$/, '') || fallback) + SUBS[digit]!;
}

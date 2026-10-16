// COMMUTATOR — term slots, the pure part (review 2026-10, 3b103ba9 / 1a080950). A slot shows its value as
// terms; one hidden input feeds it. This module reads that input's text (kernel parser, no DOM) so the lens
// and the tests agree on what counts as a term, an empty slot, or text that does not read.
import * as K from '../kernel';
import type { AtomDecl, Term } from '../kernel/types';

export type SlotRead =
  | { k: 'empty' }
  | { k: 'ok'; term: Term; open?: number }
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
/** The floor's action, when there is exactly one (P7.2, P8.2): its map declaration. */
const theAction = () => { const acts = (parseExtra.cur?.maps ?? []).filter((m) => m.kind === 'action'); return acts.length === 1 ? acts[0]! : null; };

type Piece = string | { inner: Piece[] };
/** Split text into runs and bracket groups; null when the brackets do not pair up. */
function groups(text: string): Piece[] | null {
  const root: Piece[] = [];
  const stack: Piece[][] = [root];
  let run = '';
  const flush = () => { if (run) { stack[stack.length - 1]!.push(run); run = ''; } };
  for (const ch of text) {
    if (ch === '(') { flush(); const g = { inner: [] as Piece[] }; stack[stack.length - 1]!.push(g); stack.push(g.inner); }
    else if (ch === ')') { flush(); if (stack.length === 1) return null; stack.pop(); }
    else run += ch;
  }
  flush();
  return stack.length === 1 ? root : null;
}
/** Postfix marks that may follow a bracketed head: (αβ)⁻¹(p). */
const MARKS = /^(?:⁻¹|[⁰¹²³⁴⁵⁶⁷⁸⁹]|\^-?\d+)+$/;

/**
 * An action applied is typed as Pinter writes it — α(p), α(β(p)), (αβ)(p), α⁻¹(p), (παπ⁻¹)(r) — and read as the
 * action term σ(g, p). Every bracket that follows a group element (a letter run, or a bracketed product) is read as
 * that element applied to what is inside, innermost first, so nesting works (final W1–7 blocker #1). A bracket after
 * a map's name stays the map, a bracket after ^ or _ stays an exponent, and a bracket after nothing is grouping.
 * Returns the rewritten text in the kernel's σ(g, p) form, or null when nothing reads as an action.
 */
export function actionText(text: string): string | null {
  const act = theAction();
  if (!act) return null;
  const maps = (parseExtra.cur?.maps ?? []).map((m) => m.label);
  const tree = groups(text);
  if (!tree) return null;
  let changed = false;
  type Part = { text: string; k: 'run' | 'group' | 'call' };
  const conv = (seq: Piece[]): string => {
    const parts: Part[] = [];
    for (const it of seq) {
      if (typeof it === 'string') { parts.push({ text: it, k: 'run' }); continue; }
      const inner = conv(it.inner);
      const comma = it.inner.some((x) => typeof x === 'string' && x.includes(','));
      const last = parts[parts.length - 1];
      const applied = (g: string) => { changed = true; return { text: `${act.label}(${g}, ${inner})`, k: 'call' as const }; };
      if (last?.k === 'run') {
        const at = last.text.lastIndexOf(',');
        const lead = last.text.slice(0, at + 1), head = last.text.slice(at + 1).trim();
        const before = parts[parts.length - 2];
        if (!comma && !lead && before?.k === 'group' && MARKS.test(head)) { parts.splice(-2, 2, applied(before.text + head)); continue; }
        const isMap = maps.some((m) => head === m || head.endsWith(m));
        if (!comma && head && !isMap && !/[\^_]$/.test(head)) { parts.splice(-1, 1, ...(lead ? [{ text: lead, k: 'run' as const }] : []), applied(head)); continue; }
        parts.push({ text: `(${inner})`, k: head && !/,\s*$/.test(last.text) ? 'call' : 'group' });
        continue;
      }
      if (last?.k === 'group' && !comma) { parts.splice(-1, 1, applied(last.text)); continue; }
      parts.push({ text: `(${inner})`, k: 'group' });
    }
    return parts.map((x) => x.text).join('');
  };
  const out = conv(tree);
  return changed ? out : null;
}
function asAction(text: string, atoms: AtomDecl[]): Term | null {
  const rewritten = actionText(text);
  if (!rewritten) return null;
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
/** Brackets left open at the end of the text (0 when they pair up or close too often). */
export function openBrackets(text: string): number {
  let d = 0;
  for (const ch of text) { if (ch === '(') d++; else if (ch === ')' && --d < 0) return 0; }
  return d;
}
function readClosed(text: string, atoms: AtomDecl[]): SlotRead {
  const r = parse(text, atoms);
  if (r.ok && sortsOk(r.term, atoms)) return { k: 'ok', term: settleE(r.term, atoms) };
  const act = asAction(text, atoms);
  if (act) return { k: 'ok', term: act };
  if (r.ok) { const fixed = settleE(r.term, atoms); if (sortsOk(fixed, atoms)) return { k: 'ok', term: fixed }; }
  return r.ok ? { k: 'ok', term: r.term } : { k: 'bad', text, error: r.error };
}
/**
 * Read a slot's text against the atoms in scope (level atoms + Tower variables). Frames close themselves: text that
 * stops inside brackets (α(β(p, f(s(x) reads as if they were closed, and `open` says how many were (final W1–7 #1).
 */
export function readSlot(src: string, atoms: AtomDecl[]): SlotRead {
  const text = greek(normaliseSlot(src).trim(), atoms);
  if (!text) return { k: 'empty' };
  const open = openBrackets(text);
  if (open) {
    const r = readClosed(text + ')'.repeat(open), atoms);
    if (r.k === 'ok') return { ...r, open };
  }
  return readClosed(text, atoms);
}

/**
 * A term as slot source text: K.termSource, except that an action applied is written as Pinter writes it and as the
 * player types it — α(p), (αβ)(p), α⁻¹(p) — never with the action's own symbol (NORMS › Sorts). Reads back the same.
 */
export function slotSource(t: Term, L: Record<string, string>): string {
  const act = theAction();
  const has = (u: Term): boolean => u.k === 'app' ? (u.fn === act?.id || u.args.some(has)) : u.k === 'mul' ? u.fs.some(has) : u.k === 'inv' ? has(u.arg) : u.k === 'pow' ? has(u.base) : false;
  if (!act || !has(t)) return K.termSource(t, L);
  const go = (u: Term): string => {
    if (u.k === 'app' && u.fn === act.id && u.args.length === 2) {
      const g = K.norm(u.args[0]!);
      const simple = (x: Term) => x.k === 'atom' || x.k === 'e';
      const gs = K.termSource(g, L);
      return `${simple(g) || (g.k === 'inv' && simple(g.arg)) ? gs : `(${gs})`}(${go(u.args[1]!)})`;
    }
    if (u.k === 'app') return `${L[u.fn] ?? u.fn}(${u.args.map(go).join(', ')})`;
    return K.termSource(u, L); // a point is a letter or an action applied: no products of points
  };
  return go(K.norm(t));
}

// ───────── chips ─────────

/**
 * The element chips a term slot offers, by sort (final W1–7 #2, #11): every letter in play; an inverse for each one
 * that lives in a GROUP — Tower variables included, whatever else the level has — and e only where a group exists.
 * A point of a set (p ∈ Ω, x ∈ A) gets neither. Integer (ℤ) letters are kept as given. Order: what came in, then any
 * missing inverses.
 */
export function elementChips(chips: Term[], atoms: AtomDecl[], env: K.SortEnv | null | undefined): Term[] {
  const decl = new Map(atoms.map((a) => [a.id, a]));
  const multi = !!env?.multi;
  const inGroup = (id: string): boolean => {
    const d = decl.get(id);
    if (d?.sort === 'Z') return false;
    if (!multi) return true;
    const s = env!.atomSort.get(id) ?? d?.carrier ?? K.DEFAULT_GROUP;
    return env!.sorts.get(s)?.kind === 'group';
  };
  const hasGroup = !multi || [...env!.sorts.values()].some((x) => x.kind === 'group');
  const seen = new Set<string>();
  const out: Term[] = [];
  const add = (t: Term) => { const k = JSON.stringify(t); if (!seen.has(k)) { seen.add(k); out.push(t); } };
  for (const t of chips) {
    if (t.k === 'inv' && t.arg.k === 'atom' && !inGroup(t.arg.id)) continue;
    if (t.k === 'e' && !t.s && !hasGroup) continue;
    add(t);
  }
  for (const t of chips) if (t.k === 'atom' && inGroup(t.id)) add({ k: 'inv', arg: t });
  return out;
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

// LEMMA WORKS — shell helpers: DOM, safe kernel calls, campaign progress, statements.
import * as K from '../kernel';
import type { Fact, LevelManifest, PatFact, Term } from '../kernel/types';
import { LEVELS, LEVEL_BY_ID, REGISTRY, MIRROR_NAMES } from '../levels/levels';
import type { Save } from '../state/store';

// ───────── DOM ─────────
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, string | number | boolean | undefined | null> = {}, ...kids: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'html') el.innerHTML = String(v);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Call a kernel/groups function that may still be unimplemented; fall back quietly. */
export function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch (err) {
    if (!(err instanceof Error) || !/not implemented/.test(err.message)) console.warn('[shell]', err);
    return fallback;
  }
}

// ───────── campaign ─────────
export const CHAPTERS: Record<number, { roman: string; name: string }> = {
  1: { roman: 'I', name: 'The Bench' },
  2: { roman: 'II', name: 'Suppose' },
  3: { roman: 'III', name: 'Clockwork' },
  4: { roman: 'IV', name: 'Powers' },
};
export const MAIN = LEVELS.filter((l) => !l.side);
export const isSolved = (save: Save, id: string) => !!save.levels[id]?.solvedAt;

/** Open when every main-path level in `uses` is solved. L01 always open. */
export function isOpen(save: Save, lv: LevelManifest): boolean {
  if (lv.id === LEVELS[0]!.id) return true;
  return lv.uses.filter((u) => !LEVEL_BY_ID[u]?.side).every((u) => isSolved(save, u));
}
/** The first open, unsolved main-path level (the "next work order"). */
export function nextLevel(save: Save, after?: string): LevelManifest | null {
  // side orders chain to the next open side order before returning to the main path
  if (after && LEVEL_BY_ID[after]?.side) {
    const side = LEVELS.filter((l) => l.side && l.id !== after && isOpen(save, l) && !isSolved(save, l.id));
    if (side.length) return side[0]!;
  }
  const start = after && !LEVEL_BY_ID[after]?.side ? MAIN.findIndex((l) => l.id === after) + 1 : 0;
  const order = [...MAIN.slice(start), ...MAIN.slice(0, start)];
  return order.find((l) => isOpen(save, l) && !isSolved(save, l.id)) ?? null;
}

export function labels(level: LevelManifest): Record<string, string> {
  return Object.fromEntries(level.atoms.map((a) => [a.id, a.label]));
}

export function schemaLemmaNo(id: string): number | null {
  const s = REGISTRY[id];
  return s?.fromLevel ? LEVEL_BY_ID[s.fromLevel]?.index ?? null : null;
}
export function schemaNames(id: string, mirror = false): { name: string; textbook: string } {
  const s = REGISTRY[id];
  if (!s) return { name: id, textbook: id };
  if (mirror && MIRROR_NAMES[id]) return MIRROR_NAMES[id]!;
  return { name: s.name, textbook: s.textbook };
}

// ───────── term typesetting (HTML + TeX share one tokenizer) ─────────
/** 'stmt': textbook statements (a², (ab)⁵); 'proof': transcript lines (only runs of 3+ compress). */
export type Mode = 'stmt' | 'proof';
const sameT = (a: Term, b: Term) => JSON.stringify(a) === JSON.stringify(b);
const simpleT = (x: Term) => x.k === 'atom' || x.k === 'meta' || x.k === 'e';
interface Tok { block: Term[]; k: number }
function tokens(fs: Term[], mode: Mode): Tok[] {
  const single = mode === 'stmt' ? 2 : 3, blockMin = mode === 'stmt' ? 2 : 3;
  const out: Tok[] = [];
  for (let i = 0; i < fs.length;) {
    let best = { p: 1, k: 1 };
    for (let p = 1; p <= Math.min(4, Math.floor((fs.length - i) / 2)); p++) {
      if (p === 1 && !(simpleT(fs[i]!) || (fs[i]!.k === 'inv' && simpleT((fs[i] as { arg: Term }).arg)))) continue;
      let k = 1;
      while (i + (k + 1) * p <= fs.length && fs.slice(i + k * p, i + (k + 1) * p).every((f, j) => sameT(f, fs[i + j]!))) k++;
      if (k >= (p === 1 ? single : blockMin) && p * k > best.p * best.k) best = { p, k };
    }
    out.push({ block: fs.slice(i, i + best.p), k: best.k });
    i += best.p * best.k;
  }
  return out;
}
interface Pen { atom: (id: string) => string; meta: (id: string) => string; e: string; sup: (s: string) => string; neg: string }
function typeset(t: Term, L: Record<string, string>, mode: Mode, pen: Pen): string {
  const word = (fs: Term[]): string => tokens(fs, mode).map((tk) => {
    if (tk.k === 1) return tk.block.map(one).join('');
    if (tk.block.length === 1) {
      const f = tk.block[0]!;
      if (f.k === 'inv') return one(f.arg) + pen.sup(`${pen.neg}${tk.k}`);
      return one(f) + pen.sup(String(tk.k));
    }
    return `(${word(tk.block)})${pen.sup(String(tk.k))}`;
  }).join('');
  const one = (x: Term): string => {
    switch (x.k) {
      case 'atom': return pen.atom(L[x.id] ?? x.id);
      case 'meta': return pen.meta(x.id);
      case 'e': return pen.e;
      case 'inv': return simpleT(x.arg) ? one(x.arg) + pen.sup(`${pen.neg}1`) : `(${typeset(x.arg, L, mode, pen)})${pen.sup(`${pen.neg}1`)}`;
      case 'mul': return word(x.fs);
      case 'app': return pen.atom(L[x.fn] ?? x.fn) + `(${x.args.map((y) => typeset(y, L, mode, pen)).join(', ')})`; // Book phase C
      // v4 Phase B: base with its exponent polynomial as a superscript, e.g. (ab)^{5k₁}
      case 'pow': return (simpleT(x.base) ? one(x.base) : `(${typeset(x.base, L, mode, pen)})`) + pen.sup(K.exponentText(x.exp, L, pen === TEX_PEN));
      case 'int': return K.exponentText(x.val, L, pen === TEX_PEN);
    }
  };
  return t.k === 'mul' ? word(t.fs) : one(t);
}
const HTML_PEN: Pen = {
  atom: (s) => `<i class="m-atom">${esc(s)}</i>`, meta: (s) => `<i class="m-meta">${esc(s)}</i>`, e: '<i class="m-e">e</i>',
  sup: (s) => `<sup class="m-sup">${s}</sup>`, neg: '−',
};
const TEX_PEN: Pen = {
  atom: (s) => (/′/.test(s) ? `{${s.replace(/′/g, "'")}}` : s), meta: (s) => s, e: 'e', sup: (s) => `^{${s}}`, neg: '-',
};
const SUP_DIGITS: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
const UNI_PEN: Pen = { atom: (s) => s, meta: (s) => s, e: 'e', sup: (s) => [...s].map((c) => SUP_DIGITS[c] ?? c).join(''), neg: '-' };
export const tH = (t: Term, L: Record<string, string>, mode: Mode = 'stmt') => typeset(t, L, mode, HTML_PEN);
/** Plain unicode, e.g. "(ab)⁻¹" (for tooltips and justification text). */
export const tU = (t: Term, L: Record<string, string>, mode: Mode = 'proof') => typeset(t, L, mode, UNI_PEN);
/** A given's display name in HTML: h₄ → h<sub>4</sub> (Latin Modern lacks the subscript glyphs). */
export const nameHTML = (name: string) => esc(name).replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, (m) => `<sub class="m-sub">${[...m].map((c) => String(c.charCodeAt(0) - 0x2080)).join('')}</sub>`);
/** A given's display name in TeX math: h₄ → h_{4}. */
export const texName = (name: string) => name.replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, (m) => `_{${[...m].map((c) => String(c.charCodeAt(0) - 0x2080)).join('')}}`).replace(/′/g, "'").replace(/\|/g, '|');
export const termTex = (t: Term, L: Record<string, string>, mode: Mode = 'proof') => typeset(t, L, mode, TEX_PEN);

export function fH(f: Fact | PatFact, L: Record<string, string>, mode: Mode = 'stmt'): string {
  const rel = (r: string) => ` <span class="m-rel">${r}</span> `;
  const q = (ms: string[]) => (ms.length ? `∀${ms.map((m) => `<i>${m}</i>`).join(', ')}.&ensp;` : '');
  switch (f.k) {
    case 'eq': return tH(f.l, L, mode) + rel('=') + tH(f.r, L, mode);
    case 'neq': return tH(f.l, L, mode) + rel('≠') + tH(f.r, L, mode);
    case 'mem': return tH(f.t, L, mode) + rel('∈') + `<i>${L[f.sub.id] ?? f.sub.id}</i>`; // Book phase B (plain fallback)
    case 'bot': return '<span class="m-rel">⊥</span>';
    case 'size': return `|<i>G</i>|${rel('=')}${f.n}`;
    case 'law': return q(f.metas) + tH(f.l, L, mode) + rel('=') + tH(f.r, L, mode);
    case 'cond': return q(f.metas) + f.premises.map((p) => fH(p, L, mode)).join(', ') + rel('⇒') + fH(f.concl, L, mode);
  }
}
export function factTex(f: Fact | PatFact, L: Record<string, string>, mode: Mode = 'proof'): string {
  switch (f.k) {
    case 'eq': return `${termTex(f.l, L, mode)} = ${termTex(f.r, L, mode)}`;
    case 'neq': return `${termTex(f.l, L, mode)} \\neq ${termTex(f.r, L, mode)}`;
    case 'mem': return `${termTex(f.t, L, mode)} \\in ${L[f.sub.id] ?? f.sub.id}`; // Book phase B (plain fallback)
    case 'bot': return '\\bot';
    case 'size': return `|G| = ${f.n}`;
    case 'law': return `${f.metas.length ? `\\forall ${f.metas.join(', ')}.\\; ` : ''}${termTex(f.l, L, mode)} = ${termTex(f.r, L, mode)}`;
    case 'cond': return `${f.metas.length ? `\\forall ${f.metas.join(', ')}.\\; ` : ''}${f.premises.map((p) => factTex(p, L, mode)).join(',\\ ')} \\Rightarrow ${factTex(f.concl, L, mode)}`;
  }
}

/** Escape prose for LaTeX text mode; map the few unicode marks we use to ASCII TeX. */
export function texText(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}')
    .replace(/—/g, '---').replace(/–/g, '--').replace(/[‘’]/g, "'").replace(/[“]/g, '``').replace(/[”]/g, "''")
    .replace(/…/g, '\\ldots{}').replace(/·/g, '\\textperiodcentered{}')
    .replace(/[^\x00-\x7F]/g, '');
}

// ───────── rich justification text (prose with embedded math) ─────────
const SUPS: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
const MATHY = /[⁻¹²³⁴⁵⁶⁷⁸⁹⁰₀₁₂₃₄₅₆₇₈₉′=≠·∀⇒∈⊥|]/;
const NOT_MATH = new Set(['be', 'ace', 'cab', 'bee', 'abbe', 'babe']);
const STOP_AFTER_A = /^(by|at|=|:=|to|on|with|and|for|of|from|x|u|v|w)$/i;

/** Split a unicode justification like "multiply on the left by a⁻¹" into text/math segments. */
export function richSegments(s: string, level: LevelManifest): { math: boolean; text: string }[] {
  const letters = new Set<string>(['e', 'x', 'u', 'v', 'w', 'G']);
  for (const a of level.atoms) letters.add(a.label);
  for (const g of level.givens) if (g.name.length <= 3) letters.add(g.name);
  const isMathWord = (w: string, prev: string | undefined, next: string | undefined): boolean => {
    const core = w.replace(/^[(\[]+|[)\],.;:]+$/g, '');
    if (!core) return false;
    if (MATHY.test(core) && !/^[A-Za-z]{3,}/.test(core)) return true;
    if (/^\d+$/.test(core)) return prev !== undefined && MATHY.test(prev);
    // word built only from level letters (multi-char labels like e′ handled by MATHY)
    const chars = [...core.replace(/[()]/g, '')];
    if (!chars.every((c) => letters.has(c))) return false;
    if (core === 'a') { // article or atom?
      if (prev && STOP_AFTER_A.test(prev)) return true;
      if (next && /^[a-z]{3,}$/i.test(next)) return false;
      return true;
    }
    return !NOT_MATH.has(core.toLowerCase());
  };
  const words = s.split(/(\s+)/);
  const toks = words.filter((w) => !/^\s+$/.test(w) && w !== '');
  const segs: { math: boolean; text: string }[] = [];
  let ti = 0;
  for (const w of words) {
    if (w === '') continue;
    if (/^\s+$/.test(w)) { const last = segs[segs.length - 1]; if (last) last.text += w; continue; }
    const m = isMathWord(w, toks[ti - 1], toks[ti + 1]);
    ti++;
    // peel trailing punctuation off math words
    let core = w, tail = '', lead = '';
    if (m) {
      const mm = /^(.*?)([,.;:]*)$/.exec(w)!; core = mm[1]!; tail = mm[2]!;
      // an unbalanced bracket belongs to the surrounding prose, not to the formula
      const bal = (x: string) => (x.match(/\(/g)?.length ?? 0) - (x.match(/\)/g)?.length ?? 0);
      while (bal(core) < 0 && core.endsWith(')')) { tail = ')' + tail; core = core.slice(0, -1); }
      while (bal(core) > 0 && core.startsWith('(')) { lead += '('; core = core.slice(1); }
    }
    if (lead) { const l0 = segs[segs.length - 1]; if (l0 && !l0.math) l0.text += lead; else segs.push({ math: false, text: lead }); }
    const last = segs[segs.length - 1];
    if (last && last.math === m) last.text += core;
    else segs.push({ math: m, text: core });
    if (tail) segs.push({ math: false, text: tail });
  }
  // math segments: trim edge whitespace back into neighbours
  const out: { math: boolean; text: string }[] = [];
  for (const sg of segs) {
    if (!sg.math) { out.push(sg); continue; }
    const lead = /^\s*/.exec(sg.text)![0], trail = /\s*$/.exec(sg.text)![0];
    if (lead) out.push({ math: false, text: lead });
    out.push({ math: true, text: sg.text.trim() });
    if (trail) out.push({ math: false, text: trail });
  }
  return out.filter((x) => x.text !== '');
}

function mathUnicodeToHTML(m: string): string {
  let out = '';
  const chars = [...m];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    if (c in SUPS) {
      let run = '';
      while (i < chars.length && chars[i]! in SUPS) { run += SUPS[chars[i]!]; i++; }
      i--; out += `<sup class="m-sup">${run.replace('-', '−')}</sup>`;
    } else if (c >= '₀' && c <= '₉') out += `<sub class="m-sub">${c.charCodeAt(0) - 0x2080}</sub>`;
    else if (/[A-Za-z]/.test(c)) out += `<i>${c}</i>`;
    else if (c === '=' || c === '≠' || c === '⇒' || c === '∈') out += ` <span class="m-rel">${c}</span> `;
    else out += esc(c);
  }
  return out.replace(/\s+/g, ' ').replace(/ <span class="m-rel">/g, '&thinsp;<span class="m-rel">').replace(/<\/span> /g, '</span>&thinsp;');
}
function mathUnicodeToTex(m: string): string {
  let out = '';
  const chars = [...m.replace(/:=/g, '≔')];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    if (c in SUPS) {
      let run = '';
      while (i < chars.length && chars[i]! in SUPS) { run += SUPS[chars[i]!]; i++; }
      i--; out += `^{${run}}`;
    } else if (c >= '₀' && c <= '₉') {
      let run = '';
      while (i < chars.length && chars[i]! >= '₀' && chars[i]! <= '₉') { run += String(chars[i]!.charCodeAt(0) - 0x2080); i++; }
      i--; out += `_{${run}}`;
    } else if (c === '′') out += "'";
    else if (c === '≠') out += ' \\neq ';
    else if (c === '≔') out += ' := ';
    else if (c === '·') out += ' \\cdot ';
    else if (c === '∀') out += '\\forall ';
    else if (c === '⇒') out += ' \\Rightarrow ';
    else if (c === '∈') out += ' \\in ';
    else if (c === '⊥') out += '\\bot ';
    else if (/[\x20-\x7E]/.test(c)) out += c === '{' || c === '}' ? `\\${c}` : c;
  }
  return out.replace(/\s+/g, ' ').trim();
}
export function richHTML(s: string, level: LevelManifest): string {
  return richSegments(s, level).map((sg) => (sg.math ? `<span class="math">${mathUnicodeToHTML(sg.text)}</span>` : esc(sg.text))).join('');
}
export function richTex(s: string, level: LevelManifest): string {
  return richSegments(s, level).map((sg) => (sg.math ? `$${mathUnicodeToTex(sg.text)}$` : texText(sg.text))).join('');
}

// ───────── generalized statements ("Lemma n. For all a, b ∈ G, if …, then …") ─────────
export interface Statement { html: string; tex: string; plainHTML: string }

function cardClause(f: Fact, L: Record<string, string>, html: boolean): string {
  const t = (x: Term) => (html ? `<span class="math">${tH(x, L)}</span>` : `$${termTex(x, L, 'stmt')}$`);
  const pf = (p: PatFact) => (html ? `<span class="math">${fH(p, L)}</span>` : `$${factTex(p, L, 'stmt')}$`);
  const metas = (ms: string[]) => (html ? ms.map((m) => `<span class="math"><i>${m}</i></span>`).join(', ') : `$${ms.join(', ')}$`);
  const inG = html ? '<span class="math">&thinsp;∈&thinsp;<i>G</i></span>' : '$\\in G$';
  if (f.k === 'law') return html
    ? `<span class="math">${tH(f.l, L)} = ${tH(f.r, L)}</span> for all ${metas(f.metas)} ${inG}`
    : `$${termTex(f.l, L, 'stmt')} = ${termTex(f.r, L, 'stmt')}$ for all $${f.metas.join(', ')} \\in G$`;
  if (f.k === 'cond') return `${pf(f.concl)} for all ${metas(f.metas)} ${inG} with ${f.premises.map(pf).join(' and ')}`;
  if (f.k === 'size') return '';
  return html ? `<span class="math">${fH(f, L)}</span>` : `$${factTex(f, L, 'stmt')}$`;
}

/** The theorem a level proves, stated in textbook form. `any` wraps atom letters as striped "any" beads. */
export function statementOf(level: LevelManifest, opts: { any?: boolean } = {}): Statement {
  const L = labels(level);
  const allowedIds = new Set(level.sockets.flatMap((sk) => sk.allowedGivens));
  const allowed = level.givens.filter((g) => allowedIds.has(g.id));
  const size = allowed.find((g) => g.fact.k === 'size');
  const hyps = allowed.filter((g) => g.fact.k !== 'size');
  const atomsH = level.atoms.map((a) => `<i class="m-atom${opts.any ? ' any' : ''}">${esc(a.label)}</i>`).join(', ');
  const atomsT = level.atoms.map((a) => a.label.replace(/′/g, "'")).join(', ');
  const n = size ? (size.fact as { n: number }).n : 0;
  const preH = size ? `Let <span class="math"><i>G</i></span> be a group of order ${n}. For all ` : 'For all ';
  const preT = size ? `Let $G$ be a group of order ${n}. For all ` : 'For all ';
  const hypsH = hyps.map((g) => cardClause(g.fact, L, true));
  const hypsT = hyps.map((g) => cardClause(g.fact, L, false));
  const tgH = level.sockets.map((sk) => `<span class="math">${fH(sk.target, L)}</span>`).join(' and ');
  const tT = level.sockets.map((sk) => `$${factTex(sk.target, L, 'stmt')}$`).join(' and ');
  const ifH = hypsH.length ? `, if ${hypsH.join(' and ')}, then ${tgH}.` : `, ${tgH}.`;
  const ifT = hypsT.length ? `, if ${hypsT.join(' and ')}, then ${tT}.` : `, ${tT}.`;
  return {
    html: `${preH}<span class="math">${atomsH}&thinsp;∈&thinsp;<i>G</i></span>${ifH}`,
    tex: `${preT}$${atomsT} \\in G$${ifT}`,
    plainHTML: level.sockets.map((sk) => `<span class="math">${fH(sk.target, L)}</span>`).join('<span class="qed-and">and</span>'),
  };
}

/** Givens of a level as one short "h: ab = e" line each (HTML). */
export function givenLine(level: LevelManifest, id: string): string {
  const g = level.givens.find((x) => x.id === id);
  if (!g) return id;
  return `<span class="math"><i>${esc(g.name)}</i>: ${fH(g.fact, labels(level))}</span>`;
}

export { K, REGISTRY, LEVELS, LEVEL_BY_ID };

// LEMMA WORKS v3 — HUD helpers: DOM, guarded calls, campaign progress, catalogue access, floor anchors.
// Owner: HUD builder. Typesetting is reused from the v2 shell (import only; v2 folders stay untouched).
import * as F from '../factory';
import { rectToScreen } from '../floor/project';
import type { Family, LevelManifest, Term } from '../kernel/types';
import type { FactoryStore, FState } from '../state/factoryStore';
import { LEVELS, LEVEL_BY_ID, REGISTRY, MIRROR_NAMES } from '../levels/levels';
import type { ItemValue, Machine, MachineKind, MachineSpec } from '../factory/types';
import { FAMILY } from '../ui/tokens';
import { fH as fH0, tH as tH0 } from '../shell/util';

export { tU, richHTML, schemaNames, schemaLemmaNo, nameHTML, labels } from '../shell/util';

/** The floor's Tower labels and their sorts (set by the app on every render): typeset maths marks them. */
export const varRegistry = { labels: new Map<string, 'G' | 'Z'>() };
const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const digitsOf = (sub: string) => [...sub].map((c) => String(c.charCodeAt(0) - 0x2080)).join('');
const varTag = (label: string, sort: 'G' | 'Z' | undefined, tag: 'i' = 'i') => {
  const m = /^(.*?)([₀₁₂₃₄₅₆₇₈₉]*)$/.exec(label)!;
  return `<${tag} class="m-atom any ${sort === 'Z' ? 'z' : 'g'}" title="${sort === 'Z' ? 'an integer variable: it can be any integer' : 'a variable: it can be any element'}">${m[1]}${m[2] ? `<sub class="m-sub">${digitsOf(m[2])}</sub>` : ''}</${tag}>`;
};
/**
 * Latin Modern has no subscript glyphs: x₁ → x<sub>1</sub>. Tower variables (subscripted letters, or any label
 * in the registry such as a bare x) get a SOLID tinted chip by sort — never hatching (design review, 2026-10-09).
 */
export function fixVars(html: string): string {
  const reg = varRegistry.labels;
  return html
    .replace(/<i class="m-atom">([^<]*)<\/i>/g, (m0, label: string) => (reg.has(label) || /[₀₁₂₃₄₅₆₇₈₉]$/.test(label) ? varTag(label, reg.get(label)) : m0))
    // names inside exponents (ℤ Towers: (ab)^{5k₁}) and anywhere else in text, never inside a tag
    .replace(/(^|>)([^<]*)/g, (_m, gt: string, text: string) => gt + text.replace(/([A-Za-z])([₀₁₂₃₄₅₆₇₈₉]+)/g, (x, a: string, sub: string) => varTag(a + sub, reg.get(a + sub))))
    // bare one-letter integer variables inside exponents: (ab)^{5k}
    .replace(/<sup class="m-sup">([^<]*)<\/sup>/g, (m0, body: string) => {
      const zs = [...reg].filter(([l, so]) => so === 'Z' && /^[A-Za-z]$/.test(l)).map(([l]) => l);
      return zs.length ? `<sup class="m-sup">${body.replace(new RegExp(`[${zs.join('')}]`, 'g'), (c) => varTag(c, 'Z'))}</sup>` : m0;
    });
}
void SUBS;
export const tH = (...a: Parameters<typeof tH0>): string => fixVars(tH0(...a));
export const fH = (...a: Parameters<typeof fH0>): string => fixVars(fH0(...a));
export { LEVELS, LEVEL_BY_ID, REGISTRY, MIRROR_NAMES };

export type Store = FactoryStore;
export type S = FState;

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

/** Call a function from a concurrently-built module; quiet fallback while it is still a stub. */
export function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch (err) {
    if (!(err instanceof Error) || !/not implemented/.test(err.message)) console.warn('[hud]', err);
    return fallback;
  }
}

// ───────── campaign progress (v3 save) ─────────
type SaveLike = { levels: Record<string, { solvedAt?: number } | undefined> };
export const MAIN = LEVELS.filter((l) => !l.side);
export const isSolved = (save: SaveLike, id: string) => !!save.levels[id]?.solvedAt;
export function isOpen(save: SaveLike, lv: LevelManifest): boolean {
  if (lv.id === LEVELS[0]!.id) return true;
  return lv.uses.filter((u) => !LEVEL_BY_ID[u]?.side).every((u) => isSolved(save, u));
}
export function nextLevel(save: SaveLike, after?: string): LevelManifest | null {
  if (after && LEVEL_BY_ID[after]?.side) {
    const side = LEVELS.filter((l) => l.side && l.id !== after && isOpen(save, l) && !isSolved(save, l.id));
    if (side.length) return side[0]!;
  }
  const start = after && !LEVEL_BY_ID[after]?.side ? MAIN.findIndex((l) => l.id === after) + 1 : 0;
  const order = [...MAIN.slice(start), ...MAIN.slice(0, start)];
  return order.find((l) => isOpen(save, l) && !isSolved(save, l.id)) ?? null;
}
export const CHAPTERS: Record<number, { roman: string; name: string }> = {
  1: { roman: 'I', name: 'The Works' },
  2: { roman: 'II', name: 'Suppose' },
  3: { roman: 'III', name: 'Clockwork' },
  4: { roman: 'IV', name: 'Powers' },
};

export const hues = (level: LevelManifest): Record<string, number> => Object.fromEntries(level.atoms.map((a) => [a.id, a.hue]));

// ───────── catalogue ─────────
export const FAMILY_ORDER: Family[] = ['equation', 'inverse', 'identity', 'given', 'structure', 'lemma', 'contradiction', 'scope'];

/** v4 catalogue as the HUD needs it (the editor's SPECS win when they cover the kind). */
const FALLBACK: Partial<Record<MachineKind, MachineSpec>> = {
  spool: { kind: 'spool', name: 'Spool', family: 'equation', glyph: 't=t', blurb: 'Makes t = t from any term.', hotkey: '1', placeable: true },
  rewriter: { kind: 'rewriter', name: 'Rewriter', family: 'given', glyph: 'L→R', blurb: 'Changes one spot of an equation, by a recipe.', hotkey: '2', placeable: true },
  operator: { kind: 'operator', name: 'Operator', family: 'structure', glyph: 't·', blurb: 'Changes the whole equation.', hotkey: '3', placeable: true },
  joiner: { kind: 'joiner', name: 'Joiner', family: 'equation', glyph: '⋈', blurb: 'Combines two facts.', hotkey: '4', placeable: true },
  theorem: { kind: 'theorem', name: 'Theorem', family: 'lemma', glyph: '⇒', blurb: 'Uses a theorem: premises in, conclusion out.', hotkey: '5', placeable: true },
  tower: { kind: 'tower', name: 'Tower', family: 'scope', glyph: 'x₁', blurb: 'x can be anything. Prove it for x, and ∀ makes it true for all.', hotkey: '6', placeable: true },
  forall: { kind: 'forall', name: '∀', family: 'lemma', glyph: '∀', blurb: 'Makes a fact about x true for all x.', hotkey: '7', placeable: true },
  carddock: { kind: 'carddock', name: 'Card Dock', family: 'lemma', glyph: '∀=', blurb: 'Puts a theorem on a belt.', placeable: true },
  hopper: { kind: 'hopper', name: 'Hopper', family: 'structure', glyph: 't', blurb: 'Emits a term. No claim.', placeable: true },
  given: { kind: 'given', name: 'Given Inlet', family: 'given', glyph: 'h', blurb: 'A hypothesis of this order.', placeable: false },
  socket: { kind: 'socket', name: 'Receiving Dock', family: 'equation', glyph: '∎', blurb: 'Deliver the goal here.', placeable: false },
  desk: { kind: 'desk', name: 'Assumption Desk', family: 'scope', glyph: '⊢', blurb: 'Emits the room’s assumption.', placeable: false },
  gate: { kind: 'gate', name: 'Exit Gate', family: 'scope', glyph: '⊣', blurb: 'What leaves the room.', placeable: false },
};
/** v4 hotbar (DESIGN v4 §1): Spool 1 · Rewriter 2 · Operator 3 · Joiner 4 · Theorem 5 · Tower 6 · ∀ 7. */
export const HOTBAR_V4: MachineKind[] = ['spool', 'rewriter', 'operator', 'joiner', 'theorem', 'tower', 'forall'];
export const HOTKEY_V4: Record<string, string> = { spool: '1', rewriter: '2', operator: '3', joiner: '4', theorem: '5', tower: '6', forall: '7' };
export function spec(kind: MachineKind): MachineSpec {
  const ed = (F.SPECS as Partial<Record<string, MachineSpec>> | undefined)?.[kind];
  const fb = FALLBACK[kind];
  const s = ed ? { ...ed, blurb: fb?.blurb ?? ed.blurb } : fb; // the HUD's short copy (COPY.md) wins
  const out = s ?? { kind, name: kind[0]!.toUpperCase() + kind.slice(1), family: 'equation', glyph: '?', blurb: '', placeable: true };
  return HOTKEY_V4[kind] ? { ...out, hotkey: HOTKEY_V4[kind] } : out;
}
export const hotbarKinds = (): MachineKind[] => HOTBAR_V4;
export const drawerKinds = (): MachineKind[] => ['carddock', 'hopper'];
export const VERBS: MachineKind[] = ['rewriter', 'operator', 'joiner', 'theorem'];

/** Static "in → out" reading for hover cards (fallback when ports are not computable). */
export const IO: Partial<Record<MachineKind, [string, string]>> = {
  spool: ['term t (knob or port)', 'equation t = t'],
  rewriter: ['equation · [rule: a fact made here]', 'equation'],
  operator: ['equation · [term t]', 'equation'],
  joiner: ['two facts', 'equation or ⊥'],
  theorem: ['premises · [card: a fact made here]', 'equation or inequation'],
  tower: ['—', 'broadcasts its symbol to the floor'],
  forall: ['a fact about Tower variables', 'law or theorem card'],
  carddock: ['—', 'card'],
  hopper: ['—', 'term'],
};
export const KIND_WORD: Record<string, string> = { term: 'term', eq: 'equation', neq: 'inequation', bot: '⊥', size: '|G| = n', law: 'law', cond: 'card' };

export function familyInk(f: Family) { return FAMILY[f]; }

/** Display name of a machine on the canvas (earned machines carry their theorem's name). */
export function machineName(m: Pick<Machine, 'kind' | 'config'>): string {
  const c = m.config as { kind: string; recipe?: { k: string; ref?: { k: string; id?: string; mirror?: boolean } } | null; label?: string };
  const ref = c.recipe && 'ref' in c.recipe ? c.recipe.ref : undefined;
  if (c.kind === 'theorem' && ref?.k === 'schema' && ref.id) {
    const sc = REGISTRY[ref.id];
    if (sc) return ref.mirror ? (MIRROR_NAMES[ref.id]?.name ?? `${sc.name} ᵒᵖ`) : sc.name;
  }
  if (c.kind === 'tower' && c.label) return `Tower ${c.label}`;
  return spec(m.kind).name;
}

// ───────── Tower variables ─────────
export interface TowerVar { id: string; label: string; machine: string; sort: 'G' | 'Z' }
/** Variables declared by Towers on this floor (compiled graph vars when present, else Tower configs). */
export function towerVars(s: S): TowerVar[] {
  const out: TowerVar[] = [];
  for (const m of s.canvas.machines) {
    const c = m.config as { kind: string; varId?: string; label?: string; sort?: 'G' | 'Z' };
    if (c.kind === 'tower' && c.varId) out.push({ id: c.varId, label: c.label || c.varId, machine: m.id, sort: c.sort === 'Z' ? 'Z' : 'G' });
  }
  return out;
}
/** Level atoms plus Tower variables, for term entry (parseTerm) and labels. */
export function atomsAll(s: S): import('../kernel/types').AtomDecl[] {
  const vs = towerVars(s).map((v, i) => ({ id: v.id, label: v.label, hue: (s.level.atoms.length + i) % 6, variable: true, sort: v.sort }));
  const g = (s.compiled?.graph?.vars ?? []).filter((v) => !vs.some((w) => w.id === v.id));
  return [...s.level.atoms, ...vs, ...g];
}
export const labelsAll = (s: S): Record<string, string> => Object.fromEntries(atomsAll(s).map((a) => [a.id, a.label]));
export const huesAll = (s: S): Record<string, number> => Object.fromEntries(atomsAll(s).map((a) => [a.id, a.hue]));
/** Tower variable id → sort. */
export const varSortsOf = (s: S): Map<string, 'G' | 'Z'> => new Map(atomsAll(s).filter((a) => (a as { variable?: boolean }).variable).map((a) => [a.id, (a as { sort?: 'G' | 'Z' }).sort === 'Z' ? 'Z' : 'G'] as [string, 'G' | 'Z']));
export const varIdsOf = (s: S): Set<string> => new Set(atomsAll(s).filter((a) => (a as { variable?: boolean }).variable).map((a) => a.id));
/** Does a term mention an atom id? */
export function mentions(t: Term, id: string): boolean {
  switch (t.k) {
    case 'atom': return t.id === id;
    case 'inv': return mentions(t.arg, id);
    case 'mul': return t.fs.some((f) => mentions(f, id));
    default: { const b = (t as { base?: Term }).base; return b ? mentions(b, id) : false; }
  }
}
export function atomsIn(t: Term, out = new Set<string>()): Set<string> {
  if (t.k === 'atom') out.add(t.id); else if (t.k === 'inv') atomsIn(t.arg, out); else if (t.k === 'mul') t.fs.forEach((f) => atomsIn(f, out));
  else { const b = (t as { base?: Term }).base; if (b) atomsIn(b, out); }
  return out;
}

// ───────── items as maths ─────────
export function itemHTML(v: ItemValue | undefined, L: Record<string, string>): string {
  if (!v) return '';
  if (v.k === 'term') return tH(v.term, L);
  return fH(v.k === 'fact' ? v.fact : v.card, L, 'proof');
}
export const termOf = (v: ItemValue | undefined): Term | null => (v && v.k === 'term' ? v.term : null);

// ───────── floor anchors ─────────
// The lens and hints anchor to machines on the floor. Order: a helper exported by ../floor (if any);
// the floor's own projection (floor/project.ts: camera convention shared with the HUD) applied to the
// machine's grid rect; elements tagged data-machine="<id>"; else null (callers dock at the right edge).
type RectLike = { left: number; top: number; width: number; height: number };
const FLOOR_HELPERS = ['machineScreenRect', 'screenRectOf', 'machineRect', 'rectOfMachine', 'anchorOf'];
/** The floor module, once its dynamic import resolves (index.ts sets it). */
export const floorModule: { mod: Record<string, unknown> } = { mod: {} };
export function machineRect(id: string, s?: S): RectLike | null {
  const fl = floorModule.mod;
  for (const name of FLOOR_HELPERS) {
    const fn = fl[name];
    if (typeof fn !== 'function') continue;
    try {
      const r = (fn as (id: string) => unknown)(id) as Partial<RectLike & { x: number; y: number; w: number; h: number }> | null;
      if (r) {
        const left = r.left ?? r.x, top = r.top ?? r.y, width = r.width ?? r.w ?? 0, height = r.height ?? r.h ?? 0;
        if (typeof left === 'number' && typeof top === 'number') return { left, top, width, height };
      }
    } catch { /* not ready */ }
  }
  const root = document.getElementById('floor');
  if (!root || !root.querySelector('svg, canvas')) return null; // the floor has not drawn anything yet
  const q = CSS.escape(id);
  const tagged = root.querySelector(`[data-machine="${q}"], [data-machine-id="${q}"], [data-mid="${q}"]`);
  if (tagged) {
    const r = tagged.getBoundingClientRect();
    if (r.width || r.height) return { left: r.left, top: r.top, width: r.width, height: r.height };
  }
  if (!s) return null;
  const m = s.canvas.machines.find((x) => x.id === id);
  if (!m) return null;
  const g = safe(() => F.rectOf(m, s.ctx), null);
  const fr = root.getBoundingClientRect();
  if (!g || !fr.width) return null;
  const sr = rectToScreen(s.ui.camera, { w: fr.width, h: fr.height }, g.x, g.y, g.x + g.w, g.y + g.h, 0.3);
  return { left: fr.left + sr.x, top: fr.top + sr.y, width: sr.w, height: sr.h };
}

/** Last pointer position (toasts appear near it). */
export const pointer = { x: innerWidth / 2, y: innerHeight - 120 };
if (typeof window !== 'undefined') window.addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true, capture: true });

/** Copy text, with a textarea fallback. */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = h('textarea', {}, text); document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; } ta.remove(); return ok;
  }
}

/** The level's own idea line (v4 content). */
export const ideaOf = (lv: LevelManifest): string => lv.idea;

// ───────── statements: card targets (∀ goals) as textbook sentences ─────────
import { statementOf as statementOf0, termTex as termTex0 } from '../shell/util';
type St = ReturnType<typeof statementOf0>;
/** "Lemma n. For all …" for any order, including ∀ goals (law / conditional-card docks). */
export function statementOf(level: LevelManifest, opts: { any?: boolean } = {}): St {
  const cards = level.sockets.map((sk) => sk.target).filter((t) => t.k === 'law' || t.k === 'cond');
  if (!cards.length) return statementOf0(level, opts);
  const L = Object.fromEntries(level.atoms.map((a) => [a.id, a.label]));
  const metas = [...new Set(cards.flatMap((c) => (c as { metas: string[] }).metas))];
  // integer variables are those inside exponents ((ab)^{5k}): they range over ℤ, not G
  const zs = new Set<string>();
  const walk = (t: Term) => {
    if (t.k === 'pow') { for (const term of t.exp) for (const x of term.monomial) if (x.ref.k === 'zmeta') zs.add(x.ref.id); walk(t.base); }
    else if (t.k === 'inv') walk(t.arg); else if (t.k === 'mul') t.fs.forEach(walk);
  };
  for (const c of cards) {
    if (c.k === 'law') { walk(c.l); walk(c.r); }
    else if (c.k === 'cond') { for (const p of c.premises) if (p.k === 'eq' || p.k === 'neq') { walk(p.l); walk(p.r); } if (c.concl.k === 'eq' || c.concl.k === 'neq') { walk(c.concl.l); walk(c.concl.r); } }
  }
  const gm = metas.filter((m) => !zs.has(m)), zm = metas.filter((m) => zs.has(m));
  const it = (ms: string[]) => ms.map((m) => `<i class="m-atom${opts.any ? ' any' : ''}">${esc(m)}</i>`).join(', ');
  const mvH = [gm.length ? `${it(gm)}&thinsp;∈&thinsp;<i>G</i>` : '', zm.length ? `${it(zm)}&thinsp;∈&thinsp;ℤ` : ''].filter(Boolean).join('</span> and <span class="math">');
  const mvT = [gm.length ? `${gm.join(', ')} \\in G` : '', zm.length ? `${zm.join(', ')} \\in \\mathbb{Z}` : ''].filter(Boolean).join('$ and $');
  const clause = (t: (typeof cards)[number], html: boolean): string => {
    if (t.k === 'law') return html ? `<span class="math">${fH({ k: 'eq', l: t.l, r: t.r }, L)}</span>` : `$${fTex({ k: 'eq', l: t.l, r: t.r })}$`;
    if (t.k === 'cond') {
      const prem = t.premises.map((p) => (html ? `<span class="math">${fH(p, L)}</span>` : `$${fTex(p)}$`)).join(' and ');
      const concl = html ? `<span class="math">${fH(t.concl, L)}</span>` : `$${fTex(t.concl)}$`;
      return prem ? `if ${prem}, then ${concl}` : concl;
    }
    return '';
  };
  const fTex = (f: { k: string; l: Term; r: Term }) => `${tTex(f.l)} ${f.k === 'neq' ? '\\neq' : '='} ${tTex(f.r)}`;
  const tTex = (t: Term): string => safe(() => termTex0(t, L, 'stmt'), '');
  const html = `For all <span class="math">${mvH}</span>, ${cards.map((c) => clause(c, true)).join(', and ')}.`;
  const tex = `For all $${mvT}$, ${cards.map((c) => clause(c, false)).join(', and ')}.`;
  return { html, tex, plainHTML: level.sockets.map((sk) => `<span class="math">${fH(sk.target, L)}</span>`).join('<span class="qed-and">and</span>') };
}

// ───────── typed fields: x1 / x_1 → x₁ as you type (only when that names a Tower; bare x stays x) ─────────
const SUBDIG = '₀₁₂₃₄₅₆₇₈₉';
/** Attach live subscripting to an input. `labels()` = the Tower labels it may refer to; `any` subscripts every letter+digits. */
export function liveSubscripts(input: HTMLInputElement, labels: () => Set<string>, any = false) {
  input.addEventListener('input', () => {
    const v = input.value, caret = input.selectionStart ?? v.length;
    const known = labels();
    let removed = 0, before = 0;
    const out = v.replace(/([A-Za-z])_?(\d+)/g, (m, a: string, d: string, off: number) => {
      const lab = a + [...d].map((c) => SUBDIG[+c]).join('');
      if (!any && !known.has(lab)) return m;
      const drop = m.length - lab.length;
      if (off + m.length <= caret) before += drop;
      removed += drop;
      return lab;
    });
    let out2 = out, before2 = before;
    out2 = out2.replace(/\^-1/g, (m: string, off: number) => { if (off + m.length <= caret - before) before2 += m.length - 2; return '⁻¹'; });
    if (out2 !== v) { input.value = out2; const c = caret - before2; input.setSelectionRange(c, c); input.dispatchEvent(new Event('input')); }
    void removed;
  });
}
export const towerLabelSet = (s: S): Set<string> => new Set(towerVars(s).map((v) => v.label));

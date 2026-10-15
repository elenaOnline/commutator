// Concept cards — TeX-ish inline maths ($…$) and a minimal markdown (**bold**, *italic*, paragraphs) → HTML.
import { esc } from '../util';

const GREEK_LOWER: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ',
  iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ',
  phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
};
const GREEK_UPPER: Record<string, string> = { Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω' };
const SYM: Record<string, string> = {
  forall: '∀', Rightarrow: '⇒', neq: '≠', ne: '≠', bot: '⊥', in: '∈', notin: '∉', geq: '≥', ge: '≥', leq: '≤', le: '≤', langle: '⟨', rangle: '⟩',
  dots: '…', ldots: '…', cdots: '⋯', cdot: '·', ';': '&thinsp;', ',': '&thinsp;', ':': '&thinsp;', '!': '', ' ': '&nbsp;', quad: '&emsp;', qquad: '&emsp;&emsp;',
  mid: '|', vert: '|', lvert: '|', rvert: '|', mapsto: '↦', to: '→', rightarrow: '→', leftarrow: '←', exists: '∃', neg: '¬', lnot: '¬', times: '×',
  implies: '⟹', Longrightarrow: '⟹', nRightarrow: '⇏', iff: '⟺', Leftrightarrow: '⟺', impliedby: '⟸',
  trianglelefteq: '⊴', triangleleft: '◁', unlhd: '⊴', lhd: '◁', subseteq: '⊆', subset: '⊂', subsetneq: '⊊', supseteq: '⊇', cap: '∩', cup: '∪',
  setminus: '∖', emptyset: '∅', varnothing: '∅', circ: '∘', cong: '≅', simeq: '≃', sim: '∼', equiv: '≡', vdash: '⊢', dashv: '⊣', pm: '±',
  '{': '{', '}': '}', '|': '‖', backslash: '∖', infty: '∞', prime: '′', star: '⋆', ast: '∗', oplus: '⊕', otimes: '⊗', wedge: '∧', vee: '∨',
  ...GREEK_UPPER,
};
/** Upright operator names: \ker x, \gcd(m, n), \operatorname{Aut}. */
const OPS = ['ker', 'gcd', 'lcm', 'deg', 'det', 'dim', 'mod', 'min', 'max', 'exp', 'log', 'Im', 'im', 'Hom', 'Aut', 'Inn', 'End', 'Sym', 'id', 'sgn', 'ord'];
/** Macros that take a {group}: blackboard letters, upright text and operator names. */
const GROUPED = ['mathbb', 'mathrm', 'text', 'textrm', 'operatorname', 'mathit', 'mathbf', 'pmod'];
/** Every macro the card TeX knows. Anything else is a typo, and the cards test fails on it. */
export const KNOWN_MACROS: ReadonlySet<string> = new Set([...Object.keys(SYM), ...Object.keys(GREEK_LOWER), ...OPS, ...GROUPED]);
const REL = /[⇒⟹⟸⟺⇏≠∈∉≥≤↦→←×⊴◁⊆⊂⊊⊇≅≃∼≡⊢⊣]/;
const rel = (x: string) => ` <span class="m-rel">${x}</span> `;

export function texHTML(src: string): string {
  let i = 0;
  const group = (): string => {
    if (src[i] === '{') {
      i++; let depth = 1; const start = i;
      while (i < src.length && depth) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; i++; }
      return conv(src.slice(start, i - 1));
    }
    const c = src[i++] ?? '';
    return /[A-Za-z]/.test(c) ? `<i>${c}</i>` : esc(c);
  };
  const conv = (t: string): string => {
    const save = src, si = i;
    src = t; i = 0;
    let out = '';
    while (i < src.length) {
      const c = src[i]!;
      if (c === '\\') {
        const m = /^\\([A-Za-z]+|.)/.exec(src.slice(i));
        const name = m?.[1] ?? '';
        i += 1 + name.length;
        if (name === 'mathbb') { const g = group().replace(/<\/?i>/g, ''); out += ({ Z: 'ℤ', N: 'ℕ', Q: 'ℚ', R: 'ℝ', C: 'ℂ' } as Record<string, string>)[g] ?? g; continue; }
        if (name === 'pmod') { out += `&ensp;(mod ${group()})`; continue; }
        if (GROUPED.includes(name)) { const g = group(); out += name === 'mathit' ? g : name === 'mathbf' ? `<b>${g}</b>` : `<span class="m-op">${g.replace(/<\/?i>/g, '')}</span>`; continue; }
        if (OPS.includes(name)) { out += `<span class="m-op">${name}</span>${name === 'mod' ? '&ensp;' : '&thinsp;'}`; continue; }
        if (GREEK_LOWER[name]) { out += `<i>${GREEK_LOWER[name]}</i>`; continue; }
        const sym = SYM[name];
        out += sym !== undefined ? (REL.test(sym) ? rel(sym) : sym) : esc(name);
      } else if (c === '^') { i++; out += `<sup class="m-sup">${group()}</sup>`; }
      else if (c === '_') { i++; out += `<sub class="m-sub">${group()}</sub>`; }
      else if (c === '=') { i++; out += rel('='); }
      else if (/[A-Za-z]/.test(c)) { i++; out += `<i>${c}</i>`; }
      else if (c === '-' && src[i + 1] && /\d/.test(src[i + 1]!)) { i++; out += '−'; }
      else if (c === '{' || c === '}') { i++; }
      else { i++; out += esc(c); }
    }
    src = save; i = si;
    return out;
  };
  return `<span class="math">${conv(src)}</span>`;
}

/** One line of markdown: **bold**, *italic*, $maths$. */
export function mdInline(md: string): string {
  return md.split(/(\$[^$]+\$)/g).map((p) => (p.startsWith('$') && p.endsWith('$') && p.length > 1
    ? texHTML(p.slice(1, -1))
    : esc(p).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<em>$1</em>'))).join('');
}

/** Paragraphs (blank-line separated) of inline markdown. */
export const mdHTML = (md: string): string => mdInline(md).split(/\n{2,}/).map((x) => `<p>${x}</p>`).join('');

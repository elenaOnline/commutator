// Concept cards — TeX-ish inline maths ($…$) and a minimal markdown (**bold**, *italic*, paragraphs) → HTML.
import { esc } from '../util';

const SYM: Record<string, string> = {
  forall: '∀', Rightarrow: '⇒', neq: '≠', bot: '⊥', in: '∈', geq: '≥', leq: '≤', langle: '⟨', rangle: '⟩', dots: '…', ldots: '…', cdot: '·',
  ';': '&thinsp;', ',': '&thinsp;', quad: '&emsp;', qquad: '&emsp;&emsp;', mid: '|', mapsto: '↦', exists: '∃', neg: '¬', times: '×',
  implies: '⟹', Longrightarrow: '⟹', nRightarrow: '⇏',
};
const REL = /[⇒⟹⇏≠∈≥≤↦×]/;
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
        if (name === 'mathbb') { const g = group().replace(/<\/?i>/g, ''); out += g === 'Z' ? 'ℤ' : g === 'N' ? 'ℕ' : g; continue; }
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

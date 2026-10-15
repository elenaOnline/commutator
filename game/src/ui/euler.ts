// COMMUTATOR — the Euler blob (Book phase B): a subgroup drawn as a set, a soft rounded outline with its name
// inside, flat, in the subgroup ink (ui/tokens SUBGROUP). A membership reads literally: "t ∈ (H)" — the term,
// the ∈, the set it sits in. Used on belts (floor items), in the lens's membership rail and by the Subgroup Tower.
import { FONT, SUBGROUP } from './tokens';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
/** The outline, in a 30 × 22 box: a little irregular, so it reads as a set drawn by hand, not a button. */
export const BLOB_PATH = 'M3.6,11.4 C3.1,5.2 9.4,1.6 15.6,1.9 C22.6,2.2 27.4,5.4 27.1,11.2 C26.8,17.4 21.4,20.6 14.8,20.2 C8.4,19.8 4,17 3.6,11.4 Z';
const W = 30, H = 22;

/** A label's letter and subscript digits (H₁ → H, 1). */
function split(label: string): { base: string; sub: string } {
  const m = /^(.*?)([₀-₉]+)$/.exec(label);
  return m ? { base: m[1]!, sub: [...m[2]!].map((c) => String(c.charCodeAt(0) - 0x2080)).join('') } : { base: label, sub: '' };
}

/**
 * The blob as SVG markup centred at (x, y), `scale` × its 30 × 22 box. Wider for a subscripted name (N₁).
 * The name is italic Latin Modern in the subgroup ink; the outline is 1.5 px of the same ink on a pale fill.
 */
export function eulerBlobSVG(label: string, x = 0, y = 0, scale = 1, opts: { normal?: boolean } = {}): string {
  const { base, sub } = split(label);
  const sx = scale * (1 + Math.max(0, sub.length) * 0.16), sy = scale;
  const t = `translate(${(x - (W * sx) / 2).toFixed(1)},${(y - (H * sy) / 2).toFixed(1)}) scale(${sx.toFixed(3)},${sy.toFixed(3)})`;
  const fs = 12.5 * scale;
  const name = `<text x="${x.toFixed(1)}" y="${(y + fs * 0.34).toFixed(1)}" text-anchor="middle" font-family="${FONT.math}" font-size="${fs.toFixed(1)}" fill="${SUBGROUP.ink}"><tspan font-style="italic">${esc(base)}</tspan>${sub ? `<tspan font-size="${(fs * 0.68).toFixed(1)}" baseline-shift="-22%">${sub}</tspan>` : ''}</text>`;
  // a normal subgroup's outline is doubled inside (⊴): the same set, marked closed under conjugation
  const inner = opts.normal ? `<path d="${BLOB_PATH}" transform="${t} translate(${(W * 0.08).toFixed(1)},${(H * 0.1).toFixed(1)}) scale(0.84,0.8)" fill="none" stroke="${SUBGROUP.ink}" stroke-width="${(0.9 / scale).toFixed(2)}" opacity=".55"/>` : '';
  return `<g class="eu-blob"><path d="${BLOB_PATH}" transform="${t}" fill="${SUBGROUP.fill}" stroke="${SUBGROUP.ink}" stroke-width="${(1.5 / scale).toFixed(2)}" stroke-linejoin="round"/>${inner}${name}</g>`;
}

/** The blob as an inline <svg> (HUD), sized to sit on a line of maths at `em` px. */
export function eulerBlobHTML(label: string, em = 18, opts: { normal?: boolean; title?: string } = {}): string {
  const { sub } = split(label);
  const scale = em / 17;
  const w = W * scale * (1 + sub.length * 0.16) + 2, h = H * scale + 2;
  return `<svg class="eu-blob-svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}" role="img" aria-label="${esc(opts.title ?? `the subgroup ${label}`)}">${eulerBlobSVG(label, w / 2, h / 2, scale, opts)}</svg>`;
}

// LEMMA WORKS — bead identity by SHAPE (colour stays reserved for mechanics).
// Shared with the board: import { beadShape, beadPath, beadSVG } from '../bench/shapes'.
// Owner: bench builder.
//
// Atom hue slot → shape: 0 (a) circle · 1 (b) rounded square · 2 (c) hexagon ·
// 3 (e′) diamond · 4 pentagon · 5 octagon. An inverse is the hollow version of
// the same shape (white fill, navy outline) carrying ⁻¹.

export type BeadShape = 'circle' | 'square' | 'hexagon' | 'diamond' | 'pentagon' | 'octagon';

const ORDER: BeadShape[] = ['circle', 'square', 'hexagon', 'diamond', 'pentagon', 'octagon'];

/** Shape for an atom's palette slot (AtomDecl.hue). */
export function beadShape(hue: number): BeadShape {
  return ORDER[((Math.trunc(hue) % ORDER.length) + ORDER.length) % ORDER.length]!;
}

const f = (n: number) => +n.toFixed(2);
function poly(pts: Array<[number, number]>): string {
  return `M${pts.map(([x, y]) => `${f(x)},${f(y)}`).join('L')}Z`;
}
function regular(n: number, cx: number, cy: number, r: number, rot: number): string {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return poly(pts);
}

/**
 * SVG path `d` for a shape centred in a `size`×`size` box. The shapes are sized
 * for equal visual weight (a diamond reaches the box edge, a square sits inside).
 * Draw with stroke-linejoin:round; `inset` leaves room for that stroke.
 */
export function beadPath(shape: BeadShape, size = 100, inset = 4): string {
  const c = size / 2;
  const R = c - inset;
  switch (shape) {
    case 'circle':
      return `M${f(c - R)},${f(c)}A${f(R)},${f(R)} 0 1 0 ${f(c + R)},${f(c)}A${f(R)},${f(R)} 0 1 0 ${f(c - R)},${f(c)}Z`;
    case 'square': {
      const h = R * 0.86, k = R * 0.3; // half side, corner radius
      const x0 = c - h, x1 = c + h, y0 = c - h, y1 = c + h;
      return `M${f(x0 + k)},${f(y0)}H${f(x1 - k)}A${f(k)},${f(k)} 0 0 1 ${f(x1)},${f(y0 + k)}V${f(y1 - k)}A${f(k)},${f(k)} 0 0 1 ${f(x1 - k)},${f(y1)}H${f(x0 + k)}A${f(k)},${f(k)} 0 0 1 ${f(x0)},${f(y1 - k)}V${f(y0 + k)}A${f(k)},${f(k)} 0 0 1 ${f(x0 + k)},${f(y0)}Z`;
    }
    case 'hexagon': return regular(6, c, c, R * 1.0, 0);            // flat top, points left/right
    case 'diamond': return regular(4, c, c, R * 1.06, -Math.PI / 2);
    case 'pentagon': return regular(5, c, c, R * 1.02, -Math.PI / 2);
    case 'octagon': return regular(8, c, c, R * 0.98, Math.PI / 8);
  }
}

/** Inline SVG for a bead body. hollow = inverse (white with navy outline). */
export function beadSVG(hue: number, hollow: boolean, opts: { ink?: string; stroke?: number } = {}): string {
  const ink = opts.ink ?? '#1B2340';
  const sw = opts.stroke ?? (hollow ? 6.5 : 5);
  const shape = beadShape(hue);
  return `<svg class="bn-shape bn-shape-${shape}" viewBox="0 0 100 100" aria-hidden="true"><path d="${beadPath(shape, 100, hollow ? 5 : 4)}" fill="${hollow ? '#fff' : ink}" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"/></svg>`;
}

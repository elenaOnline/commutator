import type { FiniteGroup } from './index';

/** Construct once; runtime operations are single typed-array lookups. */
function table(name: string, labels: string[], product: (a: number, b: number) => number): FiniteGroup {
  const n = labels.length;
  const products = new Uint8Array(n * n);
  const inverses = new Uint8Array(n);
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) products[a * n + b] = product(a, b);
  }
  for (let a = 0; a < n; a++) {
    const b = labels.findIndex((_, b) => products[a * n + b] === 0 && products[b * n + a] === 0);
    if (b < 0) throw new Error(`No inverse for ${name}: ${labels[a]}`);
    inverses[a] = b;
  }
  return { name, order: n, labels, mul: (a, b) => products[a * n + b]!, inv: a => inverses[a]! };
}
const subs = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈'];
const cyclic = (n: number) => table(`ℤ${subs[n]}`, Array.from({ length: n }, (_, i) => String(i)), (a, b) => (a + b) % n);
const product = (name: string, moduli: number[]) => {
  const n = moduli.reduce((a, b) => a * b, 1);
  const digits = (i: number) => moduli.map(m => { const d = i % m; i = Math.floor(i / m); return d; });
  const coordinates = Array.from({ length: n }, (_, i) => digits(i));
  return table(name, coordinates.map(ds => `(${ds.join(',')})`), (a, b) => {
    let index = 0, stride = 1;
    moduli.forEach((m, k) => { index += ((coordinates[a]![k]! + coordinates[b]![k]!) % m) * stride; stride *= m; });
    return index;
  });
};
// Composition ab applies b first, then a.
const permutations = [[0, 1, 2], [1, 0, 2], [2, 1, 0], [0, 2, 1], [1, 2, 0], [2, 0, 1]];
const symmetric = table('S₃', ['e', '(12)', '(13)', '(23)', '(123)', '(132)'], (a, b) =>
  permutations.findIndex(p => p.every((v, k) => v === permutations[a]![permutations[b]![k]!]!)));
// Elements s^b r^a; r^a s = s r^-a.
const dihedral = table('D₄', ['e', 'r', 'r²', 'r³', 's', 'sr', 'sr²', 'sr³'], (a, b) =>
  ((a >> 2) ^ (b >> 2)) * 4 + (((b >> 2) ? -(a % 4) : a % 4) + b % 4 + 4) % 4);
// Signed basis 1,i,j,k; each adjacent pair of indices is +basis,-basis.
const basis = [[0, 2, 4, 6], [2, 1, 6, 5], [4, 7, 1, 2], [6, 4, 3, 1]];
const quaternion = table('Q₈', ['1', '−1', 'i', '−i', 'j', '−j', 'k', '−k'], (a, b) =>
  basis[a >> 1]![b >> 1]! ^ (a & 1) ^ (b & 1));

export const GROUPS: FiniteGroup[] = [
  cyclic(1), cyclic(2), cyclic(3), cyclic(4),
  table('V₄', ['e', 'a', 'b', 'c'], (a, b) => a ^ b),
  cyclic(5), cyclic(6), symmetric, cyclic(7), cyclic(8),
  product('ℤ₄×ℤ₂', [4, 2]), product('ℤ₂³', [2, 2, 2]), dihedral, quaternion,
];

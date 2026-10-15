// COMMUTATOR — a letter keeps its shape everywhere (playtest W1–3 #16). Bead shape = identity (colour is reserved for
// mechanics), so in The Book the shape is derived from the LETTER, never from the order atoms are listed in a level:
// c is a hexagon on every floor, lens and card. Tower variables do not use these: they always wear the variable look
// (a round bead in the variable tint). Slots: 0 circle · 1 square · 2 hexagon · 3 diamond · 4 pentagon · 5 octagon.
const FIXED: Record<string, number> = {
  a: 0, b: 1, c: 2, 'e′': 3, d: 4, g: 5,
  p: 0, q: 1, r: 2, s: 4, t: 5, h: 4, k: 5, f: 1,
  x: 0, y: 1, z: 2, u: 4, v: 5, w: 3, n: 0, m: 1,
  'α': 0, 'β': 1, 'γ': 2, 'τ': 3, 'π': 4, 'σ': 5, 'ρ': 2, 'φ': 4,
};
/** The bead slot of a letter (its label without subscripts). Unknown letters get a stable slot from their code. */
export function letterSlot(label: string): number {
  const base = label.replace(/[₀-₉0-9]+$/, '');
  if (base in FIXED) return FIXED[base]!;
  const cp = base.codePointAt(0) ?? 0;
  return cp % 6;
}

// LEMMA WORKS board — text label collision pass (screen space).
// Priority: socket statement (5) > room label (4) > inlet / press statement (3)
//           > hover card (2) > bead strings (1).
// Tiles are fixed obstacles. Higher priorities are placed first; a lower label
// that overlaps is nudged vertically (screen px, converted to world units), and
// faded if no free slot is found. Bead strings are never moved off their wire;
// they fade instead.

type R = { l: number; t: number; r: number; b: number };
const rect = (e: Element): R | null => {
  const b = e.getBoundingClientRect();
  return b.width > 0 && b.height > 0 ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null;
};
const hit = (a: R, b: R, pad = 2) => a.l < b.r + pad && a.r > b.l - pad && a.t < b.b + pad && a.b > b.t - pad;
const shift = (a: R, dy: number): R => ({ l: a.l, r: a.r, t: a.t + dy, b: a.b + dy });
const shrink = (a: R, k: number): R => ({ l: a.l + k, r: a.r - k, t: a.t + k, b: a.b - k });

export function resolveLabels(world: SVGGElement, scale: number): void {
  const labs = [...world.querySelectorAll<SVGGElement>('.lw-lab')];
  for (const e of labs) { e.removeAttribute('transform'); e.style.opacity = ''; }
  const placed: R[] = [];
  world.querySelectorAll('.lw-solids .lw-st:not(.lw-gate)').forEach((e) => {
    if ((e as SVGElement).style.display === 'none') return;
    const r = rect(e); if (r) placed.push(shrink(r, 4));
  });
  const nTiles = placed.length;
  labs.sort((a, b) => +(b.dataset.pri ?? 0) - +(a.dataset.pri ?? 0));
  for (const e of labs) {
    const pri = +(e.dataset.pri ?? 0);
    if (pri <= 1) {
      // bead strings: test each glyph, fade on any overlap with a label
      const glyphs = [...e.querySelectorAll('text')].map(rect).filter((x): x is R => !!x);
      const texts = labs.filter((l) => +(l.dataset.pri ?? 0) >= 2 && l.style.opacity === '')
        .flatMap((l) => [...l.querySelectorAll('text')].map(rect)).filter((x): x is R => !!x);
      if (glyphs.some((g) => texts.some((p) => hit(g, p, 0)))) e.style.opacity = '0.3';
      continue;
    }
    const r = rect(e); if (!r) continue;
    const steps = pri === 2 ? [-10, -20, -32, -46, -62, 12, 24] : [-8, 8, -16, 16, -26, 26, -38, 38];
    // the hover card is a transient overlay: it prefers clear ground, but only labels can push it away
    const passes = pri === 2 ? [placed, placed.slice(nTiles)] : [placed];
    let done = false;
    for (const obs of passes) {
      const blocked = (x: R) => obs.some((p) => hit(x, p));
      if (!blocked(r)) { placed.push(r); done = true; break; }
      for (const dy of steps) {
        const x = shift(r, dy);
        if (!blocked(x)) { e.setAttribute('transform', `translate(0,${(dy / scale).toFixed(2)})`); placed.push(x); done = true; break; }
      }
      if (done) break;
    }
    if (pri >= 5 && !done) { placed.push(r); continue; }
    if (!done) { e.style.opacity = '0.32'; placed.push(r); }
  }
}


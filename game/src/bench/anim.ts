// LEMMA WORKS — bench commit animation (FLIP). Persisting beads glide, cancelled
// pairs annihilate inward, inserted beads grow out of their gap, e pops.
// Owner: bench builder.
import { FAMILY, MOTION } from '../ui/tokens';
import { lcs } from './util';

export interface Snap {
  el: HTMLElement;
  rect: DOMRect;
  key: string;      // leaf sig or crate sig
  side: string;
  crate: boolean;
  deleted: boolean; // was a preview 'del' bead
}

/** Capture positions of every bead/crate on the pallet rails. */
export function snapshot(root: HTMLElement): Snap[] {
  const out: Snap[] = [];
  root.querySelectorAll<HTMLElement>('.bn-src-pallet [data-leaf], .bn-src-pallet [data-crate]').forEach((el) => {
    const rail = el.closest<HTMLElement>('.bn-rail');
    out.push({
      el, rect: el.getBoundingClientRect(), key: el.dataset.leaf ?? el.dataset.crate ?? '',
      side: rail?.dataset.side ?? 'l', crate: !!el.dataset.crate, deleted: el.classList.contains('is-del'),
    });
  });
  return out;
}

const center = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/**
 * Animate from `before` to the freshly rendered DOM under `root`.
 * `overlay` is an absolutely positioned layer covering root (for ghosts).
 */
export function playFlip(root: HTMLElement, before: Snap[], overlay: HTMLElement, opts: { reduced: boolean; ink?: string }) {
  if (opts.reduced) return;
  const after = snapshot(root);
  const D = MOTION.stamp;
  const oRect = overlay.getBoundingClientRect();

  // Match per kind (leaves, crates). Try straight (l→l, r→r) and crossed (swap) pairings.
  const pick = (crate: boolean) => {
    const bySide = (arr: Snap[], s: string) => arr.filter((x) => x.crate === crate && x.side === s && !x.deleted);
    const run = (map: Record<string, string>) => {
      const pairs: Array<[Snap, Snap]> = [];
      for (const s of ['l', 'r']) {
        const A = bySide(before, s), B = bySide(after, map[s]!);
        for (const [i, j] of lcs(A.map((x) => x.key), B.map((x) => x.key))) pairs.push([A[i]!, B[j]!]);
      }
      return pairs;
    };
    const straight = run({ l: 'l', r: 'r' });
    const crossed = run({ l: 'r', r: 'l' });
    return crossed.length > straight.length ? crossed : straight;
  };
  const crates = pick(true);
  const leaves = pick(false);
  const delta = new Map<HTMLElement, { dx: number; dy: number }>();
  for (const [a, b] of [...crates, ...leaves]) delta.set(b.el, { dx: a.rect.left - b.rect.left, dy: a.rect.top - b.rect.top });

  const matchedBefore = new Set<HTMLElement>([...crates, ...leaves].map(([a]) => a.el));
  const matchedAfter = new Set<HTMLElement>([...crates, ...leaves].map(([, b]) => b.el));

  // persisting: glide (compensating for a moving parent crate)
  for (const [el, d] of delta) {
    let { dx, dy } = d;
    const parent = el.parentElement?.closest<HTMLElement>('[data-crate]');
    const pd = parent ? delta.get(parent) : undefined;
    if (pd) { dx -= pd.dx; dy -= pd.dy; }
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      if (el.classList.contains('was-ins')) el.animate([{ filter: 'brightness(1.6)' }, { filter: 'none' }], { duration: D });
      continue;
    }
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: D, easing: MOTION.easeOut });
  }

  // inserted: grow out of the gap
  for (const a of after) {
    if (matchedAfter.has(a.el)) continue;
    const parentMatched = a.el.parentElement?.closest<HTMLElement>('[data-crate]');
    if (parentMatched && !matchedAfter.has(parentMatched) && !a.crate) continue; // grows with its crate
    a.el.animate(
      [{ transform: 'scale(0.05)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
      { duration: D + 60, easing: MOTION.easeSpring, fill: 'backwards' },
    );
  }

  // removed: runs annihilate inward; lone e pops
  const gone = before.filter((b) => !matchedBefore.has(b.el) && !b.crate);
  const goneCrates = before.filter((b) => !matchedBefore.has(b.el) && b.crate);
  const runs: Snap[][] = [];
  for (const g of gone) {
    const last = runs[runs.length - 1];
    const prev = last?.[last.length - 1];
    if (prev && prev.side === g.side && Math.abs(prev.rect.right - g.rect.left) < prev.rect.width * 0.9) last!.push(g);
    else runs.push([g]);
  }
  const ghost = (s: Snap) => {
    const c = s.el.cloneNode(true) as HTMLElement;
    c.classList.remove('is-sel', 'is-del', 'is-ins', 'is-lit');
    c.classList.add('bn-ghost-fx');
    c.style.left = `${s.rect.left - oRect.left}px`;
    c.style.top = `${s.rect.top - oRect.top}px`;
    c.style.width = `${s.rect.width}px`;
    c.style.height = `${s.rect.height}px`;
    overlay.append(c);
    return c;
  };
  for (const run of runs) {
    const cs = run.map((s) => center(s.rect));
    const cx = cs.reduce((a, p) => a + p.x, 0) / cs.length;
    const cy = cs.reduce((a, p) => a + p.y, 0) / cs.length;
    const allE = run.every((s) => s.key === 'e');
    for (const s of run) {
      const g = ghost(s);
      const c = center(s.rect);
      const kf = allE
        ? [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.35)', opacity: 0.9, offset: 0.35 }, { transform: 'scale(0)', opacity: 0 }]
        : [{ transform: 'none', opacity: 1 }, { transform: `translate(${cx - c.x}px, ${cy - c.y}px) scale(0.15)`, opacity: 0.2 }];
      g.animate(kf, { duration: allE ? D * 0.9 : D, easing: allE ? 'ease-out' : 'cubic-bezier(.55,0,.8,.2)', fill: 'forwards' }).finished.then(() => g.remove(), () => g.remove());
    }
    // a little burst where things vanish
    const burst = document.createElement('span');
    burst.className = 'bn-burst';
    burst.style.left = `${cx - oRect.left}px`;
    burst.style.top = `${cy - oRect.top}px`;
    burst.style.setProperty('--burst', allE ? FAMILY.identity.ink : (run.length > 1 ? FAMILY.inverse.ink : (opts.ink ?? FAMILY.structure.ink)));
    overlay.append(burst);
    burst.animate(
      [{ transform: 'translate(-50%,-50%) scale(0.2)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(0.6)', opacity: 0.9, offset: 0.55 }, { transform: 'translate(-50%,-50%) scale(1.25)', opacity: 0 }],
      { duration: D + 80, delay: allE ? 0 : D * 0.55, easing: 'ease-out', fill: 'both' },
    ).finished.then(() => burst.remove(), () => burst.remove());
  }
  for (const s of goneCrates) {
    const g = ghost(s);
    g.animate([{ opacity: 0.8, transform: 'none' }, { opacity: 0, transform: 'scale(0.85)' }], { duration: D * 0.8, easing: 'ease-in', fill: 'forwards' })
      .finished.then(() => g.remove(), () => g.remove());
  }
}

/** Quick fade for unrelated pallet switches. */
export function fadeIn(el: HTMLElement, reduced: boolean) {
  if (reduced) return;
  el.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 160, easing: MOTION.easeOut });
}

export function shakeEl(el: Element, reduced: boolean) {
  if (reduced) { el.animate([{ outline: '2px solid #FF6A3D' }, { outline: '2px solid transparent' }], { duration: MOTION.shake }); return; }
  el.animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }],
    { duration: MOTION.shake, easing: 'ease-out' },
  );
}

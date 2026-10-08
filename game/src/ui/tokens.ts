// LEMMA WORKS — design tokens. Architect-owned. Overprint direction
// (design/research/visual-direction.md §C) with B's gold lemma band and A's
// Latin Modern. Colour = mechanic; never decorate with these inks.
import type { Family } from '../kernel/types';

export const INK = {
  paper: '#FFFFFF',
  paperWarm: '#FBFAF7',     // panels
  grid: '#D5D8E0',          // registration crosses, hairlines
  navy: '#1B2340',          // items, beads, text, lemma tiles (15.4:1)
  navy2: '#545B73',         // secondary text (6.7:1)
  navy3: '#8A90A3',         // tertiary / disabled (decorative only)
  gold: '#C99A2E',          // earned-lemma band (from B)
} as const;

/** One ink per rule family. text = AA-safe text colour on white for labels. */
export const FAMILY: Record<Family, { ink: string; text: string; glyph: string; label: string }> = {
  identity:      { ink: '#FFB81C', text: '#8A5A00', glyph: 'e',  label: 'Identity' },     // sunflower: always with a dark edge
  inverse:       { ink: '#C9246E', text: '#A61C5A', glyph: '⁻¹', label: 'Inverse' },      // raspberry
  structure:     { ink: '#2F6BFF', text: '#1F4FD1', glyph: '( )', label: 'Structure' },   // riso blue: crates, lift
  equation:      { ink: '#3CC7AE', text: '#11806C', glyph: '=',  label: 'Equation' },     // aqua: swap, merge, givens as rules
  scope:         { ink: '#5528C2', text: '#5528C2', glyph: '∃',  label: 'Scope' },        // violet: rooms, assumptions
  contradiction: { ink: '#FF6A3D', text: '#C2410C', glyph: '⊥',  label: 'Contradiction' },// signal orange
  lemma:         { ink: '#1B2340', text: '#1B2340', glyph: 'L',  label: 'Earned' },       // navy + gold band
  given:         { ink: '#3CC7AE', text: '#11806C', glyph: 'h',  label: 'Given' },        // givens share equation ink
};

/** Isometric projection used by the board: grid unit → screen px at zoom 1. */
export const ISO = {
  unit: 56,
  /** screen = (x - y) * cos30 * unit , (x + y) * sin30 * unit - z * unit */
  cos: Math.cos(Math.PI / 6),
  sin: Math.sin(Math.PI / 6),
  tileHeight: 0.26,
} as const;

export const FONT = {
  math: "'Latin Modern', 'Latin Modern Roman', 'STIX Two Text', Georgia, serif",
  mathItalic: "'Latin Modern Italic', 'Latin Modern', Georgia, serif",
  ui: "'Space Grotesk', system-ui, sans-serif",
} as const;

export const MOTION = {
  /** Station stamp: bead ops animate in this long. */
  stamp: 260,
  /** Shake on an illegal gesture. */
  shake: 320,
  /** Replay: ms per node at 1×. */
  replayStep: 520,
  easeOut: 'cubic-bezier(.2,.8,.2,1)',
  easeSpring: 'cubic-bezier(.34,1.56,.64,1)',
} as const;

/** Respect reduced motion everywhere. */
export const reducedMotion = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

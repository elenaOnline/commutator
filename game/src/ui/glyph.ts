// COMMUTATOR — machine glyphs as HTML (review 2026-10). Latin Modern has no ⥲, so the Rewriter's isomorphism
// arrow is drawn: a light SVG tilde (stroke 1.0) stacked over →. ✣ is the Operator; t* / *t are the multiply
// tiles (asterisk at 150%, shifted down 34% so it sits on the letter's middle). Everything else is text.
// Inline styles only, so a glyph renders the same in the hotbar, the lens header, drawers and concept cards.

export const ISO = '⥲';
export const OPERATOR = '✣';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const TILDE = '<svg viewBox="0 0 14 6" aria-hidden="true" style="width:.95em;height:.42em;display:block;overflow:visible">'
  + '<path d="M1,4.2q3,-4.4 6,0t6,0" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>';
const AST = '<span aria-hidden="true" style="font-size:150%;line-height:0;vertical-align:-.34em;font-style:normal">*</span>';

/** The glyph as HTML: ⥲ drawn, t* / *t with a large asterisk, ✣ and the rest as text. */
export function glyphHTML(g: string): string {
  if (g === ISO) {
    return '<span class="g-iso" role="img" aria-label="⥲" style="display:inline-flex;flex-direction:column;align-items:center;gap:.06em;line-height:.7;font-style:normal">'
      + `${TILDE}<span aria-hidden="true">→</span></span>`;
  }
  if (g === 't*') return `<span class="g-mul" role="img" aria-label="t*"><i>t</i>${AST}</span>`;
  if (g === '*t') return `<span class="g-mul" role="img" aria-label="*t">${AST}<i>t</i></span>`;
  if (g === OPERATOR) return `<span class="g-op" style="font-style:normal">${OPERATOR}</span>`;
  return esc(g);
}

/** The glyph as an element (wrap in your own chip). */
export function glyphEl(g: string, cls = ''): HTMLSpanElement {
  const el = document.createElement('span');
  if (cls) el.className = cls;
  el.innerHTML = glyphHTML(g);
  return el;
}

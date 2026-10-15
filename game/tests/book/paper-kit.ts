// The Paper view on every Book reference solution (worlds 1–3): it must read like a proof a TA would accept.
// Called from kit-w123's deliver(). Every equation line has a reason, and every cited line comes earlier.
// PAPER_DUMP=1 also writes each page as text to /tmp/paper/<level>.txt (for reading, not for the assertions).
import { expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import type * as F from '../../src/factory';
import type { Floor } from '../../src/factory/compiler.testkit';
import { buildPaper, paperHTML } from '../../src/hud/paper';
import { adapt } from '../../src/hud/transcript';
import { buildTranscript } from '../../src/hud/proof';
import type { S } from '../../src/hud/util';

/** Visible text of an HTML fragment (subscripts back to ₀…₉, superscripts as ^n). */
export const paperText = (html: string) => html.replace(/<sub class="m-sub">(\d+)<\/sub>/g, (_m, d: string) => [...d].map((x) => '₀₁₂₃₄₅₆₇₈₉'[+x]).join(''))
  .replace(/<sup[^>]*>([^<]*)<\/sup>/g, '^$1').replace(/<[^>]+>/g, '').replace(/&thinsp;|&ensp;|&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').trim();

export function paperOfFloor(f: Floor, comp: F.Compiled) {
  const s = { level: f.level, ctx: f.ctx, canvas: f.c, compiled: comp } as unknown as S;
  const { st } = adapt(s);
  const p = buildPaper(st);
  return { p, html: paperHTML(p, st), st };
}

export function checkPaper(f: Floor, comp: F.Compiled) {
  const { p, html } = paperOfFloor(f, comp);
  const id = f.level.id;
  if (process.env.PAPER_DUMP) {
    mkdirSync('/tmp/paper', { recursive: true });
    if (process.env.PAPER_DUMP === '2') {
      const { st } = paperOfFloor(f, comp);
      writeFileSync(`/tmp/paper/${id}.json`, JSON.stringify({ nodes: st.graph.nodes, tr: buildTranscript(st).items }, null, 1));
    }
    writeFileSync(`/tmp/paper/${id}.canvas.json`, JSON.stringify(f.c));
    writeFileSync(`/tmp/paper/${id}.txt`, paperText(html.replace(/<\/div>|<\/p>/g, '\n')).replace(/\n\s+/g, '\n'));
  }
  expect(p.solved, `${id}: the paper is complete`).toBe(true);
  for (const l of p.lines) {
    const why = paperText(l.reason);
    if (l.kind === 'eq') expect(why, `${id} line ${l.no} has a reason`).not.toBe('');
    // reasons are words, never a schema id ("act.mul", "hom.mul", "sub.e")
    expect(why, `${id} line ${l.no}: a raw id as a reason`).not.toMatch(/(^|[\s(,;])[a-z]+\.[a-z]+/);
    // citations point backwards only: "line k", "lines j and k", "lines j–k"
    for (const m of why.matchAll(/lines? (\d+)(?:\s*(?:–|and)\s*(\d+))?/g)) {
      for (const k of [m[1], m[2]].filter(Boolean).map(Number)) expect(k, `${id} line ${l.no} cites line ${k}: ${why}`).toBeLessThan(l.no);
    }
  }
  return { p, html };
}

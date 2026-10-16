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
import { fH, groupAliases, labels, withEAliases, type S } from '../../src/hud/util';

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
  const { st } = paperOfFloor(f, comp);
  const page = paperText(html);
  // maps print by their names (final playtest N3: "pi(x)" for π(x))
  for (const m of f.level.maps ?? []) if (m.label !== m.id) expect(page, `${id}: the map ${m.label} prints as ${m.id}`).not.toMatch(new RegExp(`(^|[^A-Za-z])${m.id}\\(`));
  // a hypothesis with a name is cited by it ("ker π ⊆ ker f with x = …"), never by its whole formula (finale playtest)
  for (const g of f.level.givens) if (!/[=≠∈]|^\|/.test(g.name) && (g.fact.k === 'law' || g.fact.k === 'cond')) expect(page, `${id}: ${g.name} cited by its formula`).not.toMatch(/the hypothesis ∀/);
  // a ∀-introduction that reaches a dock states the dock as the heading does: same sides, same binders (final playtests #10, N22)
  const byId = new Map(st.graph.nodes.map((n) => [n.id, n] as const));
  for (const l of p.lines) {
    const n = byId.get(l.nodes[0] ?? '');
    if (l.kind !== 'prose' || n?.k !== 'generalize') continue;
    const line = paperText(l.html!);
    expect(line, `${id} line ${l.no}`).toMatch(/^(Since .* (was|were) arbitrary, |Hence )/);
    const sock = comp.check.sockets.find((k) => k.ok && (k.filledBy === n.id || (byId.get(k.filledBy ?? '') as { input?: string } | undefined)?.input === n.id));
    const t = f.level.sockets.find((k) => k.id === sock?.id)?.target;
    if (!t || (t.k !== 'law' && t.k !== 'cond')) continue;
    const L = { ...labels(f.level), ...groupAliases(t.binds, labels(f.level), t.metas), ...Object.fromEntries(t.metas.map((m) => [m, m])) };
    if (sock!.holes) continue;
    const parts = (t.k === 'cond' ? [...t.premises, t.concl] : [{ k: 'eq', l: t.l, r: t.r }]).map((q) => paperText(withEAliases(L, () => fH(q as never, L))));
    for (const q of parts) expect(line, `${id} line ${l.no} states the dock as the heading does`).toContain(q);
    // the element binders, in the dock's own order ("for all x, y ∈ G", never "∀y, x")
    const binders = line.slice(line.indexOf('for all'), line.indexOf(parts[0]!));
    const seen = [...binders.matchAll(/(?<![A-Za-z])([a-z])(?![A-Za-z₀-₉(])/g)].map((m) => m[1]!).filter((x, i, xs) => t.metas.includes(x) && xs.indexOf(x) === i);
    expect(seen, `${id} line ${l.no}: ${line}`).toEqual(t.metas);
  }
  for (const l of p.lines) {
    const why = paperText(l.reason);
    if (l.kind === 'eq') expect(why, `${id} line ${l.no} has a reason`).not.toBe('');
    // an instantiation that renames nothing ("with x = x", "n = n") is not printed (final playtests #10, N22)
    expect(why, `${id} line ${l.no}: ${why}`).not.toMatch(/(?:with|,) ([A-Za-zα-ω]) = \1(?![₀-₉\w′^])/);
    // reasons are words, never a schema id ("act.mul", "hom.mul", "sub.e")
    expect(why, `${id} line ${l.no}: a raw id as a reason`).not.toMatch(/(^|[\s(,;])[a-z]+\.[a-z]+/);
    // citations point backwards only: "line k", "lines j and k", "lines j–k"
    for (const m of why.matchAll(/lines? (\d+)(?:\s*(?:–|and)\s*(\d+))?/g)) {
      for (const k of [m[1], m[2]].filter(Boolean).map(Number)) expect(k, `${id} line ${l.no} cites line ${k}: ${why}`).toBeLessThan(l.no);
    }
  }
  return { p, html };
}

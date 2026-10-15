// Pointer reachability of a Book reference floor (design/pinter/reviews/reachability.md). Called from every Book
// deliver (kit-w123, kit-wC, kit-w1214, kit-members). The floor was built through the editor API; this asks whether the
// real HUD — recipe picker, lens knobs, room popover / editor, Tower lens — could have built it, in the context the
// live game gives the player (ctxFor with the test's earned theorems and saved lemmas). Not a test file.
//
// REACH=off skips the check; REACH_DUMP=1 appends each floor's issues to /tmp/reach/<level>.jsonl (for the report).
import { expect } from 'vitest';
import { appendFileSync, mkdirSync } from 'node:fs';
import * as K from '../../src/kernel';
import * as F from '../../src/factory';
import type { MachineConfig } from '../../src/factory/types';
import type { Floor } from '../../src/factory/compiler.testkit';
import { ctxFor, type SavedLemma } from '../../src/state/factoryStore';
import { pointerReport, type ReachIssue } from '../../src/hud/reach';
import { parseExtra } from '../../src/hud/slotparse';
import { setSortCtx, sortCtx } from '../../src/ui/sorts';
import type { S } from '../../src/hud/util';

/** The context the live game builds for this floor's level, from the test context's earned theorems and lemmas. */
export function liveCtx(f: Floor): K.KernelCtx {
  const tctx = f.ctx;
  const lemmas: SavedLemma[] = tctx.level.tools.schemas.filter((id) => tctx.registry[id]?.origin === 'authored').map((id, i) => {
    const sc = tctx.registry[id]!;
    return { id, name: sc.name, card: sc.card, levelId: f.level.id, canvas: f.c, machine: '', savedAt: i } as SavedLemma;
  });
  return ctxFor(f.level, tctx.level.tools.schemas, lemmas);
}

/** Run `fn` with the HUD's per-floor globals (sort context, slot parser maps) set as hud/index.ts › render sets them. */
function withHudGlobals<T>(ctx: K.KernelCtx, comp: F.Compiled, fn: () => T): T {
  const prevSort = sortCtx.cur, prevParse = parseExtra.cur;
  try {
    const sc = setSortCtx(ctx, comp.graph);
    parseExtra.cur = sc.env?.multi ? { maps: [...sc.env.maps.values()], sorts: [...sc.env.sorts.values()] } : undefined;
    return fn();
  } finally { sortCtx.cur = prevSort; parseExtra.cur = prevParse; }
}

const stateOf = (f: Floor, ctx: K.KernelCtx, comp: F.Compiled): S => ({ level: f.level, ctx, canvas: f.c, compiled: comp }) as unknown as S;

// ───────── re-checks by recompiling (the HUD cannot set it, but does the player need to?) ─────────

/** The machine's output with `cfg` in place of its config, or null when it does not run. */
function outWith(f: Floor, id: string, cfg: MachineConfig): string | null {
  const c = { ...f.c, machines: f.c.machines.map((m) => (m.id === id ? { ...m, config: cfg } : m)) };
  const comp = (() => { try { return F.compile(c, f.ctx); } catch { return null; } })();
  return comp ? outOf(comp, id) : null;
}
const outOf = (comp: F.Compiled, id: string): string | null => {
  const r = comp.machines[id];
  if (!r || r.status.k !== 'ok' || !r.out) return null;
  return JSON.stringify(r.out.k === 'fact' ? r.out.fact : r.out.k === 'card' ? r.out.card : r.out.term);
};
/** `cfg` and every variant a pointer reaches from it without knobs: each drawn target (braces / carets), each cut. */
function pointerVariants(f: Floor, id: string, cfg: MachineConfig): MachineConfig[] {
  const c = { ...f.c, machines: f.c.machines.map((m) => (m.id === id ? { ...m, config: cfg } : m)) };
  const comp = (() => { try { return F.compile(c, f.ctx); } catch { return null; } })();
  const res = comp?.machines[id];
  const out: MachineConfig[] = [cfg];
  if (!res) return out;
  const w = res.inputs['q'];
  if (cfg.kind === 'rewriter' && w?.k === 'fact') for (const cand of res.candidates ?? []) {
    const a = cand.addr;
    if ('gap' in a) { const g = F.pinFromGap(w.fact, a); if (g) out.push({ ...cfg, gap: g }); }
    else { const t = F.pinFromAddr(w.fact, a); if (t) out.push({ ...cfg, target: t }); }
  }
  // cut handles are drawn only on an equation premise (lens.ts › drawHandles)
  const p0 = res.inputs['p0'];
  if (cfg.kind === 'theorem' && p0?.k === 'fact' && (p0.fact.k === 'eq' || p0.fact.k === 'neq')) for (let i = 0; i < (res.choices?.length ?? 0); i++) out.push({ ...cfg, choice: i });
  return out;
}
/** Rewriter recipes the picker does list that do what an axiom law does (the picker has no axiom rows). */
function axiomAlternatives(cfg: MachineConfig): { name: string; cfg: MachineConfig }[] {
  if (cfg.kind !== 'rewriter' || cfg.recipe?.k !== 'law' || cfg.recipe.ref.k !== 'axiom') return [];
  const id = cfg.recipe.ref.id, rev = cfg.dir === 'rev';
  const base = { ...cfg, dir: 'fwd' as const, values: {} };
  if (id === 'unitL' || id === 'unitR') return [rev ? { name: 'insert e', cfg: { ...base, recipe: { k: 'insertE' } } } : { name: 'pop e', cfg: { ...base, recipe: { k: 'pop' } } }];
  if (!rev) return [{ name: 'cancel', cfg: { ...base, recipe: { k: 'cancel' } } }];
  const x = cfg.values['x'] ?? { k: 'knob', term: null };
  return [false, true].map((inv) => ({ name: `insert pair (${inv ? 'x⁻¹x' : 'xx⁻¹'})`, cfg: { ...base, recipe: { k: 'insertPair', inv, x } } }));
}

/**
 * Refine 'no-knob' and 'not-listed' issues by recompiling the floor:
 *  - a value on a meta with no knob that changes nothing (the compiler infers the same step without it) is dropped
 *    and noted (redundant);
 *  - a step the pointer reaches another way (pin a drawn target, pick a cut, a listed recipe that does the same) stays
 *    a failure, labelled with that way: the reference solution should be spelled as the player builds it.
 */
function refine(f: Floor, comp: F.Compiled, issues: ReachIssue[], notes: string[]): ReachIssue[] {
  const out: ReachIssue[] = [];
  const byMachine = new Map<string, ReachIssue[]>();
  for (const i of issues) if (i.code) byMachine.set(i.machine, [...(byMachine.get(i.machine) ?? []), i]);
  for (const [id, list] of byMachine) {
    const m = f.c.machines.find((x) => x.id === id)!;
    const want = outOf(comp, id);
    const unshown = list.filter((i) => i.code === 'no-knob').map((i) => i.meta!);
    if (unshown.length && (m.config.kind === 'rewriter' || m.config.kind === 'theorem')) {
      const values = Object.fromEntries(Object.entries(m.config.values).filter(([k]) => !unshown.includes(k)));
      const bare = { ...m.config, values } as MachineConfig;
      if (want && outWith(f, id, bare) === want) {
        notes.push(`${id} (${m.kind}): values for ${unshown.join(', ')} have no knob, but are redundant (same step without them)`);
        for (const i of list) if (i.code === 'no-knob') i.code = undefined, i.detail = '';
      } else {
        const way = pointerVariants(f, id, bare).findIndex((v, k) => k > 0 && outWith(f, id, v) === want);
        for (const i of list) if (i.code === 'no-knob') i.detail += way > 0 ? ` [reachable another way: ${m.kind === 'theorem' ? 'pick the cut' : 'pin the target'} on the lens instead of setting ${unshown.join(', ')}]` : ' [and without it the step changes: no pointer route found]';
      }
    }
    // a mirror the row cannot toggle: does the plain law (either direction, any drawn target) make the same step?
    for (const i of list.filter((x) => x.code === 'no-toggle')) {
      const c0 = m.config;
      if (c0.kind !== 'rewriter' || c0.recipe?.k !== 'law' || c0.recipe.ref.k !== 'schema') continue;
      const plain = { ...c0.recipe.ref }; delete plain.mirror;
      const tries = (['fwd', 'rev'] as const).map((dir) => ({ ...c0, dir, recipe: { k: 'law' as const, ref: plain } }));
      const hit = tries.find((t) => pointerVariants(f, id, t).some((v) => outWith(f, id, v) === want));
      i.detail += hit ? ` [reachable another way: the plain law, direction ${hit.dir}]` : ' [the plain law gives no such step in either direction at any drawn target]';
    }
    for (const i of list.filter((x) => x.code === 'not-listed')) {
      const alts = axiomAlternatives(m.config);
      const hit = alts.find((a) => pointerVariants(f, id, a.cfg).some((v) => outWith(f, id, v) === want));
      if (hit) i.detail += ` [reachable another way: the listed recipe "${hit.name}" does the same step]`;
    }
  }
  for (const i of issues) if (!(i.detail === '' && i.code === undefined && i.area === 'knob')) out.push(i);
  return out;
}

/** Every reachability issue of the floor, each recipe miss annotated when the TEST's context would have offered it. */
export function reachIssues(f: Floor, comp: F.Compiled, notes: string[] = []): (ReachIssue & { level: string })[] {
  const live = liveCtx(f);
  const rep = withHudGlobals(live, comp, () => pointerReport(stateOf(f, live, comp)));
  notes.push(...rep.notes);
  const issues = refine(f, comp, rep.issues, notes);
  // a recipe the live picker lacks but the test context offers: the test grants a tool the game does not
  const extra = f.ctx.level.tools.schemas.filter((id) => !live.level.tools.schemas.includes(id));
  if (extra.length) {
    const testIssues = withHudGlobals(f.ctx, comp, () => pointerReport(stateOf(f, f.ctx, comp)).issues);
    for (const i of issues) {
      if (i.area !== 'recipe') continue;
      if (!testIssues.some((t) => t.machine === i.machine && t.area === 'recipe')) i.detail += ` [the test context offers it: it adds ${extra.join(', ')}, which ctxFor does not give]`;
    }
  }
  return issues.map((i) => ({ level: f.level.id, ...i }));
}

/** The shared Book assertion: every machine and room of the reference floor is reachable with the real pointer. */
export function assertPointerReachable(f: Floor, comp: F.Compiled) {
  if (process.env.REACH === 'off') return;
  const notes: string[] = [];
  const issues = reachIssues(f, comp, notes);
  if (process.env.REACH_DUMP) {
    mkdirSync('/tmp/reach', { recursive: true });
    appendFileSync(`/tmp/reach/${f.level.id}.jsonl`, `${JSON.stringify({ issues, notes })}\n`);
  }
  const lines = issues.map((i) => `${i.machine} (${i.kind}) ${i.area}: ${i.detail}`);
  // soft: a reachability miss never hides the delivery, oracle, paper or par checks that follow (and vice versa)
  expect.soft(lines, `${f.level.id}: not reachable with the pointer`).toEqual([]);
}

// LEMMA WORKS — shell smoke + screenshots. HEADLESS ONLY. Usage: node src/shell/pw-shell.mjs [WxH ...]
// Needs the shell dev server: npx vite --port 8793 --strictPort
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = process.env.SHELL_URL ?? 'http://localhost:8793/';
const SHOTS = new URL('../../.shots/', import.meta.url).pathname;
const sizes = process.argv.slice(2).length ? process.argv.slice(2).map((s) => s.split('x').map(Number)) : [[1280, 800], [1440, 900], [1600, 1000]];

const browser = await chromium.launch({ headless: true });
const errors = [];
const report = [];

async function page(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`[${width}] ${e}`));
  p.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && m.text().includes('[shell]'))) errors.push(`[${width}] ${m.text()}`); });
  for (let tries = 0; ; tries++) {
    try {
      await p.goto(BASE);
      await p.evaluate(() => localStorage.clear());
      await p.goto(BASE);
      await p.waitForSelector('.lw-app');
      break;
    } catch (e) { if (tries > 5) throw e; await p.waitForTimeout(1500); } // other builders' edits trigger HMR reloads
  }
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  return p;
}

/** Load a fixture solution into the store; commits it whole (hold>0: the last `hold` nodes as a second commit). */
async function solve(p, id, { hold = 0, keepCeremony = false } = {}) {
  return p.evaluate(async ({ id, hold, keepCeremony }) => {
    const st = window.__lw;
    try { st.openLevel(id); } catch (e) { console.warn('openLevel threw (other module): ' + e.message); }
    let g;
    if (id === 'R01') {
      const H = await import('/tests/helpers.ts');
      const b = new H.Builder(), a = H.A('a');
      b.given('h4'); b.given('h6');
      let n = b.start(H.P(a, a));
      n = b.steps(n, [{ k: 'insertE', at: { side: 'r', path: [], gap: 2 } }, H.rw(H.node('g-h4'), {}, 'r', [2, 3], 'rev')]);
      n = b.steps(n, [H.rw(H.node('g-h6'), {}, 'r', [0, 6])]);
      const w = b.apply(n, H.schema('witness'), { u: a, v: a });
      b.swap(w);
      g = b.g;
    } else {
      const mod = await import(`/tests/solutions/${id}.ts`);
      g = mod.solution();
    }
    const fix = (s) => (typeof s === 'string' ? s.replace(/^g-/, 'g:') : s);
    const graph = JSON.parse(JSON.stringify(g), (k, v) => (['id', 'input'].includes(k) || k === 'inputs' ? (Array.isArray(v) ? v.map(fix) : fix(v)) : v));
    const head = { ...graph, nodes: graph.nodes.slice(0, graph.nodes.length - hold) };
    st.commitGraph(head, { recordUndo: true });
    if (hold) st.commitGraph(graph, { recordUndo: true });
    const out = { solved: st.get().check.solved, bad: Object.values(st.get().check.nodes).filter((n) => !n.ok).map((n) => n.error) };
    if (!keepCeremony) { st.clearCeremony(); document.querySelector('.qed-actions .lw-key:last-child')?.click(); }
    return out;
  }, { id, hold, keepCeremony });
}
const tex = (p) => p.evaluate(async () => { const m = await import('/src/shell/proof.ts'); const s = window.__lw.get(); return m.transcriptTeX(m.buildTranscript(s), s); });
const shot = async (p, name) => { await p.screenshot({ path: `${SHOTS}shell2-${name}.png` }); };
const open = async (p, id) => { await p.evaluate((id) => { try { window.__lw.openLevel(id); } catch { /* other module */ } }, id); await p.waitForTimeout(250); };
/** Layout audit: any element of `sel` clipped by the viewport or overlapping the bench? */
const audit = (p, label) => p.evaluate((label) => {
  const out = [];
  const bench = document.querySelector('.lw-bench')?.getBoundingClientRect();
  const vw = innerWidth, vh = innerHeight;
  for (const [sel, name] of [['.lw-lab:not([hidden])', 'lab'], ['.lw-toolbox', 'toolbox'], ['.proof-head .lw-key', 'proof button']]) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.right > vw + 1 || r.bottom > vh + 1) out.push(`${name} clipped by viewport`);
      if (name === 'lab' && bench && r.bottom > bench.top + 1) out.push('lab overlaps bench');
      if (name === 'proof button' && el.scrollWidth > el.clientWidth + 1) out.push('proof button text clipped');
    }
  }
  // transcript: no math cell may wrap
  for (const c of document.querySelectorAll('.t-lhs, .t-rhs')) if (c.textContent && c.getBoundingClientRect().height > 40) out.push(`transcript math wraps: "${c.textContent.slice(0, 20)}"`);
  return out.map((x) => `${label}: ${x}`);
}, label);

const vis = (p, sel, within) => p.evaluate(({ sel, within }) => {
  const el = document.querySelector(sel); if (!el) return 'missing';
  const r = el.getBoundingClientRect(), w = (within ? document.querySelector(within) : document.documentElement).getBoundingClientRect();
  return { top: r.top - w.top, bottom: w.bottom - r.bottom, hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest(sel) === el };
}, { sel, within });

for (const [w, hgt] of sizes) {
  const tag = `${w}x${hgt}`;
  const p = await page(w, hgt);
  // 4. fresh map: next node fully in view with 24px clearance, overflow cue present
  await p.waitForTimeout(400);
  const nv = await vis(p, '.mn.next', '.map-field');
  if (nv === 'missing' || nv.bottom < 23 || nv.top < 0) report.push(`${tag} map: next node not clear (${JSON.stringify(nv)})`);
  await shot(p, `map-fresh-${tag}`);
  for (const id of ['L01', 'L02', 'L03', 'L04', 'L05']) { const r = await solve(p, id); if (!r.solved) report.push(`${tag} ${id} not solved ${r.bad}`); }
  // map position memory: scroll to top, leave, return
  await p.evaluate(() => window.__lw.openMap()); await p.waitForTimeout(300);
  await p.evaluate(() => { document.querySelector('.map-field').scrollTop = 0; });
  await p.waitForTimeout(100);
  await p.evaluate(() => window.__lw.openLevel('L05')); await p.waitForTimeout(150);
  await p.evaluate(() => window.__lw.openMap()); await p.waitForTimeout(400);
  const st0 = await p.evaluate(() => document.querySelector('.map-field').scrollTop);
  if (st0 !== 0) report.push(`${tag} map did not keep its scroll position (${st0})`);
  // 5. predictions: run, then change a guess -> new round, history not rewritten
  await open(p, 'L06');
  const g = (i, k) => `.lab-pane.predict .pcard:nth-child(${i}) .pguess:nth-of-type(${k})`;
  await p.click(g(1, 1)); await p.click(g(2, 1));
  await p.click('.pfoot .lw-key');
  await p.waitForTimeout(1900);
  await shot(p, `L06-predict-run-${tag}`);
  report.push(...await audit(p, `${tag} L06 predict`));
  const before = await p.evaluate(() => document.querySelector('.pcard .pyours')?.textContent ?? '');
  await p.click(g(1, 2));
  await p.waitForTimeout(100);
  const after = await p.evaluate(() => ({ res: document.querySelectorAll('.pcard .pverdict').length, intro: document.querySelector('.lab-intro')?.textContent }));
  if (after.res !== 0 || !/Round 2/.test(after.intro)) report.push(`${tag} prediction change did not start a new round: ${JSON.stringify(after)} (before: ${before})`);
  await shot(p, `L06-predict-round2-${tag}`);
  // bench never squeezed by the lab
  const benchH = await p.evaluate(() => document.querySelector('.lw-bench').getBoundingClientRect().height);
  await p.click('.lab-close'); await p.waitForTimeout(100);
  const benchH2 = await p.evaluate(() => document.querySelector('.lw-bench').getBoundingClientRect().height);
  if (Math.abs(benchH - benchH2) > 1) report.push(`${tag} lab changes bench height ${benchH2}→${benchH}`);
  // 2+1. award: L06 solved with the last station held back; ceremony waits for the board
  const t0 = Date.now();
  await solve(p, 'L06', { hold: 1, keepCeremony: true });
  await p.waitForTimeout(250);
  const waiting = await p.evaluate(() => document.querySelector('.lw-ceremony')?.className);
  if (!/waiting/.test(waiting)) report.push(`${tag} ceremony covered the board immediately (${waiting})`);
  await shot(p, `L06-delivery-250ms-${tag}`);
  await p.waitForTimeout(2400 - (Date.now() - t0));
  await shot(p, `L06-award-flight-${tag}`);
  await p.waitForTimeout(1600);
  const end = await p.evaluate(() => ({ clones: document.querySelectorAll('.qed-clone').length, focus: document.activeElement?.textContent, receipt: document.querySelector('.tb-receipt')?.textContent, stays: document.querySelectorAll('.qed-machine').length }));
  if (end.clones) report.push(`${tag} award clone lingers`);
  if (!/Next work order/.test(end.focus ?? '')) report.push(`${tag} ceremony end focus: ${end.focus}`);
  await shot(p, `L06-award-end-${tag}`);
  report.push(`${tag} receipt after award: "${end.receipt}", machine cards kept: ${end.stays}`);
  await p.click('.qed-actions .lw-key:last-child');
  // 3. Esc mid-ceremony keeps the way forward
  for (const id of ['L07', 'L08']) await solve(p, id);
  await solve(p, 'L09', { hold: 2, keepCeremony: true });
  await p.waitForTimeout(700);
  await shot(p, `L09-clash-delivery-700ms-${tag}`);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  const esc = await p.evaluate(() => ({ next: !!document.querySelector('.lw-ceremony:not([hidden]) .next-order'), focus: document.activeElement?.textContent }));
  if (!esc.next || !/Next work order/.test(esc.focus ?? '')) report.push(`${tag} Esc lost Next: ${JSON.stringify(esc)}`);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  const esc2 = await p.evaluate(() => !!document.querySelector('.lw-ceremony:not([hidden]) .next-order') || !!document.querySelector('.wo-next .next-order'));
  if (!esc2) report.push(`${tag} second Esc left no Next work order`);
  await shot(p, `L09-after-esc-${tag}`);
  await p.click('.qed-actions .lw-key:last-child').catch(() => {});
  // 7. L08 lab second pin reachable
  await p.evaluate(() => window.__lw.resetLevel?.());
  for (const id of ['L10', 'R01', 'L11']) await solve(p, id);
  await solve(p, 'L12', { hold: 2, keepCeremony: true });
  await p.waitForTimeout(4200);
  await p.click('.qed-actions .lw-key:last-child');
  await p.waitForTimeout(400);
  const qv = await vis(p, '.t-qed', '.proof-body');
  if (qv === 'missing' || qv.bottom < 0 || qv.top < 0) report.push(`${tag} L12 concluding line not revealed (${JSON.stringify(qv)})`);
  report.push(...await audit(p, `${tag} L12`));
  await shot(p, `L12-after-qed-${tag}`);
  // 6. replay dimming keeps pace with the board cursor
  await p.evaluate(() => { const st = window.__lw; st.stepReplay(1); st.stepReplay(-10); });
  await p.waitForTimeout(150);
  const dim = await p.evaluate(() => {
    const st = window.__lw.get(), r = st.ui.replay, shown = new Set(r.order.slice(0, Math.floor(r.cursor) + 1));
    const bad = [...document.querySelectorAll('.proof-body [data-nodes]')].filter((n) => { const ids = n.dataset.nodes.split(' ').filter(Boolean); return ids.length && (ids.some((i) => shown.has(i)) === n.classList.contains('future')); }).length;
    return { cursor: r.cursor, of: r.order.length, bad, lit: document.querySelectorAll('.proof-body .t-line:not(.future):not(.goal-ghost)').length, dim: document.querySelectorAll('.proof-body .t-line.future').length };
  });
  if (dim.bad) report.push(`${tag} replay dimming mismatch ${JSON.stringify(dim)}`);
  await shot(p, `L12-replay-6-${tag}`);
  await p.evaluate(() => window.__lw.stopReplay());
  // L08 second pin hit-test
  await open(p, 'L08');
  await p.evaluate(() => { const b = document.querySelector('.lab-toggle'); if (document.querySelector('.lw-lab').hidden) b.click(); document.querySelectorAll('.lab-tab')[0].click(); });
  await p.click('.pfoot .lw-key');
  await p.waitForTimeout(2600);
  const pins = await p.$$('.lab-pane.predict .pcard .lw-key');
  if (pins.length < 2) report.push(`${tag} L08: expected 2 pin buttons, got ${pins.length}`);
  else {
    await pins[pins.length - 1].scrollIntoViewIfNeeded();
    const hit = await p.evaluate(() => { const bs = document.querySelectorAll('.lab-pane.predict .pcard .lw-key'); const b = bs[bs.length - 1]; const r = b.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b; });
    if (!hit) report.push(`${tag} L08 second pin is covered`);
    await shot(p, `L08-second-pin-${tag}`);
  }
  await p.context().close();
}
console.log(report.length ? `FINDINGS:\n${report.join('\n')}` : 'no layout findings');
console.log(errors.length ? `ERRORS:\n${[...new Set(errors)].join('\n')}` : 'no page errors');
await browser.close();

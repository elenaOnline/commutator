// COMMUTATOR — W10–14 blocker #1 check (HEADLESS ONLY): P14.3 needs "Lagrange in K". The reference floor is rebuilt
// through the store except its Lagrange-in-K Rewriter, which is placed and configured with the REAL POINTER: the
// Rewriter hotkey, a click on the floor, a click on the picker row "Lagrange in K". Then the factory must deliver.
// Usage: node src/hud/pw-p143.mjs /tmp/cm/p143.json
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.HUD_URL ?? 'http://localhost:8790/';
const SHOTS = new URL('../../.shots/p143/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const D = JSON.parse(readFileSync(process.argv[2] ?? '/tmp/cm/p143.json', 'utf8'));
const HMR_STUB = `export const createHotContext = () => ({ accept() {}, acceptExports() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {}, decline() {}, data: {} });
export const updateStyle = (id, css) => { let s = document.querySelector('style[data-vite-dev-id="' + id + '"]'); if (!s) { s = document.createElement('style'); s.setAttribute('data-vite-dev-id', id); document.head.appendChild(s); } s.textContent = css; };
export const removeStyle = (id) => document.querySelector('style[data-vite-dev-id="' + id + '"]')?.remove();
export const injectQuery = (u) => u; export class ErrorOverlay extends HTMLElement {}`;

const browser = await chromium.launch({ headless: true });
const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fail.push(what); };
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  // src/factory/editor.ts currently reads process.env (another agent's in-flight debug flags); shim it for this page only
  if (process.env.SHIM_PROCESS !== '0') await page.addInitScript(() => { window.process ??= { env: {} }; });
  await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const shot = (n) => page.screenshot({ path: `${SHOTS}${n}.png` });
  await page.goto(BASE);
  await page.evaluate((d) => {
    localStorage.clear();
    const camp = (earned, lemmas) => ({ levels: {}, earned, lemmas });
    localStorage.setItem('lemma-works/v3', JSON.stringify({ version: 5, campaign: 'book', campaigns: { main: camp([], []), book: camp(d.earned, d.lemmas.map((l) => ({ ...l, savedAt: l.savedAt ?? 1 }))) }, settings: { speed: 4, reducedMotion: false } }));
  }, D);
  await page.reload();
  await page.waitForSelector('.h3-hotbar');
  await page.evaluate(() => document.fonts.ready);
  const verified = await page.evaluate(() => window.__lw.get().save.campaigns.book.lemmas.map((l) => [l.name, l.verified, l.reason]));
  console.log('     lemmas:', JSON.stringify(verified));
  const built = await page.evaluate((c) => {
    const st = window.__lw;
    st.openLevel('P14.3'); st.closeCards(); st.resetLevel();
    const map = new Map(); const log = [];
    for (const m of c.machines) {
      if (m.locked) { map.set(m.id, m.id); continue; }
      const before = new Set(st.get().canvas.machines.map((x) => x.id));
      const e = st.place(m.kind, m.at, { rot: m.rot, config: m.config });
      if (!e.ok) { log.push(`place ${m.id}: ${e.reason}`); continue; }
      map.set(m.id, st.get().canvas.machines.find((x) => !before.has(x.id)).id);
    }
    for (const b of c.belts) { if (!b.to) continue; const e = st.connect({ m: map.get(b.from.m), port: b.from.port }, { m: map.get(b.to.m), port: b.to.port }, b.path); if (!e.ok) { const e2 = st.connect({ m: map.get(b.from.m), port: b.from.port }, { m: map.get(b.to.m), port: b.to.port }); if (!e2.ok) log.push(`belt: ${e2.reason}`); } }
    st.setPlaying(false);
    return { log, map: Object.fromEntries(map) };
  }, D.canvas);
  check(!built.log.length, `floor rebuilt except the Lagrange-in-K Rewriter ${JSON.stringify(built.log)}`);

  // ── the real pointer: Rewriter hotkey, a click on the floor, the picker row "Lagrange in K"
  await page.keyboard.press('Escape');
  // a free, visible tile: hotkey 2 arms the Rewriter, a click places it (the lens opens on its picker)
  const count = () => page.evaluate(() => window.__lw.get().canvas.machines.length);
  const n0 = await count();
  for (const [x, y] of [[20, 2], [24, 2], [20, -2], [26, 6], [16, -2], [28, 2], [6, 0]]) {
    const p = await page.evaluate(([x, y]) => window.__hud.tileXY(x, y), [x, y]);
    if (p.x < 120 || p.x > 1300 || p.y < 240 || p.y > 780) continue;
    await page.keyboard.press('2');
    await page.mouse.move(p.x, p.y, { steps: 5 });
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(600);
    if ((await count()) > n0) break;
  }
  await shot('0-after-place');
  const rows = await page.locator('.h3-lens .h3-prow').allInnerTexts();
  console.log('     rows:', rows.length, JSON.stringify(rows.slice(0, 30).map((t) => t.replace(/\s+/g, ' ').slice(0, 30))));
  const lagRows = rows.filter((t) => /Lagrange/.test(t)).map((t) => t.replace(/\s+/g, ' ').slice(0, 40));
  check(lagRows.some((t) => /Lagrange in K/.test(t)) && lagRows.some((t) => /Lagrange in G/.test(t)), `the picker offers Lagrange per group: ${JSON.stringify(lagRows)}`);
  const homPow = rows.filter((t) => /powers through a homomorphism|homomorphism.*power/i.test(t)).length;
  check(homPow <= 1, `hom.pow is listed once (${homPow})`);
  await shot('1-picker-lagrange-in-K');
  await page.locator('.h3-lens .h3-prow', { hasText: 'Lagrange in K' }).first().click();
  await page.waitForTimeout(500);
  const rw = await page.evaluate(() => { const s = window.__lw.get(); return s.canvas.machines.filter((m) => m.kind === 'rewriter').map((m) => ({ id: m.id, ref: m.config.recipe?.ref })); });
  const mine = rw.find((r) => r.ref?.k === 'lagrange' && r.ref.sort === 'K');
  check(!!mine, `the pointer's Rewriter is Lagrange in K (${JSON.stringify(rw.map((r) => r.ref))})`);
  // pin it to the right-hand side (the dock reads x³ = e there), then belt it in
  const solved = await page.evaluate(([id, s3, t, target]) => {
    const st = window.__lw;
    const m = st.get().canvas.machines.find((x) => x.id === id);
    st.configure(id, { ...m.config, target });
    const a = st.connect({ m: s3, port: 'out' }, { m: id, port: 'q' });
    const b = st.connect({ m: id, port: 'out' }, { m: t, port: 'p0' });
    st.setPlaying(true); st.setSpeed(4);
    return [a.ok || a.reason, b.ok || b.reason, st.get().compiled.machines[id]?.status];
  }, [mine?.id, built.map[D.s3], built.map[D.t], D.target]);
  console.log('     wiring:', JSON.stringify(solved));
  let done = false;
  for (let i = 0; i < 200 && !done; i++) { await page.waitForTimeout(150); done = await page.evaluate(() => !!window.__lw.get().ui.ceremony || !!window.__lw.get().save.campaigns.book.levels['P14.3']?.solvedAt); }
  if (!done) console.log('     state:', await page.evaluate(() => { const s = window.__lw.get(); return JSON.stringify(Object.entries(s.compiled.machines).map(([id, c]) => [id, s.canvas.machines.find((m) => m.id === id)?.kind, c.status?.k, c.status?.reason ?? c.status?.why ?? ''])); }));
  if (!done) await shot('1b-not-delivered');
  check(done, 'P14.3 delivered (∎)');
  await page.waitForTimeout(400); await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await shot('2-ceremony');
  check(!errors.length, `no page errors ${errors.slice(0, 3).join(' | ')}`);
  await page.evaluate(() => localStorage.clear());
  await ctx.close();
} finally {
  await browser.close();
}
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall ok');
process.exit(fail.length ? 1 : 0);

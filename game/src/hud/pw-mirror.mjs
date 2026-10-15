// COMMUTATOR — reachability gap P16.s3 (HEADLESS ONLY): a Rewriter with "power of a conjugate" shows the side toggle,
// and the pointer reaches the mirrored side. Usage: node src/hud/pw-mirror.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.env.HUD_URL ?? 'http://localhost:8790/';
const SHOTS = new URL('../../.shots/mirror/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
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
  await page.addInitScript(() => { window.process ??= { env: {} }; });
  await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('lemma-works/v3', JSON.stringify({ version: 5, campaign: 'book', campaigns: { main: { levels: {}, earned: [], lemmas: [] }, book: { levels: {}, earned: [], lemmas: [] } }, settings: { speed: 4, reducedMotion: false } })); });
  await page.reload(); await page.waitForSelector('.h3-hotbar'); await page.evaluate(() => document.fonts.ready);
  const id = await page.evaluate(() => {
    const st = window.__lw; st.openLevel('P16.s3'); st.closeCards(); st.resetLevel();
    const before = new Set(st.get().canvas.machines.map((m) => m.id));
    st.place('rewriter', { x: 16, y: 4 }, { rot: 0, config: { kind: 'rewriter', recipe: { k: 'law', ref: { k: 'schema', id: 'power.conjugate' } }, dir: 'fwd', values: {} } });
    const id = st.get().canvas.machines.find((m) => !before.has(m.id)).id;
    st.select([id]); st.openLens(id); return id;
  });
  await page.waitForTimeout(500);
  const tog = page.locator('.h3-lens .h3-sidetoggle button');
  check((await tog.count()) === 2, `the Rewriter lens shows the side toggle for power of a conjugate (${await tog.count()})`);
  await page.screenshot({ path: `${SHOTS}1-rewriter-plain.png` });
  await tog.nth(1).click(); await page.waitForTimeout(400);
  const ref = await page.evaluate((id) => window.__lw.get().canvas.machines.find((m) => m.id === id).config.recipe.ref, id);
  check(ref.mirror === true, `the pointer reaches the mirrored side ${JSON.stringify(ref)}`);
  await page.screenshot({ path: `${SHOTS}2-rewriter-mirror.png` });
  check(!errors.length, `no page errors ${errors.slice(0, 2).join(' | ')}`);
  await page.evaluate(() => localStorage.clear());
  await ctx.close();
} finally { await browser.close(); }
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall ok');
process.exit(fail.length ? 1 : 0);

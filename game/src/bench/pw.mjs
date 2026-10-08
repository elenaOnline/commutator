// LEMMA WORKS — headless Playwright helpers for driving the bench harness with
// real pointer events. HEADLESS ONLY. Usage: node src/bench/play.mjs
import { chromium } from 'playwright';

export const BASE = process.env.BENCH_URL ?? 'http://localhost:8791/src/bench/dev.html';
export const SHOTS = new URL('../../.shots/', import.meta.url).pathname;

/** Open the REAL shell at http://localhost:8791/ and switch to a level. earned = 'witness,cancel'. */
export async function openShell(level, { width = 1280, height = 800, earned = '' } = {}) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(BASE.replace('/src/bench/dev.html', '/'));
      await page.waitForLoadState('networkidle');
      await page.evaluate((earned) => {
        localStorage.clear();
        if (earned) localStorage.setItem('lemma-works/v1', JSON.stringify({ version: 1, levels: {}, earned: earned.split(','), settings: { reducedMotion: false, speed: 1 } }));
      }, earned);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);
      await page.evaluate((id) => window.__lw.openLevel(id), level);
      await page.waitForSelector('.bn');
      await page.evaluate(() => document.fonts.ready);
      break;
    } catch (e) { if (attempt > 3) throw e; await page.waitForTimeout(800); }
  }
  await page.waitForTimeout(400);
  return { browser, page, errors };
}

export async function open(level, extra = '', { width = 1440, height = 900, h = 420, reduced = false } = {}) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  await page.goto(`${BASE}?level=${level}&fresh=1&h=${h}${extra}`);
  await page.waitForSelector('.bn');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  return { browser, page, errors };
}

const sel = (side, wpath, i) => `.bn-src-pallet [data-i="${i}"][data-side="${side}"][data-wpath="${wpath}"]`;
const gsel = (side, wpath, g) => `.bn-src-pallet [data-gap="${g}"][data-side="${side}"][data-wpath="${wpath}"]`;

export async function center(page, css) {
  const b = await page.locator(css).first().boundingBox();
  if (!b) throw new Error(`no box for ${css}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
}
export const bead = (page, side, i, wpath = '') => center(page, sel(side, wpath, i));
export const gap = (page, side, g, wpath = '') => center(page, gsel(side, wpath, g));

/** Press-drag across beads i..j on a rail (horizontal). */
export async function dragSpan(page, side, i, j, wpath = '') {
  const a = await bead(page, side, i, wpath), b = await bead(page, side, j, wpath);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(a.x + ((b.x - a.x) * k) / 8, a.y + ((b.y - a.y) * k) / 8);
  await page.mouse.up();
  await page.waitForTimeout(60);
}
/** Lift bead i (vertical pull) and drop on bead j. */
export async function liftDrop(page, side, i, j, wpath = '') {
  const a = await bead(page, side, i, wpath), b = await bead(page, side, j, wpath);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x, a.y - 14);
  await page.mouse.move(a.x, a.y - 30);
  for (let k = 1; k <= 8; k++) await page.mouse.move(a.x + ((b.x - a.x) * k) / 8, a.y - 30 + ((b.y - a.y + 30) * k) / 8);
  await page.mouse.up();
  await page.waitForTimeout(60);
}
export async function clickBead(page, side, i, wpath = '') { const a = await bead(page, side, i, wpath); await page.mouse.click(a.x, a.y); await page.waitForTimeout(40); }
export async function clickGap(page, side, g, wpath = '') { const a = await gap(page, side, g, wpath); await page.mouse.click(a.x, a.y); await page.waitForTimeout(40); }

export async function cards(page) {
  return page.$$eval('.bn-moves .bn-mcard', (els) => els.map((e) => e.querySelector('.bn-mcard-l')?.textContent + (e.querySelector('.bn-mcard-n') ? ` ×${e.querySelector('.bn-mcard-n').textContent}` : '')));
}
export async function card(page, name) {
  const loc = page.locator('.bn-moves .bn-mcard', { hasText: name }).first();
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(60);
}
/** Cut gaps currently drawn by a machine: [{side, gap, choices}] */
export async function cuts(page) {
  return page.$$eval('.bn-src-pallet .is-cut', (els) => els.map((e) => ({ side: e.dataset.side, wpath: e.dataset.wpath, gap: +e.dataset.gap, choices: e.dataset.choices })));
}
export async function offers(page) {
  return page.$$eval('.bn-pop .bn-offer, .bn-moves .bn-offer', (els) => els.map((e) => ({
    where: e.closest('.bn-pop') ? 'pop' : 'dock',
    label: e.querySelector('.bn-offer-l')?.textContent,
    pv: e.querySelector('.bn-offer-pv')?.textContent ?? e.querySelector('.bn-offer-need')?.textContent,
  })));
}
/** Click the offer whose label matches (regex or string), in pop first then dock. */
export async function pickOffer(page, re, where = null) {
  const list = await offers(page);
  const idx = list.findIndex((o) => (!where || o.where === where) && (typeof re === 'string' ? o.label?.includes(re) : re.test(o.label ?? '')));
  if (idx < 0) throw new Error(`no offer ${re}; have: ${JSON.stringify(list)}`);
  const loc = page.locator('.bn-pop .bn-offer, .bn-moves .bn-offer').nth(idx);
  const b = await loc.boundingBox();
  await page.mouse.move(b.x + 20, b.y + b.height / 2);
  await page.waitForTimeout(30);
  await page.mouse.click(b.x + 20, b.y + b.height / 2);
  await page.waitForTimeout(40);
  return list[idx];
}
export async function chip(page, label) {
  const loc = page.locator('.bn-entry .bn-chip', { hasText: label }).first();
  await loc.click();
}
export async function state(page) {
  return page.evaluate(() => {
    const s = window.__lw.get();
    const id = s.ui.activeNode;
    const f = id ? s.check.nodes[id]?.fact : null;
    const t = (x) => !x ? '' : x.k === 'atom' ? x.id : x.k === 'e' ? 'e' : x.k === 'inv' ? (x.arg.k === 'mul' || x.arg.k === 'inv' ? `(${t(x.arg)})⁻¹` : `${t(x.arg)}⁻¹`) : x.k === 'mul' ? x.fs.map(t).join('') : x.id;
    return {
      fact: f ? (f.k === 'eq' ? `${t(f.l)} = ${t(f.r)}` : f.k === 'neq' ? `${t(f.l)} ≠ ${t(f.r)}` : f.k) : null,
      solved: s.check.solved, nodes: s.graph.nodes.length,
      lat: window.__benchLatency.samples.slice(-1)[0] ?? null,
    };
  });
}
export async function shot(page, name) { await page.waitForTimeout(420); await page.screenshot({ path: `${SHOTS}bench-${name}.png` }); }

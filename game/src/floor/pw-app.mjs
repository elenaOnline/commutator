// LEMMA WORKS v3 floor — headless real-pointer First Light in the FULL app (HUD + floor). HEADLESS ONLY.
// node src/floor/pw-app.mjs   (dev server on :8822)
import { chromium } from 'playwright';
const BASE = process.env.FLOOR_URL ?? 'http://localhost:8822';
const SHOTS = new URL('../../.shots/', import.meta.url).pathname;
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(BASE + '/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('.fl-root .fl-m', { timeout: 20000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1200);
const shot = (n) => page.screenshot({ path: `${SHOTS}v3-floor-app-${n}.png` });
const c = async (css) => { const b = await page.locator(css).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const t0 = Date.now();
await shot('0-open');
const ids = await page.evaluate(() => { const cv = window.__lw.get().canvas; return { spool: cv.machines.find((m) => m.kind === 'spool').id, sock: cv.machines.find((m) => m.kind === 'socket').id }; });
const a = await c(`.fl-m[data-m="${ids.spool}"]`), b = await c(`.fl-m[data-m="${ids.sock}"]`);
await page.keyboard.press('2');
const mid = { x: a.x + (b.x - a.x) * 0.45, y: a.y + (b.y - a.y) * 0.45 };
await page.mouse.move(mid.x, mid.y, { steps: 8 }); await page.waitForTimeout(200);
await shot('1-ghost');
await page.mouse.click(mid.x, mid.y); await page.waitForTimeout(150);
await page.keyboard.press('Escape'); await page.waitForTimeout(80);
const canc = await page.evaluate(() => window.__lw.get().canvas.machines.find((m) => m.kind === 'canceller')?.id);
const so = await c(`.fl-p-hit[data-p="${ids.spool}|out"] circle`), cq = await c(`.fl-p-hit[data-p="${canc}|q"] circle`);
await page.mouse.move(so.x, so.y); await page.mouse.down(); await page.mouse.move(cq.x, cq.y, { steps: 10 }); await page.mouse.up();
await page.waitForTimeout(150);
const co = await c(`.fl-p-hit[data-p="${canc}|out"] circle`), sq = await c(`.fl-p-hit[data-p="${ids.sock}|q"] circle`);
await page.mouse.move(co.x, co.y); await page.mouse.down(); await page.mouse.move(sq.x, sq.y, { steps: 10 }); await page.mouse.up();
await page.mouse.move(700, 120);
await page.waitForTimeout(700);
await shot('2-flowing');
let delivered = false;
for (let i = 0; i < 60 && !delivered; i++) { await page.waitForTimeout(150); delivered = await page.evaluate(() => Object.keys(window.__lw.get().run.delivered).length > 0); }
const secs = (Date.now() - t0) / 1000;
await page.waitForTimeout(900);
await shot('3-delivered');
// select the canceller: the HUD lens should anchor to it
await page.evaluate(() => window.__lw.clearCeremony?.());
const cc = await c(`.fl-m[data-m="${canc}"]`);
await page.mouse.click(cc.x, cc.y); await page.waitForTimeout(400);
await shot('4-lens');
console.log(JSON.stringify({ delivered, secs, belts: await page.evaluate(() => window.__lw.get().canvas.belts.length), perf: await page.evaluate(() => window.__floorPerf.samples), errors }, null, 1));
await browser.close();

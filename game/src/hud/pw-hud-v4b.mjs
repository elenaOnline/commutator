// LEMMA WORKS v3 — HUD v4 (recipes, towers, ∀, Lemma Book, concept cards), REAL pointer/keyboard input (HEADLESS ONLY).
// `__lw` is used only to read state, to open a level, and to seed a save; never to build.
// Usage: node src/hud/pw-hud-v4b.mjs [width height]   (server: npx vite --port 8823 --strictPort)
import { chromium } from 'playwright';

const BASE = process.env.HUD_URL ?? 'http://localhost:8823/';
const SHOTS = new URL('../../.shots/', import.meta.url).pathname;
const sizes = process.argv[2] ? [[+process.argv[2], +process.argv[3]]] : [[1440, 900], [1280, 800]];
const HMR_STUB = `export const createHotContext = () => ({ accept() {}, acceptExports() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {}, decline() {}, data: {} });
export const updateStyle = (id, css) => { let s = document.querySelector('style[data-vite-dev-id="' + id + '"]'); if (!s) { s = document.createElement('style'); s.setAttribute('data-vite-dev-id', id); document.head.appendChild(s); } s.textContent = css; };
export const removeStyle = (id) => document.querySelector('style[data-vite-dev-id="' + id + '"]')?.remove();
export const injectQuery = (u) => u; export class ErrorOverlay extends HTMLElement {}`;

const browser = await chromium.launch({ headless: true });
const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fail.push(what); };
try {
  for (const [W, H] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const shot = (n) => page.screenshot({ path: `${SHOTS}v4b-hud-${n}-${W}x${H}.png` });
    const st = () => page.evaluate(() => { const s = window.__lw.get(); return { tool: s.ui.tool, hint: s.ui.hint, lens: s.ui.lens, follow: s.ui.follow ?? null, delivered: s.run.delivered, machines: s.canvas.machines.map((m) => ({ id: m.id, kind: m.kind, at: m.at, cfg: m.config })), belts: s.canvas.belts.map((b) => `${b.from.m}.${b.from.port}>${b.to.m}.${b.to.port}`) }; });
    const mc = async (m) => { const b = await page.locator(`.fl-m[data-m="${m}"]`).first().boundingBox(); return b && { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    const port = async (m, p) => { const b = await page.locator(`.fl-p-hit[data-p="${m}|${p}"] circle`).first().boundingBox(); return b && { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    const drag = async (a, b) => { await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2 + 4, { steps: 10 }); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.waitForTimeout(60); await page.mouse.up(); await page.waitForTimeout(150); };
    const tile = (x, y) => page.evaluate(([x, y]) => window.__hud.tileXY(x, y), [x, y]);
    const placeAt = async (key, x, y) => {
      const before = (await st()).machines.map((m) => m.id);
      if (key.length === 1) await page.keyboard.press(key); else await page.locator(`.h3-slot[data-key="${key}"]`).click();
      const p = await tile(x, y); await page.mouse.move(p.x, p.y, { steps: 4 }); await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(120);
      const after = await st();
      return after.machines.find((m) => !before.includes(m.id))?.id ?? null;
    };
    const seed = (save) => page.evaluate((sv) => { localStorage.clear(); if (sv) localStorage.setItem('lemma-works/v3', JSON.stringify(sv)); }, save);
    const boot = async (save) => { await page.goto(BASE); await seed(save); await page.reload(); await page.waitForSelector('.h3-hotbar'); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(500); };

    await boot(null);
    await page.keyboard.press('Enter'); await page.waitForTimeout(150); // close the concept cards
    let s = await st();
    const spool = s.machines.find((m) => m.kind === 'spool'), sock = s.machines.find((m) => m.kind === 'socket');
    for (const [key, kind, dy] of [['5', 'theorem', 3], ['2', 'rewriter', -3]]) {
      const id = await placeAt(key, Math.round((spool.at.x + sock.at.x) / 2), spool.at.y + dy);
      await page.waitForTimeout(300);
      check(!!id && (await st()).lens === id, `[${W}] ${kind} placed, its lens open`);
      const out = await port(id, 'out');
      const lensBox = await page.locator('.h3-lens').boundingBox();
      const hitFloor = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('#floor'), [out.x, out.y]);
      const clearOf = lensBox && (out.x < lensBox.x - 24 || out.x > lensBox.x + lensBox.width + 24 || out.y < lensBox.y - 24 || out.y > lensBox.y + lensBox.height + 24);
      check(hitFloor, `[${W}] ${kind} output port reachable (${clearOf ? '≥24 px clear of the lens' : 'pointer passes through the lens'})`);
      await shot(`${kind}-lens`);
      const before = (await st()).belts.length;
      await drag(out, await port(sock.id, 'q'));
      const after = await st();
      check(after.belts.length === before + 1 && after.belts.some((b) => b.startsWith(`${id}.out>`)), `[${W}] a real drag from the ${kind}'s output draws a belt: ${after.belts.join(', ')}`);
      await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
      await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    }
    console.log(`[${W}x${H}] page errors:`, errors.length ? errors.slice(0, 6).join('\n  ') : 'none');
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(fail.length ? `${fail.length} FAILED` : 'all checks passed');
}

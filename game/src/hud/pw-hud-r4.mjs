// LEMMA WORKS v3 — HUD fix round r4 (after the ceremony the floor is free; ceremony capture, level keying, note toast, rotation badge), REAL pointer/keyboard input (HEADLESS ONLY).
// `__lw` is used only to read state, to open a level, and to seed a save; never to build.
// Usage: node src/hud/pw-hud-r3.mjs [width height]   (server: npx vite --port 8823 --strictPort)
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
    for (const motion of ['no-preference', 'reduce']) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, reducedMotion: motion });
    const page = await ctx.newPage();
    await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const shot = (n) => page.screenshot({ path: `${SHOTS}v3-hud-r4-${n}-${W}x${H}.png` });
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
    const boot = async (save) => { await page.goto(BASE); await seed(save); await page.reload(); await page.waitForSelector('.fl-m'); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400); await page.keyboard.press('Enter'); await page.waitForTimeout(150); };

    const camOf = () => page.evaluate(() => JSON.stringify(window.__lw.get().ui.camera));
    const buildL01 = async () => {
      const s0 = await st();
      const spool = s0.machines.find((m) => m.kind === 'spool'), sock = s0.machines.find((m) => m.kind === 'socket');
      const canc = await placeAt('2', Math.round((spool.at.x + sock.at.x) / 2), spool.at.y);
      await page.waitForTimeout(250);
      await page.locator('.h3-lens .h3-prow[data-key="cancel"]').click(); await page.waitForTimeout(200);
      await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
      await drag(await port(spool.id, 'out'), await port(canc, 'q'));
      await drag(await port(canc, 'out'), await port(sock.id, 'q'));
      return { spool, sock, canc };
    };
    const waitCeremony = async () => { for (let i = 0; i < 60; i++) { if (await page.locator('.h3-ceremony:not([hidden])').count()) return true; await page.waitForTimeout(100); } return false; };

    // solve L01, let the ceremony finish on its own (no Esc), Keep refining, then work on the floor
    await boot(null);
    const { spool } = await buildL01();
    check(await waitCeremony(), `[${W} ${motion}] ceremony`);
    await page.waitForSelector('.h3-ceremony.done', { timeout: 8000 });
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape'); // Esc on the finished ceremony = Keep refining
    await page.waitForTimeout(200);
    const layer = await page.evaluate(() => { const c = document.querySelector('.h3-ceremony'); const r = document.querySelector('.h3-receipt'); return { ceremonyShown: !!c && getComputedStyle(c).display !== 'none', receipt: !!r && r.getBoundingClientRect().width > 0 }; });
    check(!layer.ceremonyShown && !layer.receipt, `[${W} ${motion}] no capture layer or receipt left: ${JSON.stringify(layer)}`);
    const id = await placeAt('4', spool.at.x + 1, spool.at.y + 4);
    check(!!id, `[${W} ${motion}] Keep refining → hotkey + floor click places a machine (${id})`);
    await page.keyboard.press('Escape');
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('#floor') !== null, [W * 0.5, H * 0.5]);
    check(hit, `[${W} ${motion}] the floor receives pointer input at the centre`);
    await shot(`after-refine-${motion}`);
    console.log(`[${W}x${H} ${motion}] page errors:`, errors.length ? errors.slice(0, 6).join('\n  ') : 'none');
    await ctx.close();
  }
  }
} finally {
  await browser.close();
  console.log(fail.length ? `${fail.length} FAILED` : 'all checks passed');
}

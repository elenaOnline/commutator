// LEMMA WORKS v3 — headless HUD walkthrough (HEADLESS ONLY; never a visible window).
// Usage: node src/hud/pw-hud.mjs [width height]   (server: npx vite --port 8823 --strictPort)
import { chromium } from 'playwright';

const BASE = process.env.HUD_URL ?? 'http://localhost:8823/';
const SHOTS = new URL('../../.shots/', import.meta.url).pathname;
const sizes = process.argv[2] ? [[+process.argv[2], +process.argv[3]]] : [[1280, 800], [1440, 900]];
const only = process.env.ONLY ?? '';

const browser = await chromium.launch({ headless: true });
try {
  for (const [W, H] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    // isolate this run from other builders' saves: no HMR client (no reloads, no error overlay)
    await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: `
      export const createHotContext = () => ({ accept() {}, acceptExports() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {}, decline() {}, data: {} });
      export const updateStyle = (id, css) => { let s = document.querySelector('style[data-vite-dev-id="' + id + '"]'); if (!s) { s = document.createElement('style'); s.setAttribute('data-vite-dev-id', id); document.head.appendChild(s); } s.textContent = css; };
      export const removeStyle = (id) => document.querySelector('style[data-vite-dev-id="' + id + '"]')?.remove();
      export const injectQuery = (u) => u;
      export class ErrorOverlay extends HTMLElement {}` }));
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
    await page.goto(BASE);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.h3-hotbar');
    await page.evaluate(() => document.fonts.ready);
    const shot = async (name) => { if (!only || name.includes(only)) await page.screenshot({ path: `${SHOTS}v3-hud-${name}-${W}x${H}.png` }); };
    const t0 = Date.now();
    await page.waitForTimeout(1200);
    const tick1 = await page.evaluate(() => window.__lw.get().run.tick);
    console.log(`[${W}x${H}] tick after ${Date.now() - t0} ms: ${tick1}`);
    await shot('L01-open');

    // hover the Canceller slot
    const slot = page.locator('.h3-slot[data-key="canceller"]');
    await slot.hover();
    await page.waitForTimeout(150);
    await shot('hover');
    await page.mouse.move(W / 2, H / 2);

    // all-machines drawer with a search
    await page.locator('.h3-all').click();
    await page.keyboard.type('inv');
    await page.waitForTimeout(100);
    await shot('drawer');
    await page.keyboard.press('Escape');

    // the three hints: place → feed → deliver (through the store; the floor is built concurrently)
    await page.keyboard.press('2');
    const ids = await page.evaluate(() => {
      const st = window.__lw;
      const s = st.get();
      const spool = s.canvas.machines.find((m) => m.kind === 'spool');
      const sock = s.canvas.machines.find((m) => m.kind === 'socket');
      const y = spool.at.y;
      let placed = null;
      for (let x = spool.at.x + 3; x < sock.at.x - 1 && !placed; x++) {
        const r = st.place('canceller', { x, y });
        if (r.ok) placed = r.ids?.[0] ?? st.get().canvas.machines.find((m) => m.kind === 'canceller')?.id;
      }
      return { spool: spool.id, sock: sock.id, canc: placed, hint: st.get().ui.hint };
    });
    console.log('placed', JSON.stringify(ids));
    await page.waitForTimeout(150);
    await shot('hint2');
    await page.evaluate(({ spool, canc }) => window.__lw.connect({ m: spool, port: 'out' }, { m: canc, port: 'q' }), ids);
    await page.waitForTimeout(150);
    await shot('hint3');
    console.log('hint now', await page.evaluate(() => window.__lw.get().ui.hint));

    // the lens on the canceller, before delivery
    await page.evaluate((id) => { window.__lw.setPlaying(false); window.__lw.select([id]); window.__lw.openLens(id); }, ids.canc);
    await page.waitForTimeout(300);
    await shot('lens');
    const lensInfo = await page.evaluate(() => ({ brackets: document.querySelectorAll('.h3-br').length, chosen: document.querySelectorAll('.h3-br.chosen').length, docked: document.querySelector('.h3-lens')?.classList.contains('docked') }));
    console.log('lens', JSON.stringify(lensInfo));
    // pin the other (left-rail) bracket, then back to first match
    const other = page.locator('.h3-br:not(.chosen)').first();
    if (await other.count()) {
      await other.click();
      await page.waitForTimeout(200);
      console.log('after pin', JSON.stringify(await page.evaluate((id) => window.__lw.get().canvas.machines.find((m) => m.id === id).config.target, ids.canc)));
      await shot('lens-pinned');
      await page.locator('.h3-tag', { hasText: 'use first match' }).click();
      await page.waitForTimeout(100);
    }
    await page.keyboard.press('Escape');
    console.log('lens after Esc', await page.evaluate(() => window.__lw.get().ui.lens));

    // transcript drawer
    await page.keyboard.press('t');
    await page.waitForTimeout(200);
    await shot('transcript');

    // deliver → ceremony
    await page.evaluate(({ canc, sock }) => { const st = window.__lw; st.connect({ m: canc, port: 'out' }, { m: sock, port: 'q' }); st.setUI({ transcriptOpen: false }); st.setPlaying(true); }, ids);
    let solved = false;
    for (let i = 0; i < 60 && !solved; i++) { await page.waitForTimeout(200); solved = await page.evaluate(() => !!document.querySelector('.h3-ceremony:not([hidden])')); }
    console.log('ceremony shown', solved, 'tick', await page.evaluate(() => window.__lw.get().run.tick));
    await page.waitForTimeout(1400);
    await shot('ceremony-mid');
    await page.waitForTimeout(1600);
    await shot('ceremony-end');
    await page.locator('.h3-ceremony button', { hasText: 'Keep refining' }).click().catch(() => {});
    await page.waitForTimeout(200);
    await shot('L01-solved');

    // map
    await page.keyboard.press('m');
    await page.waitForTimeout(500);
    await shot('map');
    await page.keyboard.press('m');

    // L06: lab with predictions; L09: room preset + lens docked on a given
    await page.evaluate(() => window.__lw.openLevel('L06'));
    await page.waitForTimeout(300);
    await page.locator('.h3-tog', { hasText: 'Lab' }).click();
    await page.waitForTimeout(300);
    await shot('L06-lab');
    await page.evaluate(() => window.__hud.lab.toggle(false));
    await page.evaluate(() => window.__lw.openLevel('L09'));
    await page.waitForTimeout(300);
    await page.locator('.h3-more').click();
    await page.waitForTimeout(100);
    await shot('L09-order');
    await page.locator('.h3-order .h3-preset').first().click();
    console.log('room tool', JSON.stringify(await page.evaluate(() => window.__lw.get().ui.tool)));
    await page.locator('.h3-slot[data-key="room"]').click();
    await page.waitForTimeout(150);
    await shot('L09-room');
    await page.keyboard.press('Escape');

    console.log(`[${W}x${H}] errors:`, errors.length ? errors.slice(0, 12).join('\n  ') : 'none');
    await ctx.close();
  }
} finally {
  await browser.close();
}

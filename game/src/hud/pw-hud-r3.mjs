// LEMMA WORKS v3 — HUD fix round r3 (ceremony capture, level keying, note toast, rotation badge), REAL pointer/keyboard input (HEADLESS ONLY).
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
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const shot = (n) => page.screenshot({ path: `${SHOTS}v3-hud-r3-${n}-${W}x${H}.png` });
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

    // ── 1. the ceremony holds all input; Esc skips to the end; metrics frozen at the solve
    await boot(null);
    const { spool, sock } = await buildL01();
    check(await waitCeremony(), `[${W}] ceremony on the first solve`);
    const solvedMetrics = await page.evaluate(() => window.__lw.metrics());
    const before = JSON.stringify((await st()).machines.map((m) => m.id)) + (await st()).belts.join() + JSON.stringify((await st()).tool) + await camOf();
    await page.mouse.click(W * 0.3, H * 0.6);                    // a floor click
    await page.keyboard.press('2'); await page.keyboard.press('b'); await page.keyboard.press('t'); await page.keyboard.press('Space');
    await page.mouse.move(W / 2, H / 2); await page.mouse.wheel(0, 400); await page.waitForTimeout(150);
    await page.mouse.move(W * 0.3, H * 0.5); await page.mouse.down(); await page.mouse.move(W * 0.5, H * 0.6, { steps: 6 }); await page.mouse.up();
    const after = JSON.stringify((await st()).machines.map((m) => m.id)) + (await st()).belts.join() + JSON.stringify((await st()).tool) + await camOf();
    const tOpen = await page.evaluate(() => window.__lw.get().ui.transcriptOpen);
    check(before === after && !tOpen, `[${W}] clicks, keys, wheel and drags during the ceremony reach nothing`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    check(await page.locator('.h3-ceremony.done:not([hidden])').count() === 1, `[${W}] Esc skips to the end state`);
    // a click on the just-appeared Next button is ignored (it was aimed at the floor)
    const nb = await page.locator('.h3-ceremony .qed-actions button').first().boundingBox();
    await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
    check((await st()).machines.some((m) => m.kind === 'spool') && await page.evaluate(() => window.__lw.get().level.id) === 'L01', `[${W}] an immediate click does not fire Next`);
    const receipt = await page.locator('.h3-receipt').innerText();
    check(receipt.includes(`${solvedMetrics.machines} machine`) && receipt.includes(`area ${solvedMetrics.area}`), `[${W}] receipt = metrics at solve: "${receipt}"`);
    await shot('ceremony-end');
    await page.mouse.click(W * 0.05, H * 0.5);                   // outside the card: nothing
    check(await page.locator('.h3-ceremony:not([hidden])').count() === 1, `[${W}] a click outside the card does nothing`);
    await page.waitForTimeout(500);
    await page.locator('.h3-ceremony button', { hasText: 'Keep refining' }).click();
    await page.waitForTimeout(200);
    check(await page.locator('.h3-ceremony:not([hidden])').count() === 0, `[${W}] Keep refining closes it`);

    // ── 2. editing a solved floor never re-opens the modal; a later distinct solution is a quiet note
    await page.keyboard.press('Escape');
    await placeAt('4', spool.at.x + 1, spool.at.y + 4);
    await page.keyboard.press('Escape');
    let note = '';
    for (let i = 0; i < 40 && !note; i++) { await page.waitForTimeout(100); note = await page.evaluate(() => { const t = document.querySelector('.h3-toast.on[data-kind="note"]'); return t ? t.textContent : ''; }); }
    check(!(await page.locator('.h3-ceremony:not([hidden])').count()), `[${W}] no second ceremony after an edit`);
    check(/Another proof/.test(note), `[${W}] note toast: "${note}"`);
    await shot('note');
    const nr = await page.locator('.h3-toast.on').boundingBox();
    check(!!nr && nr.y < 60 && Math.abs(nr.x + nr.width / 2 - W / 2) < 4, `[${W}] the note sits upper-centre`);
    await page.waitForTimeout(4000);
    check(!(await page.locator('.h3-toast.on').count()), `[${W}] the note auto-expires`);

    // ── 3. a ceremony belongs to its level
    await boot(null);
    await buildL01();
    await waitCeremony();
    await page.evaluate(() => window.__lw.openLevel('L02'));
    await page.waitForTimeout(1200);
    check(!(await page.locator('.h3-ceremony:not([hidden])').count()) && !(await page.evaluate(() => window.__lw.get().ui.ceremony)), `[${W}] L01's ceremony never shows on L02`);

    // ── 4. rotation badge reflects ui.rot
    await page.keyboard.press('2');
    await page.mouse.move(W / 2, H / 2);
    await page.keyboard.press('r');
    await page.waitForTimeout(100);
    const rot = await page.evaluate(() => window.__lw.get().ui.rot);
    const badge = await page.locator('.h3-slot.on .h3-rotb').innerText().catch(() => '');
    check(rot === 1 && badge === '↻90°', `[${W}] rotation badge "${badge}" for ui.rot=${rot}`);
    await shot('rot-badge');
    await page.keyboard.press('3');
    check(await page.evaluate(() => window.__lw.get().ui.rot) === 0 && !(await page.locator('.h3-rotb').count()), `[${W}] another kind resets rotation and the badge`);
    console.log(`[${W}x${H}] page errors:`, errors.length ? errors.slice(0, 6).join('\n  ') : 'none');
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(fail.length ? `${fail.length} FAILED` : 'all checks passed');
}

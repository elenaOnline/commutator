// LEMMA WORKS v3 — HUD v4 (recipes, towers, ∀, Lemma Book, concept cards), REAL pointer/keyboard input (HEADLESS ONLY).
// `__lw` is used only to read state, to open a level, and to seed a save; never to build.
// Usage: node src/hud/pw-hud-v4b01.mjs [width height]   (server: npx vite --port 8823 --strictPort)
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
    const shot = (n) => page.screenshot({ path: `${SHOTS}v4B-hud-${n}-${W}x${H}.png` });
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
    await page.evaluate(() => window.__lw.openLevel('B01')); await page.waitForTimeout(400);
    check(await page.locator('.h3-cards:not([hidden])').count() === 1, `[${W}] B01 concept cards open`);
    await shot('B01-cards');
    await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    let s = await st();
    const sk = s.machines.find((m) => m.kind === 'socket');
    for (let i = 0; i < 12; i++) { const a = await tile(sk.at.x - 10, sk.at.y - 3), b = await tile(sk.at.x - 10, sk.at.y + 3); if (a.x > 60 && a.y > 160 && b.y < H - 160) break; await page.mouse.move(W / 2, H / 2); await page.mouse.wheel(0, 240); await page.waitForTimeout(120); }
    const tw = await placeAt('6', sk.at.x - 10, sk.at.y - 3);
    await page.waitForTimeout(250);
    await page.locator('.h3-lens .h3-seg', { hasText: 'ℤ' }).click(); await page.waitForTimeout(250);
    await page.locator('.h3-lens .h3-tname').fill('k'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    const t = (await st()).machines.find((m) => m.id === tw)?.cfg;
    check(t?.sort === 'Z' && t?.label === 'k₁', `[${W}] ℤ Tower named k₁: ${t?.label}`);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    const sp = await placeAt('1', sk.at.x - 10, sk.at.y + 1);
    await page.keyboard.press('Escape');
    await page.mouse.click((await mc(sp)).x, (await mc(sp)).y); await page.waitForTimeout(200);
    await page.locator('.h3-lens .h3-term').first().fill('(ab)^(5k_1)'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
    const rw = await placeAt('2', sk.at.x - 6, sk.at.y + 1);
    await page.waitForTimeout(300);
    const imported = await page.locator('.h3-lens .h3-prow').filter({ hasText: 'imported' }).allInnerTexts();
    check(imported.length === 3, `[${W}] Imported power laws in the picker: ${imported.map((x) => x.split('\n')[0]).join(', ')}`);
    await shot('B01-picker');
    await page.locator('.h3-lens .h3-prow[data-key="schema:power.multiply"]').click(); await page.waitForTimeout(250);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await drag(await port(sp, 'out'), await port(rw, 'q'));
    await page.waitForTimeout(300);
    await page.mouse.click((await mc(rw)).x, (await mc(rw)).y); await page.waitForTimeout(300);
    await page.locator('.h3-lens .h3-seg', { hasText: 'R → L' }).click(); await page.waitForTimeout(300);
    const ints = await page.locator('.h3-lens .h3-intknob').count();
    check(ints >= 1, `[${W}] integer knobs for the ℤ metas: ${ints}`);
    const names = await page.locator('.h3-lens .h3-intknob .h3-knob-k').allInnerTexts();
    for (const [nm, v] of [['m', '5'], ['n', 'k_1']]) {
      const k = page.locator('.h3-lens .h3-intknob').filter({ hasText: `${nm} :=` }).locator('.h3-term');
      if (await k.count()) { await k.fill(v); await page.keyboard.press('Enter'); await page.waitForTimeout(250); }
    }
    const out = await page.locator('.h3-lens .h3-out').innerText().catch(() => '');
    const status = await page.locator('.h3-lens .h3-status').innerText().catch(() => '');
    console.log(`  knobs ${names.join(' ')} · status ${status.replace(/\n/g, ' ')} · out ${out.replace(/\n/g, ' ')}`);
    await shot('B01-multiplier');
    console.log(`[${W}x${H}] page errors:`, errors.length ? errors.slice(0, 6).join('\n  ') : 'none');
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(fail.length ? `${fail.length} FAILED` : 'all checks passed');
}

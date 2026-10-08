// LEMMA WORKS v3 — HUD v4 (recipes, towers, ∀, Lemma Book, concept cards), REAL pointer/keyboard input (HEADLESS ONLY).
// `__lw` is used only to read state, to open a level, and to seed a save; never to build.
// Usage: node src/hud/pw-hud-v4.mjs [width height]   (server: npx vite --port 8823 --strictPort)
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
    const shot = (n) => page.screenshot({ path: `${SHOTS}v4-hud-${n}-${W}x${H}.png` });
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

    const lensText = () => page.locator('.h3-lens').innerText().catch(() => '');
    // ── A. L01: cards → place a Rewriter → the lens opens on its recipe picker → cancel → two drags → deliver
    await boot(null);
    check(await page.locator('.h3-cards:not([hidden])').count() === 1, `[${W}] concept cards open on first entry`);
    await shot('L01-cards-1');
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(120);
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(120);
    await shot('L01-cards-3');
    await page.keyboard.press('Enter'); await page.waitForTimeout(120);
    check(await page.locator('.h3-cards:not([hidden])').count() === 0, `[${W}] Enter closes the cards`);
    let s = await st();
    const spool = s.machines.find((m) => m.kind === 'spool'), sock = s.machines.find((m) => m.kind === 'socket');
    const rw = await placeAt('2', Math.round((spool.at.x + sock.at.x) / 2), spool.at.y);
    check(!!rw, `[${W}] Rewriter placed (${rw})`);
    await page.waitForTimeout(250);
    const picker = await page.locator('.h3-lens .h3-picker').count();
    check(picker === 1 && (await st()).lens === rw, `[${W}] the lens opens on the recipe picker`);
    const groups = await page.locator('.h3-lens .h3-plist .h3-group').allInnerTexts();
    check(!(await lensText()).includes('→ a') , `[${W}] picker lists rules only: groups ${groups.join(' | ')}`);
    await shot('L01-picker');
    await page.locator('.h3-lens .h3-prow[data-key="cancel"]').click();
    await page.waitForTimeout(250);
    s = await st();
    check(s.machines.find((m) => m.id === rw)?.cfg.recipe?.k === 'cancel', `[${W}] cancel chosen`);
    await page.keyboard.press('Escape');
    await drag(await port(spool.id, 'out'), await port(rw, 'q'));
    await drag(await port(rw, 'out'), await port(sock.id, 'q'));
    let solved = false;
    for (let i = 0; i < 40 && !solved; i++) { await page.waitForTimeout(150); solved = Object.keys((await st()).delivered).length > 0; }
    check(solved, `[${W}] L01 delivered`);
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150); await page.keyboard.press('Escape');
    await page.mouse.click((await mc(rw)).x, (await mc(rw)).y); await page.waitForTimeout(300);
    await shot('L01-lens-recipe');
    await page.keyboard.press('Escape');

    // ── B. L03: the picker offers the given h, typeset, under "Given here"
    await page.evaluate(() => window.__lw.openLevel('L03')); await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    s = await st();
    const sk3 = s.machines.find((m) => m.kind === 'socket');
    const rw3 = await placeAt('2', sk3.at.x - 3, sk3.at.y + 2);
    await page.waitForTimeout(250);
    const names3 = await page.locator('.h3-lens .h3-plist .h3-group').allInnerTexts();
    check(names3.some((g) => /given here/i.test(g)), `[${W}] L03 picker groups: ${names3.join(' | ')}`);
    await shot('L03-picker');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');

    // ── C. S01 (∀ goal): Tower → Spool(x₁) → ∀ → Ready to save → Lemma Book
    await page.evaluate(() => window.__lw.openLevel('S01')); await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    s = await st();
    const sk = s.machines.find((m) => m.kind === 'socket');
    for (let i = 0; i < 12; i++) {
      const a = await tile(sk.at.x - 9, sk.at.y - 3), b = await tile(sk.at.x - 9, sk.at.y);
      if (a.x > 60 && a.y > 160 && b.y < H - 140) break;
      await page.mouse.move(W / 2, H / 2); await page.mouse.wheel(0, 240); await page.waitForTimeout(120);
    }
    const tw = await placeAt('6', sk.at.x - 9, sk.at.y - 3);
    await page.waitForTimeout(250);
    check((await st()).lens === tw, `[${W}] the Tower lens opens`);
    const tl = await lensText();
    check(/not necessarily distinct/.test(tl), `[${W}] Tower copy: independently arbitrary, not necessarily distinct`);
    await shot('S01-tower');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    const sp = await placeAt('1', sk.at.x - 9, sk.at.y);
    await page.keyboard.press('Escape');
    await page.mouse.click((await mc(sp)).x, (await mc(sp)).y); await page.waitForTimeout(200);
    await page.locator('.h3-lens .h3-term').first().fill('x_1'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    const fa = await placeAt('7', sk.at.x - 5, sk.at.y);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await drag(await port(sp, 'out'), await port(fa, 'q'));
    await page.waitForTimeout(300);
    await page.mouse.click((await mc(fa)).x, (await mc(fa)).y); await page.waitForTimeout(300);
    const fl = await lensText();
    check(/ready to save/i.test(fl), `[${W}] ∀ output: Ready to save (${fl.split('\n').slice(0, 6).join(' / ')})`);
    await shot('S01-forall');
    if (await page.locator('.h3-lens .h3-lname').count()) {
      await page.locator('.h3-lens .h3-lname').fill('Reflexivity');
      await page.locator('.h3-lens button', { hasText: 'Save to Lemma Book' }).click();
      await page.waitForTimeout(300);
    }
    await page.keyboard.press('Escape');
    await page.keyboard.press('l'); await page.waitForTimeout(200);
    const book = await page.locator('.h3-book').innerText().catch(() => '');
    check(/Reflexivity/.test(book), `[${W}] the Lemma Book lists it`);
    await shot('S01-book');
    await page.keyboard.press('l');
    await page.keyboard.press('t'); await page.waitForTimeout(250);
    const tr = await page.locator('.h3-transcript').innerText().catch(() => '');
    check(/arbitrary/.test(tr), `[${W}] transcript: "${tr.split('\n').slice(0, 4).join(' / ')}"`);
    await shot('S01-transcript');
    await page.keyboard.press('t');
    console.log(`[${W}x${H}] page errors:`, errors.length ? errors.slice(0, 6).join('\n  ') : 'none');
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(fail.length ? `${fail.length} FAILED` : 'all checks passed');
}

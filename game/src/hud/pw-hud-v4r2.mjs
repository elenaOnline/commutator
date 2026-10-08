// LEMMA WORKS v3 — HUD v4 (recipes, towers, ∀, Lemma Book, concept cards), REAL pointer/keyboard input (HEADLESS ONLY).
// `__lw` is used only to read state, to open a level, and to seed a save; never to build.
// Usage: node src/hud/pw-hud-v4r2.mjs [width height]   (server: npx vite --port 8823 --strictPort)
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
    const shot = (n) => page.screenshot({ path: `${SHOTS}v4r2-hud-${n}-${W}x${H}.png` });
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
    const fit = async (sk, xs) => { for (let i = 0; i < 14; i++) { const ps = await Promise.all(xs.map(([dx, dy]) => tile(sk.at.x + dx, sk.at.y + dy))); if (ps.every((p) => p.x > 70 && p.x < W - 70 && p.y > 170 && p.y < H - 170)) return; await page.mouse.move(W / 2, H / 2); await page.mouse.wheel(0, 200); await page.waitForTimeout(120); } };
    const pick = async (key) => { await page.locator(`.h3-lens .h3-prow[data-key="${key}"]`).click(); await page.waitForTimeout(250); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); };
    const openLens = async (id) => { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); const c = await mc(id); await page.mouse.click(c.x, c.y); await page.waitForTimeout(300); };
    const typeKnob = async (sel, v) => { const k = page.locator(sel).first(); await k.fill(v); await k.press('Enter'); await page.waitForTimeout(250); };
    const deliveredWait = async () => { for (let i = 0; i < 60; i++) { if (Object.keys((await st()).delivered).length) return true; await page.waitForTimeout(150); } return false; };

    // ── S01 by pointer: Tower x₁ · Spool (x₁⁻¹)⁻¹ · Rewriter(insert x⁻¹x at the end of R) · Rewriter(cancel) · ∀ → dock
    await boot(null);
    await page.evaluate(() => window.__lw.openLevel('S01')); await page.waitForTimeout(400);
    await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    let s = await st();
    let sk = s.machines.find((m) => m.kind === 'socket');
    await fit(sk, [[-17, -4], [-17, 0], [-1, 0]]);
    await placeAt('6', sk.at.x - 17, sk.at.y - 4); await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    const sp = await placeAt('1', sk.at.x - 17, sk.at.y); await page.keyboard.press('Escape');
    await openLens(sp); await typeKnob('.h3-lens .h3-knob .h3-term', '(x_1^-1)^-1'); await page.keyboard.press('Escape');
    const ra = await placeAt('2', sk.at.x - 13, sk.at.y); await pick('pairInv');
    const rb = await placeAt('2', sk.at.x - 9, sk.at.y); await pick('cancel');
    const fa = await placeAt('7', sk.at.x - 5, sk.at.y); await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await drag(await port(sp, 'out'), await port(ra, 'q'));
    await drag(await port(ra, 'out'), await port(rb, 'q'));
    await drag(await port(rb, 'out'), await port(fa, 'q'));
    await page.evaluate(() => window.__lw.setPlaying(false));
    await drag(await port(fa, 'out'), await port(sk.id, 'q'));
    await openLens(ra);
    await typeKnob('.h3-lens .h3-knob .h3-term', 'x_1');
    const gapEnd = page.locator('.h3-lens .h3-br.gap[data-side="r"][data-path=""][data-gap="1"]');
    check(await gapEnd.count() === 1, `[${W}] the end-of-rail gap is a clickable caret`);
    if (await gapEnd.count()) { await gapEnd.click(); await page.waitForTimeout(250); }
    await openLens(fa);
    const ft = await lensText();
    check(/generalized/i.test(ft) && /ready to save/i.test(ft) && !/nothing to generalize/i.test(ft), `[${W}] S01 ∀ lens: ${ft.split('\n').filter((l) => /eneraliz|save|Nothing/i.test(l)).join(' / ')}`);
    await shot('S01-forall');
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    check((await st()).lens === null, `[${W}] Esc in the name field closes the lens`);
    // the floor's "Ready to save" badge → the lens opens with its name field focused (ui.lensFocus)
    const badge = page.locator(`#floor [data-badge="${fa}"]`).first();
    check(await badge.count() === 1, `[${W}] the floor shows Ready to save on the ∀ output`);
    await badge.click(); await page.waitForTimeout(300);
    check(await page.evaluate(() => document.activeElement?.classList.contains('h3-lname') && !window.__lw.get().ui.lensFocus), `[${W}] the badge focuses the lens's name field (lensFocus cleared)`);
    await page.locator('.h3-lens .h3-lname').fill('Double Fl'); // an in-progress save: the ceremony must wait

    await page.evaluate(() => window.__lw.setPlaying(true));
    check(await deliveredWait(), `[${W}] S01 delivered`);
    await page.waitForTimeout(800);
    check(await page.locator('.h3-ceremony:not([hidden])').count() === 0, `[${W}] the ceremony waits while the lemma name is being typed`);
    await page.mouse.click(W - 40, H / 2); await page.waitForTimeout(900); // focus leaves the field → ceremony plays
    await page.waitForSelector('.h3-ceremony .qed-save', { timeout: 8000 }).catch(() => {});
    const nm = await page.locator('.h3-ceremony .qed-name').inputValue().catch(() => '');
    check(nm === 'Double Flip', `[${W}] ceremony offers the save, prefilled "${nm}"`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(600);
    const note = await page.locator('.h3-ceremony .qed-note').innerText().catch(() => '');
    check(/x1 was arbitrary|x₁ was arbitrary/.test(note.replace(/\s+/g, ' ')) || /arbitrary/.test(note), `[${W}] ceremony note: "${note}"`);
    await shot('S01-ceremony');
    await page.locator('.h3-ceremony .qed-save button').click(); await page.waitForTimeout(900);
    s = await st();
    const saved = await page.evaluate(() => window.__lw.get().save.lemmas.map((l) => l.name));
    check(saved.includes('Double Flip'), `[${W}] saved from the ceremony: ${saved.join(', ')}`);
    await shot('S01-saved');
    await page.evaluate(() => window.__lw.clearCeremony()); await page.waitForTimeout(200); // cleared by another path
    check(await page.locator('.h3-ceremony:not([hidden])').count() === 0, `[${W}] clearCeremony() tears the layer down`);
    const before = (await st()).machines.length;
    await placeAt('4', sk.at.x - 9, sk.at.y + 4);
    check((await st()).machines.length === before + 1, `[${W}] the floor takes clicks and keys again right away`);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.keyboard.press('t'); await page.waitForTimeout(300);
    const tex = await page.evaluate(async () => { const m = await import('/src/hud/proof.ts'); void m; return document.querySelector('.h3-transcript')?.textContent ?? ''; });
    check(!/lemma:|power\./.test(tex), `[${W}] transcript cites names, not ids`);
    await page.keyboard.press('t');

    // ── B01: power stacks, nested brackets, Literal Power preview, ∀ notes
    await page.evaluate(() => window.__lw.openLevel('B01')); await page.waitForTimeout(400);
    await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    s = await st();
    sk = s.machines.find((m) => m.kind === 'socket');
    const giv = s.machines.find((m) => m.kind === 'given');
    await fit(sk, [[-21, -4], [-21, 2], [-1, 2]]);
    const tw = await placeAt('6', sk.at.x - 21, sk.at.y - 4);
    await page.locator('.h3-lens .h3-seg', { hasText: 'ℤ' }).click(); await page.waitForTimeout(200);
    await page.locator('.h3-lens .h3-tname').fill('k'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    const head = await page.locator('.h3-lens .h3-lens-sub').innerText().catch(() => '');
    check(/Let k1 ∈ ℤ|Let k₁ ∈ ℤ/.test(head.replace(/\s+/g, ' ')), `[${W}] Tower header from its sort: "${head.replace(/\n/g, ' ')}"`);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    const y = sk.at.y + 2;
    const s2 = await placeAt('1', sk.at.x - 21, y); await page.keyboard.press('Escape');
    await openLens(s2); await typeKnob('.h3-lens .h3-knob .h3-term', '(ab)^(5k_1)'); await page.keyboard.press('Escape');
    const mu = await placeAt('2', sk.at.x - 17, y); await pick('schema:power.multiply');
    const li = await placeAt('2', sk.at.x - 13, y); await pick('schema:power.literal');
    const hh = await placeAt('2', sk.at.x - 9, y); await pick('given:h');
    const id = await placeAt('2', sk.at.x - 5, y); await pick('schema:power.identity');
    const f2 = await placeAt('7', sk.at.x - 2, y - 3); await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.evaluate(() => window.__lw.setPlaying(false));
    for (const [a, b] of [[s2, mu], [mu, li], [li, hh], [hh, id], [id, f2]]) await drag(await port(a, 'out'), await port(b, 'q'));
    await drag(await port(f2, 'out'), await port(sk.id, 'q'));
    await openLens(mu);
    await page.locator('.h3-lens .h3-seg', { hasText: 'R → L' }).click(); await page.waitForTimeout(250);
    for (const [nmx, v] of [['m', '5'], ['n', 'k_1']]) { const k = page.locator('.h3-lens .h3-intknob').filter({ hasText: `${nmx} :=` }).locator('.h3-term'); if (await k.count()) { await k.fill(v); await k.press('Enter'); await page.waitForTimeout(250); } }
    await openLens(li);
    const brs = await page.locator('.h3-lens .h3-twin .h3-br').count();
    const flash = await page.locator('.h3-lens .h3-after .h3-flash').count();
    check(brs >= 1 && flash === 10, `[${W}] Literal Power: ${brs} bracket(s) inside the power base; ${flash} highlighted beads after`);
    await shot('B01-literal');
    await openLens(hh);
    const hbrs = await page.locator('.h3-lens .h3-twin .h3-br').count();
    check(hbrs >= 1, `[${W}] h's bracket inside the power base is drawn (${hbrs})`);
    await page.evaluate(() => window.__lw.setPlaying(true));
    check(await deliveredWait(), `[${W}] B01 delivered`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300); await page.keyboard.press('Escape');
    await openLens(f2);
    const bt = await lensText();
    check(/Generalized/.test(bt) && /Can’t save globally/.test(bt) && !/Nothing to generalize/.test(bt), `[${W}] B01 ∀: ${bt.split('\n').filter((l) => /eneraliz|save|Nothing/i.test(l)).join(' / ')}`);
    await shot('B01-forall');
    console.log(`[${W}x${H}] page errors:`, errors.length ? errors.slice(0, 6).join('\n  ') : 'none');
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(fail.length ? `${fail.length} FAILED` : 'all checks passed');
}

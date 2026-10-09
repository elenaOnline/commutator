// LEMMA WORKS v3 — HUD v4 (recipes, towers, ∀, Lemma Book, concept cards), REAL pointer/keyboard input (HEADLESS ONLY).
// `__lw` is used only to read state, to open a level, and to seed a save; never to build.
// Usage: node src/hud/pw-hud-v41.mjs [width height]   (server: npx vite --port 8823 --strictPort)
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
    const shot = (n) => page.screenshot({ path: `${SHOTS}v41-hud-${n}-${W}x${H}.png` });
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

    await boot(null);
    // ── 1. every concept card of every level renders all its declared figures
    const report = await page.evaluate(async () => {
      const { CARDS } = await import('/src/levels/cards.ts');
      const st = window.__lw; const bad = []; let n = 0, figs = 0;
      for (const [id, cs] of Object.entries(CARDS)) {
        if (!(await import('/src/levels/levels.ts')).LEVEL_BY_ID[id]) continue;
        st.openLevel(id);
        for (let i = 0; i < cs.length; i++) {
          st.openCards(i); await new Promise((r) => requestAnimationFrame(r));
          const want = (cs[i].figures ?? (cs[i].figure ? [cs[i].figure] : [])).length;
          const got = document.querySelectorAll('.h3-cards .cf-figure').length;
          n++; figs += got;
          if (got !== want) bad.push(`${id}#${i + 1} ${got}/${want}`);
          if (/\*/.test(document.querySelector('.h3-cards .cf-body')?.textContent ?? '')) bad.push(`${id}#${i + 1} leaked *`);
        }
      }
      st.closeCards();
      return { n, figs, bad };
    });
    check(report.bad.length === 0, `[${W}] ${report.n} cards, ${report.figs} figures rendered${report.bad.length ? ' · missing: ' + report.bad.join(', ') : ''}`);
    for (const [lv, page_] of [['L01', 0], ['L01', 2], ['T01', 0], ['S01', 0], ['B01', 0]]) {
      await page.evaluate(([l, p]) => { window.__lw.openLevel(l); window.__lw.openCards(p); }, [lv, page_]);
      await page.waitForTimeout(lv === 'L01' && page_ === 2 ? 2600 : 400);
      await shot(`card-${lv}-${page_ + 1}`);
    }
    await page.keyboard.press('Escape');
    // ── 2. picker rows show before → after strips; Operator has no boilerplate
    await page.evaluate(() => window.__lw.openLevel('L01')); await page.waitForTimeout(300);
    await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    let s = await st();
    const sp = s.machines.find((m) => m.kind === 'spool'), sk = s.machines.find((m) => m.kind === 'socket');
    await placeAt('2', Math.round((sp.at.x + sk.at.x) / 2), sp.at.y);
    await page.waitForTimeout(250);
    const demos = await page.locator('.h3-lens .h3-prow .h3-prow-demo').count();
    const tints = await page.locator('.h3-lens .h3-prow .h3-tint').count();
    check(demos >= 5 && tints >= 5, `[${W}] picker strips: ${demos} rows with a strip, ${tints} tinted beads`);
    await shot('picker-strips');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await placeAt('3', Math.round((sp.at.x + sk.at.x) / 2), sp.at.y + 3);
    await page.waitForTimeout(250);
    const opText = await page.locator('.h3-lens').innerText().catch(() => '');
    check(!/L = R ⇒|L=R⇒/.test(opText) && (await page.locator('.h3-lens .h3-prow-demo').count()) === 4, `[${W}] Operator: 4 strips, no "L = R ⇒"`);
    await shot('operator-picker');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    // ── 3. solid variables and live subscripts (S01: Tower x, Spool typed "x1^-1")
    await page.evaluate(() => window.__lw.openLevel('S01')); await page.waitForTimeout(300);
    await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    s = await st();
    const sk2 = s.machines.find((m) => m.kind === 'socket');
    for (let i = 0; i < 12; i++) { const a = await tile(sk2.at.x - 10, sk2.at.y - 3); if (a.x > 70 && a.y > 170) break; await page.mouse.move(W / 2, H / 2); await page.mouse.wheel(0, 220); await page.waitForTimeout(100); }
    const tw = await placeAt('6', sk2.at.x - 10, sk2.at.y - 3);
    const lab = (await st()).machines.find((m) => m.id === tw)?.cfg.label;
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    const sp2 = await placeAt('1', sk2.at.x - 10, sk2.at.y); await page.keyboard.press('Escape');
    const c2 = await mc(sp2); await page.mouse.click(c2.x, c2.y); await page.waitForTimeout(250);
    const inp = page.locator('.h3-lens .h3-knob .h3-term').first();
    const base = (lab ?? 'x').replace(/[₀-₉]/g, '');
    const sub = (lab ?? '').slice(base.length) ? '1' : '';
    await inp.click(); await page.keyboard.type(`${base}${sub}^-1`, { delay: 30 });
    const typed = await inp.inputValue();
    check(typed === `${lab}⁻¹`, `[${W}] typed "${base}${sub}^-1" shows "${typed}" (Tower ${lab})`);
    await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    const chip = await page.evaluate(() => { const c = document.querySelector('.h3-lens .h3-chip.h3-var'); const b = document.querySelector('.h3-lens .h3-varbead:not(.bn-inv) .bn-shape path'); return { chip: c ? getComputedStyle(c).backgroundImage : 'none?', fill: b ? getComputedStyle(b).fill : '' }; });
    check(chip.chip === 'none' && /rgb\(234, 228, 251\)/.test(chip.fill), `[${W}] variables are solid: chip bg-image ${chip.chip}, bead fill ${chip.fill}`);
    await shot('vars-solid');
    console.log(`[${W}x${H}] page errors:`, errors.length ? errors.slice(0, 6).join('\n  ') : 'none');
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(fail.length ? `${fail.length} FAILED` : 'all checks passed');
}

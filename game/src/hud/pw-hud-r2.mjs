// LEMMA WORKS v3 — HUD fix round r2, REAL pointer/keyboard input (HEADLESS ONLY).
// `__lw` is used only to read state, to open a level, and to seed a save; never to build.
// Usage: node src/hud/pw-hud-r2.mjs [width height]   (server: npx vite --port 8823 --strictPort)
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
    const shot = (n) => page.screenshot({ path: `${SHOTS}v3-hud-r2-${n}-${W}x${H}.png` });
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
    const boot = async (save) => { await page.goto(BASE); await seed(save); await page.reload(); await page.waitForSelector('.fl-m'); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400); };

    // ── A. L01 with real pointer: hint → place → back to Select → two drags → deliver → follow
    await boot(null);
    let s = await st();
    const spool = s.machines.find((m) => m.kind === 'spool'), sock = s.machines.find((m) => m.kind === 'socket');
    const canc = await placeAt('2', Math.round((spool.at.x + sock.at.x) / 2), spool.at.y);
    s = await st();
    check(!!canc, `[${W}] canceller placed by pointer`);
    check(s.tool.k === 'select', `[${W}] L01 returns to Select after the first placement (tool=${s.tool.k})`);
    await drag(await port(spool.id, 'out'), await port(canc, 'q'));
    await drag(await port(canc, 'out'), await port(sock.id, 'q'));
    s = await st();
    check(s.belts.length === 2, `[${W}] two belts by drag: ${s.belts.join(', ')}`);
    await page.locator('.h3-tog', { hasText: 'Lab' }).click(); await page.locator('.h3-tog', { hasText: 'Lab' }).click(); // run cluster stays live
    let solved = false;
    for (let i = 0; i < 40 && !solved; i++) { await page.waitForTimeout(150); solved = Object.keys((await st()).delivered).length > 0; }
    check(solved, `[${W}] L01 delivered`);
    await page.waitForTimeout(3600);
    await page.locator('.h3-ceremony button', { hasText: 'Follow it on the floor' }).click();
    await page.waitForTimeout(400);
    check((await st()).follow === 's', `[${W}] follow mode from the ceremony`);
    await shot('L01-follow');
    await page.keyboard.press('Escape');
    check((await st()).follow === null, `[${W}] Esc leaves follow mode`);
    // status headline: click the machine, read the lens
    await page.mouse.click((await mc(canc)).x, (await mc(canc)).y);
    await page.waitForTimeout(250);
    const status = await page.locator('.h3-lens .h3-status').innerText().catch(() => '');
    check(/working|delivered/.test(status) && !/starved/.test(status), `[${W}] delivering Canceller headline "${status.replace(/\n/g, ' ')}"`);
    await shot('L01-lens-status');
    await page.keyboard.press('Escape');

    // ── B. L06 Witness: premise rails with split handles; one result on hover; click cuts
    const solvedTo = (ids) => Object.fromEntries(ids.map((id) => [id, { canvas: undefined, solvedAt: 1, history: [] }]));
    await boot({ version: 3, levels: solvedTo(['L01', 'L02', 'L03', 'L05']), earned: ['witness', 'cancel'], settings: { speed: 1, reducedMotion: false } });
    await page.evaluate(() => window.__lw.openLevel('L06'));
    await page.waitForTimeout(400);
    s = await st();
    const names = await page.locator('.h3-earned .h3-name').allInnerTexts();
    check(names.join(',') === 'Witness,Lathe', `[${W}] earned slots ${names.join(',')}`);
    const allVisible = await page.locator('.h3-all').isVisible();
    check(allVisible, `[${W}] All always reachable`);
    const sk = s.machines.find((m) => m.kind === 'socket');
    const y0 = sk.at.y;
    // zoom out with the wheel until the build row (13 tiles west of the dock) is on screen
    for (let i = 0; i < 12; i++) {
      const p = await tile(sk.at.x - 13, y0);
      if (p.x > 60 && p.y > 120 && p.y < H - 120) break;
      await page.mouse.move(W / 2, H / 2); await page.mouse.wheel(0, 240); await page.waitForTimeout(120);
    }
    const sp = await placeAt('1', sk.at.x - 13, y0);
    await page.keyboard.press('Escape');
    await page.mouse.click((await mc(sp)).x, (await mc(sp)).y);
    await page.waitForTimeout(200);
    await page.locator('.h3-lens .h3-term').first().fill('abb^-1a^-1');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    await page.keyboard.press('Escape');
    const c1 = await placeAt('2', sk.at.x - 10, y0);
    const c2 = await placeAt('2', sk.at.x - 7, y0);
    const ws = await placeAt('stamp:witness', sk.at.x - 4, y0);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await drag(await port(sp, 'out'), await port(c1, 'q'));
    await drag(await port(c1, 'out'), await port(c2, 'q'));
    await drag(await port(c2, 'out'), await port(ws, 'p0'));
    s = await st();
    check(s.machines.find((m) => m.id === ws)?.cfg.schema === 'witness', `[${W}] Witness slot placed a Witness Stamp`);
    await page.mouse.click((await mc(ws)).x, (await mc(ws)).y);
    await page.waitForTimeout(300);
    const nh = await page.locator('.h3-lens .h3-handle').count();
    const listText = await page.locator('.h3-lens').innerText();
    check(nh >= 2, `[${W}] Witness premise shows ${nh} split handles`);
    check(!/\(u = /.test(listText) && (await page.locator('.h3-lens .h3-choice').count()) === 0, `[${W}] no list of conclusions in the lens`);
    await shot('L06-witness-lens');
    const other = page.locator('.h3-lens .h3-handle:not(.chosen)').last();
    await other.hover();
    await page.waitForTimeout(150);
    const prev = await page.locator('.h3-lens .h3-preview').innerText();
    check(prev.includes('→'), `[${W}] hover previews one result: "${prev.replace(/\n/g, ' ')}"`);
    await shot('L06-witness-hover');
    const before = (await st()).machines.find((m) => m.id === ws).cfg.choice;
    await other.click();
    await page.waitForTimeout(250);
    const after = (await st()).machines.find((m) => m.id === ws).cfg.choice;
    check(after !== before, `[${W}] clicking a handle cuts there (choice ${before} → ${after})`);
    await shot('L06-witness-cut');
    await page.keyboard.press('Escape');

    // ── C. L02: Apply with a routed law card → premises auto-size, x knob appears
    await boot(null);
    await page.evaluate(() => window.__lw.openLevel('L02'));
    await page.waitForTimeout(400);
    s = await st();
    const giv = s.machines.find((m) => m.kind === 'given');
    const sk2 = s.machines.find((m) => m.kind === 'socket');
    const ap = await placeAt('9', Math.round((giv.at.x + sk2.at.x) / 2), sk2.at.y + 2);
    await page.keyboard.press('Escape');
    await drag(await port(giv.id, 'out'), await port(ap, 'rule'));
    await page.waitForTimeout(300);
    s = await st();
    const apc = s.machines.find((m) => m.id === ap).cfg;
    check(apc.premises === 0, `[${W}] Apply auto-sized to the law card (premises=${apc.premises})`);
    await page.mouse.click((await mc(ap)).x, (await mc(ap)).y);
    await page.waitForTimeout(250);
    const knob = page.locator('.h3-lens .h3-knob .h3-term');
    check(await knob.count() === 1, `[${W}] the law's x has a knob`);
    if (await knob.count()) { await knob.fill('e'); await page.keyboard.press('Enter'); await page.waitForTimeout(200); }
    const out = await page.locator('.h3-lens .h3-out').innerText().catch(() => '');
    check(/e′/.test(out), `[${W}] Apply emits the instance: "${out.replace(/\n/g, ' ')}"`);
    await shot('L02-apply-law');
    // a HUD-originated refusal toasts outside the lens, once
    console.log(`[${W}x${H}] page errors:`, errors.length ? errors.slice(0, 6).join('\n  ') : 'none');
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(fail.length ? `${fail.length} FAILED` : 'all checks passed');
}

// LEMMA WORKS v3 floor — headless Playwright driver (HEADLESS ONLY; never a visible window).
// Usage: node src/floor/pw-floor.mjs <cmd>   with the dev server on :8822 (npx vite --port 8822 --strictPort)
//   shots   — screenshot every harness scene to .shots/v3-floor-*.png
//   play    — real-pointer First Light: place → connect → deliver, measuring input → present latency
//   perf    — frame timing on the perf scene (40 machines, 30+ belts, 60+ packets)
import { chromium } from 'playwright';

const BASE = process.env.FLOOR_URL ?? 'http://localhost:8822';
const SHOTS = new URL('../../.shots/', import.meta.url).pathname;
const W = 1440, H = 900;

export async function open(path, { reduced = false } = {}) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + path);
  await page.waitForSelector('.fl-root .fl-m', { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return { browser, page, errors };
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}v3-floor-${name}.png` });

/** Screen centre of a machine / port / belt in the page. */
export async function centerOf(page, css) {
  const b = await page.locator(css).first().boundingBox();
  if (!b) throw new Error(`no box for ${css}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
const portSel = (m, p) => `.fl-p-hit[data-p="${m}|${p}"] circle`;

async function shots() {
  for (const [name, q] of [['l01', 'l01'], ['l01-solved', 'l01-solved'], ['showcase', 'showcase'], ['perf', 'perf']]) {
    const { browser, page, errors } = await open(`/src/floor/dev.html?scene=${q}&shot=1`);
    await page.waitForTimeout(name === 'l01-solved' ? 2600 : 1200);
    await shot(page, name);
    if (name === 'showcase') {
      await page.evaluate(() => window.__lw.toggleAlt(true));
      await page.waitForTimeout(200);
      await shot(page, 'showcase-alt');
      await page.evaluate(() => window.__lw.toggleAlt(false));
      // hover the first jammed machine for its reason
      const jam = await page.$('.fl-pip-jammed');
      if (jam) {
        const id = await jam.getAttribute('data-pip');
        const c = await centerOf(page, `.fl-m[data-m="${id}"]`);
        await page.mouse.move(c.x, c.y);
        await page.waitForTimeout(400);
        await shot(page, 'showcase-jam-hover');
      }
    }
    if (errors.length) console.log(name, 'errors:', errors.slice(0, 5));
    await browser.close();
  }
}

async function play() {
  const { browser, page, errors } = await open('/src/floor/dev.html?scene=l01&shot=1');
  const t0 = Date.now();
  const ids = await page.evaluate(() => { const c = window.__lw.get().canvas; return { spool: c.machines.find((m) => m.kind === 'spool').id, sock: c.machines.find((m) => m.kind === 'socket').id }; });
  await shot(page, 'play-0-open');
  // 1. arm the canceller and hover between spool and dock
  await page.evaluate(() => window.__lw.setTool({ k: 'place', kind: 'canceller' }));
  const a = await centerOf(page, `.fl-m[data-m="${ids.spool}"]`), b = await centerOf(page, `.fl-m[data-m="${ids.sock}"]`);
  const mid = { x: a.x + (b.x - a.x) * 0.45, y: a.y + (b.y - a.y) * 0.45 };
  await page.mouse.move(mid.x - 40, mid.y - 10, { steps: 4 });
  await page.mouse.move(mid.x, mid.y, { steps: 6 });
  await page.waitForTimeout(250);
  await shot(page, 'play-1-ghost');
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__lw.setTool({ k: 'select' }));
  const canc = await page.evaluate(() => window.__lw.get().canvas.machines.find((m) => m.kind === 'canceller')?.id);
  if (!canc) throw new Error('canceller not placed');
  // 2. drag spool.out → canceller.q
  const so = await centerOf(page, portSel(ids.spool, 'out'));
  const cq = await centerOf(page, portSel(canc, 'q'));
  await page.mouse.move(so.x, so.y); await page.mouse.down();
  await page.mouse.move((so.x + cq.x) / 2, (so.y + cq.y) / 2 + 10, { steps: 6 });
  await page.mouse.move(cq.x + 6, cq.y + 4, { steps: 6 });
  await page.waitForTimeout(120);
  await shot(page, 'play-2-drag');
  await page.mouse.up();
  await page.waitForTimeout(200);
  // 3. click-click canceller.out → socket.q
  const co = await centerOf(page, portSel(canc, 'out'));
  const sq = await centerOf(page, portSel(ids.sock, 'q'));
  await page.mouse.click(co.x, co.y);
  await page.mouse.move(sq.x - 30, sq.y, { steps: 6 });
  await page.mouse.move(sq.x, sq.y, { steps: 3 });
  await page.waitForTimeout(100);
  await shot(page, 'play-3-clickclick');
  await page.mouse.click(sq.x, sq.y);
  // 4. watch it flow and deliver
  await page.mouse.move(40, 40);
  let delivered = false;
  for (let i = 0; i < 60 && !delivered; i++) {
    await page.waitForTimeout(150);
    delivered = await page.evaluate(() => Object.keys(window.__lw.get().run.delivered).length > 0);
    if (i === 4) await shot(page, 'play-4-flow');
  }
  await page.waitForTimeout(500);
  await shot(page, 'play-5-delivered');
  const perf = await page.evaluate(() => window.__floorPerf.samples);
  const belts = await page.evaluate(() => window.__lw.get().canvas.belts.length);
  console.log(JSON.stringify({ delivered, belts, seconds: (Date.now() - t0) / 1000, perf, errors }, null, 1));
  await browser.close();
}

async function perf() {
  const { browser, page, errors } = await open('/src/floor/dev.html?scene=perf&shot=1');
  const counts = await page.evaluate(() => { const s = window.__lw.get(); return { machines: s.canvas.machines.length, belts: s.canvas.belts.length }; });
  await page.waitForTimeout(800);
  // measure real frame intervals for 3 s while packets move, then during a pan
  const res = await page.evaluate(async () => {
    const measure = (ms) => new Promise((res) => { const ts = []; const t0 = performance.now(); const f = (t) => { ts.push(t); if (t - t0 < ms) requestAnimationFrame(f); else res(ts); }; requestAnimationFrame(f); });
    const pk = () => document.querySelectorAll('.fl-pk').length;
    const ts = await measure(3000);
    const d = ts.slice(1).map((t, i) => t - ts[i]); d.sort((a, b) => a - b);
    const work = window.__floorPerf.frames.slice(-150).sort((a, b) => a - b);
    return { packets: pk(), frames: d.length, fps: Math.round(1000 / (d.reduce((a, b) => a + b, 0) / d.length)), p50: d[Math.floor(d.length / 2)], p95: d[Math.floor(d.length * 0.95)], max: d[d.length - 1], loopWorkP50: work[Math.floor(work.length / 2)], loopWorkP95: work[Math.floor(work.length * 0.95)] };
  });
  await shot(page, 'perf-live');
  // input → present for a place on the busy floor
  await page.evaluate(() => window.__lw.setTool({ k: 'place', kind: 'meet' }));
  await page.mouse.move(1150, 160, { steps: 3 }); await page.waitForTimeout(100);
  await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(200);
  await page.evaluate(() => window.__lw.setTool({ k: 'select' }));
  const samples = await page.evaluate(() => window.__floorPerf.samples);
  console.log(JSON.stringify({ counts, ...res, samples, errors }, null, 1));
  await browser.close();
}

async function interact() {
  const { browser, page, errors } = await open('/src/floor/dev.html?scene=l01-solved&shot=1');
  const st = () => page.evaluate(() => { const s = window.__lw.get(); return { machines: s.canvas.machines.map((m) => `${m.kind}@${m.at.x},${m.at.y}r${m.rot}`), belts: s.canvas.belts.length, rooms: s.canvas.rooms.map((r) => JSON.stringify(r.rect)), sel: s.ui.selection, tool: s.ui.tool, lens: s.ui.lens, cam: s.ui.camera, alt: s.ui.alt }; });
  const log = async (label) => console.log(label.padEnd(16), JSON.stringify(await st()));
  await page.waitForTimeout(600);
  await log('start');
  const canc = await page.evaluate(() => window.__lw.get().canvas.machines.find((m) => m.kind === 'canceller').id);
  const cc = await centerOf(page, `.fl-m[data-m="${canc}"]`);
  // click → select + lens
  await page.mouse.click(cc.x, cc.y); await page.waitForTimeout(100); await log('click canceller');
  // drag move by ~2 tiles down-right
  await page.mouse.move(cc.x, cc.y); await page.mouse.down();
  await page.mouse.move(cc.x + 40, cc.y + 60, { steps: 8 }); await page.waitForTimeout(80);
  await shot(page, 'i-move');
  await page.mouse.up(); await page.waitForTimeout(150); await log('moved');
  // hover + R rotate, Q pipette
  const c2 = await centerOf(page, `.fl-m[data-m="${canc}"]`);
  await page.mouse.move(c2.x, c2.y); await page.waitForTimeout(60);
  await page.keyboard.press('r'); await page.waitForTimeout(120); await log('R rotate');
  await page.keyboard.press('q'); await page.waitForTimeout(80); await log('Q pipette');
  await page.mouse.move(c2.x - 260, c2.y + 120, { steps: 5 }); await page.waitForTimeout(120);
  await shot(page, 'i-pipette-ghost');
  await page.mouse.click(c2.x - 260, c2.y + 120); await page.waitForTimeout(120); await log('placed copy');
  await page.mouse.click(10, 10, { button: 'right' }); await log('right-click');
  // branch: drag off the spool belt into the new canceller's input
  const newc = await page.evaluate(() => window.__lw.get().canvas.machines.filter((m) => m.kind === 'canceller').at(-1).id);
  const belt0 = await page.evaluate(() => window.__lw.get().canvas.belts[0].id);
  const bp = await centerOf(page, `.fl-b[data-b="${belt0}"] .fl-hit`);
  const nq = await centerOf(page, `.fl-p-hit[data-p="${newc}|q"] circle`);
  await page.mouse.move(bp.x, bp.y); await page.mouse.down();
  await page.mouse.move((bp.x + nq.x) / 2, (bp.y + nq.y) / 2, { steps: 6 }); await page.mouse.move(nq.x, nq.y, { steps: 6 }); await page.waitForTimeout(80);
  await shot(page, 'i-branch');
  await page.mouse.up(); await page.waitForTimeout(150); await log('branched');
  // box select everything in a band
  await page.mouse.move(300, 250); await page.mouse.down(); await page.mouse.move(1300, 760, { steps: 8 });
  await shot(page, 'i-box');
  await page.mouse.up(); await log('box');
  await page.mouse.click(1380, 120); await log('click empty');
  // room: spec from the tool, drag a rectangle, then resize via a handle
  await page.evaluate(() => window.__lw.setTool({ k: 'room', kind: 'suppose', l: { k: 'atom', id: 'a' }, r: { k: 'atom', id: 'b' } }));
  await page.mouse.move(700, 820); await page.mouse.down(); await page.mouse.move(980, 960, { steps: 8 }); await page.mouse.move(1100, 900, { steps: 4 });
  await page.waitForTimeout(80); await shot(page, 'i-room-paint');
  await page.mouse.up(); await page.waitForTimeout(150); await log('room');
  await page.evaluate(() => window.__lw.setTool({ k: 'select' }));
  const room = await page.evaluate(() => window.__lw.get().canvas.rooms[0]?.id);
  if (room) {
    await page.evaluate((id) => window.__lw.select([id]), room);
    await page.waitForTimeout(80);
    const h = await centerOf(page, `.fl-rh[data-rh="${room}|e"] circle`);
    await page.mouse.move(h.x, h.y); await page.mouse.down(); await page.mouse.move(h.x + 90, h.y + 45, { steps: 6 });
    await shot(page, 'i-room-resize');
    await page.mouse.up(); await page.waitForTimeout(120); await log('resized');
  }
  // pan with space-drag, zoom with wheel, F to fit, Alt hold
  await page.mouse.move(720, 450); await page.keyboard.down(' '); await page.mouse.down(); await page.mouse.move(620, 380, { steps: 5 }); await page.mouse.up(); await page.keyboard.up(' ');
  await page.waitForTimeout(60); await log('space-pan');
  await page.mouse.wheel(0, -240); await page.waitForTimeout(80); await log('wheel zoom');
  await page.keyboard.press('f'); await page.waitForTimeout(80); await log('F fit');
  await page.keyboard.down('Alt'); await page.waitForTimeout(400); await log('alt held'); await shot(page, 'i-alt');
  await page.keyboard.up('Alt'); await log('alt released');
  await page.keyboard.down('Alt'); await page.keyboard.up('Alt'); await log('alt tapped');
  // delete selection
  await page.evaluate((id) => window.__lw.select([id]), newc); await page.mouse.move(1380, 120);
  await page.keyboard.press('Delete'); await page.waitForTimeout(100); await log('delete');
  console.log('perf', JSON.stringify(await page.evaluate(() => window.__floorPerf.samples)));
  console.log('errors', errors);
  await browser.close();
}

/** v3 fix round r2: one check per fix, real pointer where the fix is about a gesture. */
async function r2() {
  const out = {};
  for (const [W2, H2] of [[1440, 900], [1280, 800]]) {
    const tag = `${W2}`;
    const browser = await chromium.launch({ headless: true });
    const page = await (await browser.newContext({ viewport: { width: W2, height: H2 }, deviceScaleFactor: 2 })).newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    const go = async (scene) => { await page.goto(`${BASE}/src/floor/dev.html?scene=${scene}&shot=1`); await page.waitForSelector('.fl-root .fl-m'); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(500); };
    const r = {};
    // 1. earned-theorem slot places the right schema (pointer click on the floor)
    await go('l01');
    await page.evaluate(() => window.__lw.openLevel('L07'));
    await page.waitForTimeout(300);
    for (const [schema, mirror] of [['cancel', false], ['cancel', true], ['witness', true]]) {
      await page.evaluate(([schema, mirror]) => window.__lw.setTool({ k: 'place', kind: 'stamp', schema, mirror }), [schema, mirror]);
      const y = 120 + Object.keys(r).length * 0;
      const x = schema === 'cancel' && !mirror ? W2 * 0.5 : schema === 'cancel' ? W2 * 0.62 : W2 * 0.38;
      await page.mouse.move(x - 30, H2 * 0.75 - 20); await page.mouse.move(x, H2 * 0.75, { steps: 4 }); await page.mouse.click(x, H2 * 0.75);
      await page.waitForTimeout(120);
      void y;
    }
    r.stamps = await page.evaluate(() => window.__lw.get().canvas.machines.filter((m) => m.kind === 'stamp').map((m) => `${m.config.schema}${m.config.mirror ? 'ᵒᵖ' : ''}`));
    await page.screenshot({ path: `${SHOTS}v3-floor-r2-stamps-${tag}.png` });
    // 2. L01: place → tool returns to Select; ghost quiet over the new footprint; drag from an output ALWAYS belts (even armed)
    await go('l01');
    const ids = await page.evaluate(() => { const c = window.__lw.get().canvas; return { spool: c.machines.find((m) => m.kind === 'spool').id, sock: c.machines.find((m) => m.kind === 'socket').id }; });
    const a = await centerOf(page, `.fl-m[data-m="${ids.spool}"]`), b = await centerOf(page, `.fl-m[data-m="${ids.sock}"]`);
    await page.evaluate(() => window.__lw.setTool({ k: 'place', kind: 'canceller' }));
    const mid = { x: a.x + (b.x - a.x) * 0.45, y: a.y + (b.y - a.y) * 0.45 };
    await page.mouse.move(mid.x, mid.y, { steps: 5 }); await page.mouse.click(mid.x, mid.y); await page.waitForTimeout(150);
    r.toolAfterFirstPlace = await page.evaluate(() => window.__lw.get().ui.tool.k);
    await page.evaluate(() => window.__lw.setTool({ k: 'place', kind: 'popper' })); // re-arm on purpose
    await page.mouse.move(mid.x + 2, mid.y + 1); await page.waitForTimeout(100);
    r.ghostOverNewFootprint = await page.evaluate(() => document.querySelector('.fl-l-ghost').innerHTML.length);
    const canc = await page.evaluate(() => window.__lw.get().canvas.machines.find((m) => m.kind === 'canceller').id);
    const so = await centerOf(page, `.fl-p-hit[data-p="${ids.spool}|out"] circle`), cq = await centerOf(page, `.fl-p-hit[data-p="${canc}|q"] circle`);
    await page.mouse.move(so.x, so.y); await page.mouse.down(); await page.mouse.move(cq.x, cq.y, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(150);
    r.beltWhilePlaceArmed = await page.evaluate(() => window.__lw.get().canvas.belts.length);
    r.machinesAfterArmedDrag = await page.evaluate(() => window.__lw.get().canvas.machines.length);
    // 3. forgiving belts: broken (placement cuts), direct coupling, crossing bridge
    await go('l01-solved');
    await page.waitForTimeout(400);
    const sock = await page.evaluate(() => window.__lw.get().canvas.machines.find((m) => m.kind === 'socket'));
    await page.evaluate((s) => window.__lw.setTool({ k: 'place', kind: 'hopper' }), sock);
    // hover the ghost: it must preview the cut
    const before = await page.evaluate((s) => { const sp = window.__lw.get(); return { x: s.at.x - 1, y: s.at.y }; }, sock);
    const cell = await page.evaluate(({ x, y }) => { const el = document.querySelector('.fl-root'); const r = el.getBoundingClientRect(); const cam = window.__lw.get().ui.camera; const sx = (x + 0.5 - (y + 0.5)) * 42, sy = (x + 0.5 + y + 0.5) * 21; return { x: r.left + r.width / 2 + (sx - cam.x) * cam.zoom, y: r.top + r.height / 2 + (sy - cam.y) * cam.zoom }; }, before);
    await page.mouse.move(cell.x - 20, cell.y); await page.mouse.move(cell.x, cell.y, { steps: 3 }); await page.waitForTimeout(150);
    await page.screenshot({ path: `${SHOTS}v3-floor-r2-cut-preview-${tag}.png` });
    await page.mouse.click(cell.x, cell.y); await page.waitForTimeout(250);
    await page.evaluate(() => window.__lw.setTool({ k: 'select' }));
    r.broken = await page.evaluate(() => window.__lw.get().canvas.belts.filter((b) => b.broken).map((b) => b.broken));
    r.brokenDrawn = await page.evaluate(() => document.querySelectorAll('.fl-b.is-broken').length);
    const bb = await page.$('.fl-b.is-broken .fl-hit');
    if (bb) { const bx = await bb.boundingBox(); await page.mouse.move(bx.x + bx.width * 0.5, bx.y + bx.height * 0.5); await page.waitForTimeout(400); }
    await page.screenshot({ path: `${SHOTS}v3-floor-r2-broken-${tag}.png` });
    // direct coupling + crossing: built by store actions, checked in the DOM
    await go('l01');
    const built = await page.evaluate(() => {
      const s = window.__lw, c0 = s.get().canvas; const sp = c0.machines.find((m) => m.kind === 'spool'), so = c0.machines.find((m) => m.kind === 'socket');
      const c = s.place('canceller', { x: so.at.x - 2, y: so.at.y }, { rot: 0 });
      const cid = c.ok ? c.ids[0] : null;
      const r1 = cid && s.connect({ m: sp.id, port: 'out' }, { m: cid, port: 'q' });
      const r2 = cid && s.connect({ m: cid, port: 'out' }, { m: so.id, port: 'q' });
      const hx = sp.at.x + 5;
      const h = s.place('hopper', { x: hx, y: sp.at.y - 3 }, { rot: 1 });
      if (h.ok) s.configure(h.ids[0], { kind: 'hopper', t: { k: 'atom', id: 'a' } });
      const iv = s.place('inverter', { x: hx, y: sp.at.y + 3 }, { rot: 1 });
      const r3 = h.ok && iv.ok && s.connect({ m: h.ids[0], port: 'out' }, { m: iv.ids[0], port: 'q' });
      const belts = s.get().canvas.belts;
      return { direct: belts.filter((b) => b.path.length === 0).length, r1: r1 && r1.ok, r2: r2 && (r2.ok || r2.reason), r3: r3 && (r3.ok || r3.reason) };
    });
    await page.waitForTimeout(1200);
    r.directCross = { ...built, couplingsDrawn: await page.evaluate(() => document.querySelectorAll('.fl-b.is-direct').length), bridges: await page.evaluate(() => document.querySelectorAll('.fl-bridge').length) };
    await page.screenshot({ path: `${SHOTS}v3-floor-r2-direct-bridge-${tag}.png` });
    // 4. Alt labels every belt, at minimum readable size, on the busy showcase
    await go('showcase');
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__lw.toggleAlt(true)); await page.waitForTimeout(200);
    r.alt = await page.evaluate(() => {
      const s = window.__lw.get();
      const want = s.canvas.belts.filter((b) => !b.broken && s.compiled.machines[b.from.m]?.out).length;
      const got = document.querySelectorAll('.fl-altlab').length;
      const fs = [...document.querySelectorAll('.fl-altlab text')].map((t) => t.getBoundingClientRect().height);
      const names = [...document.querySelectorAll('.fl-l-labels .fl-sz-n text')].map((t) => t.getBoundingClientRect().height);
      return { want, got, minFormulaPx: Math.min(...fs).toFixed(1), minNamePx: names.length ? Math.min(...names).toFixed(1) : 'hidden', zoom: s.ui.camera.zoom.toFixed(2) };
    });
    await page.screenshot({ path: `${SHOTS}v3-floor-r2-alt-${tag}.png` });
    await page.evaluate(() => window.__lw.toggleAlt(false)); await page.waitForTimeout(150);
    // 6. packet flood: ≤ 2 drawn per belt, ×n at blocked outputs
    r.flood = await page.evaluate(() => {
      const per = {}; for (const p of window.__lw.get().run.packets) if (p.at.k === 'belt') per[p.at.belt] = (per[p.at.belt] ?? 0) + 1;
      return { maxPerBelt: Math.max(0, ...Object.values(per)), drawn: document.querySelectorAll('.fl-pk').length, queueChips: [...document.querySelectorAll('.fl-queue text')].map((t) => t.textContent) };
    });
    await page.screenshot({ path: `${SHOTS}v3-floor-r2-showcase-${tag}.png` });
    // 7. statements use powers like the chip (R01: a² = e)
    await page.evaluate(() => window.__lw.openLevel('R01')); await page.waitForTimeout(300);
    r.dockText = await page.evaluate(() => [...document.querySelectorAll('.fl-socklab text:last-child')].map((t) => t.textContent));
    r.errors = errors;
    out[tag] = r;
    await browser.close();
  }
  console.log(JSON.stringify(out, null, 1));
}

const cmd = process.argv[2] ?? 'shots';
await ({ shots, play, perf, interact, r2 }[cmd] ?? shots)();

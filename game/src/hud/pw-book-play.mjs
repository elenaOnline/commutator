// COMMUTATOR — The Book phase A playthrough (HEADLESS ONLY). Rebuilds the authors' reference floors for P4.6 (open
// dock), P4.s4 (witness dock), P4.12 (three Suppose rooms) and P4.9 (two Assume rooms) through the real store /
// editor API (paintRoom, place, connect: the same calls the floor makes), lets the factory run to ∎, and
// screenshots the filled chips, the ceremony with the proof on paper, and the floor.
// Usage: node src/hud/pw-book-play.mjs /tmp/canvases.json   (canvases dumped from the reference tests)
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.HUD_URL ?? 'http://localhost:8790/';
const SHOTS = new URL('../../.shots/book-play/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const CANVASES = JSON.parse(readFileSync(process.argv[2] ?? '/tmp/cm/canvases.json', 'utf8'));
const HMR_STUB = `export const createHotContext = () => ({ accept() {}, acceptExports() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {}, decline() {}, data: {} });
export const updateStyle = (id, css) => { let s = document.querySelector('style[data-vite-dev-id="' + id + '"]'); if (!s) { s = document.createElement('style'); s.setAttribute('data-vite-dev-id', id); document.head.appendChild(s); } s.textContent = css; };
export const removeStyle = (id) => document.querySelector('style[data-vite-dev-id="' + id + '"]')?.remove();
export const injectQuery = (u) => u; export class ErrorOverlay extends HTMLElement {}`;

const browser = await chromium.launch({ headless: true });
const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fail.push(what); };
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const shot = (n, clip) => page.screenshot({ path: `${SHOTS}${n}.png`, ...(clip ? { clip } : {}) });
  const crop = async (sel, n, pad = 10) => { const b = await page.locator(sel).first().boundingBox(); if (b) await shot(n, { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + 2 * pad, height: b.height + 2 * pad }); };
  await page.goto(BASE);
  // a Book save that has earned W2's theorems (cancellation, unique inverse, inverse of a product)
  await page.evaluate(() => {
    localStorage.clear();
    const camp = (earned) => ({ levels: {}, earned, lemmas: [] });
    localStorage.setItem('lemma-works/v3', JSON.stringify({ version: 5, campaign: 'book', campaigns: { main: camp([]), book: camp(['cancel', 'witness', 'socks']) }, settings: { speed: 4, reducedMotion: false } }));
  });
  await page.reload();
  await page.waitForSelector('.h3-hotbar');
  await page.evaluate(() => document.fonts.ready);

  /** Rebuild a reference canvas through the store: rooms (with their desks and gates), machines, belts. */
  const build = (id) => page.evaluate(([id, c]) => {
    const st = window.__lw;
    st.openLevel(id); st.closeCards(); st.resetLevel();
    const map = new Map();
    const log = [];
    // in the reference order: Towers before the rooms whose assumptions name their variables
    const paint = (r) => {
      const before = new Set(st.get().canvas.rooms.map((x) => x.id));
      const e = st.paintRoom(r.rect, r.kind, r.l, r.r, r.rel, r.assumes);
      if (!e.ok) { log.push(`room ${r.id}: ${e.reason}`); return; }
      const nr = st.get().canvas.rooms.find((x) => !before.has(x.id));
      map.set(r.id, nr.id);
      for (const m of st.get().canvas.machines) if (m.config.room === nr.id) map.set(`${m.kind}:${r.id}${m.config.slot ? `/${m.config.slot}` : ''}`, m.id);
    };
    for (const m of c.machines) {
      if (m.kind === 'desk' && !map.has(m.id)) { const r = c.rooms.find((x) => x.id === m.config.room); if (r && !map.has(r.id)) paint(r); }
      if (m.locked) { if (!map.has(m.id)) map.set(m.id, m.id); continue; }
      const before = new Set(st.get().canvas.machines.map((x) => x.id));
      const e = st.place(m.kind, m.at, { rot: m.rot, config: m.config });
      if (!e.ok) { log.push(`place ${m.id}: ${e.reason}`); continue; }
      map.set(m.id, st.get().canvas.machines.find((x) => !before.has(x.id)).id);
    }
    for (const b of c.belts) {
      if (!b.to) continue;
      const from = { m: map.get(b.from.m) ?? b.from.m, port: b.from.port }, to = { m: map.get(b.to.m) ?? b.to.m, port: b.to.port };
      const e = st.connect(from, to, b.path);
      if (!e.ok) { const e2 = st.connect(from, to); if (!e2.ok) log.push(`belt ${b.from.m}>${b.to.m}: ${e2.reason}`); }
    }
    st.setPlaying(true); st.setSpeed(4);
    return log;
  }, [id, CANVASES[id]]);
  const waitSolved = async () => { for (let i = 0; i < 160; i++) { if (await page.evaluate(() => !!window.__lw.get().ui.ceremony)) return true; await page.waitForTimeout(150); } return false; };
  const fitFloor = () => page.evaluate(() => { const s = window.__lw.get(); window.__lw.setCamera({ ...s.ui.camera, zoom: 0.62 }); });

  for (const id of ['P4.6', 'P4.s4', 'P4.12', 'P4.9']) {
    const log = await build(id);
    check(!log.length, `${id}: rebuilt through the store ${log.length ? JSON.stringify(log) : ''}`);
    check(await waitSolved(), `${id}: every dock delivered (∎)`);
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape'); // skip to the end state
    await page.waitForTimeout(500);
    const cer = await page.locator('.qed-card').innerText().catch(() => '');
    check(/Proof\./.test(cer), `${id}: the ceremony writes the proof on paper`);
    await shot(`${id}-1-ceremony`);
    await crop('.qed-card', `${id}-1b-ceremony-card`);
    await page.keyboard.press('Escape'); // keep refining
    await page.waitForTimeout(400);
    if (id === 'P4.6' || id === 'P4.s4') {
      const filled = await page.evaluate(() => ({ chip: document.querySelectorAll('.h3-order .m-hole.filled').length, floor: document.querySelectorAll('.fl-hole.is-filled').length, chipText: document.querySelector('.h3-order .h3-goal')?.textContent }));
      check(filled.chip > 0 && filled.floor > 0, `${id}: filled chips on the order chip and the dock (${JSON.stringify(filled)})`);
      await crop('.h3-order', `${id}-2-order-filled`);
      const lab = await page.locator('.fl-socklab').first().boundingBox();
      if (lab) await shot(`${id}-3-dock-filled`, { x: Math.max(0, lab.x - 160), y: Math.max(0, lab.y - 90), width: lab.width + 320, height: lab.height + 180 });
      const tex = await page.evaluate(async () => { const { adapt } = await import('/src/hud/transcript.ts'); const P = await import('/src/hud/proof.ts'); const U = await import('/src/hud/util.ts'); const s = window.__lw.get(); const { st } = adapt(s); return P.transcriptTeX(P.buildTranscript(st), st, U.dockAnswers(s)); });
      check(!/\?/.test(tex.split('\n').find((l) => l.startsWith('\\noindent')) ?? '?') && !/¤/.test(tex) && !/\{-1\}[a-z^{}0-9-]* \\in G/.test(tex), `${id}: LaTeX states the found answer: ${JSON.stringify((tex.split('\n').find((l) => l.startsWith('\\noindent')) ?? '').slice(0, 160))}`);
    }
    if (id === 'P4.12' || id === 'P4.9') {
      await fitFloor();
      await page.waitForTimeout(400);
      await shot(`${id}-2-floor`);
    }
    await page.keyboard.press('t');
    await page.waitForTimeout(200);
    await page.locator('.h3-transcript button', { hasText: 'On paper' }).click();
    await page.waitForTimeout(400);
    await crop('.h3-paper', `${id}-4-paper`);
    const paper = await page.locator('.h3-paper').innerText();
    check(!/¤|undefined|NaN/.test(paper), `${id}: paper reads cleanly`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('t');
    await page.waitForTimeout(200);
  }

  // the room lens: change P4.9's first Assume room to two assumptions through the desk's editor
  await page.evaluate(() => { const s = window.__lw.get(); const desk = s.canvas.machines.find((m) => m.kind === 'desk'); window.__lw.select([desk.id]); window.__lw.openLens(desk.id); });
  await page.waitForTimeout(500);
  const hasEditor = await page.locator('.h3-lens .h3-roomedit').count();
  check(hasEditor > 0, 'the desk lens has the assumptions editor');
  await crop('.h3-lens', 'P4.9-5-desk-lens');
  check(!errors.length, `no page errors ${errors.slice(0, 3).join(' | ')}`);
  await page.evaluate(() => localStorage.clear());
  await ctx.close();
} finally {
  await browser.close();
}
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall ok');
process.exit(fail.length ? 1 : 0);

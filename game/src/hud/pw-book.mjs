// COMMUTATOR — The Book phase A UI check (HEADLESS ONLY): campaign switch, Book map, a Book order chip with its
// method, the Paper view after solving L01 (proof panel → On paper), and the Book ceremony with the paper proof.
// `__lw` builds the one-machine solutions (this is a rendering check, not a hand-feel playtest).
// Usage: node src/hud/pw-book.mjs   (dev server at http://localhost:8790/, or HUD_URL=…)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.HUD_URL ?? 'http://localhost:8790/';
const SHOTS = new URL('../../.shots/book/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const HMR_STUB = `export const createHotContext = () => ({ accept() {}, acceptExports() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {}, decline() {}, data: {} });
export const updateStyle = (id, css) => { let s = document.querySelector('style[data-vite-dev-id="' + id + '"]'); if (!s) { s = document.createElement('style'); s.setAttribute('data-vite-dev-id', id); document.head.appendChild(s); } s.textContent = css; };
export const removeStyle = (id) => document.querySelector('style[data-vite-dev-id="' + id + '"]')?.remove();
export const injectQuery = (u) => u; export class ErrorOverlay extends HTMLElement {}`;

const browser = await chromium.launch({ headless: true });
const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fail.push(what); };
try {
  const W = 1440, H = 900;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const shot = (n, clip) => page.screenshot({ path: `${SHOTS}${n}.png`, ...(clip ? { clip } : {}) });
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.h3-hotbar');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  /** Solve an order whose dock wants the pre-placed Spool's term with one cancellation (L01, P3.1). */
  const solveByCancel = () => page.evaluate(async () => {
    const st = window.__lw;
    const s = st.get();
    const sp = s.canvas.machines.find((m) => m.kind === 'spool');
    const sock = s.canvas.machines.find((m) => m.kind === 'socket');
    const cfg = { kind: 'rewriter', recipe: { k: 'cancel' }, dir: 'fwd', target: { k: 'first' }, gap: { k: 'first' }, values: {}, tidy: true };
    let rw = null;
    for (const dx of [5, 6, 7, 4, 8]) for (const dy of [0, 2, -2, 4]) {
      if (rw) break;
      const before = new Set(st.get().canvas.machines.map((m) => m.id));
      const e = st.place('rewriter', { x: sp.at.x + dx, y: sp.at.y + dy }, { config: cfg });
      if (e.ok) rw = st.get().canvas.machines.find((m) => !before.has(m.id)).id;
    }
    if (!rw) return 'could not place';
    const a = st.connect({ m: sp.id, port: 'out' }, { m: rw, port: 'q' });
    const b = st.connect({ m: rw, port: 'out' }, { m: sock.id, port: 'q' });
    return a.ok && b.ok ? 'ok' : `${a.reason ?? ''} ${b.reason ?? ''}`;
  });
  const waitSolved = async () => { for (let i = 0; i < 80; i++) { if (await page.evaluate(() => !!window.__lw.get().ui.ceremony)) return true; await page.waitForTimeout(150); } return false; };

  // ── 1. L01: solve, skip the ceremony, open the proof panel, then On paper
  await page.keyboard.press('Escape'); // concept cards
  check(await solveByCancel() === 'ok', 'L01 solution built');
  check(await waitSolved(), 'L01 solved (ceremony)');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape'); // skip to the end state
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape'); // keep refining
  await page.waitForTimeout(300);
  await page.keyboard.press('t');
  await page.waitForTimeout(300);
  await page.locator('.h3-transcript button', { hasText: 'On paper' }).click();
  await page.waitForTimeout(400);
  const paperTxt = await page.locator('.h3-paper').innerText();
  check(/1\.\s*a/.test(paperTxt) && /\(inverse\)/.test(paperTxt) && /\(identity\)/.test(paperTxt), `L01 paper has numbered lines with reasons: ${JSON.stringify(paperTxt.slice(0, 160))}`);
  check(!/→|⇒/.test(paperTxt), 'no → or ⇒ on paper');
  await shot('1-l01-paper');
  const pr = await page.locator('.h3-paper').boundingBox();
  if (pr) await shot('1b-l01-paper-crop', { x: pr.x - 8, y: pr.y - 8, width: pr.width + 16, height: pr.height + 16 });
  await page.keyboard.press('Escape');

  // ── 2. the map: main campaign, then the switch to The Book
  await page.keyboard.press('m');
  await page.waitForTimeout(500);
  check(await page.locator('.map-tab.on').innerText() === 'Commutator', 'map opens on the main campaign');
  await shot('2-map-main');
  await page.locator('.map-tab[data-campaign="book"]').click();
  await page.waitForTimeout(500);
  const bookState = await page.evaluate(() => ({ c: window.__lw.get().save.campaign, worlds: [...document.querySelectorAll('.bw-head')].map((x) => x.textContent), nodes: document.querySelectorAll('.map-book .mn').length }));
  check(bookState.c === 'book' && bookState.worlds.length > 0 && bookState.nodes > 0, `Book map: ${bookState.worlds.length} worlds, ${bookState.nodes} levels`);
  console.log('     worlds:', bookState.worlds.slice(0, 4).join(' | '));
  await shot('3-map-book');
  // the main campaign's progress never shows in the Book
  const prog = await page.locator('.map-progress').innerText();
  check(/^0 of/.test(prog.trim()), `Book progress starts at 0 (${prog.replace(/\s+/g, ' ')})`);

  // ── 3. a Book order: the order chip names its method
  await page.locator('.map-book .mn.next, .map-book .mn.open').first().click();
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape'); // concept cards
  await page.waitForTimeout(200);
  const chip = await page.locator('.h3-order').innerText();
  check(/Method\s*·\s*\S/i.test(chip), `order chip shows the method: ${JSON.stringify(chip.split('\n').slice(0, 3).join(' / '))}`);
  const ob = await page.locator('.h3-order').boundingBox();
  await shot('4-book-order');
  if (ob) await shot('4b-book-order-chip', { x: Math.max(0, ob.x - 10), y: Math.max(0, ob.y - 10), width: ob.width + 20, height: ob.height + 20 });
  await page.locator('.h3-order .h3-more').click();
  await page.waitForTimeout(250);
  const ob2 = await page.locator('.h3-order').boundingBox();
  if (ob2) await shot('4c-book-order-open', { x: Math.max(0, ob2.x - 10), y: Math.max(0, ob2.y - 10), width: ob2.width + 20, height: ob2.height + 20 });
  check(!(await page.locator('.h3-order').innerText()).includes('New idea'), 'Book chip never says "New idea"');

  // ── 4. P3.1 solved: earned/progress land in the Book only; the ceremony writes the proof on paper
  const lvl = await page.evaluate(() => window.__lw.get().level.id);
  if (lvl === 'P3.1') {
    check(await solveByCancel() === 'ok', 'P3.1 solution built');
    check(await waitSolved(), 'P3.1 solved (ceremony)');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const cer = await page.locator('.qed-card').innerText();
    check(/Proof\./.test(cer) && /\(inverse\)/.test(cer), 'Book ceremony shows the paper proof');
    await shot('5-book-ceremony-paper');
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('lemma-works/v3')));
    check(save.version === 5 && !!save.campaigns.book.levels['P3.1']?.solvedAt && !save.campaigns.main.levels['P3.1'], 'P3.1 progress saved under the Book');
    check(!!save.campaigns.main.levels.L01?.solvedAt && !save.campaigns.book.levels.L01, 'L01 progress stays under main');
  } else console.log(`     (Book first level is ${lvl}; skipped the P3.1 ceremony check)`);

  // ── 5a. an open dock (P4.6): `d = ?` on the floor, in the order chip and in the dock's lens
  await page.evaluate(() => { window.__lw.openLevel('P4.6'); window.__lw.closeCards(); });
  await page.waitForTimeout(700);
  const chipOpen = await page.locator('.h3-order .h3-goal').first().innerText();
  check(/\?/.test(chipOpen) && (await page.locator('.h3-order .m-hole').count()) > 0, `P4.6 chip shows a hole chip: ${JSON.stringify(chipOpen)}`);
  check((await page.locator('.fl-hole').count()) > 0, 'P4.6 dock on the floor shows a hole chip');
  await shot('6-open-dock-floor');
  const sockBox = await page.locator('.fl-socklab').first().boundingBox();
  if (sockBox) await shot('6b-open-dock-label', { x: Math.max(0, sockBox.x - 140), y: Math.max(0, sockBox.y - 80), width: sockBox.width + 280, height: sockBox.height + 160 });
  const ob3 = await page.locator('.h3-order').boundingBox();
  if (ob3) await shot('6c-open-dock-chip', { x: Math.max(0, ob3.x - 10), y: Math.max(0, ob3.y - 10), width: ob3.width + 20, height: ob3.height + 20 });

  // ── 5b. a multi-desk Assume room: the popover adds a 2nd assumption; desks ⊢₁ ⊢₂; heading P₁, P₂ ⟹ Q
  await page.evaluate(() => { window.__lw.openLevel('P4.6'); window.__lw.resetLevel(); window.__lw.closeCards(); });
  await page.waitForTimeout(500);
  await page.keyboard.press('g');
  await page.waitForTimeout(250);
  await page.locator('.h3-roompop .h3-seg', { hasText: 'Assume' }).click();
  await page.locator('.h3-roompop input').nth(0).fill('ab');
  await page.locator('.h3-roompop input').nth(1).fill('ba');
  await page.locator('.h3-addassume').click();
  await page.locator('.h3-roompop .h3-roomextras input').nth(0).fill('a');
  await page.locator('.h3-roompop .h3-roomextras input').nth(1).fill('e');
  await page.waitForTimeout(250);
  const pop = await page.locator('.h3-roompop').innerText();
  check(/⟹/.test(pop) && /P\s*2/.test(pop), `room popover with two assumptions: ${JSON.stringify(pop.replace(/\s+/g, ' ').slice(0, 140))}`);
  const pb = await page.locator('.h3-roompop').boundingBox();
  if (pb) await shot('7-room-popover-two', { x: Math.max(0, pb.x - 10), y: Math.max(0, pb.y - 10), width: pb.width + 20, height: pb.height + 20 });
  await page.keyboard.press('Escape');
  const painted = await page.evaluate(() => {
    const st = window.__lw; const A = (id) => ({ k: 'atom', id });
    const as = [{ rel: 'eq', l: { k: 'mul', fs: [A('a'), A('b')] }, r: { k: 'mul', fs: [A('b'), A('a')] } }, { rel: 'eq', l: A('a'), r: { k: 'e' } }];
    for (const [x, y] of [[10, 14], [14, 18], [6, 20], [18, 4], [10, 2]]) { const e = st.paintRoom({ x, y, w: 6, h: 5 }, 'assume', as[0].l, as[0].r, 'eq', as); if (e.ok) break; }
    const s = st.get(); const room = s.canvas.rooms.find((r) => r.assumes?.length === 2);
    return room ? s.canvas.machines.filter((m) => m.config.kind === 'desk' && m.config.room === room.id).map((m) => m.config.slot ?? 0) : null;
  });
  check(Array.isArray(painted) && painted.length === 2, `two-desk room painted, desk slots ${JSON.stringify(painted)}`);
  await page.waitForTimeout(400);
  const desks = await page.evaluate(() => [...document.querySelectorAll('#floor text, #floor tspan')].map((t) => t.textContent).filter((x) => /⊢[₁₂]/.test(x ?? '')).length);
  check(desks >= 2, `numbered desks ⊢₁ ⊢₂ on the floor (${desks})`);
  await shot('8-two-desk-room');

  // ── 5. migration: a v4 save loads as the main campaign
  await page.evaluate(() => localStorage.setItem('lemma-works/v3', JSON.stringify({ version: 4, levels: { L01: { canvas: { version: 3, levelId: 'L01', machines: [], belts: [], rooms: [] }, history: [], solvedAt: 1 } }, earned: ['witness'], lemmas: [], lastLevel: 'L01', settings: { speed: 1, reducedMotion: false } })));
  await page.reload();
  await page.waitForSelector('.h3-hotbar');
  const mig = await page.evaluate(() => { const s = window.__lw.get().save; return { v: s.version, c: s.campaign, main: Object.keys(s.campaigns.main.levels), earned: s.campaigns.main.earned, book: Object.keys(s.campaigns.book.levels) }; });
  check(mig.v === 5 && mig.c === 'main' && mig.main.includes('L01') && mig.earned.includes('witness') && mig.book.length === 0, `v4 save migrates to main: ${JSON.stringify(mig)}`);
  await page.evaluate(() => localStorage.clear());
  check(!errors.length, `no page errors ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
} finally {
  await browser.close();
}
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall ok');
process.exit(fail.length ? 1 : 0);

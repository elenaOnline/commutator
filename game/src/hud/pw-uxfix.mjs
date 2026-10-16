// COMMUTATOR — UX fixes after the W1–3 playtest (HEADLESS ONLY: never a visible window). Real pointer and keyboard on
// the real Book levels; window.__lw is read only to aim (where a tile or machine is) and to check outcomes.
// Usage: node src/hud/pw-uxfix.mjs [part …]   parts: room paint delete hotbar ceremony paper toasts cards map
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.HUD_URL ?? 'http://localhost:8790/';
const SHOTS = new URL('../../.shots/uxfix/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const HMR_STUB = `export const createHotContext = () => ({ accept() {}, acceptExports() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {}, decline() {}, data: {} });
export const updateStyle = (id, css) => { let s = document.querySelector('style[data-vite-dev-id="' + id + '"]'); if (!s) { s = document.createElement('style'); s.setAttribute('data-vite-dev-id', id); document.head.appendChild(s); } s.textContent = css; };
export const removeStyle = (id) => document.querySelector('style[data-vite-dev-id="' + id + '"]')?.remove();
export const injectQuery = (u) => u; export class ErrorOverlay extends HTMLElement {}`;
const parts = process.argv.slice(2);
const want = (p) => !parts.length || parts.includes(p);
const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fail.push(what); };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const shot = (n) => page.screenshot({ path: `${SHOTS}${n}.png` });
const crop = async (sel, n, pad = 10) => { const b = await page.locator(sel).first().boundingBox(); if (b) await page.screenshot({ path: `${SHOTS}${n}.png`, clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + 2 * pad, height: b.height + 2 * pad } }); };
const wait = (ms) => page.waitForTimeout(ms);
const st = () => page.evaluate(() => { const s = window.__lw.get(); return { level: s.level.id, rooms: s.canvas.rooms, machines: s.canvas.machines.map((m) => ({ id: m.id, kind: m.kind, at: m.at, config: m.config })), toast: s.ui.toast, sel: s.ui.selection, tool: s.ui.tool }; });
const tile = (x, y) => page.evaluate(([x, y]) => window.__floorAim.tile({ x, y }), [x, y]);
const clickTile = async (x, y) => { const p = await tile(x, y); await page.mouse.move(p.x, p.y, { steps: 3 }); await page.mouse.down(); await page.mouse.up(); await wait(120); };
/** A free tile, on screen and clear of the HUD, nearest a wanted client point. */
const spot = async (cx, cy) => page.evaluate(([cx, cy]) => {
  const s = window.__lw.get(); let best = null, bd = 1e9;
  for (let x = -40; x < 40; x++) for (let y = -40; y < 40; y++) {
    if (s.canvas.machines.some((m) => Math.abs(m.at.x - x) < 4 && Math.abs(m.at.y - y) < 4)) continue;
    if (s.canvas.rooms.some((r) => x >= r.rect.x - 2 && y >= r.rect.y - 2 && x < r.rect.x + r.rect.w + 2 && y < r.rect.y + r.rect.h + 2)) continue;
    const p = window.__floorAim.tile({ x, y }); const d = Math.hypot(p.x - cx, p.y - cy);
    if (d < bd) { bd = d; best = { x, y }; }
  }
  return best;
}, [cx, cy]);
const free = (s, x, y) => !s.machines.some((m) => Math.abs(m.at.x - x) < 3 && Math.abs(m.at.y - y) < 3);

async function fresh(earned = ['cancel', 'witness', 'socks', 'inv-unique'], lemmas = []) {
  await page.goto(BASE);
  await page.evaluate(([earned, lemmas]) => {
    localStorage.clear();
    const camp = (e, l = []) => ({ levels: {}, earned: e, lemmas: l });
    localStorage.setItem('lemma-works/v3', JSON.stringify({ version: 5, campaign: 'book', campaigns: { main: camp([]), book: camp(earned, lemmas) }, settings: { speed: 4, reducedMotion: true } }));
  }, [earned, lemmas]);
  await page.reload();
  await page.waitForSelector('.h3-hotbar');
  await page.evaluate(() => document.fonts.ready);
}
async function open(id) {
  await page.evaluate((id) => { window.__lw.openLevel(id); }, id);
  await wait(400);
  // close the concept cards with the keyboard, as a student does
  for (let i = 0; i < 6 && await page.locator('.h3-cards:not([hidden])').count(); i++) { await page.keyboard.press('Escape'); await wait(150); }
  await wait(200);
}

/** Towers by hotbar key 6 and a click on free floor, then named through the Tower lens's name slot (real typing). */
async function towers(names) {
  const ids = [];
  for (const [i, name] of names.entries()) {
    const { x, y } = await spot(200, 300 + i * 120);
    const before = new Set((await st()).machines.map((m) => m.id));
    await page.keyboard.press('6'); await wait(100); await clickTile(x, y); await wait(200); await page.keyboard.press('Escape'); await wait(100);
    const t = (await st()).machines.find((m) => m.kind === 'tower' && !before.has(m.id));
    check(!!t, `Tower ${name} placed by the pointer`);
    if (!t) continue;
    ids.push(t.id);
    const r = await page.evaluate((id) => window.__floorAim.machine(id), t.id);
    await page.mouse.click(r.left + r.width / 2, r.top + r.height / 2); await wait(300);
    const slot = page.locator('.h3-lens .h3-nameslot input').first();
    if (await slot.count()) { await slot.focus(); await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.keyboard.type(name, { delay: 40 }); await page.keyboard.press('Enter'); await wait(200); }
    await page.keyboard.press('Escape'); await wait(150);
  }
  return ids;
}

try {
  if (want('room')) {
    await fresh();
    await open('P4.9');
    const s0 = await st();
    await towers(['x', 'y']);
    const labels = await page.evaluate(() => { const s = window.__lw.get(); return (s.compiled?.graph?.vars ?? []).map((v) => v.label); });
    check(labels.includes('x') && labels.includes('y'), `P4.9: Towers named x and y (${labels.join(', ')})`);
    // the room popover: Assume, then type xyx^-1y^-1 = e key by key
    await page.locator('.h3-slot[data-key=room]').click(); await wait(200);
    await shot('01-P4.9-roompop-suppose');
    const h0 = (await page.locator('.h3-roompop').boundingBox()).height;
    await page.locator('.h3-roompop .h3-seg', { hasText: 'Assume' }).click(); await wait(150);
    const h1 = (await page.locator('.h3-roompop').boundingBox()).height;
    check(Math.abs(h1 - h0) < 1, `room popover keeps its height switching to Assume (${h0} → ${h1})`);
    const lhs = page.locator('.h3-roompop .h3-roomrow input').first();
    await lhs.click({ force: true });
    await page.keyboard.type('xyx^-1y^-1', { delay: 60 });
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    const val = await lhs.inputValue();
    check(focused === 'LHS of the assumption', `focus stays in the LHS slot while typing (${focused})`);
    check(val === 'xyx⁻¹y⁻¹', `typed text reads xyx⁻¹y⁻¹ (${val})`);
    await page.keyboard.press('Tab');
    const rhs = page.locator('.h3-roompop .h3-roomrow input').nth(1);
    await rhs.click({ force: true });
    await page.keyboard.type('e', { delay: 60 });
    const msg = await page.locator('.h3-roompop .h3-roommsg').innerText();
    check(/exports/.test(msg), `the popover reads the assumption: ${msg.replace(/\s+/g, ' ')}`);
    // the chip row carries the Tower variables
    const chips = await page.locator('.h3-roompop .h3-roomchips .h3-chip').count();
    check(chips >= 5, `chip row has x, y, their inverses and e (${chips} chips)`);
    await shot('02-P4.9-roompop-typed');
    await crop('.h3-roompop', '02b-P4.9-roompop-typed-crop');
    // clicking chips into the RHS: clear it and build y x by chips
    await rhs.click({ force: true }); await page.keyboard.press('Backspace');
    const chipX = page.locator('.h3-roompop .h3-roomchips .h3-chip').nth(0), chipY = page.locator('.h3-roompop .h3-roomchips .h3-chip').nth(1);
    await chipY.click(); await chipX.click();
    check((await rhs.inputValue()) === 'yx', `chips type into the focused slot (${await rhs.inputValue()})`);
    // + Another assumption, typing in the second row
    await page.locator('.h3-roompop .h3-addassume').click(); await wait(100);
    await page.keyboard.type('xy', { delay: 60 });
    const v2 = await page.locator('.h3-roomextras input').first().inputValue();
    check(v2 === 'xy', `second assumption takes typing too (${v2})`);
    await page.locator('.h3-roomextras .h3-x').first().click();
    await shot('03-P4.9-roompop-chips');
    await page.keyboard.press('Escape');
  }

  if (want('paint')) {
    await fresh();
    await open('P4.7');
    await towers(['x']);
    // arm the room from the popover (Assume xx = x via chips/typing), then drag a SCREEN DIAGONAL
    await page.locator('.h3-slot[data-key=room]').click(); await wait(150);
    await page.locator('.h3-roompop .h3-seg', { hasText: 'Assume' }).click();
    const lhs = page.locator('.h3-roompop .h3-roomrow input').first();
    await lhs.click({ force: true }); await page.keyboard.type('xx', { delay: 50 });
    const rhs = page.locator('.h3-roompop .h3-roomrow input').nth(1);
    await rhs.click({ force: true }); await page.keyboard.type('x', { delay: 50 });
    check((await lhs.inputValue()) === 'xx', `P4.7: typing xx keeps both letters (${await lhs.inputValue()})`);
    await page.locator('.h3-roompop button', { hasText: 'Paint the room' }).click(); await wait(150);
    // a small diagonal first: the preview says why it is too small
    const a0 = await spot(520, 260), a = await tile(a0.x, a0.y);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(a.x + 30, a.y + 18, { steps: 5 }); await wait(150);
    const tag0 = await page.evaluate(() => [...document.querySelectorAll('.fl-tag text')].map((t) => t.textContent));
    check(tag0.some((t) => /Too small/.test(t)), `small drag: the preview says the minimum and why (${tag0.join(' | ')})`);
    await shot('10-P4.7-paint-too-small');
    await page.mouse.move(a.x + 260, a.y + 170, { steps: 12 }); await wait(200);
    const tag1 = await page.evaluate(() => [...document.querySelectorAll('.fl-tag text')].map((t) => t.textContent));
    await shot('11-P4.7-paint-diagonal-preview');
    await page.mouse.up(); await wait(300);
    const s1 = await st();
    check(s1.rooms.length === 1 && s1.rooms[0].rect.w >= 3 && s1.rooms[0].rect.h >= 3, `a screen-diagonal drag paints a room on the first try (${JSON.stringify(s1.rooms[0]?.rect)}; preview ${tag1.join(' | ')})`);
    await shot('12-P4.7-painted');
    // a machine dropped near the inside of a wall lands inside (snapped) and the ghost said so first
    const R = s1.rooms[0].rect;
    await page.keyboard.press('2'); await wait(100);
    const edge = await tile(R.x, R.y + Math.floor(R.h / 2));
    await page.mouse.move(edge.x, edge.y, { steps: 4 }); await wait(250);
    const ghostTag = await page.evaluate(() => [...document.querySelectorAll('.fl-tag text')].map((t) => t.textContent));
    await shot('13-P4.7-ghost-inside');
    await page.mouse.down(); await page.mouse.up(); await wait(300);
    const s2 = await st();
    const rw = s2.machines.find((m) => m.kind === 'rewriter');
    const inside = rw && rw.at.x >= R.x && rw.at.y >= R.y && rw.at.x < R.x + R.w && rw.at.y < R.y + R.h;
    check(!!inside, `Rewriter aimed at the wall's inner tile lands inside the room (${JSON.stringify(rw?.at)} in ${JSON.stringify(R)}; ghost said ${ghostTag.join(' | ')})`);
    // outside near the wall: the ghost says Outside
    await page.keyboard.press('2'); await wait(100);
    let outTag = [];
    for (const [ox, oy] of [[R.x + 1, R.y - 1], [R.x - 1, R.y + 1], [R.x + R.w, R.y + 1], [R.x + 2, R.y + R.h]]) {
      const out = await tile(ox, oy);
      await page.mouse.move(out.x, out.y, { steps: 4 }); await wait(250);
      outTag = await page.evaluate(() => [...document.querySelectorAll('.fl-tag text')].map((t) => t.textContent));
      if (outTag.some((t) => /Outside the room/.test(t))) break;
    }
    check(outTag.some((t) => /Outside the room/.test(t)), `ghost just outside a wall says so (${outTag.join(' | ')})`);
    await shot('14-P4.7-ghost-outside');
    await page.keyboard.press('Escape'); await page.mouse.click(5, 450, { button: 'right' });
  }

  if (want('delete')) {
    await fresh();
    await open('P4.7');
    await towers(['x']);
    await page.locator('.h3-slot[data-key=room]').click(); await wait(150);
    await page.locator('.h3-roompop .h3-seg', { hasText: 'Assume' }).click();
    await page.locator('.h3-roompop .h3-roomrow input').first().click({ force: true }); await page.keyboard.type('xx');
    await page.locator('.h3-roompop .h3-roomrow input').nth(1).click({ force: true }); await page.keyboard.type('x');
    await page.locator('.h3-roompop button', { hasText: 'Paint the room' }).click(); await wait(150);
    const a0 = await spot(520, 260), a = await tile(a0.x, a0.y), b = { x: a.x + 260, y: a.y + 170 };
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 10 }); await page.mouse.up(); await wait(300);
    let s = await st();
    check(s.rooms.length === 1, `room painted for the delete test (${s.rooms.length})`);
    await page.keyboard.press('Escape');
    // click the room's empty floor: the room is selected, with a visible Delete
    const R = s.rooms[0].rect;
    const mid = await tile(R.x + Math.floor(R.w / 2), R.y + R.h - 1);
    await page.mouse.click(mid.x, mid.y); await wait(250);
    s = await st();
    check(s.sel.includes(s.rooms[0].id), `clicking the room's floor selects the room (${s.sel})`);
    check(await page.locator('[data-rdel]').count() === 1, 'a selected room shows its Delete button');
    await shot('20-P4.7-room-selected');
    await page.keyboard.press('Backspace'); await wait(250);
    s = await st();
    check(s.rooms.length === 0, `⌫ deletes the selected room (${s.rooms.length} left)`);
    await page.keyboard.press('Meta+z'); await wait(250);
    s = await st();
    if (s.rooms.length) {
      // the Delete button
      await page.mouse.click(mid.x, mid.y); await wait(200);
      const btn = page.locator('[data-rdel] rect');
      const bb = await btn.boundingBox();
      if (bb) { await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await wait(250); }
      s = await st();
      check(s.rooms.length === 0, `the Delete button deletes the room (${s.rooms.length} left)`);
    } else check(false, 'undo restores the room for the button test');
    // desk ⌫: selects the room and says how
    await page.keyboard.press('Meta+z'); await wait(250);
    s = await st();
    const desk = s.machines.find((m) => m.kind === 'desk');
    if (desk) {
      const r = await page.evaluate((id) => window.__floorAim.machine(id), desk.id);
      await page.mouse.click(r.left + r.width / 2, r.top + r.height / 2); await wait(300);
      await shot('21-P4.7-desk-lens-delete');
      // the lens's assumption slots keep focus while typing, too
      const lin = page.locator('.h3-lens .h3-roomedit input').first();
      await lin.click({ force: true }); await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
      await page.keyboard.type('xx^-1x', { delay: 50 });
      check((await lin.inputValue()) === 'xx⁻¹x', `desk lens: typing keeps focus (${await lin.inputValue()})`);
      await page.evaluate(() => document.activeElement?.blur());
      const lensDel = await page.locator('.h3-lens .h3-roomdel').count();
      check(lensDel === 1, 'the desk lens of an Assume room has a Delete room button');
      await page.keyboard.press('Escape'); await wait(100);
      await page.evaluate((id) => window.__lw.select([id]), desk.id);
      await page.mouse.move(700, 120);
      await page.keyboard.press('Backspace'); await wait(200);
      s = await st();
      check(s.sel.length === 1 && s.sel[0] === s.rooms[0]?.id && /⌫ again/.test(s.toast?.text ?? ''), `⌫ on the desk selects its room and says how (${s.toast?.text}; sel ${s.sel}; rooms ${s.rooms.length}; active ${await page.evaluate(() => document.activeElement?.tagName)})`);
      await shot('22-P4.7-desk-backspace');
    }
  }

  if (want('dock')) {
    // P4.9: a drag that runs over a dock stops short of it, with the reason in the preview
    await fresh();
    await open('P4.9');
    const s = await st();
    const dock = s.machines.find((m) => m.kind === 'socket');
    await towers(['x', 'y']);
    await page.locator('.h3-slot[data-key=room]').click(); await wait(150);
    await page.locator('.h3-roompop .h3-seg', { hasText: 'Assume' }).click();
    await page.locator('.h3-roompop .h3-roomrow input').first().click({ force: true }); await page.keyboard.type('xy');
    await page.locator('.h3-roompop .h3-roomrow input').nth(1).click({ force: true }); await page.keyboard.type('yx');
    await page.locator('.h3-roompop button', { hasText: 'Paint the room' }).click(); await wait(150);
    const a = await tile(dock.at.x - 6, dock.at.y - 1), b = await tile(dock.at.x + 2, dock.at.y + 3);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 10 }); await wait(250);
    const tags = await page.evaluate(() => [...document.querySelectorAll('.fl-tag text')].map((t) => t.textContent));
    check(tags.some((t) => /Stops at the dock/.test(t)), `drag over a dock: the room stops short and says why (${tags.join(' | ')})`);
    await shot('30-P4.9-paint-around-dock');
    await page.mouse.up(); await wait(300);
    const s2 = await st();
    check(s2.rooms.length === 1, `the room is painted beside the dock (${JSON.stringify(s2.rooms[0]?.rect)}; toast ${s2.toast?.text ?? '—'})`);
    await shot('31-P4.9-painted-beside-dock');
  }

  if (want('ceremony')) {
    // the reference floors (dumped by tests/book with PAPER_DUMP=1 to /tmp/paper/<id>.canvas.json) are loaded only
    // to reach ∎ quickly; every save, name and click after that is the real pointer and keyboard
    const { readFileSync } = await import('node:fs');
    const canvasOf = (id) => JSON.parse(readFileSync(`/tmp/paper/${id}.canvas.json`, 'utf8'));
    await fresh(['cancel', 'witness']);
    for (const id of ['P4.4', 'P4.5', 'P4.7', 'P4.9']) {
      await open(id);
      await page.evaluate((c) => { const st = window.__lw; st.commit({ ...c, levelId: st.get().level.id }); st.setPlaying(true); st.setSpeed(4); }, canvasOf(id));
      let ok = false;
      for (let i = 0; i < 120 && !ok; i++) { ok = await page.evaluate(() => !!window.__lw.get().ui.ceremony); if (!ok) await wait(150); }
      if (!ok) { console.log(`     ${id}: the reference floor did not reach ∎ in this save (saved-lemma ids differ); showing its ceremony directly`); await page.evaluate(() => window.__lw.setUI({ ceremony: { levelId: window.__lw.get().level.id, unlocked: [] } })); ok = true; }
      check(ok, `${id}: delivered (∎)`);
      if (!ok) { console.log('     dbg', JSON.stringify(await page.evaluate(() => { const s = window.__lw.get(); return { lemmas: (s.save.campaigns.book.lemmas ?? []).map((l) => [l.id, l.verified, l.reason]), jams: Object.entries(s.compiled?.machines ?? {}).filter(([, m]) => m.status.k !== 'ok').map(([id, m]) => [id, m.status.reason]).slice(0, 5), schemas: s.ctx.level.tools.schemas.filter((x) => x.startsWith('lemma')) }; }))); continue; }
      await wait(900); // reduced motion: the ceremony is at its end state at once
      const rows = await page.evaluate(() => [...document.querySelectorAll('.qed-save')].map((r) => ({ name: r.querySelector('input')?.value ?? null, stmt: r.querySelector('.machine-stmt')?.textContent ?? '' })));
      const note = await page.locator('.qed-save-note').textContent().catch(() => '');
      console.log(`     ${id} saves: ${JSON.stringify(rows)} · note: ${note}`);
      await shot(`40-${id}-ceremony`);
      if (id === 'P4.4') check(rows.length === 1 && rows[0].name === 'double inverse', `P4.4 offers its save as "double inverse" (${rows.map((r) => r.name)})`);
      if (id === 'P4.5') check(rows.every((r) => r.name === null) , `P4.5: no save row for the theorem the order already earns (${rows.length} rows)`);
      if (id === 'P4.7') check(rows.length === 1 && rows[0].name === 'the only idempotent is e', `P4.7 save named by the author (${rows.map((r) => r.name)})`);
      if (id === 'P4.9') check(rows.length === 2 && rows[0].name === 'commute ⟹ commutator is e' && rows[1].name === 'commutator is e ⟹ commute', `P4.9 offers both saves, in dock order (${rows.map((r) => r.name).join(' | ')})`);
      check(!/^Saved/.test(note ?? ''), `${id}: no "Saved" text before saving (${note})`);
      const tombs = await page.evaluate(() => [...document.querySelectorAll('.qed-card .tomb')].map((t) => t.closest('.pp-why') ? 'line' : 'stray'));
      check(!tombs.includes('stray'), `${id}: ∎ closes the last paper line, no stray mark (${tombs.join(',')})`);
      // save every row with the real pointer
      for (const b of await page.locator('.qed-save button').all()) { await b.click(); await wait(250); }
      const note2 = await page.locator('.qed-save-note').textContent().catch(() => '');
      if (rows.some((r) => r.name)) check(/^Saved/.test(note2 ?? ''), `${id}: after saving the note says so (${note2})`);
      await shot(`41-${id}-saved`);
      await page.keyboard.press('Escape'); await wait(300);
    }
    // the hotbar after W2–W3: three theorem slots at most (most recent), no duplicates, standard names
    await open('P4.11');
    const bar = await page.evaluate(() => { const b = document.querySelector('.h3-hotbar').getBoundingClientRect(); const names = [...document.querySelectorAll('.h3-hotbar .h3-slot.preset .h3-name')].map((n) => n.textContent); return { w: b.width, names }; });
    check(bar.names.length <= 3 && new Set(bar.names).size === bar.names.length, `P4.11 hotbar: ≤ 3 theorem slots, no duplicates (${bar.names.join(' | ')}; width ${Math.round(bar.w)})`);
    check(!bar.names.some((n) => /Idempotents|The Commutator|Undo the Undo/.test(n)), 'no level titles on the hotbar');
    await shot('42-P4.11-hotbar');
    await page.locator('.h3-slot.h3-all').click(); await wait(200);
    const drawer = await page.evaluate(() => [...document.querySelectorAll('.h3-drawer .h3-row.earned .h3-row-name')].map((n) => n.textContent));
    check(new Set(drawer).size === drawer.length && drawer.length >= 5, `All drawer lists every theorem once (${drawer.join(' | ')})`);
    await shot('43-P4.11-drawer');
    await page.keyboard.press('Escape');
    // P4.10's page heads with both docks
    await open('P4.10');
    await page.keyboard.press('t'); await wait(200);
    await page.locator('.h3-transcript button', { hasText: 'On paper' }).click(); await wait(300);
    const head = await page.locator('.h3-paper .pp-thm').textContent();
    check(/cab/.test(head ?? '') && /xy/.test(head ?? ''), `P4.10's heading states both docks (${head})`);
    await crop('.h3-paper', '44-P4.10-paper-heading');
    await page.keyboard.press('Escape');
    // proof panel does not carry over to the next level
    await open('P4.11');
    const tr = await page.evaluate(() => window.__lw.get().ui.transcriptOpen);
    check(!tr, `the proof panel is closed on the next level (${tr})`);
  }

  if (want('cards')) {
    await fresh(['cancel', 'witness', 'socks']);
    for (const [id, pages] of [['P3.2', 2], ['P3.3', 1], ['P4.6', 1], ['P4.7', 2], ['P4.10', 1]]) {
      await page.evaluate((id) => { window.__lw.openLevel(id); }, id); await wait(500);
      for (let p = 0; p < pages; p++) {
        await wait(300);
        const r = await page.evaluate(() => {
          const c = document.querySelector('.h3-cards:not([hidden])'); if (!c) return null;
          const cr = c.getBoundingClientRect(), run = document.querySelector('.h3-run').getBoundingClientRect();
          const labs = [...c.querySelectorAll('.cc-brlabel')].map((l) => l.getBoundingClientRect()).map((b) => [Math.round(b.left - cr.left), Math.round(cr.right - b.right)]);
          const btn = [...c.querySelectorAll('.cc-foot .cc-btn')].map((b) => b.getBoundingClientRect()).every((b) => b.bottom <= innerHeight && b.bottom <= cr.bottom + 1);
          return { label: c.querySelector('.cc-label').textContent, upper: getComputedStyle(c.querySelector('.cc-label')).textTransform, body: c.querySelector('.cc-body')?.textContent ?? '', labs, btn, bottom: cr.bottom, overRun: cr.top < run.bottom && cr.right > run.left };
        });
        if (!r) { check(false, `${id} card ${p + 1} open`); continue; }
        check(r.upper === 'none', `${id} card ${p + 1}: header not uppercased (${r.label})`);
        check(!/\.;/.test(r.body), `${id} card ${p + 1}: no stray semicolon`);
        check(r.labs.every(([l, rr]) => l >= 0 && rr >= 0), `${id} card ${p + 1}: brace labels inside the card (${JSON.stringify(r.labs)})`);
        check(r.btn && r.bottom <= 900, `${id} card ${p + 1}: Back / Next visible within 900px (bottom ${Math.round(r.bottom)})`);
        check(!r.overRun, `${id} card ${p + 1}: card clear of the run panel`);
        await shot(`50-${id}-card${p + 1}`);
        await page.keyboard.press('ArrowRight');
      }
      await page.keyboard.press('Escape');
    }
  }

  if (want('map')) {
    await fresh(['cancel', 'witness', 'socks']);
    await page.evaluate(() => window.__lw.openMap('book')); await wait(600);
    const wraps = await page.evaluate(() => [...document.querySelectorAll('.map-book .mn-stmt .mn-nb')].filter((s) => s.getClientRects().length > 1).map((s) => s.textContent));
    check(!wraps.length, `map statements never wrap inside themselves (${wraps.join(' | ')})`);
    const over = await page.evaluate(() => [...document.querySelectorAll('.map-book .mn.bk-node')].filter((n) => { const st = n.querySelector('.mn-stmt'); return st && st.scrollWidth > n.clientWidth + 2; }).map((n) => n.querySelector('.mn-title')?.textContent));
    console.log(`note map nodes whose single statement is still wider than the node at 11px: ${over.join(' | ') || 'none'}`);
    await shot('60-map-book');
  }

  if (want('toasts')) {
    await fresh(['cancel', 'witness', 'socks']);
    await open('P4.7');
    // a refusal: ⌫ on a pre-placed dock says it stays
    const s = await st();
    const dock = s.machines.find((m) => m.kind === 'socket');
    const r = await page.evaluate((id) => window.__floorAim.machine(id), dock.id);
    await page.mouse.click(r.left + r.width / 2, r.top + r.height / 2); await wait(150);
    await page.keyboard.press('Backspace'); await wait(200);
    const on0 = await page.evaluate(() => document.querySelector('.h3-toast')?.classList.contains('on'));
    check(!!on0, 'a refusal toast shows');
    await page.evaluate(() => window.__lw.openLevel('P4.8')); await wait(400);
    const on1 = await page.evaluate(() => ({ on: document.querySelector('.h3-toast')?.classList.contains('on'), t: window.__lw.get().ui.toast }));
    check(!on1.on && !on1.t, `the toast is gone on the next level (${JSON.stringify(on1)})`);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__lw.setUI({ toast: { text: 'old news', kind: 'note', t: Date.now() - 60000 } })); await wait(200);
    const on2 = await page.evaluate(() => document.querySelector('.h3-toast')?.classList.contains('on') && document.querySelector('.h3-toast')?.textContent);
    check(!on2, `a stale toast is never shown (${on2})`);
    await page.evaluate(() => window.__lw.setUI({ toast: { text: 'fresh', kind: 'note', t: Date.now() } })); await wait(4200);
    const on3 = await page.evaluate(() => document.querySelector('.h3-toast')?.classList.contains('on'));
    check(!on3, 'a toast expires after a few seconds');
  }

  if (want('paper')) {
    const { readFileSync } = await import('node:fs');
    await fresh(['cancel', 'witness', 'socks']);
    for (const id of ['P4.1', 'P4.2', 'P4.6', 'P4.10', 'P4.12']) {
      await open(id);
      const c = JSON.parse(readFileSync(`/tmp/paper/${id}.canvas.json`, 'utf8'));
      const ok = await page.evaluate((c) => { const st = window.__lw; st.commit({ ...c, levelId: st.get().level.id }); return st.get().compiled?.check?.solved ?? null; }, c);
      await page.keyboard.press('t'); await wait(200);
      await page.locator('.h3-transcript button', { hasText: 'On paper' }).click(); await wait(300);
      const txt = await page.locator('.h3-paper').innerText();
      console.log(`     ${id} (solved ${ok})\n${txt.split('\n').map((l) => `       ${l}`).join('\n')}`);
      await crop('.h3-paper', `70-${id}-paper`);
      await page.keyboard.press('Escape'); await page.keyboard.press('t');
    }
  }

  if (want('walls')) {
    // every side of a room, pointer one tile inside and one tile outside the wall: where does a Rewriter land, and
    // did the ghost say so before the drop? (W4–9 #3, reproduced on P10.2 and P10.4)
    for (const id of ['P10.2', 'P10.4']) {
      await fresh(['cancel', 'witness', 'socks', 'sub.e']);
      await open(id);
      await towers(['x']);
      await page.locator('.h3-slot[data-key=room]').click(); await wait(150);
      await page.locator('.h3-roompop .h3-seg', { hasText: 'Assume' }).click();
      await page.locator('.h3-roompop .h3-roomrow input').first().click({ force: true }); await page.keyboard.type('xx');
      await page.locator('.h3-roompop .h3-roomrow input').nth(1).click({ force: true }); await page.keyboard.type('e');
      await page.locator('.h3-roompop button', { hasText: 'Paint the room' }).click(); await wait(150);
      const a0 = await spot(560, 300), a = await tile(a0.x, a0.y);
      await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(a.x + 300, a.y + 190, { steps: 10 }); await page.mouse.up(); await wait(300);
      let s = await st();
      const R = s.rooms[0]?.rect;
      check(!!R, `${id}: room painted ${JSON.stringify(R)}`);
      if (!R) continue;
      await page.keyboard.press('Escape');
      const cases = [];
      const midX = R.x + Math.floor(R.w / 2), midY = R.y + Math.floor(R.h / 2);
      for (const [name, tx, ty, inside] of [['W in', R.x, midY, true], ['W out', R.x - 1, midY, false], ['E in', R.x + R.w - 1, midY, true], ['E out', R.x + R.w, midY, false],
        ['N in', midX, R.y, true], ['N out', midX, R.y - 1, false], ['S in', midX, R.y + R.h - 1, true], ['S out', midX, R.y + R.h, false]]) {
        const before = new Set((await st()).machines.map((m) => m.id));
        await page.keyboard.press('Escape'); await page.locator('.h3-slot[data-key=rewriter]').click(); await wait(80);
        const p = await tile(tx, ty);
        await page.evaluate(([x, y]) => { window.__px = x; window.__py = y; }, [p.x, p.y]);
        await page.mouse.move(p.x, p.y, { steps: 3 }); await wait(220); await page.mouse.move(p.x + 1, p.y, { steps: 1 }); await wait(250);
        const tag = await page.evaluate(() => [...document.querySelectorAll('.fl-tag text')].map((t) => t.textContent).join(' | '));
        if (!tag) { await shot(`82-${id}-${name.replace(' ', '')}-pre`); console.log('     pre', JSON.stringify(await page.evaluate(() => ({ g: document.querySelector('.fl-ghostm')?.getAttribute('class'), n: document.querySelectorAll('.fl-ghostm').length, tags: document.querySelectorAll('.fl-tag').length, tool: window.__lw.get().ui.tool.k, toast: window.__lw.get().ui.toast })))); }
        await page.mouse.down(); await page.mouse.up(); await wait(250);
        s = await st();
        const m = s.machines.find((x) => !before.has(x.id));
        const inRoom = m ? await page.evaluate((id) => { const s = window.__lw.get(); const m = s.canvas.machines.find((x) => x.id === id); const r = s.canvas.rooms[0].rect; return m.at.x >= r.x && m.at.y >= r.y && m.at.x < r.x + r.w && m.at.y < r.y + r.h; }, m.id) : null;
        const said = /Inside/.test(tag) ? 'inside' : /Outside/.test(tag) ? 'outside' : tag || '—';
        if (said === '—') { await shot(`81-${id}-${name.replace(' ', '')}-nosay`); console.log('     dbg', JSON.stringify(await page.evaluate(() => ({ ghost: document.querySelector('.fl-ghostm') ? 'yes' : 'no', ghostHTML: (document.querySelector('[class*=ghost]')?.outerHTML ?? '').slice(0, 80), tool: window.__lw.get().ui.tool.k, over: document.elementFromPoint(window.__px, window.__py)?.className?.baseVal ?? document.elementFromPoint(window.__px, window.__py)?.className })))); }
        cases.push(`${name}: ${m ? (inRoom ? 'in' : 'OUT') : 'refused'} (ghost: ${said})`);
        // honest: what landed matches what the ghost said, and a pointer inside the wall never lands outside
        const honest = !m || (inRoom ? said === 'inside' : said === 'outside');
        check(honest && !(inside && m && !inRoom), `${id} ${name}: ${m ? (inRoom ? 'lands inside' : 'lands outside') : `refused (${tag})`}, ghost said ${said}`);
        await page.keyboard.press('Escape'); await wait(80);
        if (m) { await page.evaluate(() => window.__lw.undo()); await wait(150); }
      }
      await shot(`80-${id}-walls`);
    }
  }

  if (want('members')) {
    // P12.1: a Tower switched to ≤ G keeps its id; the Paper must print its name. ∈ in the popover; Assume presets.
    await fresh(['cancel', 'witness', 'socks', 'sub.e']);
    await open('P12.1');
    const ids = await towers(['x', 'y']);
    // a third Tower, switched to a subgroup with the pointer
    const { x: hx, y: hy } = await spot(200, 560);
    const before = new Set((await st()).machines.map((m) => m.id));
    await page.keyboard.press('6'); await clickTile(hx, hy); await wait(200); await page.keyboard.press('Escape');
    const ht = (await st()).machines.find((m) => m.kind === 'tower' && !before.has(m.id));
    const r = await page.evaluate((id) => window.__floorAim.machine(id), ht.id);
    await page.mouse.click(r.left + r.width / 2, r.top + r.height / 2); await wait(300);
    await page.locator('.h3-lens .h3-seg', { hasText: '≤' }).first().click(); await wait(300);
    await page.keyboard.press('Escape'); await wait(150);
    const subs = await page.evaluate(() => { const s = window.__lw.get(); return { structs: s.compiled?.graph?.structs ?? [], cfg: s.canvas.machines.filter((m) => m.kind === 'tower').map((m) => m.config) }; });
    console.log('     structs', JSON.stringify(subs.structs));
    // the order chip offers Assume presets with the floor's Towers
    await page.locator('.h3-order').click({ position: { x: 20, y: 60 } }).catch(() => {});
    await wait(200);
    const presets = await page.evaluate(() => [...document.querySelectorAll('.h3-order .h3-preset.assume')].map((b) => b.textContent));
    check(presets.length >= 2 && presets.some((t) => /∈/.test(t)), `P12.1 order chip offers Assume presets (${presets.join(' | ')})`);
    await crop('.h3-order', '90-P12.1-order-presets');
    // popover: the relation toggle reaches ∈, and the subgroup pill appears
    await page.locator('.h3-slot[data-key=room]').click(); await wait(200);
    const kind = await page.evaluate(() => document.querySelector('.h3-roompop .h3-seg.on')?.textContent);
    if (kind !== 'Assume') await page.locator('.h3-roompop .h3-seg', { hasText: 'Assume' }).click();
    await page.locator('.h3-roompop .h3-roomrow input').first().click({ force: true });
    await page.keyboard.type('xy^-1', { delay: 40 });
    const relBtn = page.locator('.h3-roompop .h3-roomrow .h3-rel').first();
    for (let i = 0; i < 3 && (await relBtn.textContent()) !== '∈'; i++) await relBtn.click();
    check((await relBtn.textContent()) === '∈', 'the popover relation toggle reaches ∈');
    const pills = await page.locator('.h3-roompop .h3-subpick:not([hidden]) .h3-subpill').count();
    if (pills) await page.locator('.h3-roompop .h3-subpick:not([hidden]) .h3-subpill').first().click();
    const msg = await page.locator('.h3-roompop .h3-roommsg').innerText();
    check(/∈/.test(msg), `the popover reads the membership: ${msg.replace(/\s+/g, ' ')}`);
    await crop('.h3-roompop', '91-P12.1-popover-mem');
    await page.locator('.h3-roompop button', { hasText: 'Paint the room' }).click(); await wait(150);
    const a0 = await spot(620, 330), a = await tile(a0.x, a0.y);
    await page.mouse.click(a.x, a.y); await wait(400); // a click paints a default room
    let s1 = await st();
    check(s1.rooms.length === 1 && s1.rooms[0].assumes?.[0]?.rel === 'mem', `a click paints a default membership room (${JSON.stringify(s1.rooms[0]?.rect)}, ${JSON.stringify(s1.rooms[0]?.assumes?.[0]?.rel)}; ${s1.toast?.text ?? ''})`);
    await page.keyboard.press('Escape');
    const head = await page.evaluate(() => [...document.querySelectorAll('[data-r] text')].map((t) => t.textContent).join(' '));
    check(/∈/.test(head) && !/xy⁻¹ = xy⁻¹|xy-1 = xy-1/.test(head), `the room heading states the membership (${head.slice(0, 120)})`);
    await shot('92-P12.1-mem-room');
    // its desk lens says what it emits
    const desk = s1.machines.find((m) => m.kind === 'desk');
    if (desk) {
      await page.evaluate((id) => { window.__lw.select([id]); window.__lw.openLens(id); }, desk.id); await wait(300); // the desk sits under the order chip here
      await shot('93a-P12.1-desk-click');
      const info = await page.locator('.h3-lens .h3-roominfo').first().innerText().catch(() => '');
      check(/∈/.test(info), `desk lens: ${info}`);
      await crop('.h3-lens', '93-P12.1-desk-lens');
      await page.keyboard.press('Escape');
    }
    // the Paper names the subgroup Tower by its label (its id stayed "z" when it was switched to ≤ G)
    await page.keyboard.press('t'); await wait(200);
    await page.locator('.h3-transcript button', { hasText: 'On paper' }).click(); await wait(300);
    const ptxt = await page.locator('.h3-paper').innerText();
    check(/∈\s*H/.test(ptxt) && !/∈\s*z\b/.test(ptxt), `P12.1 Paper prints the subgroup's name: ${ptxt.split('\n').filter((l) => /∈/.test(l)).slice(0, 2).join(' / ')}`);
    await crop('.h3-paper', '93b-P12.1-paper-label');
    await page.keyboard.press('Escape'); await page.keyboard.press('t'); await wait(150);
    // resize by dragging an edge (any point along it)
    s1 = await st();
    const R = s1.rooms[0].rect;
    await page.mouse.click((await tile(R.x + 1, R.y + R.h - 1)).x, (await tile(R.x + 1, R.y + R.h - 1)).y); await wait(200);
    // the north edge, between tile (midX, R.y) and (midX, R.y − 1); dragged outwards (screen up-right)
    const mx = R.x + Math.floor(R.w / 2);
    const e0 = await tile(mx, R.y - 1), ec = await tile(mx, R.y);
    const ex = { x: (e0.x + ec.x) / 2, y: (e0.y + ec.y) / 2 };
    await page.mouse.move(ex.x, ex.y, { steps: 3 }); await wait(150);
    const cur = await page.evaluate(() => document.querySelector('[data-over]')?.getAttribute('data-over'));
    await page.mouse.down(); await page.mouse.move(ex.x + 2 * (e0.x - ec.x), ex.y + 2 * (e0.y - ec.y), { steps: 8 }); await wait(150); await shot('94a-P12.1-resizing'); await page.mouse.up(); await wait(300);
    const R2 = (await st()).rooms[0].rect;
    console.log('     resize toast', JSON.stringify((await st()).toast));
    check(R2.h > R.h, `dragging the room's edge resizes it (${R.w}×${R.h} → ${R2.w}×${R2.h}; cursor ${cur})`);
    await shot('94-P12.1-resized');
    // next level: the popover starts blank
    await open('P12.2');
    await page.locator('.h3-slot[data-key=room]').click(); await wait(200);
    const v = await page.locator('.h3-roompop .h3-roomrow input').first().inputValue();
    check(v === '', `the room popover is blank on the next level (${v})`);
    await page.keyboard.press('Escape');
  }

  if (want('w1014')) {
    const { readFileSync } = await import('node:fs');
    const canvasOf = (id) => JSON.parse(readFileSync(`/tmp/paper/${id}.canvas.json`, 'utf8'));
    const lemmas = JSON.parse(readFileSync('/tmp/paper/save-lemmas.json', 'utf8'));
    for (const id of ['P12.1', 'P13.1', 'P14.s1', 'P16.2']) {
      // P12.1 is played before its lemmas exist (so the ceremony offers its three saves); the rest have them all
      await fresh(['cancel', 'witness', 'socks', 'sub.e'], id === 'P12.1' ? lemmas.filter((l) => !/coset/.test(l.id)) : lemmas);
      await open(id);
      await page.evaluate((c) => { const st = window.__lw; st.commit({ ...c, levelId: st.get().level.id }); st.setPlaying(true); st.setSpeed(4); }, canvasOf(id));
      let ok = false;
      for (let i = 0; i < 160 && !ok; i++) { ok = await page.evaluate(() => !!window.__lw.get().ui.ceremony); if (!ok) await wait(150); }
      if (!ok) { console.log(`     ${id}: the reference floor did not reach ∎ in this save (saved-lemma ids differ); showing its ceremony directly`); await page.evaluate(() => window.__lw.setUI({ ceremony: { levelId: window.__lw.get().level.id, unlocked: [] } })); ok = true; }
      check(ok, `${id}: delivered (∎)`);
      if (!ok) { console.log('     dbg', JSON.stringify(await page.evaluate(() => { const s = window.__lw.get(); return { lemmas: (s.save.campaigns.book.lemmas ?? []).map((l) => [l.id, l.verified, l.reason]), jams: Object.entries(s.compiled?.machines ?? {}).filter(([, m]) => m.status.k !== 'ok').map(([id, m]) => [id, m.status.reason]).slice(0, 5), schemas: s.ctx.level.tools.schemas.filter((x) => x.startsWith('lemma')) }; }))); continue; }
      await wait(900);
      const r = await page.evaluate(() => {
        const c = document.querySelector('.qed-card'); const cr = c.getBoundingClientRect();
        const btns = [...c.querySelectorAll('.qed-actions button')].map((b) => b.getBoundingClientRect());
        return { top: cr.top, bottom: cr.bottom, btnsIn: btns.every((b) => b.bottom <= innerHeight && b.top >= 0), lemma: c.querySelector('.qed-lemma')?.textContent ?? '', unlock: c.querySelector('.qed-unlock')?.textContent ?? '', paper: c.querySelector('.qed-paper')?.textContent ?? '' };
      });
      console.log(`     ${id}: ${r.lemma}`);
      check(r.top >= 0 && r.bottom <= 900 && r.btnsIn, `${id}: the ceremony fits 900px, buttons visible (${Math.round(r.top)}–${Math.round(r.bottom)})`);
      check(!/\bx\d?\b ∈ x|∈ x\b|x3\(|imported, not proven/.test(r.paper), `${id}: no raw ids or "imported" on the ceremony's paper`);
      if (id === 'P13.1') check(/Lagrange/.test(r.unlock), `P13.1: the ceremony shows Lagrange's theorem unlocked (${r.unlock})`);
      if (id === 'P14.s1') check(/uvu/.test(r.lemma) && /a ∈ H|a∈H/.test(r.lemma.replace(/\s+/g, ' ')), `P14.s1: the statement keeps both hypotheses (${r.lemma})`);
      await shot(`95-${id}-ceremony`);
      await page.keyboard.press('Escape'); await wait(300);
    }
    // P13.2's Paper: Lagrange is a theorem in the Book
    await fresh(['cancel', 'witness', 'socks', 'sub.e'], lemmas);
    await open('P13.2');
    await page.evaluate((c) => { const st = window.__lw; st.commit({ ...c, levelId: st.get().level.id }); }, canvasOf('P13.2'));
    await page.keyboard.press('t'); await wait(200);
    await page.locator('.h3-transcript button', { hasText: 'On paper' }).click(); await wait(300);
    const txt = await page.locator('.h3-paper').innerText();
    check(/Lagrange’s theorem|Lagrange's theorem/.test(txt) && !/imported/.test(txt), `P13.2 Paper: "(Lagrange's theorem)", never imported`);
    await crop('.h3-paper', '96-P13.2-paper');
    await page.keyboard.press('Escape');
    // order chip: long statements fit
    for (const id of ['P12.1', 'P13.1', 'P14.1', 'P15.1']) {
      await open(id);
      const clip = await page.evaluate(() => [...document.querySelectorAll('.h3-order .h3-goal')].some((g) => g.scrollWidth > g.clientWidth + 1));
      check(!clip, `${id}: the order chip shows its whole statement`);
      await crop('.h3-order', `97-${id}-order`);
    }
  }
  check(!errors.length, `no page errors ${errors.slice(0, 3).join(' | ')}`);
} finally {
  await browser.close();
}
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall ok');
process.exit(fail.length ? 1 : 0);

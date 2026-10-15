// COMMUTATOR — KERNEL-EXT §5.13 HUD checks (HEADLESS ONLY, never a visible window).
//   A. ∀-lens: the default save name (never the level title), Save, then the post-save note (P9.3, solved by its own floor)
//   B. picker figures print cards by display name (G, K — never G₁ / S / T / H for a group) (P14.3 Rewriter picker)
//   C. a refusal toast names machines by role, never by tile coordinates, and flashes the blocker by id
//   D. Suppose desk lens carries "Delete room" (P4.12)
// Usage: node src/hud/pw-verify513.mjs /tmp/cm/p143.json
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
const BASE = process.env.HUD_URL ?? 'http://localhost:8790/';
const SHOTS = new URL('../../.shots/v513/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const D = JSON.parse(readFileSync(process.argv[2] ?? '/tmp/cm/p143.json', 'utf8'));
const HMR_STUB = `export const createHotContext = () => ({ accept() {}, acceptExports() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {}, decline() {}, data: {} });
export const updateStyle = (id, css) => { let s = document.querySelector('style[data-vite-dev-id="' + id + '"]'); if (!s) { s = document.createElement('style'); s.setAttribute('data-vite-dev-id', id); document.head.appendChild(s); } s.textContent = css; };
export const removeStyle = (id) => document.querySelector('style[data-vite-dev-id="' + id + '"]')?.remove();
export const injectQuery = (u) => u; export class ErrorOverlay extends HTMLElement {}`;
const browser = await chromium.launch({ headless: true });
const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fail.push(what); };
const build = (page, levelId, canvas) => page.evaluate(([levelId, c]) => {
  const st = window.__lw; st.openLevel(levelId); st.closeCards(); st.resetLevel();
  const map = new Map(); const log = [];
  for (const r of c.rooms ?? []) { const e = st.paintRoom(r.rect, r.kind, r.l, r.r, r.rel, r.assumes); if (!e.ok) log.push(`room: ${e.reason}`); }
  const rooms = st.get().canvas.rooms;
  for (const m of c.machines) {
    if (m.locked || ['desk', 'gate'].includes(m.kind)) { const mine = st.get().canvas.machines.find((x) => x.kind === m.kind && (x.locked ? x.id === m.id : x.config.room === rooms[(c.rooms ?? []).findIndex((r) => r.id === m.config.room)]?.id)); if (mine) map.set(m.id, mine.id); continue; }
    const before = new Set(st.get().canvas.machines.map((x) => x.id));
    const e = st.place(m.kind, m.at, { rot: m.rot, config: m.config });
    if (!e.ok) { log.push(`place ${m.id}: ${e.reason}`); continue; }
    map.set(m.id, st.get().canvas.machines.find((x) => !before.has(x.id)).id);
  }
  for (const b of c.belts) { if (!b.to) continue; const e = st.connect({ m: map.get(b.from.m), port: b.from.port }, { m: map.get(b.to.m), port: b.to.port }); if (!e.ok) log.push(`belt: ${e.reason}`); }
  st.setPlaying(true); st.setSpeed(4);
  return { log, map: Object.fromEntries(map) };
}, [levelId, canvas]);
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE);
  // the chain up to P9.3, minus the hom-identity record itself (so it can be saved again here)
  await page.evaluate((d) => {
    localStorage.clear();
    const camp = (earned, lemmas) => ({ levels: {}, earned, lemmas });
    localStorage.setItem('lemma-works/v3', JSON.stringify({ version: 5, campaign: 'book', campaigns: { main: camp([], []), book: camp(d.earned, d.lemmas.filter((l) => !/hom-|fibre/.test(l.id)).map((l) => ({ ...l, savedAt: 1 }))) }, settings: { speed: 4, reducedMotion: false } }));
  }, D);
  await page.reload(); await page.waitForSelector('.h3-hotbar'); await page.evaluate(() => document.fonts.ready);

  // ── A. P9.3 by its own floor, then the Generalizer's lens
  const fe = D.lemmas.find((l) => l.id === 'lemma:hom-identity-1');
  const b = await build(page, 'P9.3', fe.canvas);
  check(!b.log.length, `P9.3 rebuilt ${JSON.stringify(b.log)}`);
  await page.waitForTimeout(1500);
  const gen = await page.evaluate(() => { const s = window.__lw.get(); return s.canvas.machines.find((m) => m.kind === 'forall')?.id; });
  await page.evaluate((id) => { window.__lw.setPlaying(false); window.__lw.select([id]); window.__lw.openLens(id); }, gen);
  await page.waitForTimeout(500);
  const name = await page.locator('.h3-lens .h3-lname').inputValue().catch(() => null);
  const title = await page.evaluate(() => window.__lw.get().level.title);
  check(!!name && name !== title, `∀ lens default save name "${name}" (level title "${title}")`);
  const noteHidden = await page.locator('.h3-lens .h3-save + .h3-note').isHidden().catch(() => true);
  check(noteHidden, 'post-save note hidden before saving');
  await page.screenshot({ path: `${SHOTS}A1-forall-lens-ready.png` });
  await page.locator('.h3-lens .h3-save button.primary').click();
  await page.waitForTimeout(400);
  const noteShown = await page.locator('.h3-lens .h3-note', { hasText: 'Saved' }).isVisible().catch(() => false);
  check(noteShown, 'post-save note shown once saved');
  await page.screenshot({ path: `${SHOTS}A2-forall-lens-saved.png` });

  // ── B + C. P14.3: picker figures; a refusal by role name with the blocker flashed
  await page.keyboard.press('Escape');
  // the full chain (P14.3 applies f(e) = e under its recorded id)
  await page.evaluate((d) => {
    const camp = (earned, lemmas) => ({ levels: {}, earned, lemmas });
    localStorage.setItem('lemma-works/v3', JSON.stringify({ version: 5, campaign: 'book', campaigns: { main: camp([], []), book: camp(d.earned, d.lemmas.map((l) => ({ ...l, savedAt: 1 }))) }, settings: { speed: 4, reducedMotion: false } }));
  }, D);
  await page.reload(); await page.waitForSelector('.h3-hotbar'); await page.evaluate(() => document.fonts.ready);
  const bb = await build(page, 'P14.3', D.canvas);
  check(!bb.log.length, `P14.3 rebuilt ${JSON.stringify(bb.log)}`);
  await page.evaluate(() => window.__lw.setPlaying(false));
  const rw = await page.evaluate(() => window.__lw.get().canvas.machines.find((m) => m.kind === 'rewriter').id);
  await page.evaluate((id) => { const st = window.__lw; const m = st.get().canvas.machines.find((x) => x.id === id); st.configure(id, { ...m.config, recipe: null }); st.select([id]); st.openLens(id); }, rw);
  await page.waitForTimeout(500);
  const rows = (await page.locator('.h3-lens .h3-prow').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  const feRow = rows.find((t) => /^f\(e\) = e/.test(t)) ?? '';
  check(!!feRow && !/G₁|\bS\b|\bT\b/.test(feRow), `picker figure of f(e) = e reads by display names: "${feRow.slice(0, 40)}"`);
  await page.locator('.h3-lens .h3-prow', { hasText: 'f(e) = e' }).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}B-picker-display-names.png` });
  await page.keyboard.press('Escape');
  // C. a Spool dropped on the Theorem's tile
  const at = await page.evaluate(() => window.__lw.get().canvas.machines.find((m) => m.kind === 'theorem').at);
  await page.evaluate((at) => window.__lw.place('spool', at), at);
  await page.waitForTimeout(150);
  const toast = await page.evaluate(() => window.__lw.get().ui.toast);
  const flashed = await page.locator('.is-blocker').count();
  check(!!toast?.text && !/\(\s*-?\d+\s*,\s*-?\d+\s*\)|tile \d/.test(toast.text), `refusal names by role, no coordinates: "${toast?.text}"`);
  check(flashed > 0, `the blocker flashes by id (${JSON.stringify(toast?.blockers)}, ${flashed} on the floor)`);
  await page.screenshot({ path: `${SHOTS}C-refusal.png` });

  // ── D. Suppose desk lens: Delete room
  await page.evaluate(() => { const st = window.__lw; st.openLevel('P4.12'); st.closeCards(); st.resetLevel(); });
  const room = await page.evaluate(() => {
    const st = window.__lw; const a = st.get().level.atoms;
    const e = st.paintRoom({ x: 14, y: 4, w: 8, h: 6 }, 'suppose', { k: 'atom', id: a[0].id }, { k: 'atom', id: a[1].id });
    const desk = st.get().canvas.machines.find((m) => m.kind === 'desk');
    if (desk) { st.select([desk.id]); st.openLens(desk.id); }
    return { ok: e.ok, reason: e.reason, desk: desk?.id };
  });
  await page.waitForTimeout(500);
  const del = await page.locator('.h3-lens .h3-roomdel').count();
  check(room.ok && del === 1, `Suppose desk lens shows Delete room (${JSON.stringify(room)})`);
  await page.screenshot({ path: `${SHOTS}D-suppose-delete.png` });
  check(!errors.length, `no page errors ${errors.slice(0, 2).join(' | ')}`);
  await page.evaluate(() => localStorage.clear());
  await ctx.close();
} finally { await browser.close(); }
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall ok');
process.exit(fail.length ? 1 : 0);

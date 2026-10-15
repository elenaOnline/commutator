// Lemma chains in the REAL browser (HEADLESS ONLY: never a visible window; kills nothing but its own browser).
// One fresh Book save. For every level of tests/book/chain-floors.ts PLAY_ORDER: reload the page (the Lemma Book is
// re-verified from localStorage), open the level, build its reference floor with window.__lw (store calls; a saved lemma
// is taken from the recipe picker's Saved rows, its binders chosen as the reuse lens does), run to ∎ with the store clock,
// then save every offered lemma by clicking "Save to Lemma Book" in the QED ceremony. Prints one line per level.
// Usage: node tests/book/pw-lemma-chains.mjs        (dev server on http://localhost:8790/, or HUD_URL)
import { chromium } from 'playwright';

const BASE = process.env.HUD_URL ?? 'http://localhost:8790/';
const HMR_STUB = `export const createHotContext = () => ({ accept() {}, acceptExports() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {}, decline() {}, data: {} });
export const updateStyle = (id, css) => { let s = document.querySelector('style[data-vite-dev-id="' + id + '"]'); if (!s) { s = document.createElement('style'); s.setAttribute('data-vite-dev-id', id); document.head.appendChild(s); } s.textContent = css; };
export const removeStyle = (id) => document.querySelector('style[data-vite-dev-id="' + id + '"]')?.remove();
export const injectQuery = (u) => u; export class ErrorOverlay extends HTMLElement {}`;

const browser = await chromium.launch({ headless: true });
const results = [];
let failed = 0;
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // a fresh Book save
  await page.goto(BASE);
  await page.evaluate(() => {
    localStorage.clear();
    const camp = () => ({ levels: {}, earned: [], lemmas: [] });
    localStorage.setItem('lemma-works/v3', JSON.stringify({ version: 5, campaign: 'book', campaigns: { main: camp(), book: camp() }, settings: { speed: 4, reducedMotion: true } }));
  });
  const order = await page.evaluate(async () => (await import('/tests/book/chain-floors.ts')).PLAY_ORDER);

  for (const id of order) {
    // what a player reaching this order has earned (the unlocks of every earlier Book order), then a real reload
    await page.evaluate(async (id) => {
      const { CAMPAIGN_LEVELS } = await import('/src/levels/campaigns.ts');
      const i = CAMPAIGN_LEVELS.book.findIndex((l) => l.id === id);
      const s = JSON.parse(localStorage.getItem('lemma-works/v3'));
      s.campaign = 'book';
      s.campaigns.book.earned = [...new Set([...s.campaigns.book.earned, ...CAMPAIGN_LEVELS.book.slice(0, i).flatMap((l) => l.unlocks)])];
      localStorage.setItem('lemma-works/v3', JSON.stringify(s));
    }, id);
    await page.reload();
    await page.waitForFunction(() => !!window.__lw && !!document.querySelector('.h3-hotbar'));
    const r = await page.evaluate(async (id) => {
      const st = window.__lw;
      const book = st.get().save.campaigns.book.lemmas.map((l) => ({ name: l.name, id: l.id, verified: l.verified !== false, reason: l.reason, binds: (l.card.binds ?? []).map((b) => b.id) }));
      const bad = book.filter((l) => !l.verified);
      if (bad.length) return { id, ok: false, stage: 're-verify', msg: bad.map((l) => `${l.name}: ${l.reason}`).join('; '), book };
      st.openLevel(id);
      st.closeCards();
      st.setPlaying(false);
      const { StoreFloor } = await import('/tests/book/chain-floors.ts');
      const { libraryFor } = await import('/src/hud/library.ts');
      // the recipe picker: a saved lemma is offered when the picker lists its row in the Saved group
      const offered = (kind, lid) => libraryFor(st.get(), kind === 'rule' ? 'rewriter' : 'theorem').some((e) => e.group === 'Saved' && e.ref?.k === 'schema' && e.ref.id === lid);
      const fl = new StoreFloor(st, offered);
      const { FLOORS } = await import('/tests/book/chain-floors.ts');
      let saves;
      try { saves = FLOORS[id](fl) ?? []; fl.settle(); } catch (e) { return { id, ok: false, stage: e.stage ?? 'build', msg: String(e.message ?? e), uses: fl.uses, book }; }
      for (let i = 0; i < 900 && !st.get().level.sockets.every((d) => st.get().run.delivered[d.id] !== undefined); i++) st.tick();
      const s = st.get();
      const qed = s.level.sockets.every((d) => s.run.delivered[d.id] !== undefined);
      const jams = Object.entries(s.compiled.machines).filter(([, m]) => m.status.k !== 'ok').map(([m, x]) => `${m}: ${x.status.k} ${x.status.reason ?? ''}`);
      return { id, ok: qed, stage: qed ? 'qed' : 'run', msg: qed ? '' : jams.join(' | '), uses: fl.uses, saves, ceremony: !!s.ui.ceremony, book };
    }, id);
    // save through the QED ceremony: click every "Save to Lemma Book" it offers, with the name it suggests
    if (r.ok && r.saves?.length) {
      await page.waitForSelector('.qed-save-form button', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1500); // the ceremony re-renders while its seal plays; click the settled buttons
      const offered = await page.$$eval('.qed-save-form input', (xs) => xs.map((x) => x.value));
      r.offered = offered;
      const btns = page.locator('.qed-save-form button');
      for (let i = 0; i < await btns.count(); i++) { await btns.nth(i).click(); await page.waitForTimeout(100); }
      await page.waitForTimeout(150);
      const saved = await page.evaluate(() => window.__lw.get().save.campaigns.book.lemmas.map((l) => ({ name: l.name, levelId: l.levelId, machine: l.machine, binds: (l.card.binds ?? []).map((b) => b.id) })));
      for (const sv of r.saves) {
        const got = saved.find((l) => l.levelId === id && l.machine === sv.machine);
        if (!got) { r.ok = false; r.stage = 'save'; r.msg = `the ceremony did not save the card of ${sv.machine} (offered: ${offered.join(' | ')})`; }
        else if (got.name !== sv.name) { r.ok = false; r.stage = 'save'; r.msg = `saved as "${got.name}", not "${sv.name}"`; }
      }
      r.saved = saved.filter((l) => l.levelId === id);
    }
    if (!r.ok) failed++;
    results.push(r);
    const uses = (r.uses ?? []).map((u) => `${u.lemma}${Object.keys(u.chosen).length ? ` @ ${Object.entries(u.chosen).map(([b, v]) => `${b}=${v}`).join(',')}` : ''}`).join('; ');
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${id.padEnd(7)} ${r.stage}${r.msg ? `: ${r.msg}` : ''}${uses ? `  [uses ${uses}]` : ''}${r.saved ? `  [saved ${r.saved.map((l) => `${l.name} {${l.binds.join(',')}}`).join('; ')}]` : ''}`);
  }
  if (errors.length) { console.log('page errors:'); for (const e of errors) console.log('  ', e); }
} finally {
  await browser.close();
}
console.log(failed ? `${failed} level(s) failed` : 'every chain closes in the browser');
process.exit(failed ? 1 : 0);

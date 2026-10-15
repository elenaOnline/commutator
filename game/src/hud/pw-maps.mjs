// COMMUTATOR — Book phase C visuals check (HEADLESS ONLY): map frames f(ab) on belts and in the lens, sort tints and
// tags (a fact in K reads differently from a fact in G), e_K, the Operator's "apply f to both sides", the Maps family
// in the picker, the "which homomorphism plays f" chooser, group / Hom / carrier Towers. Fixture levels registered at
// runtime until the authors' W5 / W7 / W12 levels land; then point FIXTURE at a real id.
// Usage: node src/hud/pw-maps.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.HUD_URL ?? 'http://localhost:8790/';
const SHOTS = new URL('../../.shots/maps/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
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
  const crop = async (sel, n, pad = 10) => { const b = await page.locator(sel).first().boundingBox(); if (b) await shot(n, { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + 2 * pad, height: b.height + 2 * pad }); return b; };
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.h3-hotbar');
  await page.evaluate(() => document.fonts.ready);

  // ── fixture: two groups G, K; f : G → K a homomorphism; given ab = c; deliver f(a)f(b) = f(c)
  const built = await page.evaluate(async () => {
    const { LEVEL_BY_ID } = await import('/src/levels/campaigns.ts');
    const A = (id) => ({ k: 'atom', id }), app = (fn, ...args) => ({ k: 'app', fn, args });
    LEVEL_BY_ID['PX.9'] = {
      id: 'PX.9', index: 98, campaign: 'book', world: 7, chapter: 9, title: 'Products Go to Products', method: 'Preservation', memo: 'Fixture.', idea: '',
      sorts: [{ id: 'G', kind: 'group', label: 'G' }, { id: 'K', kind: 'group', label: 'K' }],
      maps: [{ id: 'f', label: 'f', args: ['G'], res: 'K', kind: 'hom' }],
      atoms: [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }, { id: 'c', label: 'c', hue: 2 }],
      givens: [{ id: 'h', name: 'h', fact: { k: 'eq', l: { k: 'mul', fs: [A('a'), A('b')] }, r: A('c') } }],
      sockets: [{ id: 's', target: { k: 'eq', l: { k: 'mul', fs: [app('f', A('a')), app('f', A('b'))] }, r: app('f', A('c')) }, allowedGivens: ['h'] }],
      tools: { lift: true, merge: true, suppose: true, classical: true, press: false, schemas: [], conjecture: false },
      unlocks: [], par: { parts: 2, axioms: 1 }, uses: [],
    };
    const st = window.__lw;
    st.openLevel('PX.9'); st.closeCards();
    const s0 = st.get();
    const given = s0.canvas.machines.find((m) => m.kind === 'given');
    const sock = s0.canvas.machines.find((m) => m.kind === 'socket');
    const put = (kind, config, tries) => {
      for (const [dx, dy] of tries) {
        const before = new Set(st.get().canvas.machines.map((m) => m.id));
        const e = st.place(kind, { x: given.at.x + dx, y: given.at.y + dy }, { config });
        if (e.ok) return st.get().canvas.machines.find((m) => !before.has(m.id)).id;
      }
      return null;
    };
    const grid = (x0, y0) => { const out = []; for (let dy = y0; dy < y0 + 10; dy += 2) for (let dx = x0; dx < x0 + 12; dx += 2) out.push([dx, dy]); return out; };
    const ap = put('operator', { kind: 'operator', recipe: { k: 'apply', fn: 'f' } }, grid(6, 0));
    const hm = put('rewriter', { kind: 'rewriter', recipe: { k: 'law', ref: { k: 'schema', id: 'hom.mul' } }, dir: 'fwd', target: { k: 'first' }, gap: { k: 'first' }, values: {}, tidy: true }, grid(14, 0));
    // a spool of e_K, to show the sorted identity on a belt
    const sp = put('spool', { kind: 'spool', t: { k: 'knob', term: { k: 'mul', fs: [{ k: 'e', s: 'K' }, app('f', A('a'))] } } }, grid(4, 8));
    const log = [];
    const c = (a, b, port) => { const e = st.connect({ m: a, port: 'out' }, { m: b, port }); if (!e.ok) log.push(`${a}>${b}: ${e.reason}`); };
    c(given.id, ap, 'q'); c(ap, hm, 'q'); c(hm, sock.id, 'q');
    const comp = st.get().compiled;
    return { ap, hm, sp, log, sock: comp.sockets, apOut: JSON.stringify(comp.machines[ap]?.out), hmStructs: comp.machines[hm]?.structs ?? null, hmStatus: comp.machines[hm]?.status };
  });
  check(built.ap && built.hm && !built.log.length, `fixture built through the store ${JSON.stringify(built.log)}`);
  console.log('     hom law:', JSON.stringify(built.hmStructs), JSON.stringify(built.hmStatus));
  check(built.sock?.s?.ok, `the dock accepts f(a)f(b) = f(c) (${JSON.stringify(built.sock)})`);
  await page.evaluate(() => window.__lw.setSpeed(1));
  let frames = 0;
  for (let i = 0; i < 60 && frames < 2; i++) { await page.waitForTimeout(120); frames = await page.evaluate(() => document.querySelectorAll('#floor .fl-pk, #floor [class*="packet"]').length); }
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__lw.setPlaying(false));
  const floorText = await page.evaluate(() => document.querySelector('#floor')?.textContent ?? '');
  check(/K/.test(floorText), 'items in K carry their sort tag');
  await shot('1-floor-maps');
  // ── lenses
  const lensOf = async (id, name) => { await page.evaluate((id) => { window.__lw.select([id]); window.__lw.openLens(id); }, id); await page.waitForTimeout(500); return crop('.h3-lens', name); };
  await lensOf(built.ap, '2-lens-operator-apply');
  const opText = await page.locator('.h3-lens').innerText();
  check(/apply/.test(opText), `the Operator reads "apply f" (${JSON.stringify(opText.split('\n').slice(0, 4))})`);
  await lensOf(built.hm, '3-lens-hom-law-chooser');
  const hmText = await page.locator('.h3-lens').innerText();
  check(/homomorphism law/.test(hmText), 'the Rewriter names the homomorphism law');
  check((await page.locator('.h3-lens .h3-app').count()) > 0, 'the lens draws map frames f( … )');
  await lensOf(built.sp, '4-lens-spool-eK');
  check(await page.evaluate(() => /e\s*K/.test(document.querySelector('.h3-lens')?.textContent ?? '')), 'e_K is written with its group');
  // ── picker: a fresh Operator shows the Maps family; a fresh Rewriter its homomorphism law
  const fresh = async (kind) => page.evaluate((kind) => {
    const st = window.__lw; const s = st.get(); const g = s.canvas.machines.find((m) => m.kind === 'given');
    for (const [dx, dy] of [[4, 14], [8, 14], [12, 14], [4, 18], [10, 18], [16, 18]]) {
      const before = new Set(st.get().canvas.machines.map((m) => m.id));
      const e = st.place(kind, { x: g.at.x + dx, y: g.at.y + dy }, {});
      if (e.ok) { const id = st.get().canvas.machines.find((m) => !before.has(m.id)).id; st.select([id]); st.openLens(id); return id; }
    }
    return null;
  }, kind);
  await fresh('operator'); await page.waitForTimeout(500);
  check(/apply/.test(await page.locator('.h3-lens').innerText()), 'the Operator picker lists "apply f"');
  await crop('.h3-lens', '5-picker-operator-maps');
  await fresh('rewriter'); await page.waitForTimeout(500);
  check(/homomorphism law/.test(await page.locator('.h3-lens').innerText()), 'the Rewriter picker lists the homomorphism law (f)');
  await crop('.h3-lens', '6-picker-rewriter-maps');
  // ── Towers: a group Tower, a Hom Tower, an element Tower in K
  const towers = await page.evaluate(() => {
    const st = window.__lw; const s = st.get(); const g = s.canvas.machines.find((m) => m.kind === 'given');
    const out = [];
    const cfgs = [{ kind: 'tower', varId: 'G1', label: 'G₁', sort: 'G', group: true }, { kind: 'tower', varId: 'f1', label: 'f₁', sort: 'G', hom: { dom: 'G', cod: 'K' } }, { kind: 'tower', varId: 'y1', label: 'y₁', sort: 'G', carrier: 'K' }];
    for (const cfg of cfgs) for (const [dx, dy] of [[-8, 4], [-8, 8], [-8, 12], [-12, 4], [-12, 8], [-12, 12], [-4, 16]]) {
      const before = new Set(st.get().canvas.machines.map((m) => m.id));
      const e = st.place('tower', { x: g.at.x + dx, y: g.at.y + dy }, { config: cfg });
      if (e.ok) { out.push(st.get().canvas.machines.find((m) => !before.has(m.id)).id); break; }
    }
    return out;
  });
  check(towers.length === 3, `group, Hom and K-element Towers placed (${towers.length})`);
  await page.evaluate(() => window.__lw.openLens(null));
  await page.waitForTimeout(300);
  await shot('7-floor-towers');
  if (towers[1]) await lensOf(towers[1], '8-lens-hom-tower');
  if (towers[2]) await lensOf(towers[2], '9-lens-element-tower-in-K');
  check(!errors.length, `no page errors ${errors.slice(0, 3).join(' | ')}`);
  await page.evaluate(() => localStorage.clear());
  await ctx.close();
} finally {
  await browser.close();
}
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall ok');
process.exit(fail.length ? 1 : 0);

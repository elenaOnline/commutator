// COMMUTATOR — Book phase B visuals check (HEADLESS ONLY): memberships on belts (term ∈ Euler set), the lens's
// membership rail, the reuse chip (which subgroup plays H), the picker's Subgroup family, the Subgroup Tower, and
// the subgroup ink beside contradiction orange and identity yellow under deuteranopia / protanopia (Machado 2009,
// applied as an SVG colour-matrix filter to the rendered page). Uses a fixture Book level registered at runtime
// (P5.1's shape: a ∈ H given, deliver e ∈ H) until the authors ship phase B levels.
// Usage: node src/hud/pw-members.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.HUD_URL ?? 'http://localhost:8790/';
const SHOTS = new URL('../../.shots/members/', import.meta.url).pathname;
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

  // ── the fixture level and its solution, built through the store (place / connect)
  const built = await page.evaluate(async () => {
    const { LEVEL_BY_ID } = await import('/src/levels/campaigns.ts');
    const A = (id) => ({ k: 'atom', id }), sub = (id) => ({ k: 'sub', id });
    LEVEL_BY_ID['PX.1'] = {
      id: 'PX.1', index: 99, campaign: 'book', world: 4, chapter: 5, title: 'A Subgroup Contains e', method: 'Subgroup test', memo: 'Fixture.', idea: '',
      atoms: [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }],
      subgroups: [{ id: 'H', label: 'H' }, { id: 'N', label: 'N', normal: true }],
      givens: [{ id: 'g', name: 'g', fact: { k: 'mem', t: A('a'), sub: sub('H') } }],
      sockets: [{ id: 's', target: { k: 'mem', t: { k: 'e' }, sub: sub('H') }, allowedGivens: ['g'] }],
      tools: { lift: true, merge: true, suppose: true, classical: true, press: false, schemas: [], conjecture: false },
      unlocks: [], par: { parts: 3, axioms: 3 }, uses: [],
    };
    const st = window.__lw;
    st.openLevel('PX.1'); st.closeCards();
    const s0 = st.get();
    const given = s0.canvas.machines.find((m) => m.kind === 'given');
    const sock = s0.canvas.machines.find((m) => m.kind === 'socket');
    const put = (kind, config, near, tries) => {
      for (const [dx, dy] of tries) {
        const before = new Set(st.get().canvas.machines.map((m) => m.id));
        const e = st.place(kind, { x: near.x + dx, y: near.y + dy }, { config });
        if (e.ok) return st.get().canvas.machines.find((m) => !before.has(m.id)).id;
      }
      return null;
    };
    const T = (id) => ({ kind: 'theorem', recipe: { k: 'library', ref: { k: 'schema', id } }, choice: 0, values: {} });
    const grid = (x0, y0) => { const out = []; for (let dy = y0; dy < y0 + 12; dy += 2) for (let dx = x0; dx < x0 + 14; dx += 2) out.push([dx, dy]); return out; };
    const inv = put('theorem', T('sub.inv'), given.at, grid(6, -2));
    const mul = put('theorem', T('sub.mul'), given.at, grid(14, 2));
    const can = put('rewriter', { kind: 'rewriter', recipe: { k: 'cancel' }, dir: 'fwd', target: { k: 'first' }, gap: { k: 'first' }, values: {}, tidy: true }, given.at, grid(22, 2));
    const log = [];
    const c = (a, b, port) => { const e = st.connect({ m: a, port: 'out' }, { m: b, port }); if (!e.ok) log.push(`${a}>${b}.${port}: ${e.reason}`); };
    c(given.id, inv, 'p0'); c(given.id, mul, 'p0'); c(inv, mul, 'p1'); c(mul, can, 'q'); c(can, sock.id, 'q');
    // context for the ink specimen: an identity Rewriter (yellow) and a clash Joiner (orange) standing nearby
    put('rewriter', { kind: 'rewriter', recipe: { k: 'insertE' }, dir: 'fwd', target: { k: 'first' }, gap: { k: 'first' }, values: {}, tidy: true }, given.at, grid(6, 8));
    put('joiner', { kind: 'joiner', recipe: { k: 'clash' } }, given.at, grid(14, 8));
    return { inv, mul, can, log, structs: st.get().compiled.machines[mul]?.structs ?? null, sock: st.get().compiled.sockets };
  });
  check(built.inv && built.mul && built.can && !built.log.length, `fixture built through the store ${JSON.stringify(built.log)}`);
  console.log('     reuse data:', JSON.stringify(built.structs), JSON.stringify(built.sock));
  await page.evaluate(() => window.__lw.setSpeed(1));
  // catch memberships riding the belts
  let onBelts = 0;
  for (let i = 0; i < 60 && !onBelts; i++) { await page.waitForTimeout(120); onBelts = await page.evaluate(() => document.querySelectorAll('#floor .eu-blob').length); }
  await page.evaluate(() => window.__lw.setPlaying(false));
  check(onBelts > 0, `memberships ride the belts as term ∈ Euler set (${onBelts} blobs)`);
  await shot('1-floor-mem-on-belts');
  const blobBox = await page.locator('#floor .eu-blob').first().boundingBox();
  if (blobBox) await shot('1b-mem-item-close', { x: Math.max(0, blobBox.x - 160), y: Math.max(0, blobBox.y - 70), width: 300, height: 150 });

  // ── the ink beside contradiction orange and identity yellow, normal and simulated
  await page.evaluate(() => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
    svg.innerHTML = `<filter id="cvd-deutan" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="0.367322 0.860646 -0.227968 0 0 0.280085 0.672501 0.047413 0 0 -0.011820 0.042940 0.968881 0 0 0 0 0 1 0"/></filter>
      <filter id="cvd-protan" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="0.152286 1.052583 -0.204868 0 0 0.114503 0.786281 0.099216 0 0 -0.003882 -0.048116 1.051998 0 0 0 0 0 1 0"/></filter>`;
    document.body.append(svg);
  });
  const floorBox = await page.locator('#floor').boundingBox();
  // the whole floor: memberships on belts beside the identity Rewriter (yellow) and the clash Joiner (orange)
  await page.evaluate(() => { const s = window.__lw.get(); window.__lw.setCamera({ ...s.ui.camera, zoom: 0.95 }); window.__lw.openLens(null); window.__lw.setPlaying(true); });
  await page.waitForTimeout(2600);
  await page.evaluate(() => window.__lw.setPlaying(false));
  await page.waitForTimeout(300);
  const spec = undefined;
  await shot('ink-normal', spec);
  for (const f of ['deutan', 'protan']) {
    await page.evaluate((f) => { document.documentElement.style.filter = `url(#cvd-${f})`; }, f);
    await page.waitForTimeout(200);
    await shot(`ink-${f}`, spec);
  }
  await page.evaluate(() => { document.documentElement.style.filter = ''; });
  void floorBox;

  // ── the lens: the Theorem's membership premise rail and the reuse chip
  await page.evaluate((id) => { window.__lw.select([id]); window.__lw.openLens(id); }, built.mul);
  await page.waitForTimeout(500);
  const lens = await page.locator('.h3-lens').innerText();
  check((await page.locator('.h3-lens .h3-memtwin').count()) > 0, 'the lens draws the premise as one rail ending in ∈ H');
  check((await page.locator('.h3-lens .h3-plays .h3-subchip').count()) >= 2, `the reuse chip offers the subgroups (${JSON.stringify(lens.split('\n').filter((l) => / is$/.test(l)))})`);
  await crop('.h3-lens', '2-lens-theorem-reuse');
  // the Rewriter on the membership rail: braces over the term
  await page.evaluate((id) => { window.__lw.select([id]); window.__lw.openLens(id); }, built.can);
  await page.waitForTimeout(500);
  await crop('.h3-lens', '3-lens-rewriter-mem-rail');
  // the dock's lens: Expected / Arriving as memberships
  await page.evaluate(() => { const s = window.__lw.get(); const d = s.canvas.machines.find((m) => m.kind === 'socket'); window.__lw.select([d.id]); window.__lw.openLens(d.id); });
  await page.waitForTimeout(400);
  await crop('.h3-lens', '4-lens-dock');

  // ── the picker: a fresh Theorem's recipe list, with its Subgroup family
  const fresh = await page.evaluate(() => {
    const st = window.__lw; const s = st.get(); const g = s.canvas.machines.find((m) => m.kind === 'given');
    for (const [dx, dy] of [[4, 14], [8, 14], [12, 14], [4, 18], [10, 18]]) {
      const before = new Set(st.get().canvas.machines.map((m) => m.id));
      const e = st.place('theorem', { x: g.at.x + dx, y: g.at.y + dy }, {});
      if (e.ok) { const id = st.get().canvas.machines.find((m) => !before.has(m.id)).id; st.select([id]); st.openLens(id); return id; }
    }
    return null;
  });
  await page.waitForTimeout(500);
  const picker = await page.locator('.h3-lens').innerText().catch(() => '');
  check(!!fresh && /Subgroup/i.test(picker) && /closed under products/.test(picker) && /closed under conjugation/.test(picker), 'the Theorem picker lists the Subgroup family');
  await crop('.h3-lens', '5-picker-subgroup-family');

  // ── a Subgroup Tower: H₁ ≤ G on the floor, and its lens
  const tower = await page.evaluate(() => {
    const st = window.__lw; const s = st.get(); const g = s.canvas.machines.find((m) => m.kind === 'given');
    for (const [dx, dy] of [[-4, 6], [-2, 10], [2, 16], [6, 20]]) {
      const before = new Set(st.get().canvas.machines.map((m) => m.id));
      const e = st.place('tower', { x: g.at.x + dx, y: g.at.y + dy }, { config: { kind: 'tower', varId: 'H1', label: 'H₁', sort: 'G', sub: 'sub' } });
      if (e.ok) { const id = st.get().canvas.machines.find((m) => !before.has(m.id)).id; st.select([id]); st.openLens(id); return { id, cfg: st.get().canvas.machines.find((m) => m.id === id).config }; }
    }
    return null;
  });
  await page.waitForTimeout(500);
  check(!!tower && tower.cfg.sub === 'sub', `Subgroup Tower placed (${JSON.stringify(tower?.cfg)})`);
  const towerText = await page.evaluate(() => [...document.querySelectorAll('#floor .fl-tower text')].map((t) => t.textContent).join(' | '));
  check(/H1\s*≤G|H1≤G|H1 ≤G|≤/.test(towerText), `the Tower reads H₁ ≤ G (${towerText})`);
  await crop('.h3-lens', '6-lens-subgroup-tower');
  const tb = await page.locator('#floor .fl-tower').first().boundingBox();
  if (tb) await shot('6b-subgroup-tower', { x: Math.max(0, tb.x - 80), y: Math.max(0, tb.y - 60), width: tb.width + 160, height: tb.height + 120 });

  // ── run to ∎: the ceremony and the paper read the memberships
  await page.evaluate(() => { window.__lw.openLens(null); window.__lw.setPlaying(true); window.__lw.setSpeed(4); });
  let solved = false;
  for (let i = 0; i < 80 && !solved; i++) { await page.waitForTimeout(150); solved = await page.evaluate(() => !!window.__lw.get().ui.ceremony); }
  check(solved, 'e ∈ H delivered (∎)');
  await page.waitForTimeout(400); await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  await crop('.qed-card', '7-ceremony-paper');
  const cer = await page.locator('.qed-card').innerText().catch(() => '');
  check(/∈/.test(cer) && !/undefined/.test(cer), 'the ceremony and paper state memberships');
  check(!errors.length, `no page errors ${errors.slice(0, 3).join(' | ')}`);
  await page.evaluate(() => localStorage.clear());
  await ctx.close();
} finally {
  await browser.close();
}
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall ok');
process.exit(fail.length ? 1 : 0);

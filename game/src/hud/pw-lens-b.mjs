// COMMUTATOR review 2026-10 (builder B) — the real lens in every machine kind and key state, HEADLESS ONLY.
// Builds each scene through the store (`__lw`), opens the lens, screenshots it; a few checks use the real
// pointer and keyboard (pick a recipe, toggle a side, type into a slot, click a brace / caret).
// Usage: node src/hud/pw-lens-b.mjs [outDir]   (dev server already on http://localhost:8790/)
import { chromium } from 'playwright';

const BASE = process.env.HUD_URL ?? 'http://localhost:8790/';
const OUT = process.argv[2] ?? new URL('../../.shots/lens-b/', import.meta.url).pathname;
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const HMR_STUB = `export const createHotContext = () => ({ accept() {}, acceptExports() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {}, decline() {}, data: {} });
export const updateStyle = (id, css) => { let s = document.querySelector('style[data-vite-dev-id="' + id + '"]'); if (!s) { s = document.createElement('style'); s.setAttribute('data-vite-dev-id', id); document.head.appendChild(s); } s.textContent = css; };
export const removeStyle = (id) => document.querySelector('style[data-vite-dev-id="' + id + '"]')?.remove();
export const injectQuery = (u) => u; export class ErrorOverlay extends HTMLElement {}`;

const browser = await chromium.launch({ headless: true });
const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fail.push(what); };
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /\[hud\]/.test(m.text()))) errors.push(m.text()); });
  await page.goto(BASE);
  // a save that has earned the chapter-1 theorems (the Theorem picker needs them)
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('lemma-works/v3', JSON.stringify({ version: 4, lemmas: [], levels: {}, earned: ['witness', 'cancel', 'socks', 'nofix'], settings: { speed: 1, reducedMotion: false } })); });
  await page.reload();
  await page.waitForSelector('.h3-hotbar');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    const st = window.__lw;
    const at = (id) => ({ k: 'atom', id });
    const inv = (t) => ({ k: 'inv', arg: t });
    const mul = (...fs) => (fs.length === 1 ? fs[0] : { k: 'mul', fs });
    window.__b = {
      T: { at, inv, mul, e: { k: 'e' } },
      level(id) { st.openLevel(id); st.closeCards?.(); st.setUI({ hint: null, toast: null }); st.setPlaying(false); },
      clear() { const ids = st.get().canvas.machines.filter((m) => !m.locked).map((m) => m.id); if (ids.length) st.remove(ids); },
      place(kind, x, y, patch) {
        const before = new Set(st.get().canvas.machines.map((m) => m.id));
        const e = st.place(kind, { x, y }, { rot: 0 });
        if (!e.ok) throw new Error(`place ${kind} at ${x},${y}: ${e.reason}`);
        const id = st.get().canvas.machines.find((m) => !before.has(m.id)).id;
        if (patch) this.cfg(id, patch);
        return id;
      },
      cfg(id, patch) { const m = st.get().canvas.machines.find((x) => x.id === id); const e = st.configure(id, { ...m.config, ...patch }); if (!e.ok) throw new Error(`configure ${id}: ${e.reason}`); },
      link(a, pa, b, pb) { const e = st.connect({ m: a, port: pa }, { m: b, port: pb }); if (!e.ok) throw new Error(`connect ${a}.${pa} > ${b}.${pb}: ${e.reason}`); },
      open(id) { st.select([id]); st.openLens(id); },
      byKind(k) { return st.get().canvas.machines.filter((m) => m.kind === k).map((m) => m.id); },
      res(id) { const r = st.get().compiled?.machines?.[id]; return r ? { status: r.status, out: r.out ?? null, cands: r.candidates?.length ?? 0, choices: r.choices?.length ?? 0 } : null; },
      cfgOf(id) { return st.get().canvas.machines.find((m) => m.id === id)?.config; },
    };
  });
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  const settle = () => page.waitForTimeout(260);
  const shot = async (name) => {
    if (ONLY && !ONLY.test(name)) return;
    await settle();
    const lens = page.locator('.h3-lens:not([hidden])');
    if (!(await lens.count())) { check(false, `${name}: lens open`); return; }
    const box = await lens.boundingBox();
    check(Math.round(box.width) === 440, `${name}: lens is 440px wide (${Math.round(box.width)})`);
    await lens.screenshot({ path: `${OUT}real-${name}.png` });
  };
  const lensText = () => page.locator('.h3-lens').innerText().catch(() => '');

  // ═══ L03: a⁻¹ab = a⁻¹ab arrives; given h: ab = e ═══
  await ev(() => __b.level('L03'));
  const sp = await ev(() => __b.place('spool', 0, 6, { t: { k: 'knob', term: __b.T.mul(__b.T.inv(__b.T.at('a')), __b.T.at('a'), __b.T.at('b')) } }));
  const rw = await ev(() => __b.place('rewriter', 4, 6));
  await ev(([a, b]) => __b.link(a, 'out', b, 'q'), [sp, rw]);
  await ev((id) => __b.open(id), rw);
  await shot('00-rewriter-picker');
  check(!/Axioms|Fact made here|earned/.test(await lensText()), 'picker groups renamed, no origin notes');
  check((await page.locator('.h3-lens .h3-prow[data-key="pair"]').count()) === 1 && !(await page.locator('.h3-lens .h3-prow[data-key="pairInv"]').count()), 'one insert-pair row');
  // pick cancel with the real pointer
  await page.locator('.h3-lens .h3-prow[data-key="cancel"]').click();
  await settle();
  check((await ev((id) => __b.cfgOf(id).recipe?.k, rw)) === 'cancel', 'pointer: picking a recipe sets it');
  await shot('02-rewriter-cancel');
  check((await page.locator('.h3-lens .h3-br').count()) >= 2, 'cancel: braces drawn');
  check(await page.locator('.h3-lens .h3-mode').first().evaluate((b) => getComputedStyle(b).backgroundColor) !== 'rgb(255, 255, 255)', 'change pill is filled');
  // click the over-brace on the LHS (real pointer) → pinned
  const lhsBrace = page.locator('.h3-lens .h3-br.l').first();
  await lhsBrace.click();
  await settle();
  check((await ev((id) => __b.cfgOf(id).target?.k, rw)) === 'pin', 'pointer: clicking a brace pins the target');
  await shot('03-rewriter-pinned');
  await ev((id) => __b.cfg(id, { target: { k: 'first' }, tidy: false }), rw);
  await shot('04-rewriter-tidy-off');
  await ev((id) => __b.cfg(id, { tidy: true, recipe: { k: 'pop' } }), rw);
  await shot('05-rewriter-jammed');
  await ev((id) => __b.cfg(id, { recipe: { k: 'insertE' } }), rw);
  await shot('06-rewriter-insertE-carets');
  check((await page.locator('.h3-lens .h3-br.gap').count()) >= 6, 'insert e: carets drawn');
  await page.locator('.h3-lens .h3-br.gap.r').nth(2).click();
  await settle();
  check((await ev((id) => __b.cfgOf(id).gap?.k, rw)) === 'pin', 'pointer: clicking a caret pins the gap');
  await ev((id) => __b.cfg(id, { gap: { k: 'first' }, recipe: { k: 'insertPair', inv: false, x: { k: 'knob', term: null } } }), rw);
  await shot('07-pair-empty');
  // type into the slot with the real keyboard: shared caret, both slots fill
  await page.locator('.h3-lens .h3-slotknob .h3-slot-in').click();
  await page.keyboard.type('a');
  await settle();
  check((await page.locator('.h3-lens .h3-slotknob.focus .h3-caret').count()) === 2, 'slot: one caret per slot while focused (shared)');
  await page.keyboard.press('Enter');
  await settle();
  check(JSON.stringify(await ev((id) => __b.cfgOf(id).recipe.x, rw)) === JSON.stringify({ k: 'knob', term: { k: 'atom', id: 'a' } }), 'keyboard: typing a + Enter sets x := a');
  await shot('08-pair-x-a');
  // the orientation toggle (x⁻¹x first) via the pointer
  const firstSeg = page.locator('.h3-lens .h3-sidetoggle .h3-seg').first();
  check(/x/.test(await firstSeg.innerText()) && (await firstSeg.innerHTML()).indexOf('<sup') < (await firstSeg.innerHTML()).lastIndexOf('<i>'), 'orientation toggle: x⁻¹x first');
  await firstSeg.click();
  await settle();
  check((await ev((id) => __b.cfgOf(id).recipe.inv, rw)) === true, 'pointer: orientation toggle sets insertPair.inv');
  await ev((id) => { const c = __b.cfgOf(id); __b.cfg(id, { recipe: { ...c.recipe, x: { k: 'knob', term: __b.T.mul(__b.T.at('a'), __b.T.at('b')) } } }); }, rw);
  await shot('09-pair-other-orientation');
  await page.locator('.h3-lens .h3-slotknob .h3-slot-in').click();
  await page.keyboard.press('Meta+A'); await page.keyboard.press('Backspace');
  await page.keyboard.type('a(');
  await settle();
  check(/doesn’t read as a term/.test(await lensText()), 'slot: unparseable text says so');
  await shot('10-pair-bad');
  await page.keyboard.press('Escape');
  await ev((id) => __b.cfg(id, { recipe: { k: 'law', ref: { k: 'given', givenId: 'h' } }, dir: 'fwd' }), rw);
  await shot('11-rewriter-given-h');
  check(/⟶/.test(await page.locator('.h3-lens .h3-segs').first().innerText()), 'direction shows the rule itself');
  await ev((id) => __b.cfg(id, { dir: 'rev' }), rw);
  await shot('12-rewriter-given-reversed');
  await ev((id) => __b.cfg(id, { recipe: { k: 'routed' }, dir: 'fwd' }), rw);
  await shot('14-rewriter-routed');
  check(/LHS → RHS/.test(await lensText()), 'routed with nothing arriving: LHS → RHS');
  // change → picker with "keep current"
  await ev((id) => __b.cfg(id, { recipe: { k: 'cancel' } }), rw);
  await page.locator('.h3-lens .h3-mode', { hasText: 'change' }).click();
  await settle();
  await shot('01-rewriter-change-picker');
  await page.locator('.h3-lens .h3-mode', { hasText: 'keep current' }).click();
  await settle();
  // nothing routed in
  const rw2 = await ev(() => __b.place('rewriter', 4, 1, { recipe: { k: 'cancel' } }));
  await ev((id) => __b.open(id), rw2);
  await shot('15-rewriter-no-input');

  // ═══ Operator ═══
  const op = await ev(() => __b.place('operator', 8, 6));
  const sp2 = await ev(() => __b.place('spool', 8, 10, { t: { k: 'knob', term: __b.T.mul(__b.T.inv(__b.T.at('a')), __b.T.at('a'), __b.T.at('b')) } }));
  await ev(([a, b]) => __b.link(a, 'out', b, 'q'), [sp2, op]);
  await ev((id) => __b.open(id), op);
  await shot('16-operator-picker');
  await ev((id) => __b.cfg(id, { recipe: { k: 'multiply', side: 'left', t: { k: 'knob', term: null } } }), op);
  await shot('17-operator-multiply-empty');
  check(/t·LHS = t·RHS/.test((await lensText()).replace(/\s+/g, ' ')), 'operator side segments in LHS/RHS');
  await ev((id) => __b.cfg(id, { recipe: { k: 'multiply', side: 'left', t: { k: 'knob', term: __b.T.at('b') } } }), op);
  await shot('17b-operator-multiply-b');
  await ev((id) => __b.cfg(id, { recipe: { k: 'invert' } }), op);
  await shot('18-operator-invert');

  // ═══ Joiner ═══
  const jn = await ev(() => __b.place('joiner', 14, 6));
  await ev((id) => __b.open(id), jn);
  await shot('19-joiner-picker');
  await ev((id) => __b.cfg(id, { recipe: { k: 'clash' } }), jn);
  await shot('20-joiner-clash');

  // ═══ Given inlet, Dock ═══
  const gv = (await ev(() => __b.byKind('given')))[0];
  await ev((id) => __b.open(id), gv);
  await shot('37-given');
  const sk = (await ev(() => __b.byKind('socket')))[0];
  await ev((id) => __b.open(id), sk);
  await shot('38-dock-empty');

  // ═══ Spool, Tower ═══
  const sp3 = await ev(() => __b.place('spool', 0, 1));
  await ev((id) => __b.open(id), sp3);
  await shot('25-spool-empty');
  check(!/= LHS|= RHS/.test(await lensText()), 'Spool has no = LHS / = RHS chips');
  await page.locator('.h3-lens .h3-slotknob .h3-slot-in').click();
  await page.keyboard.type('ab');
  await page.keyboard.press('Enter');
  await settle();
  await shot('26-spool-ab');
  const tw = await ev(() => __b.place('tower', 14, 1));
  await ev((id) => __b.open(id), tw);
  await shot('27-tower');
  check(!(await page.locator('.h3-lens .h3-status').count()), 'Tower has no status');
  // rename with chips (real pointer)
  await page.locator('.h3-lens .h3-namechips .bn-chip', { hasText: 'y' }).click();
  await settle();
  check((await ev((id) => __b.cfgOf(id).label, tw)) === 'y', 'pointer: Tower letter chip renames it');
  await page.locator('.h3-lens .h3-sortsegs .h3-seg').nth(1).click();
  await settle();
  await shot('28-tower-z');
  await ev((id) => __b.cfg(id, { sort: 'G', label: 'x₁₂' }), tw);
  await shot('29-tower-long');
  await page.locator('.h3-lens .h3-nameslot .h3-slot-in').click();
  for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
  await settle();
  await shot('30-tower-cleared');
  await page.keyboard.press('Escape');

  // ═══ L01: delivered dock; wrong item ═══
  await ev(() => __b.level('L01'));
  const pre = (await ev(() => __b.byKind('spool')))[0];
  const sk1 = (await ev(() => __b.byKind('socket')))[0];
  await ev(([a, b]) => __b.link(a, 'out', b, 'q'), [pre, sk1]);
  await ev((id) => __b.open(id), sk1);
  await shot('39-dock-wrong');
  await ev(() => window.__lw.resetLevel());
  const r1 = await ev(() => __b.place('rewriter', 5, 0, { recipe: { k: 'cancel' } }));
  const pre2 = (await ev(() => __b.byKind('spool')))[0];
  const sk2 = (await ev(() => __b.byKind('socket')))[0];
  await ev(([a, b, c]) => { __b.link(a, 'out', b, 'q'); __b.link(b, 'out', c, 'q'); }, [pre2, r1, sk2]);
  await ev(() => window.__lw.setPlaying(true));
  for (let i = 0; i < 80; i++) { if (await ev(() => Object.keys(window.__lw.get().run.delivered ?? {}).length)) break; await page.waitForTimeout(150); }
  await ev(() => { window.__lw.setPlaying(false); window.__lw.clearCeremony?.(); });
  await page.waitForTimeout(400);
  await ev(() => window.__lw.clearCeremony?.());
  await ev((id) => __b.open(id), sk2);
  await shot('40-dock-delivered');

  // ═══ L06: theorems (unique inverse / cancellation), merged rows, side toggle ═══
  await ev(() => __b.level('L06'));
  const s6 = await ev(() => { const T = __b.T; return __b.place('spool', 0, 6, { t: { k: 'knob', term: T.mul(T.at('a'), T.at('b'), T.inv(T.at('b')), T.inv(T.at('a'))) } }); });
  const c1 = await ev(() => __b.place('rewriter', 4, 6, { recipe: { k: 'cancel' } }));
  const c2 = await ev(() => __b.place('rewriter', 8, 6, { recipe: { k: 'cancel' } }));
  const th = await ev(() => __b.place('theorem', 12, 6));
  await ev(([a, b, c, d]) => { __b.link(a, 'out', b, 'q'); __b.link(b, 'out', c, 'q'); __b.link(c, 'out', d, 'p0'); }, [s6, c1, c2, th]);
  await ev((id) => __b.open(id), th);
  await shot('21-theorem-picker');
  const rows = await page.locator('.h3-lens .h3-prow').allInnerTexts();
  check(rows.some((r) => /unique inverse/.test(r)) && rows.some((r) => /cancellation/.test(r)) && !rows.some((r) => /ᵒᵖ|left inverse|right cancellation/.test(r)), `theorem picker: merged rows (${rows.map((r) => r.split('\n')[0]).join(' / ')})`);
  await page.locator('.h3-lens .h3-prow[data-key="schema:witness"]').click();
  await settle();
  await shot('22-theorem-witness');
  check(/unique right inverse/.test(await lensText()), 'recipe header names the side: unique right inverse');
  await page.locator('.h3-lens .h3-sidetoggle .h3-seg').nth(1).click();
  await settle();
  check((await ev((id) => __b.cfgOf(id).recipe.ref.mirror, th)) === true, 'pointer: side toggle sets LibRef.mirror');
  check(/unique left inverse/.test(await lensText()), 'recipe header names the side: unique left inverse');
  await shot('23-theorem-witness-left');
  await page.locator('.h3-lens .h3-sidetoggle .h3-seg').nth(0).click();
  await settle();
  check((await ev((id) => __b.cfgOf(id).recipe.ref.mirror, th)) === undefined, 'side toggle back: no mirror flag (config unchanged from before the merge)');
  // hover a cut handle: "cut here:"
  const hd = page.locator('.h3-lens .h3-handle:not(.chosen)').first();
  if (await hd.count()) { await hd.hover(); await page.waitForTimeout(120); await shot('22b-theorem-cut-hover'); }
  await ev((id) => __b.cfg(id, { recipe: { k: 'library', ref: { k: 'schema', id: 'cancel', mirror: true } }, choice: 0 }), th);
  await shot('24-theorem-cancellation-right');

  // ═══ S01: ∀ ═══
  await ev(() => __b.level('S01'));
  const tx = await ev(() => __b.place('tower', 0, 0));
  const vx = await ev((id) => __b.cfgOf(id).varId, tx);
  const sx = await ev((v) => { const T = __b.T; return __b.place('spool', 0, 6, { t: { k: 'knob', term: T.inv(T.inv(T.at(v))) } }); }, vx);
  const fa = await ev(() => __b.place('forall', 6, 6));
  await ev(([a, b]) => __b.link(a, 'out', b, 'q'), [sx, fa]);
  await ev((id) => __b.open(id), fa);
  await shot('31-forall');
  const fa2 = await ev(() => __b.place('forall', 6, 10));
  await ev((id) => __b.open(id), fa2);
  await shot('36-forall-empty');
  await ev(() => window.__lw.setOutAsTerms(false));
  await ev((id) => __b.open(id), fa);
  await shot('31b-forall-text');
  await ev(() => window.__lw.setOutAsTerms(true));

  // ═══ the room popover: LHS / RHS are term slots (L09 has Suppose rooms) ═══
  await ev(() => { __b.level('L09'); window.__lw.openLens(null); });
  await page.locator('.h3-hotbar .h3-slot[data-key="room"]').click();
  await settle();
  await page.keyboard.type('a');
  await page.locator('.h3-roompop .h3-roomchips .bn-chip').nth(1).click(); // b, appended to the focused LHS
  await page.locator('.h3-roompop .h3-bareslot .h3-slot-in').nth(1).click();
  await page.keyboard.type('e');
  await settle();
  check(!(await page.locator('.h3-roompop button.lw-key.primary').isDisabled()), 'room popover: slots read ab and e; Paint is enabled');
  await page.locator('.h3-roompop').screenshot({ path: `${OUT}real-room-popover.png` });
  await page.keyboard.press('Escape');

  // ═══ the run cluster's Out-as-terms toggle (real pointer) ═══
  await ev(() => window.__lw.openLens(null));
  await page.locator('.h3-run .h3-outterms').click();
  await settle();
  check((await ev(() => window.__lw.get().save.settings.outAsTerms)) === false, 'pointer: run-cluster toggle turns Out as terms off');
  await page.locator('.h3-run').screenshot({ path: `${OUT}real-run-cluster.png` });
  await page.locator('.h3-run .h3-outterms').click();
  await settle();
  await page.locator('.h3-hotbar').screenshot({ path: `${OUT}real-hotbar.png` });

  check(!errors.length, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
} finally {
  await browser.close();
}
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall ok');
process.exit(fail.length ? 1 : 0);

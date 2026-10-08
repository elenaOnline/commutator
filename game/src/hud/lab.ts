// LEMMA WORKS v3 — the conjecture lab drawer (adapted from shell/lab.ts): state a claim, run it against
// small groups like test cases; prediction cards from level.predict. Testing never proves: a survivor can
// only be pinned as a dashed planning target on the order chip.
import * as K from '../kernel';
import type { Fact, Pallet, ScopeId } from '../kernel/types';
import { catalogue, evalTerm, holds, testClaim, type FiniteGroup } from '../groups';
import { reducedMotion } from '../ui/tokens';
import { esc, h, isSolved, labels, safe, fH, tH, nameHTML, type S as State, type Store } from './util';

export interface LabHooks { pin: (p: Pallet) => void; pinned: () => Pallet[] }
const activeScopeOf = (s: State): ScopeId => (s.ui.lens ? s.compiled?.scopeOf?.[s.ui.lens] : undefined) ?? K.ROOT;

interface RowResult { G: FiniteGroup; cases: number; fail: Record<string, string> | null; lhs?: string; rhs?: string }

function assumptionsFor(s: State, scope: ScopeId): { facts: Fact[]; names: string[] } {
  const L = labels(s.level);
  const facts: Fact[] = s.level.givens.map((g) => g.fact);
  const names = s.level.givens.map((g) => `<span class="math">${g.name === '|G|' ? '' : `<i>${nameHTML(g.name)}</i>: `}${fH(g.fact, L)}</span>`);
  let cur: ScopeId | undefined = scope;
  while (cur && cur !== K.ROOT) {
    const r = s.compiled?.graph?.rooms?.find((x) => x.id === cur);
    if (!r) break;
    const f: Fact = r.kind === 'suppose' ? { k: 'eq', l: r.l, r: r.r } : { k: 'neq', l: r.l, r: r.r };
    facts.push(f);
    names.push(`<span class="math lab-room">${fH(f, L)}</span> <span class="lab-dim">(room)</span>`);
    cur = r.parent;
  }
  return { facts, names };
}

function runGroup(G: FiniteGroup, atomIds: string[], assumptions: Fact[], claim: Pallet): RowResult {
  const n = G.order, k = atomIds.length;
  let cases = 0;
  const total = n ** k;
  for (let code = 0; code < total; code++) {
    const s: Record<string, number> = {};
    let c = code;
    for (const id of atomIds) { s[id] = c % n; c = Math.floor(c / n); }
    if (!assumptions.every((f) => holds(G, f, s))) continue;
    cases++;
    if (!holds(G, claim, s)) {
      const fail = Object.fromEntries(atomIds.map((id) => [id, G.labels[s[id]!]!]));
      let lhs: string | undefined, rhs: string | undefined;
      if (claim.k === 'eq' || claim.k === 'neq') {
        lhs = safe<string | undefined>(() => G.labels[evalTerm(G, claim.l, s)], undefined);
        rhs = safe<string | undefined>(() => G.labels[evalTerm(G, claim.r, s)], undefined);
      }
      return { G, cases, fail, lhs, rhs };
    }
  }
  return { G, cases, fail: null };
}

export interface Lab { render: (s: State) => void; toggle: (open?: boolean) => void; onToggle: (fn: (open: boolean) => void) => void }

const maxOrder = (gs: FiniteGroup[]) => Math.max(0, ...gs.map((G) => G.order));
const eligibleGroups = (facts: Fact[]) => safe(() => catalogue(), [] as FiniteGroup[]).filter((G) => facts.every((f) => f.k !== 'size' || f.n === G.order));
const sameP = (a: Pallet, b: Pallet) => JSON.stringify(a) === JSON.stringify(b);

export function mountLab(el: HTMLElement, store: Store, toast: (m: string) => void, hooks: LabHooks): Lab {
  el.className = 'lw-lab h3-lab';
  el.hidden = true;
  let onToggle: ((open: boolean) => void) | undefined;
  const close = h('button', { class: 'lab-close', 'aria-label': 'Close the conjecture lab' }, '×');
  close.addEventListener('click', () => toggle(false));
  const tabPredict = h('button', { class: 'lab-tab', role: 'tab' }, 'Predict');
  const tabTest = h('button', { class: 'lab-tab', role: 'tab' }, 'Test a claim');
  const tabs = h('div', { class: 'lab-tabs', role: 'tablist' }, tabPredict, tabTest);
  const predictPane = h('div', { class: 'lab-pane predict' });
  const testPane = h('div', { class: 'lab-pane test' });
  el.append(h('header', { class: 'lab-head' }, h('span', { class: 'lab-title' }, 'Conjecture lab'), h('span', { class: 'lab-dim' }, 'testing never proves'), close), tabs, predictPane, testPane);
  let tab: 'predict' | 'test' = 'test';
  const setTab = (t: 'predict' | 'test') => {
    tab = t;
    tabPredict.classList.toggle('on', t === 'predict'); tabTest.classList.toggle('on', t === 'test');
    tabPredict.setAttribute('aria-selected', String(t === 'predict')); tabTest.setAttribute('aria-selected', String(t === 'test'));
    predictPane.hidden = t !== 'predict'; testPane.hidden = t !== 'test';
  };
  tabPredict.addEventListener('click', () => setTab('predict'));
  tabTest.addEventListener('click', () => setTab('test'));

  // ───────── context: every result is bound to (level, scope, assumptions) ─────────
  let runId = 0;
  const ctxKey = (s: State, scope: ScopeId) => JSON.stringify([s.level.id, scope, assumptionsFor(s, scope).facts]);

  // ───────── free test ─────────
  const input = h('input', { placeholder: 'ab = ba', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Claim, two terms joined by = or ≠' });
  const form = h('form', { class: 'lab-form' }, input, h('button', { type: 'submit', class: 'lw-key primary small' }, 'Test'));
  const under = h('div', { class: 'lab-under' });
  const verdict = h('div', { class: 'lab-verdict', 'aria-live': 'polite' });
  const rows = h('div', { class: 'lab-rows' });
  const pins = h('div', { class: 'lab-pins' });
  testPane.append(form, under, verdict, rows, pins);
  let testCtx = '';

  const parseClaim = (src: string): { ok: true; p: Pallet } | { ok: false; error: string } => {
    const m = /^(.*?)(≠|!=|=\/=|=)(.*)$/.exec(src);
    if (!m) return { ok: false, error: 'Write a claim as two terms joined by = or ≠, e.g. ab = ba.' };
    const atoms = store.get().level.atoms;
    const l = safe(() => K.parseTerm(m[1]!.trim(), atoms), { ok: false as const, error: 'term entry is not ready yet' });
    if (!l.ok) return { ok: false, error: `Left side: ${l.error}` };
    const r = safe(() => K.parseTerm(m[3]!.trim(), atoms), { ok: false as const, error: 'term entry is not ready yet' });
    if (!r.ok) return { ok: false, error: `Right side: ${r.error}` };
    return { ok: true, p: { k: m[2] === '=' ? 'eq' : 'neq', l: l.term, r: r.term } };
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const pc = parseClaim(input.value.trim());
    if (!pc.ok) { toast(pc.error); return; }
    runTest(pc.p);
  });

  const counterHTML = (claim: Pallet, gname: string, asg: Record<string, string>, lhs: string | undefined, rhs: string | undefined, L: Record<string, string>) => {
    const asgHTML = Object.entries(asg).map(([id, v]) => `<span class="math"><i>${esc(L[id] ?? id)}</i> = ${esc(v)}</span>`).join(', ');
    const sides = claim.k === 'eq' || claim.k === 'neq'
      ? ` Then <span class="math">${tH(claim.l, L)}</span> = ${esc(lhs ?? '?')} and <span class="math">${tH(claim.r, L)}</span> = ${esc(rhs ?? '?')}.` : '';
    return `Counterexample in <b>${esc(gname)}</b>: ${asgHTML}.${sides}`;
  };

  const runTest = (claim: Pallet) => {
    const s = store.get();
    const my = ++runId;
    const scope = activeScopeOf(s);
    testCtx = ctxKey(s, scope);
    const { facts } = assumptionsFor(s, scope);
    const L = labels(s.level);
    const atomIds = s.level.atoms.map((a) => a.id);
    const groups = eligibleGroups(facts);
    const final = safe(() => testClaim(claim, s.level.atoms, facts, s.level), null);
    rows.innerHTML = ''; verdict.innerHTML = '<p class="lab-dim">Running the test cases…</p>';
    el.classList.remove('refuted', 'survived');
    const fast = reducedMotion();
    let i = 0, totalCases = 0;
    const tick = () => {
      if (my !== runId) return;
      if (i >= groups.length) return finish(null);
      const G = groups[i++]!;
      const row = h('div', { class: 'lab-row running' }, h('span', { class: 'lab-g' }, G.name), h('span', { class: 'lab-o' }, `order ${G.order}`), h('span', { class: 'lab-c' }, '…'), h('span', { class: 'lab-mark' }, ''));
      rows.append(row);
      rows.scrollTop = rows.scrollHeight;
      const res = runGroup(G, atomIds, facts, claim);
      totalCases += res.cases;
      setTimeout(() => {
        if (my !== runId) return;
        row.classList.remove('running');
        row.querySelector('.lab-c')!.textContent = res.cases ? `${res.cases} case${res.cases === 1 ? '' : 's'}` : 'no cases';
        if (res.fail) { row.classList.add('fail'); row.querySelector('.lab-mark')!.textContent = '✗'; finish(res); return; }
        row.classList.add(res.cases ? 'pass' : 'skip');
        row.querySelector('.lab-mark')!.textContent = res.cases ? '✓' : '–';
        setTimeout(tick, fast ? 0 : 45);
      }, fast ? 0 : 70);
    };
    const finish = (fail: RowResult | null) => {
      if (my !== runId) return;
      const claimHTML = `<span class="math">${fH(claim, L)}</span>`;
      if (fail?.fail || final?.k === 'counterexample') {
        el.classList.add('refuted');
        const ce = final?.k === 'counterexample' ? final : null;
        verdict.innerHTML = `<p>${claimHTML} <b class="bad">fails.</b> ${counterHTML(claim, ce?.group ?? fail!.G.name, ce?.assignment ?? fail!.fail!, ce?.lhs ?? fail?.lhs, ce?.rhs ?? fail?.rhs, L)}</p>`;
      } else if (final?.k === 'vacuous') {
        verdict.innerHTML = `<p><b>No test case.</b> No group in the catalogue (${final.groups} checked) satisfies these assumptions, so the claim is untested.</p>`;
      } else {
        el.classList.add('survived');
        const n = final?.k === 'survives' ? final.assignments : totalCases;
        verdict.innerHTML = `<p>${claimHTML} ${surviveHTML(groups, n, facts.length > 0).replace('<b class="good">Survives</b>', '<b class="good">survives</b>')} Pin it and build the proof.</p>`;
        const pin = h('button', { class: 'lw-key small' }, 'Pin as a planning target');
        pin.addEventListener('click', () => {
          if (ctxKey(store.get(), activeScopeOf(store.get())) !== testCtx) { toast('The context changed since this test. Test again first.'); return; }
          hooks.pin(claim);
          toggle(false);
          toast('Pinned on the work order as a planning target. It is not proven: only a delivery proves.');
        });
        verdict.append(pin);
      }
    };
    tick();
  };

  // ───────── prediction cards ─────────
  // `guess` is live; `snap` is the prediction frozen when the tests ran. Results are only ever
  // compared with the snapshot; changing a guess afterwards explicitly starts a new round.
  type Res = { ok: boolean; html: string };
  type Pred = { guess: (boolean | null)[]; snap: (boolean | null)[] | null; results: (Res | null)[]; ctx: string; round: number; running: boolean };
  const preds = new Map<string, Pred>();
  let predictCtx = '';
  const guessName = (g: boolean | null) => (g === null ? 'no guess' : g ? 'survives' : 'fails');
  const pinAndClose = (c: Pallet) => {
    hooks.pin(c);
    toggle(false);
    toast('Pinned on the work order as a planning target. It is not proven: only a delivery proves.');
  };
  const renderPredict = (s: State) => {
    const cards = s.level.predict ?? [];
    const L = labels(s.level);
    const ctx = ctxKey(s, K.ROOT);
    let st = preds.get(s.level.id);
    if (!st || st.ctx !== ctx) { st = { guess: cards.map(() => null), snap: null, results: cards.map(() => null), ctx, round: 1, running: false }; preds.set(s.level.id, st); }
    const state = st;
    const ran = state.snap !== null;
    predictPane.innerHTML = '';
    const { names } = assumptionsFor(s, K.ROOT);
    predictPane.append(h('p', { class: 'lab-intro' }, h('b', {}, 'Before you prove: which of these survive?'), ` Make a guess for each, then run the test groups.${state.round > 1 ? ` Round ${state.round}.` : ''}`),
      h('div', { class: 'lab-under', html: names.length ? `<span class="lab-dim">Under</span> ${names.join(', ')}` : '<span class="lab-dim">Under the group axioms only.</span>' }));
    const list = h('div', { class: 'pcards' });
    cards.forEach((c, i) => {
      const res = state.results[i];
      const card = h('div', { class: `pcard${res ? (res.ok ? ' survived' : ' refuted') : ''}` });
      const opt = (val: boolean) => {
        const on = state.guess[i] === val;
        const b = h('button', { class: `pguess${on ? ' on' : ''}`, role: 'radio', 'aria-checked': String(on), disabled: state.running,
          title: ran ? 'Changing a guess starts a new round' : val ? 'I think it survives every test group' : 'I think a group refutes it' },
          h('span', { class: 'pradio', 'aria-hidden': 'true' }), val ? 'survives' : 'fails');
        b.addEventListener('click', () => {
          if (state.snap !== null) { // the last round is history: start a new one rather than rewrite it
            state.snap = null; state.results = cards.map(() => null); state.round++;
            runId++;
          }
          state.guess[i] = state.guess[i] === val ? null : val;
          renderPredict(store.get());
        });
        return b;
      };
      card.append(h('div', { class: 'pcard-top' }, h('span', { class: 'pcard-claim math', html: fH(c, L) }),
        h('span', { class: 'pguesses', role: 'radiogroup', 'aria-label': 'Your guess' }, h('span', { class: 'pguess-label' }, 'I think'), opt(true), opt(false))),
        h('div', { class: 'pdots', 'data-i': i }));
      if (res && state.snap) {
        const p = state.snap[i] ?? null;
        const match = p === null ? '' : p === res.ok ? '<span class="pmatch yes">matches your prediction</span>' : '<span class="pmatch no">differs from your prediction</span>';
        card.append(
          h('div', { class: 'pyours', html: `Your prediction: <b>${guessName(p)}</b> ${match}` }),
          h('div', { class: 'pverdict', html: `<span class="pres-label">Result</span> ${res.html}` }));
        if (res.ok) {
          const pinned = hooks.pinned().some((x) => sameP(x, c));
          const pin = h('button', { class: 'lw-key small', disabled: pinned }, pinned ? 'Pinned as a target' : 'Pin as a target');
          pin.addEventListener('click', () => pinAndClose(c));
          card.append(pin);
        }
      }
      list.append(card);
    });
    const runBtn = h('button', { class: 'lw-key primary small', disabled: state.running }, state.running ? 'Testing…' : ran ? 'Run this round again' : 'Run the tests');
    runBtn.addEventListener('click', () => runPredictions());
    predictPane.append(list, h('div', { class: 'pfoot' }, runBtn, h('span', { class: 'lab-dim' }, 'No score. A survivor still needs a proof; only a proof delivers.')));
    predictCtx = ctx;
  };
  const surviveHTML = (groups: FiniteGroup[], cases: number, givens: boolean) => givens
    ? `<b class="good">Survives</b> all ${cases} case${cases === 1 ? '' : 's'} where the givens hold (${groups.length} group${groups.length === 1 ? '' : 's'} of order ≤ ${maxOrder(groups)}). Testing never proves.`
    : `<b class="good">Survives</b> all ${groups.length} group${groups.length === 1 ? '' : 's'} of order ≤ ${maxOrder(groups)} (${cases} case${cases === 1 ? '' : 's'}). Testing never proves.`;
  const runPredictions = () => {
    const s = store.get();
    const my = ++runId;
    const cards = s.level.predict ?? [];
    const st = preds.get(s.level.id)!;
    const L = labels(s.level);
    const { facts } = assumptionsFor(s, K.ROOT);
    const groups = eligibleGroups(facts);
    const atomIds = s.level.atoms.map((a) => a.id);
    const givens = s.level.givens.length > 0;
    st.snap = [...st.guess];           // freeze the predictions now
    st.results = cards.map(() => null); st.running = true;
    renderPredict(s);
    const fast = reducedMotion();
    let ci = 0;
    const done = () => { st.running = false; if (my === runId) renderPredict(store.get()); };
    const nextCard = () => {
      if (my !== runId) { st.running = false; return; }
      if (ci >= cards.length) return done();
      const i = ci++, claim = cards[i]!;
      const dots = predictPane.querySelector<HTMLElement>(`.pdots[data-i="${i}"]`);
      dots?.scrollIntoView({ block: 'nearest' });
      let gi = 0, cases = 0;
      const step = () => {
        if (my !== runId) { st.running = false; return; }
        if (gi >= groups.length) {
          st.results[i] = { ok: true, html: surviveHTML(groups, cases, givens) };
          return setTimeout(nextCard, fast ? 0 : 120);
        }
        const G = groups[gi++]!;
        const r = runGroup(G, atomIds, facts, claim);
        cases += r.cases;
        dots?.append(h('span', { class: `pdot ${r.fail ? 'fail' : r.cases ? 'pass' : 'skip'}`, title: `${G.name}: ${r.fail ? 'counterexample' : `${r.cases} cases`}` }, r.fail ? G.name : ''));
        if (r.fail) {
          st.results[i] = { ok: false, html: `<b class="bad">Fails.</b> ${counterHTML(claim, G.name, r.fail, r.lhs, r.rhs, L)}` };
          return setTimeout(nextCard, fast ? 0 : 260);
        }
        setTimeout(step, fast ? 0 : 38);
      };
      step();
    };
    nextCard();
  };

  // ───────── render / toggle ─────────
  let lastKey = '', lastLevel = '';
  const render = (s: State) => {
    const scope = activeScopeOf(s);
    const claims = hooks.pinned();
    const hasPredict = !!s.level.predict?.length;
    tabs.hidden = !hasPredict;
    if (s.level.id !== lastLevel) {
      lastLevel = s.level.id;
      setTab(hasPredict && !isSolved(s.save, s.level.id) ? 'predict' : 'test');
    }
    const ctx = ctxKey(s, scope);
    const key = JSON.stringify([ctx, claims.length]);
    if (key === lastKey) return;
    lastKey = key;
    // any context change invalidates in-flight runs and stale verdicts
    if (testCtx && testCtx !== ctx) {
      runId++;
      rows.innerHTML = '';
      verdict.innerHTML = '<p class="lab-stale">The level or scope changed, so the last result no longer applies. Test again.</p>';
      el.classList.remove('refuted', 'survived');
      testCtx = '';
    }
    if (hasPredict && predictCtx !== ctxKey(s, K.ROOT)) { runId++; renderPredict(s); }
    else if (hasPredict && !preds.get(s.level.id)?.running) renderPredict(s);
    const { names } = assumptionsFor(s, scope);
    under.innerHTML = names.length ? `<span class="lab-dim">Under</span> ${names.join(', ')}` : '<span class="lab-dim">Under the group axioms only.</span>';
    const L = labels(s.level);
    pins.innerHTML = claims.length ? '<div class="lab-dim">Planning targets (on the work order)</div>' : '';
    for (const c of claims) pins.append(h('div', { class: 'pin' }, h('span', { class: 'math', html: fH(c, L) })));
  };
  const toggle = (open?: boolean) => {
    el.hidden = open === undefined ? !el.hidden : !open;
    onToggle?.(!el.hidden);
    if (!el.hidden && tab === 'test') input.focus({ preventScroll: true });
  };
  setTab('test');
  return { render, toggle, onToggle: (fn) => { onToggle = fn; } };
}

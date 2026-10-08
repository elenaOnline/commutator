# LEMMA WORKS — architecture & ownership

Design: `../design/DESIGN.md` (v2). Kernel semantics: `KERNEL.md`. Visual
direction: `../design/research/visual-direction.md` §C "Overprint", with the
reference render at `../design/visual/png/c-overprint.png` and its source
`../design/visual/c-overprint.html` + `scene.js`.

Stack: TypeScript (strict), Vite, Vitest, SVG + DOM (no framework, no canvas
unless a builder has a measured reason). `npm run dev` serves on :8790.
`npm test` runs vitest. `npx tsc --noEmit` must stay clean.

## Folders and owners (strict: edit only your folder)

| folder | owner | what |
|---|---|---|
| `src/kernel/` | **kernel builder (Opus)** | Pure proof kernel: terms, matching, ops, check, offers, metrics, printing, parsing. Unit tests in `src/kernel/*.test.ts`. |
| `src/groups/` | **groups builder (Sol, junior)** | Finite group catalogue, evaluator, `testClaim`, and the semantic oracle test harness. |
| `tests/` | **acceptance builder (Sol, junior)** | K01–K118 acceptance tests plus intended solutions for every level, as proof-graph fixtures. |
| `src/bench/` | **bench builder (Opus)** | The bench: direct manipulation of the active pallet, offers, gap insertion, term entry, gestures, shake. |
| `src/board/` | **board builder (Opus)** | The isometric factory: belts, stations, buildings, ribbons, rooms, sockets, replay animation. |
| `src/shell/` | **shell builder (Opus)** | Layout; level map (theorem DAG); work order; givens/toolbox; transcript (+ Copy LaTeX); room/press/claim affordances; QED ceremony; metrics; replay controls; keyboard. |
| `src/state/`, `src/ui/`, `src/levels/`, `src/main.ts`, `index.html`, `*.md` here | **architect** | Store, derived belts, tokens, base CSS, level data, contracts. |

**Add-only rule for shared files.** If you need a new store action or field,
add it to `src/state/store.ts` without changing any existing signature, and
announce it in your final report. Never edit `src/kernel/types.ts` or
`src/levels/levels.ts`; ask the architect (say so in your report) if a type or
level is wrong.

## Data flow

```
levels.ts ──► Store ──► kernel.check(graph) ─► CheckResult
   ▲            │  ▲            ▲
   │            │  └─ commitOffer / addStart / openRoom / press / undo  (every mutation re-checked; illegal → 'shake' event, rollback)
   │            ▼
   │   subscribe(state) / on(event)
   │     ├─ shell  (layout, map, transcript, toolbox, ceremony, controls)
   │     ├─ board  (isometric factory; replay via ui.replay.cursor over ui.replay.order)
   │     └─ bench  (active pallet; kernel.offersAt / fillOffer → store.commitOffer)
```

- **The active pallet** is `ui.activeNode`, usually a belt end. Clicking a node
  anywhere (board station, transcript line) makes it active. Committing an
  offer from a mid-belt node truncates that belt's later stations (undoable).
- **Stations:** one gesture → one `meta.station` group of step nodes (e.g.
  rewrite + auto-tidy). `belts.ts` derives belts and stations for the board and
  the transcript.
- **Hover linking:** `store.setHover(nodeId)` from any surface. Every surface
  highlights `ui.hoverNode`.
- **Replay:** the shell drives `store.tickReplay(dt)` from rAF. The board
  reveals nodes in `ui.replay.order` up to `ui.replay.cursor` and animates the
  frontier. `cursor = Infinity` means "show everything" (the normal editing
  state).
- **Ceremony:** `ui.ceremony` is set on a fresh solve. The shell plays it and
  calls `store.clearCeremony()`.

## Screen

```
┌ work order ─────────┬──────────── board (isometric factory) ───────── map ┐
│ title, memo         │                                                  ◇ │
│ GOAL (big TeX)      │   rooms (violet Euler fields), belts as twin wires, │
│ givens (inlets)     │   stations (family-ink tiles), earned buildings     │
│ ──────────          │   (navy + gold band), ribbons (citations), sockets  │
│ transcript          ├──────────────────────────────────────────────────── │
│ (wire-ink margin,   │ BENCH  [ L-rail beads ]  =  [ R-rail beads ]  ghost  │
│  Copy LaTeX)        │        offers / gap menu / term entry / toolbox     │
│ metrics · par · PB  │ ▶ replay ▮▮ step   undo redo reset                  │
└─────────────────────┴─────────────────────────────────────────────────────┘
```

## Rules everyone follows

- **Soundness lives only in the kernel.** UI code never decides legality. It
  asks the kernel for offers and commits them through the store.
- **Colour = mechanic** (`src/ui/tokens.ts` FAMILY). Never use family inks
  decoratively. Every colour also has a glyph or shape.
- **Notation is never hidden.** Beads always carry their letter and ⁻¹.
- **Hand-feel is acceptance.** Measure input-to-present latency for bench
  gestures, not just animation pacing. Respect `prefers-reduced-motion`.
- **Testing etiquette (machine rules).** Browsers run **headless only**
  (Playwright Chromium is installed in this package: `node_modules/playwright`).
  Never open a visible window. Never quit or kill a browser you didn't launch;
  only kill your own PID. Screenshots go in `game/.shots/` (gitignored). Look
  at your PNGs before claiming a visual works.
- The dev server: start your own with
  `npx vite --port <your port> --strictPort` on a port assigned in your brief,
  and kill it (your PID only) when done.

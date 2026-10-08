# LEMMA WORKS v3 — architecture & ownership

Decisions: `../design/v3/DESIGN.md`. Engineering reference for compile/runtime/targeting/scope:
`../design/v3/proposals/sol-compiler.md` (DESIGN.md wins on conflicts: e.g. axioms are built into
Canceller/Expander/Popper rather than routed cards; sockets accept either orientation via a recorded swap;
every tool flag is on from order 1). Interaction reference: `../design/v3/research/factory-interaction.md`
and `../design/v3/proposals/astra.md` §7. Kernel semantics (unchanged): `KERNEL.md`.

v3 is the default entry (`npm run dev` → :8790). `?v2` mounts the old bench build for reference only.

## Folders and owners (edit only your folder)

| folder | owner | what |
|---|---|---|
| `src/factory/catalog.ts`, `geometry.ts`, `editor.ts` (+tests) | **EDITOR builder (Opus)** | Catalogue specs, footprints & ports with rotation, placement validation, belt routing (Manhattan A*), connect/branch, rooms (paint/resize with desk + gate), hit-testing, move/rotate/remove, copy/paste blueprints, `initialCanvas`. |
| `src/factory/compile.ts`, `targeting.ts`, `runtime.ts` (+tests) | **COMPILER builder (Opus)** | Canvas → ProofGraph lowering per machine, scope from geometry, first-match + pinned targets, statuses with maths reasons, deterministic tick runtime, metrics. |
| `src/floor/` | **FLOOR builder (Opus)** | Full-bleed isometric SVG floor: render machines/belts/items/rooms/ports/status, placement ghosts, belt drawing, selection/move, room painting, pan/zoom, alt-mode overlay, packet animation interpolated between ticks. |
| `src/hud/` | **HUD builder (Opus)** | App frame + HUD: hotbar & all-machines drawer, inspector lens (bracket targeting, knobs, term entry), order chip & goal, run cluster (play/pause/step/speed, clock driving store.tick), metrics, hints/onboarding, transcript drawer (+LaTeX), map, ceremony, conjecture lab (reuse v2 shell pieces by importing/adapting). |
| `tests/v3/` | **TEST builder (Sol, junior)** | Adversarial canvas suite + reference factories per level. |
| `src/factory/types.ts`, `src/factory/index.ts` (signatures), `src/state/factoryStore.ts`, `src/levels/`, `src/ui/`, `src/main.ts` | **architect** | Contracts. `index.ts` stub bodies may be replaced by re-exports from your own files (keep signatures). Add store actions add-only; announce them. |

Reusable v2 code (import, don't edit): `src/kernel/**`, `src/groups/**`, `src/ui/tokens.ts`, `src/ui/math.ts`,
`src/bench/shapes.ts` (bead shapes), `src/bench/entry.ts` (term entry), `src/board/geom.ts|draw.ts|beads.ts|mathsvg.ts`
(isometric primitives), `src/shell/proof.ts|map.ts|ceremony.ts|lab.ts` (copy into src/hud/ and adapt if their
store coupling is too tight — the v2 folders stay untouched).

## Rules everyone follows

- **The canvas is the game.** Nothing may reserve a permanent half of the screen. HUD elements float; drawers are closed by default.
- **Soundness lives only in the kernel.** The compiler lowers to kernel nodes; `check` decides. UI never decides legality.
- **Colour = mechanic** (tokens FAMILY); letters are bead shapes; maths in Latin Modern; notation never hidden.
- **Hand-feel is acceptance.** Measure input-to-present latency (place, connect, configure) — keep < 50 ms. Respect reduced motion.
- **Testing etiquette:** headless Playwright only (game/node_modules/playwright); never open a visible window; never kill
  processes you didn't start; own dev-server port as assigned; screenshots in game/.shots/v3-*.png — look at them.

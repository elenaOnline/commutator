# COMMUTATOR v4 — what changes for each owner

Decisions: `../design/v4/DESIGN.md` (read it first). Ownership is as in `ARCHITECTURE-v3.md`, plus:

| area | owner | v4 work |
|---|---|---|
| `src/kernel/**` (+ fixing legacy users in `src/bench`, `src/board`, `src/groups`) | KERNEL builder | graph `vars` (variables), `generalize` node (∀-intro + eigenvariable check), `assume` rooms (→ cond), `invert` op, `product` node, card sockets (law/cond targets up to renaming), `origin: 'authored'` schemas; oracle handles variables (∀ over them) |
| `src/factory/catalog.ts, geometry.ts, editor.ts, migrate.ts` | EDITOR builder | v4 catalogue (spool, tower, rewriter, operator, joiner, theorem, forall, carddock, hopper + protected), ports by recipe, towers (no ports; unique auto-subscripted labels), assume rooms, `migrateCanvas` (v3 → v4) |
| `src/factory/compile.ts, targeting.ts, runtime.ts` | COMPILER builder | recipe lowering, LibRef → RuleRef, towers → `graph.vars`, ∀ / assume gates, card sockets, `lemmaFrom`, `verifyLemma`; update `tests/v3` reference factories to v4 |
| `src/floor/` | FLOOR builder | tower mast + broadcast rings, striped variable beads, recipe glyph/ink on verb tiles, ∀ machine, assume rooms, symbol tracing, **Q** (empty floor clears cursor; machine = pipette), card docks |
| `src/hud/` | HUD builder | v4 hotbar + presets, lens **recipe picker** (library of rules, never results), tower/∀ lenses, **Save to Lemma Book**, Lemma Book drawer, **concept cards**, transcript for new nodes |
| `src/levels/cards.ts`, level revisions in `src/levels/levels.ts` | CONTENT writer | concept cards for every level; Toolsmith levels (∀ goals) |

Store (architect): `FSave.version 4` with `lemmas`, v3 migration, `ui.cards`, `ui.lemmaBookOpen`, actions
`openCards/closeCards/setCardPage/toggleLemmaBook/saveLemma/removeLemma`, `ctxFor(level, earned, lemmas)`.
Save key stays `lemma-works/v3` (save links keep working).

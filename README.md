# Commutator

*A factory game where you engineer real group-theory proofs.*

**Play it:** https://webreceptor.net/artifacts/commutator/

You place proof machines on an isometric floor and run belts between their
ports. Equations and hypotheses travel along the belts, and certified
equations arrive at the receiving dock. A sound proof kernel checks every
step a machine takes, so a level is solved only by a real proof.

There are two campaigns:

- **The factory campaign**, which starts with the group axioms.
- **The Book**, 71 levels that work through the group-theory chapters (2–16)
  of Charles Pinter's *A Book of Abstract Algebra*.

## Run it locally

```
cd game && npm install && npm run dev     # http://localhost:8790
npm test                                  # kernel, factory compiler/runtime, editor, levels, soundness
```

Progress saves in the browser. To restart the campaign, clear the
`localStorage` key `lemma-works/v3`. (Lemma Works was the working title.)

## How to play

- **Machines (hotbar 1–7):**
  - **Spool**, `t = t`.
  - **Rewriter**, which acts at a bracket.
  - **Operator**, which acts on the whole equation: multiply, invert, swap.
  - **Joiner**, which combines two facts: chain, product, clash.
  - **Theorem**, which turns premises into a conclusion.
  - **Tower**, which declares `x₁ ∈ G` or `n₁ ∈ ℤ` and broadcasts it everywhere.
  - **∀**, which generalizes over Tower variables.
- **Recipes:** placing a machine opens its recipe picker, a list of *rules*,
  never results. The groups are Operations, Group laws, Given here, Theorems,
  Saved (your Lemma Book), Imported, and Made here (the rule port). Mirror
  pairs such as left/right cancellation are one recipe with a side toggle,
  and anything that takes a term is a term slot with chips.
- **Connect:** drag from any output arrow to an input. Belts route, cross and
  branch, and you can splice a machine in by dropping it onto a belt.
- **Rooms (`G`):**
  - **Suppose:** ⊥ in, ¬P out.
  - **Classical:** ⊥ in, P out.
  - **Assume:** any fact Q in, `P ⇒ Q` out.
- **Your own lemmas:** a ∀ machine or Assume gate whose card is closed shows
  **✓ READY TO SAVE**. Save it, and it becomes a recipe in every later level.
  The Lemma Book (`L`) re-verifies every saved lemma whenever the game loads.
- **Learn:** concept cards open at each level; reopen them with **?** on the
  order chip. `Alt` labels every belt, `T` opens the live proof (Copy as
  LaTeX), and **Follow** traces one certificate.
- **Other keys:**
  - **Q:** over empty floor it clears the cursor; over a machine it copies it.
  - **Space:** run or pause.
  - **⌘Z:** undo.
  - **M:** the theorem map.
  - **Copy save link** (on the map) carries your progress to another copy.

## Where things are

- `game/KERNEL.md`: the proof rules.
- `game/ARCHITECTURE*.md`: modules and how they fit together.
- `game/src/kernel/`: the proof kernel.
- `game/src/factory/`: machine catalogue, editor, compiler, runtime.
- `game/src/floor/` and `game/src/hud/`: the UI.
- `game/src/levels/`: both campaigns.

Some comments point into a `design/` folder. The design notes aren't part of
this repository.

## License

MIT. See `LICENSE`.

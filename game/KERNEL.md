# Kernel semantics (contract)

Types: `src/kernel/types.ts`. API: `src/kernel/index.ts`. The adversarial
acceptance list is `../design/reviews/sol-math-adversary-r1.md` §4
(K01–K118). Where this file and that review disagree, this file wins and the
disagreement is listed under *Deliberate deviations*.

## Terms

- `norm` flattens nested `mul`, collapses a singleton `mul` to its child, and
  recurses into `inv`. It never removes `e`, cancels, or opens an inverse. An
  empty `mul` is an error.
- Equality is structural equality after `norm`.
- Atoms are rigid level constants. Metas appear only in cards (laws, conds,
  axioms). Applying a card instantiates its metas with ground terms built from
  the level's declared atoms, `e`, `inv`, `mul`. Undeclared atoms are
  rejected everywhere (start terms, lift terms, substitutions).

## Matching

`match(pattern, target)` returns every σ with
`norm(instantiate(pattern, σ)) == norm(target)`.
- A meta in a product word binds a **non-empty contiguous run** of factors. A
  run of length 1 binds the factor itself, longer runs bind a `mul`.
- A repeated meta binds the same term at every occurrence.
- `inv(P)` matches only an `inv(T)` and matches P against the **whole**
  argument T. If P is a product pattern its metas partition T's word.
- A non-meta pattern factor matches exactly one target factor.
- Candidate generation is free. **The final authority is the equality check
  `selected == norm(instantiate(src, σ))`**, re-run inside `check`.

## Addresses

`Addr {side, path, range?}` selects in an eq/neq pallet rail. `path` descends
through factor indices (at a mul) or `0` (an inv's argument). `range` is a
`[start,end)` factor interval of the word at the path; omitted means the whole
term at the path. The selected redex is `norm(mul(word[start:end]))`.
Replacement splices the instance's word into the factor list and
re-normalizes. Replacing inside an `inv` argument keeps the cap
(congruence). `GapAddr` is a gap in the word at a path: `0..word.length`.

## Step ops (on eq pallets; swap also on neq)

| op | rule |
|---|---|
| `rewrite(rule, dir, at, σ)` | The rule resolves to an equation `l = r` with metas. Axioms are laws. Registry schemas must be laws (zero-premise), mirrored if asked. Node rules must be an `eq` pallet (no metas) or a `law` card. `neq`, `bot`, `size` and `cond` are rejected as rewrite rules. src/dst = (l,r) for fwd, (r,l) for rev. σ must bind every meta of l and r. Check `termAt(at) == norm(inst(src,σ))`. Output: the rail with the redex replaced by `norm(inst(dst,σ))`. |
| `insertE(gap)` | Insert an `e` factor at the gap. Valid at any gap of any word, including inside an inv argument and around a singleton. |
| `lift(side,t)` | `L = R ⟹ tL = tR` (left) or `Lt = Rt` (right); t ground, declared atoms only. |
| `swap` | eq or neq: exchange sides. |

**Auto-tidy is not a kernel feature.** The bench emits an explicit unit
rewrite (`unitL` with `x` = the right neighbour, else `unitR` with `x` = the
left neighbour) as a second op in the same station. Popping a sole `e` (a
whole word of length 1) has no match. `e e → e` uses `x = e`.

## Graph nodes

| node | output | deps |
|---|---|---|
| `start(t)` | `eq(t,t)` | ∅ |
| `given(id)` | the manifest fact (any kind) | `{g:id}` |
| `assume(room)` | suppose: `eq(l,r)`. classical: `neq(l,r)` | `{a:room}` |
| `step(input, op)` | evalStep | deps(input) ∪ deps(rule node) |
| `apply(rule, inputs, σ)` | rule is a cond card (registry schema, mirrored if asked, or a node whose fact is a `cond`, i.e. a given). Every meta bound by σ. `inputs[i]` must be a pallet equal (eq/neq kind, both sides norm-equal, **ordered**) to `inst(premises[i],σ)`. Output: `inst(concl,σ)`. A zero-premise law applied emits its instance as an eq (universal elimination). | ∪ deps(inputs) ∪ deps(rule node) |
| `merge([n1,n2])` | `eq(X,M), eq(Y,M') ⟹ eq(X,Y)` iff M ≡ M' | ∪ |
| `clash([eqN,neqN])` | `bot` iff `eq(L,R)` and `neq(L,R)` or `neq(R,L)` | ∪ |
| `exit(room, input)` | input is `bot` with scope = room. suppose → `neq(l,r)`. classical → `eq(l,r)` (classical flag) | deps(input) − `{a:room}` |
| `press(input)` | input is `size(n)` → `law ∀x. xⁿ = e`. Requires `level.tools.press` | deps(input) |

**Scope law.** Every input and every rule node of a node must have scope equal
to the node's scope or an ancestor of it (rooms nest via `parent`). `assume`
must sit in its own room. `exit` sits in `room.parent` and its input in `room`
exactly. Nothing else crosses outward. Sibling rooms are invisible to each
other.

**Authority.** Givens resolve from the manifest only. Registry schemas must be
listed in `level.tools.schemas`. Merge, rooms and press require their flags.
The current level's own unlocks are never available. Cycles are rejected
before anything else.

**Sockets.** A socket is filled by the first root node (in graph order) whose
pallet equals the target exactly (kind, ordered sides, norm-equal) and whose
deps ⊆ `{g:id | id ∈ allowedGivens}`. That excludes room assumptions, which
cannot reach root anyway. Goal symmetry is the bench's job: it appends a
recorded `swap`. Solved = every socket filled.

**Classical flag** propagates from inputs and rule nodes. A classical exit
sets it.

## Mirror

`mirrorTerm` reverses every product's word, recursively, inside `inv` too.
A mirrored registry schema is the card with every term mirrored. This is
sound because Gᵒᵖ is a group with the same identity and inverses, and every
earned theorem is proven for all groups satisfying its premises. Size premises
are unaffected (|Gᵒᵖ| = |G|).

## Generalize (test helper)

For a socket: the level's atoms become metas. Allowed givens that are eq/neq
pallets become premises. The target becomes the conclusion. Card givens
(laws/conds) or size givens make it return `null` (not expressible as a
single cond card in v1). The registry's declared schema for an unlock must be
equal to `generalize` up to meta renaming, or be its mirror.

## Deliberate deviations from the review

- Levels with two sockets are avoided (Mirror replaces L4-R), so F4 cannot
  arise. The per-socket whitelist is still enforced.
- Rooms take only an equation target (F6).
- The press emits a law card (F5) as a node fact, with deps.

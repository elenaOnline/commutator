# Acceptance lane

Run `npx vitest run tests`. `python3 tests/poll.py` saves the real exit code,
JSON results, console output (including the par table), and polling history.
Only this folder is owned by the acceptance lane.

`acceptance.test.ts` covers K01–K118. Each review-only feature has an inline
comment explaining its v1 adaptation. Unknown output/dependency fields have
no authority: replay recomputes them. Foreign group elements use undeclared
stable IDs in the single-group v1 representation. Synthetic multi-socket
manifests test the retained whitelist rule; current campaign levels have one
socket. Size/card premises cause `generalize` to return null.

`solutions/` contains stable graph builders. Station groups reproduce one
bench gesture, including explicit auto-tidy. Ordered goal swaps are recorded
with `meta.gesture = 'auto-swap'`. Room clashes include their discharge node.
The campaign has changed since review §3: old L04 is now L05, old L05 is S01,
old L07/L08/L09 are now L08/L09/L10, and Clockwork is L11 using a size press.
The new L04 conjugates a five-turn return; L07 cancels a square-distribution
premise; L12 combines the 3/7 argument at ab with a second ba belt.

L03 exports both the exact lifted-given review route and bench routes. The
current L03 manifest disables Lift; a reachability failure on `liftedGiven`
is a manifest/design mismatch, not grounds to enable Lift in this lane.
L06 exports Witness Stamp and bench routes; L08 exports square and inverse
routes; L09 exports the direct and mirrored-cancellation room routes; L11
exports the expansion and forward-ribbon Clockwork routes. S01 also has its
bench route. The review names no distinct short route for the current L10.

The solution suite checks each station against `offersAt` at a checked graph
prefix, fills entered terms, and compares the complete op sequence (explicit
whole ranges and omitted whole ranges are equivalent). Sources, opening a
room, and pressing a size use the store's dedicated actions rather than
`offersAt`; all equation/lemma/clash stations use the offer API. The suite
checks every route's metrics, prints all part/axiom comparisons, and fails
only on parts below par. Generalized unlock cards compare up to meta renaming,
zero-premise law representation, and mirror. The finite-model oracle must see
a valid solved graph before checking every node against its retained premises.

# Acceptance lane report

Final command: `npx vitest run tests` — exit 1, 206 passed / 5 failed (211 total).
Acceptance: 117/118 passed; solution checks: 68/71 passed; oracle routes: 21/22 passed.
Strict standalone TypeScript check of all three suites passed (project tsconfig excludes tests).

## Remaining failures

- **K94 — kernel bound mismatch:** `Size(25)` and its press are accepted; `types.ts` specifies literals 1..24. The positive/integer validation lacks the upper bound. Test remains failing.
- **L03 liftedGiven — manifest/design mismatch:** exact review alternate requires Lift; current L03 tools disable it. The solve, metrics precondition, offer reachability, and oracle precondition tests remain failing. The two bench routes pass; do not enable Lift from the test lane.

All 14 primary campaign solutions solve and every bench station is offered. All 21 valid route graphs have zero finite-model oracle violations. All five unlock generalizations match registry cards up to the permitted equivalences.

## Par comparisons

Values are parts / axioms. Mismatches are reported; only parts below par fail.

| Level | Route | Actual | Par |
|---|---|---:|---:|
| L01 | solution | 1 / 2 | 1 / 2 |
| L02 | solution | 2 / 2 | 2 / 2 |
| L02 | intermediate | 2 / 2 | 2 / 2 |
| L03 | solution | 2 / 4 | 2 / 4 |
| L03 | intermediate | 2 / 4 | 2 / 4 |
| L03 | liftedGiven | unavailable | 2 / 4 |
| L04 | solution | 3 / 5 | 3 / 5 |
| L05 | solution | 3 / 5 | 3 / 5 |
| L06 | solution | 3 / 8 | 3 / 8 |
| L06 | bench | 3 / 6 | 3 / 8 |
| L07 | solution | 2 / 11 | 2 / 11 |
| L08 | solution | 3 / 6 | 3 / 7 |
| L08 | inverseRoute | 9 / 25 | 3 / 7 |
| L09 | solution | 4 / 6 | 3 / 8 |
| L09 | shortcut | 3 / 8 | 3 / 8 |
| L10 | solution | 4 / 9 | 4 / 9 |
| L11 | solution | 4 / 6 | 4 / 7 |
| L11 | shortRoute | 4 / 6 | 4 / 7 |
| L12 | solution | 8 / 14 | 8 / 18 |
| S01 | solution | 2 / 6 | 2 / 6 |
| S01 | bench | 2 / 4 | 2 / 6 |
| S02 | solution | 4 / 7 | 4 / 7 |

Scoring documentation note: current metrics excludes parts for a step annotated `auto-swap`, while the public API comment describes all distinct station groups. The table reports the actual kernel metrics; tests do not invent an alternative score.

## Evidence

- `final-run.log`: exact requested command and printed par table.
- `latest-results.json`: per-case machine-readable results.
- `par-table.json`: complete route table.
- `poll-history.jsonl`: recorded real exit codes during implementation arrival.
- `README.md`: review-to-current-campaign mappings and v1 adaptations.

Only `tests/` was edited; kernel, groups, level manifests, and store were left to their owners.

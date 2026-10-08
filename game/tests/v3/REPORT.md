89 passed / 2 failed (91); tests-only TypeScript check passes.
All seven reference factories deliver within 400 ticks; kernel checks solved; oracle reports zero false facts.
Suspected implementation bug: editor.place throws while cloning a cyclic AST instead of returning a refusal or compile jam (adversarial §16b).
Suspected implementation bug: runtime.stepRun accepts an injected packet with a real producer node ID but an inconsistent fact; the socket seals at tick 1 (§45).

| Level | Machines | Area | Cycles |
|---|---:|---:|---:|
| L01 | 1 | 30 | 32 |
| L02 | 3 | 58 | 49 |
| L03 | 3 | 50 | 52 |
| L05 | 3 | 48 | 51 |
| L06 | 4 | 43 | 45 |
| L04 | 5 | 68 | 70 |
| L07 | 2 | 38 | 41 |

Evidence: final-run.log, metrics.json; 180-second polling records in runs/.
Test corrections: Inverter port name; parameter/Meet/R01 routing; tick-zero source emissions; explicit timeout for large candidate construction (semantics unchanged).
Only tests/v3/ was modified by this task; production bugs remain failing.

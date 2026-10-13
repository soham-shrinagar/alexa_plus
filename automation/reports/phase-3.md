# Phase 3 — Search, counterexamples, and verified repair

The engine now builds a rule/entity dependency graph, searches a bounded set of disruption timings, reduces a reproducible failure by deleting unnecessary input events, proposes a scoped repair, and checks both the failure and explicit normal-behavior regressions. The command `automationCli.js repair` exposes the complete evidence.

## Delivered behavior

- Search holds each seed experiment's first input fixed and varies subsequent input times around constant-delay boundaries and adjacent milliseconds. It tests two documented input/rule orderings. The maximum is 64 experiments, default 32; truncation and incomplete simulation are exposed.
- The dependency graph labels potential reads/writes. It does not present a graph edge as a confirmed bug.
- Counterexample reduction preserves the same violated expectation. It performs greedy event deletion, capped at 100 attempts; it does not claim global minimality.
- A repair inserts one literal condition directly before the action responsible for violating a conditional expectation. This preserves normal entry behavior. Multi-clause negation, unconditional intent, unsupported constructs, and cases without a matching action require manual editing. Candidates are ranked by eligibility and number of edits, with at most eight candidates.
- Each regression supplies an independent final-state assertion. A candidate must pass these assertions, exercise every declared expectation across the suite, and leave no violation or substantive uncertainty in every searched experiment. Removing useful actions fails the normal-behavior assertion.
- Export checks the source project hash and provides before/after normalized HA YAML plus the exact canonical edit. Comments/layout are not preserved. Phase 4 adds owner identity and explicit version-bound export approval.

## Demonstration

The new `override-debug` fixture contains a motion rule and a separate manual-hold rule. Hold turns the lamp on; the motion rule's delayed off mistakenly overrides it. The proposed guard checks hold immediately before off. Three regressions cover hold during the delay, ordinary completion, and hold after normal completion. Expectations and normal outputs are declared in the fixture, not inferred from simulator output.

`phase-3-ha.json` records independent before/after execution in the real isolated HA runtime. `phase-3-verification.json` records bounded search coverage, the edit, and regression assertions. To reproduce:

```powershell
node apps/mcp-server/scripts/automationCli.js repair automation/fixtures/override-debug.yaml automation/fixtures/override-debug.json
node apps/mcp-server/scripts/repairEvidence.js --prepare
# Run testbed/run_ha.py with artifacts/automation/repair-cases.json and output automation/reports/phase-3-ha.json
node apps/mcp-server/scripts/repairEvidence.js automation/reports/phase-3-ha.json
npm run test:automation
```

## Limits

Verification completed: 17 automation tests; full suite 111 total, 110 passed, one optional Neon test skipped; 84 JavaScript files syntax checked. All six independent HA before/after cases and their state-change-sequence comparisons passed. No database changes were required for this phase.

The repair vocabulary intentionally covers one precise intervention; it is not a general synthesis system or proof of optimality. Search does not enumerate all initial states, all combinations of disruptions, arbitrary trigger-relative delay offsets, or all possible runtime schedules. Budgets and scope are visible in reports. Approval grants a reviewed YAML export, never installation in a live home. Physical effects remain unmodeled.

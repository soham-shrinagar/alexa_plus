# Phase 2 — Deterministic causal replay

The pure event engine executes supported normalized automations against explicit snapshots and timestamped inputs. It never calls services on a real home. Source-action keys, parent trace IDs, command/state observations, cancellation, blocked conditions and completion make each result inspectable. `causalTrace` reconstructs the chain that produced a violation. The CLI `run` command emits complete replay JSON.

Single mode ignores a new matching trigger while running. Restart cancels the previous continuation only after entry conditions pass. Constant delays advance virtual time. Event filters match literal data; unchanged states do not retrigger state-to triggers. Invariants are checked after same-timestamp reactions settle, final expectations at the horizon. This microstep convention is explicit: it does not claim universal HA scheduling equivalence.

Only confirmed expectations produce behavioral violations. A disagreement between commands alone is not a bug. Unknown targets/conditions, pending work, budgets, and unexercised expectations produce uncertainty. No expectations produces UNASSESSED. A repeated-feedback budget exhaustion is labeled a possible loop, not falsely reported as a proven cycle. Finite passing scenarios never constitute universal safety or a probability estimate.

## Verification

Completed: full suite 106 tests, 105 passed, one optional Neon integration skipped; syntax check passed. Eight HA runs passed (the original two plus six semantic checks), and all six simulator/runtime comparisons passed. Conformance exposed a harness issue: waiting for all HA tasks at the horizon also waited for pending delays. The harness now reads the state at the specified horizon instead. This was a test-harness correction, not a relaxed assertion.

Twelve automation tests cover import plus deterministic reproduction, source immutability, manual override guard, normal behavior, restart/single, unknown values, horizon truncation, event filters, and bounded feedback. Six independently specified conformance scenarios compare simulator outputs to authenticated real HA observations: normal completion, restart, single, guard, event filter, and chained rules. The checked-in `phase-2-ha.json` is the runtime evidence; `compareHa.js` checks input hashes, independent expected states, and state-change sequences, not exact wall-clock milliseconds.

```powershell
npm run test:automation
node apps/mcp-server/scripts/automationCli.js run automation/fixtures/manual-hold.yaml automation/fixtures/manual-hold.json
npm run automation:ha-cases
# Run the isolated testbed as documented, output automation/reports/phase-2-ha.json
node apps/mcp-server/scripts/compareHa.js automation/reports/phase-2-ha.json
```

Limits: HA 2024.12.5 virtual helpers only; no physical-device latency, clock/DST, queued/parallel modes or arbitrary template interpretation. Tie order is deterministic and configurable but not exhaustive. Rich visual replay arrives in phase 5; phase 2 provides CLI replay. Cycle proof is deferred: budgets fail closed. No database changes.

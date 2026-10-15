# Phase 6B — reproducible evaluation

## Protocol and results

The frozen corpus contains 13 author-written synthetic cases added after phases 1–5: three conflicts, four clean cases, three incomplete cases, one case without confirmed intent, and two unsupported imports. Expected states/statuses and repair eligibility are explicitly declared in `apps/mcp-server/scripts/evaluationCases.js`; the simulator does not generate the labels. The corpus SHA-256 is `828021e508fa39e98a9f52429c6c2cfd164a2bd6da538c6a8a9056e2274290fb`. A test prevents silently changing that corpus under the same evaluation.

The engine matched all 13 status labels and all declared final states/repair outcomes. There were 0 false alarms among the 4 clean cases and 0 missed violations among the 3 declared conflict cases. One delayed override produced an eligible guard preserving both the override and ordinary completion assertions. Unconditional and brightness defects were detected but correctly remained without an eligible automatic repair. Feedback returned incomplete, not a claimed cycle proof. A separate metamorphic test renames entities and shifts the entire input timeline and verifies the corresponding shifted finding.

A live `gemini-3.5-flash-lite` baseline received the same YAML, entities, confirmed expectations, scenario and suite, but no labels or engine results and no tools. It made one request for each of the first ten frozen cases, temperature 0.1. It matched 6/10 status labels; Rehearse matched 10/10 on those same cases. Raw model explanations, statuses and timings are in `phase-6-evaluation.json`. The baseline was not asked to produce repairs, so this does not establish superior repair quality. There were no repeated trials or model/prompt sweep. The last three cases were outside the ten-request baseline budget.

This is an author-written acceptance set, **not** a blinded benchmark, independent user study, or estimate of accuracy across households. It was not used to change the interpreter after seeing its labels. Existing independent HA runtime captures establish the previously documented semantic/reference cases; do not describe every new acceptance case as physically or independently HA-executed. The measured difference motivates executable checks, but does not establish that every LLM or prompt performs worse.

## Reproduction

From the repository root:

```powershell
npm run automation:evaluate
node --test apps/mcp-server/test/automation/evaluation.test.js
# Optional: ten real provider requests using the private configured key.
node apps/mcp-server/scripts/evaluateAutomation.js --llm --output artifacts/automation/evaluation-rerun.json
```

The default evaluator is offline, prints a machine-readable report and exits nonzero if any expected engine outcome fails. Output timestamps are UTC; the recorded run occurred October 16, 2026 IST. Elapsed times include local import/execution/repair work for engine cases and network/provider work for the LLM; hardware and provider load affect them. Do not use these unequal work timings as a service-level performance guarantee.

Actual users, independent household cases and repeated/blinded evaluation still require participants and their consent; a reproducible user-trial procedure is included in the submission pack instead of invented participant results.

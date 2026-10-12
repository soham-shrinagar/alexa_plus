import test from "node:test";
import assert from "node:assert/strict";
import { compileRoutine } from "../src/domain/routineCompiler.js";
import { parseRoutineGoal } from "../src/domain/intentParser.js";
import { schoolMorningScenario } from "../src/domain/scenarios/schoolMorning.js";
import { simulateRoutine } from "../src/domain/constraintEngine.js";
import { rehearse } from "../src/domain/rehearsalEngine.js";

const fixture = () =>
  compileRoutine(
    parseRoutineGoal(
      "Leave by 7:45, keep quiet before 7, and leave 15 minutes earlier when it rains.",
      schoolMorningScenario.defaults,
    ),
    schoolMorningScenario,
  );
test("explanations project actual violation IDs, expected policy and observed timing/power without an LLM", () => {
  const routine = fixture();
  const result = simulateRoutine(routine);
  const explanation = result.summary.explanation;
  assert.equal(explanation.languageSource, "deterministic-verifier-facts");
  assert.deepEqual(
    explanation.conflicts.map((item) => item.violationId),
    result.violations.map((item) => item.id),
  );
  const power = explanation.conflicts.find(
    (item) => item.code === "POWER_OVERLAP",
  );
  assert.equal(power.expected.maximumWatts, 2600);
  assert.equal(power.observed.simultaneousWatts, 3500);
  const readiness = explanation.conflicts.find(
    (item) => item.code === "READINESS_MISSED",
  );
  assert.equal(readiness.expected.finishByMinute, 450);
  assert.equal(readiness.observed.finishMinute, 455);
  assert.ok(readiness.resolutionKinds.includes("EXPLICIT_REQUEST_REVISION"));
});
test("modeled resolutions link to real verification and retain blocked policies", () => {
  const routine = fixture();
  const result = rehearse(routine, routine.context, { events: [] });
  assert.equal(result.options[0].feasible, false);
  assert.equal(result.options[0].resolution.verificationStatus, "FAILED");
  assert.equal(result.options[0].resolution.requiresApproval, true);
  assert.ok(
    result.options[0].resolution.resolvesViolationIds.every((id) =>
      result.unchanged.violations.some((issue) => issue.id === id),
    ),
  );
  assert.deepEqual(result.options[0].routine.constraints, routine.constraints);
});
test("missing steps and unsupported constraints provide a limitation rather than an invented resolution", () => {
  const routine = fixture();
  routine.constraints.push({
    id: "unsupported",
    type: "UNKNOWN",
    severity: "critical",
  });
  const explanation = simulateRoutine(routine).summary.explanation;
  const missing = explanation.conflicts.find(
    (item) => item.constraintId === "unsupported",
  );
  assert.equal(missing.code, "UNSUPPORTED_CONSTRAINT");
  assert.ok(missing.limitation);
  assert.deepEqual(missing.resolutionKinds, ["CLARIFY_DECLARED_INPUT"]);
});

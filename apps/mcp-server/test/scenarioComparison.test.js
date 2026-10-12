import test from "node:test";
import assert from "node:assert/strict";
import { compareScenarioSet } from "../src/domain/scenarioComparison.js";
import { compileRoutine } from "../src/domain/routineCompiler.js";
import { getScenario } from "../src/domain/scenarios/schoolMorning.js";
import { parseRoutineGoal } from "../src/domain/intentParser.js";

const scenario = getScenario("school-morning");
const base = () =>
  compileRoutine(
    parseRoutineGoal("Leave by 7:45 and prepare for school", scenario.defaults),
    scenario,
  );
test("bounded scenario set verifies fixed schedules without modifying source or fetching evidence", () => {
  const routine = base(),
    before = JSON.stringify(routine),
    now = Date.now();
  const input = {
    scenarios: [
      { id: "baseline", label: "Expected", scenario: { events: [] } },
      {
        id: "failure",
        label: "Departure unavailable",
        scenario: {
          events: [{ type: "CAPABILITY_UNAVAILABLE", capability: "depart" }],
        },
      },
    ],
    candidateScenario: { events: [] },
  };
  const result = compareScenarioSet(routine, routine.context, input, now);
  assert.equal(result.candidates.length, 2);
  assert.ok(
    result.candidates.every(
      (candidate) => candidate.rows[1].verification.status === "FAILED",
    ),
  );
  assert.deepEqual(
    result,
    compareScenarioSet(routine, routine.context, input, now),
  );
  assert.equal(JSON.stringify(routine), before);
  assert.match(result.interpretation, /not success probabilities/);
});
test("scenario sets reject empty, excessive, duplicate and unsupported inputs", () => {
  const routine = base();
  const row = { id: "a", label: "Expected", scenario: { events: [] } };
  for (const scenarios of [
    [],
    Array(9).fill(row),
    [row, row],
    [{ ...row, scenario: { events: [{ type: "UNSUPPORTED" }] } }],
  ])
    assert.throws(() =>
      compareScenarioSet(routine, routine.context, { scenarios }),
    );
});

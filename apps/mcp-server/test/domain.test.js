import assert from "node:assert/strict";
import test from "node:test";
import { schoolMorningScenario } from "../src/domain/scenarios/schoolMorning.js";
import { parseRoutineGoal } from "../src/domain/intentParser.js";
import { compileRoutine } from "../src/domain/routineCompiler.js";
import { buildMicroTwin } from "../src/domain/microTwinBuilder.js";
import { simulateRoutine } from "../src/domain/constraintEngine.js";
import { repairRoutine } from "../src/domain/repairEngine.js";
import { reviseRoutine } from "../src/domain/revisionEngine.js";
import { adaptRoutine } from "../src/domain/runtimeEngine.js";

const goal = "Make our school mornings run themselves. We need to leave by 7:45. Don't wake the baby before 7, don't run the kettle and water heater together, and leave 15 minutes earlier when it rains.";

test("compiler creates a generic temporal routine and only a relevant micro-twin", () => {
  const parsed = parseRoutineGoal(goal, schoolMorningScenario.defaults);
  const routine = compileRoutine(parsed, schoolMorningScenario);
  const twin = buildMicroTwin(schoolMorningScenario, routine);
  assert.equal(parsed.departureMinute, 465);
  assert.equal(parsed.quietUntilMinute, 420);
  assert.equal(twin.kind, "just-in-time-micro-twin");
  assert.ok(twin.excludedEntityCount > 0);
  assert.ok(twin.devices.every((device) => routine.steps.some((step) => step.targetId === device.id)));
});

test("simulation exposes power, quiet, and rainy deadline conflicts", () => {
  const routine = compiled(); const result = simulateRoutine(routine);
  const codes = new Set(result.violations.map((item) => item.code));
  assert.equal(result.status, "FAILED");
  assert.ok(codes.has("POWER_OVERLAP"));
  assert.ok(codes.has("QUIET_WINDOW"));
  assert.ok(codes.has("LATE_DEPARTURE"));
  assert.ok(codes.has("READINESS_MISSED"));
});

test("repair removes mechanical conflicts but preserves the family decision", () => {
  const result = repairRoutine(compiled());
  const codes = result.after.violations.map((item) => item.code);
  assert.equal(result.status, "NEEDS_INPUT");
  assert.deepEqual(codes, ["READINESS_MISSED"]);
  assert.equal(result.suggestions.length, 1);
});

test("explicit Friday revision verifies without weakening unrelated constraints", () => {
  const repaired = repairRoutine(compiled()).routine;
  const result = reviseRoutine(repaired, "On Fridays, Maya can wake at 6:50, but keep everything else unchanged.");
  assert.equal(result.simulation.status, "PASSED");
  assert.equal(result.routine.constraints.find((item) => item.id === "power-budget").maxWatts, 2600);
  assert.equal(result.routine.steps.find((item) => item.id === "maya-ready").startTime, "06:50");
});

test("runtime adaptation skips an optional failed device and advances for delay", () => {
  const verified = reviseRoutine(repairRoutine(compiled()).routine, "Maya can wake at 6:50").routine;
  const withoutCoffee = adaptRoutine(verified, { type: "DEVICE_UNAVAILABLE", capability: "make_coffee" });
  assert.ok(!withoutCoffee.routine.steps.some((step) => step.id === "make-coffee"));
  const delayed = adaptRoutine(withoutCoffee.routine, { type: "TRAVEL_DELAY", minutes: 5 });
  assert.equal(delayed.routine.steps.find((step) => step.departure).startTime, "07:25");
  assert.equal(delayed.routine.steps.find((step) => step.id === "entry-light").startTime, "07:20");
  assert.equal(delayed.simulation.status, "PASSED");
});

function compiled() { return compileRoutine(parseRoutineGoal(goal, schoolMorningScenario.defaults), structuredClone(schoolMorningScenario)); }

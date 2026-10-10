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

test("power verification sums three devices and ignores non-overlapping boundary intervals", () => {
  const steps = ["one", "two", "three"].map((id) => ({ id, label: id, startMinute: 400, endMinute: 410, durationMinutes: 10, powerWatts: 1000 }));
  const constraints = [{ id: "power", type: "MAX_CONCURRENT_POWER", maxWatts: 2600, severity: "critical" }];
  const result = simulateRoutine({ steps, constraints, context: {} });
  assert.equal(result.status, "FAILED"); assert.equal(result.violations[0].details.totalWatts, 3000);
  steps[2] = { ...steps[2], startMinute: 410, endMinute: 420 };
  assert.equal(simulateRoutine({ steps, constraints, context: {} }).status, "PASSED");
});

test("unknown constraints and malformed step times fail verification", () => {
  const routine = compiled();
  routine.constraints.push({ id: "unknown", type: "UNIMPLEMENTED", severity: "warning" });
  assert.equal(simulateRoutine(routine).status, "FAILED");
  routine.steps[0].startMinute = -1;
  assert.ok(simulateRoutine(routine).violations.some((item) => item.code === "INVALID_TIMING"));
});

test("Friday permission does not allow an early start on other weekdays", () => {
  const result = reviseRoutine(repairRoutine(compiled()).routine, "On Fridays, Maya can wake at 6:50");
  const earliest = result.routine.constraints.find((constraint) => constraint.type === "EARLIEST_START");
  assert.equal(earliest.atMinute, 420); assert.equal(earliest.exceptions.Friday, 410);
  const monday = simulateRoutine(result.routine, { ...result.routine.context, weekday: "Monday" });
  assert.equal(monday.status, "FAILED"); assert.ok(monday.violations.some((item) => item.code === "EARLY_START"));
});

test("repeated delay reports are idempotent and weather updates recompute departure", () => {
  const verified = reviseRoutine(repairRoutine(compiled()).routine, "Maya can wake at 6:50").routine;
  const first = adaptRoutine(verified, { type: "TRAVEL_DELAY", minutes: 5 });
  const repeated = adaptRoutine(first.routine, { type: "TRAVEL_DELAY", minutes: 5 });
  assert.equal(repeated.routine.steps.find((step) => step.departure).startTime, "07:25");
  const clear = adaptRoutine(repeated.routine, { type: "WEATHER_CHANGED", raining: false });
  assert.equal(clear.routine.steps.find((step) => step.departure).startTime, "07:40");
  assert.equal(clear.routine.steps.find((step) => step.relativeToDepartureMinutes !== undefined).startTime, "07:35");
});

test("goal parser rejects impossible clock times and excessive rain buffers", () => {
  assert.throws(() => parseRoutineGoal("School morning leave by 7:90", schoolMorningScenario.defaults), (error) => error.code === "INVALID_TIME");
  assert.throws(() => parseRoutineGoal("Leave by 27:00", schoolMorningScenario.defaults));
  assert.throws(() => parseRoutineGoal("Leave 500 minutes earlier when it rains", schoolMorningScenario.defaults), (error) => error.code === "INVALID_GOAL");
});

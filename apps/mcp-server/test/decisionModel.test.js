import test from "node:test";
import assert from "node:assert/strict";
import {
  scenarioFromControls,
  describeChange,
  describeEvent,
  formatFacts,
} from "../public/workspace/decisionModel.js";
test("decision controls produce combined hypothetical events without duplicate failures or implied observations", () => {
  const scenario = scenarioFromControls({
    extraTravelMinutes: 15,
    raining: true,
    capabilities: ["depart", "depart", "manual_task"],
    stepId: "prepare-1",
    taskMinutes: 10,
  });
  assert.equal(scenario.events.length, 5);
  assert.ok(scenario.events.every((event) => event.hypothetical === true));
  assert.deepEqual(scenarioFromControls({}), { events: [] });
});
test("decision labels disclose changed durations and format only actual server facts", () => {
  assert.equal(
    describeChange({
      label: "Packing",
      from: "08:00",
      to: "08:00",
      originalDurationMinutes: 10,
      durationMinutes: 20,
    }),
    "Packing: 10 → 20 min duration",
  );
  assert.equal(
    describeEvent({ type: "TASK_ALLOWANCE", stepId: "pack", minutes: 10 }, [
      { id: "pack", label: "Packing" },
    ]),
    "+10 min for Packing",
  );
  assert.equal(
    formatFacts({ finishByMinute: 600, available: false }),
    "finish by minute: 10:00 · available: false",
  );
});

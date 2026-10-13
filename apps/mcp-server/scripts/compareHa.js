import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { conformanceCases } from "../src/automation/conformanceCases.js";
import { toHaRules } from "../src/automation/importYaml.js";
import { hash } from "../src/automation/schema.js";
import { simulate } from "../src/automation/engine.js";

const report = JSON.parse(readFileSync(process.argv[2], "utf8"));
assert.equal(report.runtime, "Home Assistant Core");
for (const { project, scenario, expected, changes } of conformanceCases()) {
  const observed = report.cases.find(c => c.id === scenario.id);
  assert.ok(observed?.assertionsPassed && observed.restRead && observed.authenticatedWebSocket, `Missing independent evidence: ${scenario.id}`);
  assert.equal(observed.inputHash, hash({ id: scenario.id, entities: project.entities, rules: toHaRules(project), events: scenario.events, until: scenario.until, expected }));
  const simulated = simulate(project, scenario);
  for (const [entityId, state] of Object.entries(expected)) {
    assert.equal(observed.finalStates[entityId], state);
    assert.equal(simulated.states[entityId].state, state);
  }
  assert.deepEqual(observed.events.filter(e => e.entityId === "input_boolean.lamp").map(e => e.state), changes);
  assert.deepEqual(simulated.trace.filter(e => e.kind === "state_changed" && e.entityId === "input_boolean.lamp").map(e => e.state), changes);
  console.log(`PASS ${scenario.id}: independent expected states + HA observations + simulator agree`);
}

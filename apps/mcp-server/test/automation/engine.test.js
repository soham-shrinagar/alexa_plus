import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importAutomations } from "../../src/automation/importYaml.js";
import { simulate, causalTrace } from "../../src/automation/engine.js";

const fixture = JSON.parse(readFileSync(new URL("../../../../automation/fixtures/manual-hold.json", import.meta.url)));
const yaml = readFileSync(new URL("../../../../automation/fixtures/manual-hold.yaml", import.meta.url), "utf8");
const project = importAutomations(yaml, fixture.entities, fixture.expectations).project;
const scenario = fixture.scenarios[0];

test("delayed override is a reproducible causal counterexample, without mutating input", () => {
  const before = JSON.stringify(project), run = simulate(project, scenario);
  assert.equal(run.status, "VIOLATION"); assert.equal(run.findings[0].at, 600);
  assert.equal(causalTrace(run, run.findings[0].cause).filter(x => x.kind === "action").length, 3);
  assert.deepEqual(run, simulate(project, scenario)); assert.equal(JSON.stringify(project), before);
});
test("conditional guard stops delayed off but preserves normal completion", () => {
  const fixed = structuredClone(project);
  fixed.rules[0].actions.splice(2, 0, { kind: "condition", condition: { entityId: "input_boolean.hold", state: "off" } });
  assert.equal(simulate(fixed, scenario).status, "NO_VIOLATION_FOUND");
  const normal = simulate(fixed, fixture.scenarios[1]);
  assert.equal(normal.states["input_boolean.lamp"].state, "off");
  assert.equal(normal.status, "INCONCLUSIVE"); // hold expectation was never exercised
});
test("restart cancels a pending delay whereas single ignores the second trigger", () => {
  const p = structuredClone(project); p.expectations = [];
  const s = { id: "retrigger", events: [scenario.events[0], { kind: "state", entityId: "input_boolean.motion", state: "off", at: 100 }, { ...scenario.events[0], at: 200 }], until: 1000 };
  const restarted = simulate(p, s);
  assert.equal(restarted.trace.filter(x => x.kind === "state_changed" && x.entityId.endsWith("lamp")).at(-1).at, 800);
  assert.ok(restarted.trace.some(x => x.kind === "cancelled"));
  p.rules[0].mode = "single";
  const single = simulate(p, s);
  assert.equal(single.trace.filter(x => x.kind === "state_changed" && x.entityId.endsWith("lamp")).at(-1).at, 600);
  assert.ok(single.trace.some(x => x.kind === "single_skipped"));
});
test("unavailable values, unexercised expectations and unfinished horizons never pass", () => {
  const p = structuredClone(project); p.entities["input_boolean.lamp"].state = "unavailable";
  assert.equal(simulate(p, scenario).status, "INCONCLUSIVE");
  assert.equal(simulate(project, { ...scenario, until: 300 }).status, "INCONCLUSIVE");
});
test("event data filters and state-triggered chains execute; no-op states do not retrigger", () => {
  const p = structuredClone(project); p.expectations = [];
  p.rules[0].triggers = [{ kind: "event", eventType: "rehearse_test", data: { room: "hall" } }];
  const s = { id: "event", events: [{ kind: "event", eventType: "rehearse_test", data: { room: "kitchen" }, at: 0 }], until: 1000 };
  assert.equal(simulate(p, s).trace.filter(x => x.kind === "started").length, 0);
  s.events[0].data.room = "hall";
  assert.equal(simulate(p, s).trace.filter(x => x.kind === "started").length, 1);
});
test("feedback consumes a bounded budget and reports uncertainty, never a safety verdict", () => {
  const p = structuredClone(project); p.expectations = [];
  p.rules[0].triggers = [{ kind: "state", entityId: "input_boolean.lamp", to: "on" }];
  p.rules[0].actions = [{ kind: "set", entityIds: ["input_boolean.lamp"], state: "off" }];
  p.rules.push({ ...structuredClone(p.rules[0]), id: "back", triggers: [{ kind: "state", entityId: "input_boolean.lamp", to: "off" }], actions: [{ kind: "set", entityIds: ["input_boolean.lamp"], state: "on" }] });
  const run = simulate(p, { id: "loop", events: [{ kind: "state", entityId: "input_boolean.lamp", state: "on", at: 0 }], until: 100 }, { maxSteps: 100 });
  assert.equal(run.status, "INCONCLUSIVE"); assert.equal(run.coverage.steps, 100);
  assert.ok(run.coverage.uncertainties.some(x => x.includes("budget")));
});

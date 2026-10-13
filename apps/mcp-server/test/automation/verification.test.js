import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importAutomations } from "../../src/automation/importYaml.js";
import { dependencyGraph, search, minimizeCounterexample, proposeRepairs, verifySuite, exportRepair } from "../../src/automation/verification.js";
const snapshot = JSON.parse(readFileSync(new URL("../../../../automation/fixtures/override-debug.json", import.meta.url)));
const source = readFileSync(new URL("../../../../automation/fixtures/override-debug.yaml", import.meta.url), "utf8");
const imported = importAutomations(source, snapshot.entities, snapshot.expectations), project = imported.project;

test("bounded search finds counterexamples and explicitly reports truncation", () => {
  const result = search(project, snapshot.suite.map(x => x.scenario), { limit: 6 });
  assert.equal(result.tested, 6); assert.equal(result.truncated, true); assert.ok(result.counterexamples.length);
  assert.throws(() => search(project, [], { limit: 1000 }));
});
test("greedy minimization preserves the same violated expectation", () => {
  const s = structuredClone(snapshot.suite[0].scenario);
  s.events.push({ kind: "state", entityId: "input_boolean.motion", state: "off", at: 1000 });
  const minimized = minimizeCounterexample(project, s, "respect_hold");
  assert.ok(minimized.scenario.events.length < s.events.length);
  assert.throws(() => minimizeCounterexample(project, snapshot.suite[1].scenario, "respect_hold"));
});
test("a scoped guard fixes counterexamples and retains explicit normal behavior", () => {
  const result = proposeRepairs(project, snapshot.suite);
  assert.equal(result.baseline.passed, false);
  const candidate = result.candidates.find(c => c.eligible);
  assert.ok(candidate); assert.equal(candidate.edit.ruleId, "motion_light"); assert.equal(candidate.edit.actionIndex, 2);
  assert.ok(candidate.verification.results.every(r => r.passed));
  const output = exportRepair(project, candidate, imported.projectHash);
  assert.equal(importAutomations(output.after, snapshot.entities, snapshot.expectations).projectHash, candidate.projectHash);
  assert.throws(() => exportRepair(project, candidate, "stale"));
});
test("regressions, unknown values and unexercised intent fail closed", () => {
  assert.throws(() => verifySuite(project, [{ scenario: snapshot.suite[0].scenario, expected: {} }]));
  assert.equal(verifySuite(project, [snapshot.suite[1]]).passed, false);
  const p = structuredClone(project); p.entities["input_boolean.lamp"].state = "unavailable";
  assert.ok(proposeRepairs(p, snapshot.suite).candidates.every(c => !c.eligible));
  const broken = structuredClone(project); broken.rules[0].actions = [broken.rules[0].actions[0]];
  assert.equal(verifySuite(broken, snapshot.suite).passed, false);
});
test("read/write graph labels potential relationships, not false conflict findings", () => {
  const p = structuredClone(project);
  p.rules[1].triggers = [{ kind: "state", entityId: "input_boolean.lamp", to: "on" }];
  assert.ok(dependencyGraph(p).edges.some(e => e.from === "motion_light" && e.to === "manual_hold"));
});

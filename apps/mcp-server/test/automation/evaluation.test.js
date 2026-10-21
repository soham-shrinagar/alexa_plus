import test from "node:test";
import assert from "node:assert/strict";
import { evaluationCases } from "../../scripts/evaluationCases.js";
import { evaluate } from "../../scripts/evaluateAutomation.js";
import { importAutomations } from "../../src/automation/importYaml.js";
import { simulate } from "../../src/automation/engine.js";
import { hash } from "../../src/automation/schema.js";

test("frozen acceptance corpus preserves its independent labels and expected repair outcomes", () => {
  const cases = evaluationCases();
  assert.equal(
    hash(cases),
    "828021e508fa39e98a9f52429c6c2cfd164a2bd6da538c6a8a9056e2274290fb",
    "Changing the corpus requires a new documented evaluation version",
  );
  const report = evaluate(cases);
  assert.equal(
    report.passed,
    13,
    JSON.stringify(report.results.filter((r) => !r.passed)),
  );
  assert.equal(report.falseAlarmsOnCleanCases, 0);
  assert.ok(report.results.every((r) => r.repairRegressionPasses));
});

test("renaming entities and shifting event time preserves the delayed override diagnosis", () => {
  const entry = evaluationCases()[0];
  const renamed = JSON.parse(
    JSON.stringify(entry)
      .replaceAll("switch.desk", "switch.workbench")
      .replaceAll("input_boolean.occupancy", "input_boolean.arrival")
      .replaceAll("input_boolean.keep", "input_boolean.override"),
  );
  renamed.scenario.events.forEach((event) => {
    event.at += 237;
  });
  renamed.scenario.until += 237;
  const project = importAutomations(
    renamed.source,
    renamed.entities,
    renamed.expectations,
  ).project;
  const run = simulate(project, renamed.scenario);
  assert.equal(run.status, "VIOLATION");
  assert.equal(run.states["switch.workbench"].state, "off");
  assert.equal(run.findings[0].at, 727);
});

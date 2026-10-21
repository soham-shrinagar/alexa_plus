import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { importAutomations, toHaRules } from "../src/automation/importYaml.js";
import { hash } from "../src/automation/schema.js";
import { simulate } from "../src/automation/engine.js";
import {
  proposeRepairs,
  exportRepair,
} from "../src/automation/verification.js";
import { createHash } from "node:crypto";

const snapshot = JSON.parse(
  readFileSync("automation/fixtures/override-debug.json", "utf8"),
);
const imported = importAutomations(
  readFileSync("automation/fixtures/override-debug.yaml", "utf8"),
  snapshot.entities,
  snapshot.expectations,
);
const repair = proposeRepairs(imported.project, snapshot.suite);
const candidate = repair.candidates.find((c) => c.eligible);
assert.ok(candidate, "The sample must have a regression-verified repair");
const exported = exportRepair(
  imported.project,
  candidate,
  imported.projectHash,
);
const cases = [];
for (const [label, project] of [
  ["before", imported.project],
  ["after", candidate.project],
]) {
  for (const { scenario, expected } of snapshot.suite) {
    // Baseline reproduces the declared failure. Its observed off state is specified independently.
    const expectedState =
      label === "before" && scenario.id === "manual_override"
        ? { "input_boolean.lamp": "off" }
        : expected;
    const data = {
      id: `${label}_${scenario.id}`,
      entities: project.entities,
      rules: toHaRules(project),
      events: scenario.events,
      until: scenario.until,
      expected: expectedState,
    };
    cases.push({ ...data, inputHash: hash(data), project, scenario });
  }
}
if (process.argv[2] === "--prepare") {
  mkdirSync("artifacts/automation", { recursive: true });
  writeFileSync("artifacts/automation/verified-export.yaml", exported.after);
  writeFileSync(
    "artifacts/automation/repair-cases.json",
    JSON.stringify(
      cases.map(({ project, scenario, ...c }) => c),
      null,
      2,
    ),
  );
  console.log(`Prepared ${cases.length} independent before/after HA cases`);
} else {
  const report = JSON.parse(readFileSync(process.argv[2], "utf8"));
  assert.equal(report.runtime, "Home Assistant Core");
  if (report.exportYamlSha256)
    assert.equal(
      report.exportYamlSha256,
      createHash("sha256").update(exported.after).digest("hex"),
    );
  for (const c of cases) {
    const observed = report.cases.find((r) => r.id === c.id);
    assert.ok(
      observed?.assertionsPassed &&
        observed.restRead &&
        observed.authenticatedWebSocket,
    );
    assert.equal(observed.inputHash, c.inputHash);
    const run = simulate(c.project, c.scenario);
    for (const [key, state] of Object.entries(c.expected)) {
      assert.equal(observed.finalStates[key], state);
      assert.equal(run.states[key].state, state);
    }
    assert.deepEqual(
      observed.events
        .filter((e) => e.entityId === "input_boolean.lamp")
        .map((e) => e.state),
      run.trace
        .filter(
          (e) =>
            e.kind === "state_changed" && e.entityId === "input_boolean.lamp",
        )
        .map((e) => e.state),
    );
    console.log(`PASS ${c.id}`);
  }
  writeFileSync(
    process.argv[3] ?? "automation/reports/phase-3-verification.json",
    JSON.stringify(
      {
        projectHash: repair.projectHash,
        suiteHash: repair.suiteHash,
        baseline: repair.baseline,
        tested: repair.explored.tested,
        truncated: repair.explored.truncated,
        coverage: repair.explored.coverage,
        edit: candidate.edit,
        verification: candidate.verification,
        replayed: candidate.replayed,
        remaining: candidate.remaining,
        independentHaCases: cases.length,
      },
      null,
      2,
    ),
  );
}

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importAutomations } from "../../src/automation/importYaml.js";
import { simulate } from "../../src/automation/engine.js";
import { replayStates, parentChain } from "../../public/automation/replay.js";
import { AutomationService } from "../../src/automation/service.js";
import { MemoryAutomationStore } from "../../src/automation/store.js";
const snapshot = JSON.parse(
  readFileSync(
    new URL(
      "../../../../automation/fixtures/override-debug.json",
      import.meta.url,
    ),
  ),
);
const source = readFileSync(
  new URL(
    "../../../../automation/fixtures/override-debug.yaml",
    import.meta.url,
  ),
  "utf8",
);

test("replay shows the declared initial override, failure state, and its actual causal chain", () => {
  const project = importAutomations(
    source,
    snapshot.entities,
    snapshot.expectations,
  ).project;
  const scenario = structuredClone(snapshot.suite[0].scenario);
  scenario.initial = { "input_boolean.motion": { state: "on" } };
  const unchanged = simulate(project, scenario);
  assert.equal(replayStates(unchanged, -1)["input_boolean.motion"].state, "on");
  const run = simulate(project, snapshot.suite[0].scenario);
  const failure = run.findings[0];
  const index = run.trace.findIndex((r) => r.id === failure.cause);
  assert.equal(replayStates(run, index - 1)[failure.entityId].state, "on");
  assert.equal(replayStates(run, index)[failure.entityId].state, "off");
  assert.ok(
    parentChain(run, failure.cause).some(
      (row) => row.kind === "action" && row.action.kind === "delay",
    ),
  );
  assert.deepEqual(replayStates(run, run.trace.length - 1), run.states);
});
test("before/after comparison preserves source, uses identical inputs, and rejects foreign owners", async () => {
  const service = new AutomationService({ store: new MemoryAutomationStore() });
  const projectId = (
    await service.import("owner", {
      name: "Comparison",
      source,
      ...snapshot,
      confirmed: true,
    })
  ).workspace.id;
  const preflight = await service.preflight("owner", { projectId });
  const candidateId = preflight.analysis.candidates.find((c) => c.eligible).id;
  const input = { projectId, candidateId, scenarioId: "manual_override" };
  const compared = await service.compare("owner", input);
  assert.equal(compared.before.status, "VIOLATION");
  assert.equal(compared.after.status, "NO_VIOLATION_FOUND");
  assert.equal(compared.before.scenarioHash, compared.after.scenarioHash);
  assert.equal(
    (await service.get("owner", { projectId })).projectHash,
    preflight.analysis.projectHash,
  );
  await assert.rejects(service.compare("stranger", input), {
    code: "PROJECT_NOT_FOUND",
  });
  await assert.rejects(
    service.compare("owner", { ...input, candidateId: "0000000000000000" }),
    { code: "COMPARISON_UNAVAILABLE" },
  );
});

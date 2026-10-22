import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApplication } from "../../src/server.js";
import { WorkshopMcp } from "../../public/automation/mcp.js";
import { importAutomations } from "../../src/automation/importYaml.js";
import { simulate } from "../../src/automation/engine.js";

const fixtures = ["office-override", "bathroom-fan", "porch-quiet"].map(
  (name) => ({
    name,
    source: readFileSync(
      new URL(`../../../../automation/fixtures/${name}.yaml`, import.meta.url),
      "utf8",
    ),
    snapshot: JSON.parse(
      readFileSync(
        new URL(
          `../../../../automation/fixtures/${name}.json`,
          import.meta.url,
        ),
      ),
    ),
  }),
);

test("representative household imports complete real MCP diagnosis, comparison, approved export and reimport", async () => {
  const instance = await createApplication({
    config: {
      repositoryMode: "memory",
      demoMode: true,
      authRequired: true,
      publicUrl: "http://127.0.0.1:0",
      requestLimit: 1000,
      geminiApiKey: undefined,
    },
  });
  const server = instance.app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = instance.tokenService.issue({
    userId: "household-review",
    scopes: ["mcp:tools"],
  });
  const client = new WorkshopMcp({
    getToken: () => token,
    fetchImpl: (url, options) => fetch(base + url, options),
  });
  try {
    for (const { name, source, snapshot } of fixtures) {
      const imported = await client.call("import", {
        name,
        source,
        ...snapshot,
        confirmed: true,
      });
      assert.equal(imported.status, "SUPPORTED", name);
      const projectId = imported.workspace.id;
      const preflight = await client.call("preflight", { projectId });
      assert.equal(preflight.analysis.baseline.passed, false, name);
      const candidate = preflight.analysis.candidates.find((c) => c.eligible);
      assert.ok(
        candidate,
        `${name}: ${JSON.stringify(preflight.analysis.explored)}`,
      );
      assert.equal(candidate.searchComplete, true);
      const compared = await client.call("compare", {
        projectId,
        candidateId: candidate.id,
        scenarioId: snapshot.suite[0].scenario.id,
      });
      assert.equal(compared.before.status, "VIOLATION");
      assert.equal(compared.after.status, "NO_VIOLATION_FOUND");
      assert.equal(compared.before.scenarioHash, compared.after.scenarioHash);
      const review = await client.call("review", {
        projectId,
        candidateId: candidate.id,
        expectedVersion: 1,
      });
      const output = await client.call("export", {
        projectId,
        approvalId: review.approvalId,
        expectedVersion: 1,
        confirmed: true,
      });
      assert.equal(output.installed, false);
      const repaired = importAutomations(
        output.content,
        snapshot.entities,
        snapshot.expectations,
      );
      assert.equal(repaired.status, "SUPPORTED");
      assert.equal(repaired.projectHash, candidate.projectHash);
      for (const { scenario, expected } of snapshot.suite) {
        const run = simulate(repaired.project, scenario);
        assert.equal(run.findings.length, 0);
        assert.ok(
          !run.coverage.uncertainties.some(
            (x) => !x.startsWith("Expectation not exercised:"),
          ),
        );
        for (const [entityId, state] of Object.entries(expected))
          assert.equal(run.states[entityId].state, state);
      }
      await assert.rejects(
        client.call("export", {
          projectId,
          approvalId: review.approvalId,
          expectedVersion: 1,
          confirmed: true,
        }),
      );
    }
    assert.equal((await client.call("list")).projects.length, 3);
  } finally {
    await instance.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("realistic occupancy retriggers distinguish restart cancellation from single mode", () => {
  const { source, snapshot } = fixtures[1];
  const project = importAutomations(
    source,
    snapshot.entities,
    snapshot.expectations,
  ).project;
  const scenario = {
    id: "second_visit",
    events: [
      {
        kind: "state",
        entityId: "binary_sensor.bathroom_occupied",
        state: "on",
        at: 500,
      },
      {
        kind: "state",
        entityId: "binary_sensor.bathroom_occupied",
        state: "off",
        at: 30000,
      },
      {
        kind: "state",
        entityId: "binary_sensor.bathroom_occupied",
        state: "on",
        at: 60000,
      },
    ],
    until: 200000,
  };
  const restarted = simulate(project, scenario);
  assert.ok(restarted.trace.some((event) => event.kind === "cancelled"));
  const switchedOff = (run) =>
    run.trace
      .filter(
        (event) =>
          event.kind === "state_changed" &&
          event.entityId === "switch.bathroom_fan" &&
          event.state === "off",
      )
      .map((event) => event.at);
  assert.deepEqual(switchedOff(restarted), [180000]);
  project.rules[0].mode = "single";
  const single = simulate(project, scenario);
  assert.ok(single.trace.some((event) => event.kind === "single_skipped"));
  assert.deepEqual(switchedOff(single), [120500]);
});

test("office brightness, missing event filters and unavailable devices stay explicit", () => {
  const office = fixtures[0];
  const project = importAutomations(
    office.source,
    office.snapshot.entities,
    office.snapshot.expectations,
  ).project;
  const run = simulate(project, office.snapshot.suite[0].scenario);
  const overrideWrite = run.trace.find(
    (event) =>
      event.kind === "state_changed" &&
      event.entityId === "light.office" &&
      event.at === 14000,
  );
  assert.equal(overrideWrite.brightness, 120);
  project.entities["light.office"].state = "unavailable";
  assert.equal(
    simulate(project, office.snapshot.suite[0].scenario).status,
    "INCONCLUSIVE",
  );
  const porch = fixtures[2];
  const porchProject = importAutomations(
    porch.source,
    porch.snapshot.entities,
    porch.snapshot.expectations,
  ).project;
  const scenario = structuredClone(porch.snapshot.suite[1].scenario);
  scenario.events[0].data.button = "secondary";
  assert.equal(
    simulate(porchProject, scenario).states["light.porch"].state,
    "off",
  );
});
